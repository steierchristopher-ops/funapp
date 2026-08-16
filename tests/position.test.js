import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTargetPosition, clampTargetPosition, TARGET_DIAMETER } from '../src/mousewar/position.js';

test('pickTargetPosition always stays fully inside the play area with margins', () => {
  const bounds = { width: 1200, height: 800 };
  for (let i = 0; i < 200; i++) {
    const pos = pickTargetPosition(bounds);
    assert.ok(pos.x >= 0, 'x within left bound');
    assert.ok(pos.x + TARGET_DIAMETER <= bounds.width, 'x within right bound');
    assert.ok(pos.y >= 0, 'y within top bound');
    assert.ok(pos.y + TARGET_DIAMETER <= bounds.height, 'y within bottom bound');
  }
});

test('pickTargetPosition never lands under the reserved HUD/combo band', () => {
  const bounds = { width: 1200, height: 800 };
  for (let i = 0; i < 200; i++) {
    const pos = pickTargetPosition(bounds, { topReserved: 100 });
    assert.ok(pos.y >= 100);
  }
});

test('pickTargetPosition degrades gracefully on a tiny play area instead of throwing', () => {
  const bounds = { width: 100, height: 100 };
  const pos = pickTargetPosition(bounds);
  assert.ok(Number.isFinite(pos.x));
  assert.ok(Number.isFinite(pos.y));
});

test('clampTargetPosition pulls an out-of-bounds position back inside new bounds', () => {
  const shrunkBounds = { width: 300, height: 300 };
  const pos = clampTargetPosition({ x: 900, y: 700 }, shrunkBounds);
  assert.ok(pos.x + TARGET_DIAMETER <= shrunkBounds.width);
  assert.ok(pos.y + TARGET_DIAMETER <= shrunkBounds.height);
});

test('clampTargetPosition leaves an already-valid position untouched', () => {
  const bounds = { width: 1200, height: 800 };
  const pos = { x: 200, y: 200 };
  assert.deepEqual(clampTargetPosition(pos, bounds), pos);
});
