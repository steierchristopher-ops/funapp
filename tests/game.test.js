import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MousewarEngine,
  Phase,
  GameEvents,
  ROUND_DURATION_MS,
  COMBO_WINDOW_MS,
  MAX_MULTIPLIER,
  PERFECT_RUN_BONUS,
} from '../src/mousewar/game.js';

const COUNTDOWN_TOTAL_MS = 700 + 700 + 700 + 500;

// Starts the countdown far enough in the past that it completes exactly at
// t=0, so tests can use round-relative timestamps (1000, 1100, ...) directly.
function startedEngine(events = []) {
  const engine = new MousewarEngine({ onEvent: (type, payload) => events.push({ type, payload }) });
  engine.startCountdown(-COUNTDOWN_TOTAL_MS);
  engine.tick(0);
  assert.equal(engine.phase, Phase.PLAYING);
  assert.equal(engine.runStart, 0);
  return engine;
}

test('countdown transitions to playing and emits gameStart', () => {
  const events = [];
  const engine = startedEngine(events);
  assert.equal(engine.phase, Phase.PLAYING);
  assert.ok(events.some((e) => e.type === GameEvents.GAME_START));
});

test('first hit scores at x1 and does not increase the multiplier', () => {
  const engine = startedEngine();
  const result = engine.hitTarget(1000);
  assert.equal(result.gained, 100);
  assert.equal(engine.currentMultiplier, 1);
  assert.equal(engine.score, 100);
});

test('multiplier climbs by 1 per fast hit and score uses the new multiplier', () => {
  const engine = startedEngine();
  engine.hitTarget(1000); // x1 -> +100
  engine.hitTarget(1000 + 200); // fast -> x2 -> +200
  engine.hitTarget(1000 + 400); // fast -> x3 -> +300
  assert.equal(engine.currentMultiplier, 3);
  assert.equal(engine.score, 100 + 200 + 300);
});

test('multiplier caps at x10 and stays there on continued fast hits', () => {
  const engine = startedEngine();
  let now = 1000;
  for (let i = 0; i < 15; i++) {
    engine.hitTarget(now);
    now += 100; // well within the 1s window
  }
  assert.equal(engine.currentMultiplier, MAX_MULTIPLIER);
  assert.equal(engine.maxMultiplier, MAX_MULTIPLIER);
});

test('a hit exactly on the combo deadline still counts as a combo hit', () => {
  const engine = startedEngine();
  engine.hitTarget(1000);
  const result = engine.hitTarget(1000 + COMBO_WINDOW_MS);
  assert.equal(engine.currentMultiplier, 2);
  assert.equal(result.multiplier, 2);
});

test('missing the combo window resets multiplier to x1 without a new target', () => {
  const engine = startedEngine();
  engine.hitTarget(1000); // x1
  engine.hitTarget(1000 + 200); // x2
  engine.spawnTarget({ x: 10, y: 10 });
  const posBefore = engine.targetPosition;

  // Let the 1s window lapse without a hit.
  engine.tick(1000 + 200 + COMBO_WINDOW_MS + 1);
  assert.equal(engine.currentMultiplier, 1);
  assert.equal(engine.hasMadeMistake, true);
  assert.deepEqual(engine.targetPosition, posBefore, 'target must not change on timeout alone');

  // The eventual late hit still scores, just at x1.
  const result = engine.hitTarget(1000 + 200 + COMBO_WINDOW_MS + 500);
  assert.equal(result.multiplier, 1);
  assert.equal(result.gained, 100);
});

test('miss-click with an active multiplier resets to x1 with no score penalty', () => {
  const engine = startedEngine();
  engine.hitTarget(1000);
  engine.hitTarget(1000 + 200); // x2
  const scoreBefore = engine.score;
  const result = engine.missClick(1000 + 300);
  assert.equal(engine.currentMultiplier, 1);
  assert.equal(result.penalty, 0);
  assert.equal(engine.score, scoreBefore);
  assert.equal(engine.hasMadeMistake, true);
});

test('miss-click at x1 costs 100 points', () => {
  const engine = startedEngine();
  engine.hitTarget(1000); // score = 100, multiplier back to x1 baseline
  const result = engine.missClick(1100);
  assert.equal(result.penalty, 100);
  assert.equal(engine.score, 0);
});

test('score never drops below zero on repeated misses', () => {
  const engine = startedEngine();
  engine.missClick(1000);
  engine.missClick(1100);
  engine.missClick(1200);
  assert.equal(engine.score, 0);
});

test('round ends exactly at 30 seconds and freezes further input', () => {
  const engine = startedEngine();
  engine.hitTarget(1000);
  engine.tick(ROUND_DURATION_MS - 1);
  assert.equal(engine.phase, Phase.PLAYING);
  engine.tick(ROUND_DURATION_MS + 1);
  assert.equal(engine.phase, Phase.GAME_OVER);

  const scoreAtEnd = engine.score;
  const result = engine.hitTarget(ROUND_DURATION_MS + 100);
  assert.equal(result, null);
  assert.equal(engine.score, scoreAtEnd);
});

test('a flawless run (continuous hits, no gap ever exceeding 1s) earns the perfect-run bonus', () => {
  const engine = startedEngine();
  let expectedScore = 0;
  // Hit every 400ms for the whole round so no combo window ever lapses,
  // including right up to the final second before the round ends.
  for (let now = 400; now < ROUND_DURATION_MS; now += 400) {
    const result = engine.hitTarget(now);
    expectedScore += result.gained;
  }
  engine.tick(ROUND_DURATION_MS + 1);
  assert.equal(engine.hasMadeMistake, false);
  assert.equal(engine.isPerfectRun, true);
  assert.equal(engine.score, expectedScore + PERFECT_RUN_BONUS);
});

test('an idle gap over 1s mid-round breaks a perfect run even if the round finishes cleanly', () => {
  const engine = startedEngine();
  engine.hitTarget(1000);
  engine.tick(1000 + COMBO_WINDOW_MS + 1); // window lapses with no further hit
  engine.hitTarget(5000); // play resumes, but the damage is done
  engine.tick(ROUND_DURATION_MS + 1);
  assert.equal(engine.hasMadeMistake, true);
  assert.equal(engine.isPerfectRun, false);
});

test('a single miss disqualifies the perfect-run bonus', () => {
  const engine = startedEngine();
  engine.hitTarget(1000);
  engine.missClick(1100);
  engine.tick(ROUND_DURATION_MS + 1);
  assert.equal(engine.isPerfectRun, false);
});

test('letting the combo window lapse also disqualifies a perfect run', () => {
  const engine = startedEngine();
  engine.hitTarget(1000);
  engine.tick(1000 + COMBO_WINDOW_MS + 1);
  engine.tick(ROUND_DURATION_MS + 1);
  assert.equal(engine.isPerfectRun, false);
});

test('getCountdownLabel walks through 3, 2, 1, GO!', () => {
  const engine = new MousewarEngine();
  engine.startCountdown(0);
  assert.equal(engine.getCountdownLabel(0), '3');
  assert.equal(engine.getCountdownLabel(700), '2');
  assert.equal(engine.getCountdownLabel(1400), '1');
  assert.equal(engine.getCountdownLabel(2100), 'GO!');
});
