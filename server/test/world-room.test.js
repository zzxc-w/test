import test from 'node:test';
import assert from 'node:assert/strict';
import { withinChallengeRange } from '../src/world-room.js';

test('challenge distance is enforced from authoritative world positions', () => {
  assert.equal(withinChallengeRange({ x: 0, y: 0 }, { x: 360, y: 0 }), true);
  assert.equal(withinChallengeRange({ x: 0, y: 0 }, { x: 361, y: 0 }), false);
  assert.equal(withinChallengeRange({ x: 10, y: 10 }, { x: Number.NaN, y: 10 }), false);
});
