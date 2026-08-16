import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadBest,
  saveBest,
  loadLeaderboard,
  saveLeaderboard,
  qualifiesForLeaderboard,
  computeTopTen,
  sanitizeName,
  LEADERBOARD_LIMIT,
  MAX_NAME_LENGTH,
} from '../src/mousewar/storage.js';

function fakeBackend() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}

test('personal best defaults to 0 and persists via the injected backend', () => {
  const backend = fakeBackend();
  assert.equal(loadBest(backend), 0);
  saveBest(12_400, backend);
  assert.equal(loadBest(backend), 12_400);
});

test('leaderboard defaults to an empty list and round-trips through JSON', () => {
  const backend = fakeBackend();
  assert.deepEqual(loadLeaderboard(backend), []);
  const entries = [{ name: 'ACE', score: 18450, maxCombo: 10 }];
  saveLeaderboard(entries, backend);
  assert.deepEqual(loadLeaderboard(backend), entries);
});

test('corrupted leaderboard JSON falls back to an empty list', () => {
  const backend = fakeBackend();
  backend.setItem('mousewar:leaderboard', '{not json');
  assert.deepEqual(loadLeaderboard(backend), []);
});

test('sanitizeName uppercases, strips invalid characters, and caps length', () => {
  assert.equal(sanitizeName('ace'), 'ACE');
  assert.equal(sanitizeName('a!c-e?'), 'ACE');
  assert.equal(sanitizeName('toolong'), 'too'.toUpperCase());
  assert.equal(sanitizeName(''), '');
  assert.equal(sanitizeName(undefined), '');
});

test('sanitizeName never exceeds MAX_NAME_LENGTH characters', () => {
  assert.equal(sanitizeName('abcdefgh').length, MAX_NAME_LENGTH);
});

test('qualifiesForLeaderboard is always true while under the limit', () => {
  const entries = [{ name: 'A', score: 100, maxCombo: 2 }];
  assert.equal(qualifiesForLeaderboard(entries, 1, LEADERBOARD_LIMIT), true);
});

test('qualifiesForLeaderboard requires beating the lowest score once full', () => {
  const entries = Array.from({ length: LEADERBOARD_LIMIT }, (_, i) => ({
    name: `P${i}`,
    score: (i + 1) * 100, // lowest = 100
    maxCombo: 1,
  }));
  assert.equal(qualifiesForLeaderboard(entries, 50, LEADERBOARD_LIMIT), false);
  assert.equal(qualifiesForLeaderboard(entries, 100, LEADERBOARD_LIMIT), false, 'a tie does not bump anyone');
  assert.equal(qualifiesForLeaderboard(entries, 101, LEADERBOARD_LIMIT), true);
});

test('computeTopTen sorts descending by score and reports the new rank', () => {
  const entries = [
    { name: 'NEO', score: 17920, maxCombo: 9 },
    { name: 'MAX', score: 16700, maxCombo: 8 },
  ];
  const { list, rank } = computeTopTen(entries, { name: 'ACE', score: 18450, maxCombo: 10 });
  assert.deepEqual(list.map((e) => e.name), ['ACE', 'NEO', 'MAX']);
  assert.equal(rank, 0);
});

test('computeTopTen trims to the limit, dropping the lowest score', () => {
  const entries = Array.from({ length: LEADERBOARD_LIMIT }, (_, i) => ({
    name: `P${i}`,
    score: (i + 1) * 100,
    maxCombo: 1,
  }));
  const { list, rank } = computeTopTen(entries, { name: 'NEW', score: 1050, maxCombo: 5 }, LEADERBOARD_LIMIT);
  assert.equal(list.length, LEADERBOARD_LIMIT);
  assert.equal(rank, 0);
  assert.ok(!list.some((e) => e.name === 'P0'), 'lowest score entry should be dropped');
});

test('computeTopTen breaks score ties by higher max combo', () => {
  const entries = [{ name: 'LOW', score: 500, maxCombo: 3 }];
  const { list } = computeTopTen(entries, { name: 'HIGH', score: 500, maxCombo: 7 });
  assert.equal(list[0].name, 'HIGH');
});

test('a score that does not qualify is simply absent with rank -1', () => {
  const entries = Array.from({ length: LEADERBOARD_LIMIT }, (_, i) => ({
    name: `P${i}`,
    score: (i + 1) * 1000,
    maxCombo: 1,
  }));
  const { list, rank } = computeTopTen(entries, { name: 'LOSER', score: 1, maxCombo: 1 }, LEADERBOARD_LIMIT);
  assert.equal(rank, -1);
  assert.ok(!list.some((e) => e.name === 'LOSER'));
});
