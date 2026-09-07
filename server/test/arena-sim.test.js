import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA } from '../src/constants.js';
import { applyArenaInput, createArenaState, stepArena } from '../src/arena-sim.js';

const input = (seq, values = {}) => ({ seq, moveX: 0, moveY: 0, aimX: 1, aimY: 0, attack: false, parry: false, dash: false, ...values });

test('arena accepts only increasing input sequence numbers', () => {
  const state = createArenaState(['a', 'b'], 1000);
  assert.equal(applyArenaInput(state, 'a', input(1)), true);
  assert.equal(applyArenaInput(state, 'a', input(1)), false);
  assert.equal(applyArenaInput(state, 'unknown', input(2)), false);
});

test('movement and dash remain inside the authoritative arena', () => {
  const state = createArenaState(['a', 'b'], 1000);
  applyArenaInput(state, 'a', input(1, { moveX: -1, dash: true }));
  stepArena(state, 1034);
  assert.equal(state.players.a.x, 72);
  applyArenaInput(state, 'a', input(2, { moveX: -1, dash: false }));
  stepArena(state, 2034);
  assert.ok(state.players.a.x >= ARENA.playerRadius);
});

test('server computes attacks and never trusts client damage', () => {
  const state = createArenaState(['a', 'b'], 1000);
  state.players.a.x = 300;
  state.players.b.x = 350;
  applyArenaInput(state, 'a', input(1, { attack: true }));
  stepArena(state, 1000);
  stepArena(state, 1180);
  assert.equal(state.players.b.hp, ARENA.maxHp - ARENA.attackDamage);
});

test('well-timed parry staggers the attacker', () => {
  const state = createArenaState(['a', 'b'], 1000);
  state.players.a.x = 300;
  state.players.b.x = 350;
  applyArenaInput(state, 'a', input(1, { attack: true }));
  stepArena(state, 1000);
  applyArenaInput(state, 'b', input(1, { aimX: -1, parry: true }));
  stepArena(state, 1050);
  stepArena(state, 1180);
  assert.equal(state.players.b.hp, ARENA.maxHp);
  assert.ok(state.players.a.staggeredUntil > 1180);
});

test('round timeout picks higher HP or draw', () => {
  const state = createArenaState(['a', 'b'], 1000);
  state.players.b.hp = 10;
  stepArena(state, state.endsAt);
  assert.equal(state.winnerId, 'a');
  assert.equal(state.reason, 'time');
});
