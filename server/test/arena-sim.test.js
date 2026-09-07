import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA } from '../src/constants.js';
import { applyArenaInput, createArenaState, publicArenaSnapshot, stepArena } from '../src/arena-sim.js';

const input = (seq, values = {}) => ({ seq, moveX: 0, moveY: 0, aimX: 1, aimY: 0, attack: false, parry: false, dash: false, ...values });

test('arena accepts only increasing input sequence numbers', () => {
  const state = createArenaState(['a', 'b'], 1000);
  assert.equal(applyArenaInput(state, 'a', input(1)), true);
  assert.equal(applyArenaInput(state, 'a', input(1)), false);
  assert.equal(applyArenaInput(state, 'unknown', input(2)), false);
});

test('arena snapshots include sanitized configured fighter names', () => {
  const state = createArenaState(['a', 'b'], 1000, { a: 'Azure Crane', b: 'Jade Fox' });
  const snapshot = publicArenaSnapshot(state, 1000);
  assert.deepEqual(snapshot.players.map((player) => player.name), ['Azure Crane', 'Jade Fox']);
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
  assert.equal(state.endedAt, state.endsAt);
});

test('held action inputs trigger once and snapshots expose animation phases', () => {
  const state = createArenaState(['a', 'b'], 1000);
  state.players.a.x = 300;
  state.players.b.x = 350;
  applyArenaInput(state, 'a', input(1, { attack: true }));
  stepArena(state, 1000);
  let player = publicArenaSnapshot(state, 1050).players.find((item) => item.id === 'a');
  assert.equal(player.action, 'attack');
  assert.equal(player.attackPhase, 'windup');
  assert.equal(player.actionSeq, 1);
  stepArena(state, 1180);
  assert.equal(state.players.b.hp, ARENA.maxHp - ARENA.attackDamage);
  stepArena(state, 1700);
  assert.equal(state.players.a.actionSeq, 1, 'holding attack must not auto-repeat at cooldown');
  applyArenaInput(state, 'a', input(2, { attack: false }));
  stepArena(state, 1710);
  applyArenaInput(state, 'a', input(3, { attack: true }));
  stepArena(state, 1720);
  assert.equal(state.players.a.actionSeq, 2, 'release then press starts a new attack');
});

test('a quick press and release remains queued until the simulation tick', () => {
  const state = createArenaState(['a', 'b'], 1000);
  state.players.a.x = 300;
  state.players.b.x = 350;
  applyArenaInput(state, 'a', input(1, { attack: true }));
  applyArenaInput(state, 'a', input(2, { attack: false }));
  stepArena(state, 1000);
  assert.equal(state.players.a.attackAt, 1000);
  assert.equal(state.players.a.actionSeq, 1);
});

test('hits knock players back, show hurt state, and player bodies do not overlap', () => {
  const state = createArenaState(['a', 'b'], 1000);
  state.players.a.x = 300;
  state.players.b.x = 320;
  applyArenaInput(state, 'a', input(1, { attack: true }));
  stepArena(state, 1000);
  stepArena(state, 1180);
  assert.ok(state.players.b.x > 320);
  const b = publicArenaSnapshot(state, 1180).players.find((player) => player.id === 'b');
  assert.equal(b.action, 'hurt');
  assert.ok(Math.hypot(state.players.b.x - state.players.a.x, state.players.b.y - state.players.a.y) >= ARENA.playerRadius * 2);
});

test('a knockout produces a final snapshot with a durable end marker', () => {
  const state = createArenaState(['a', 'b'], 1000);
  state.players.a.x = 300;
  state.players.b.x = 350;
  state.players.b.hp = ARENA.attackDamage;
  applyArenaInput(state, 'a', input(1, { attack: true }));
  stepArena(state, 1000);
  stepArena(state, 1180);
  const snapshot = publicArenaSnapshot(state, 1180);
  assert.equal(snapshot.winnerId, 'a');
  assert.equal(snapshot.reason, 'defeat');
  assert.equal(state.endedAt, 1180);
  assert.equal(snapshot.players.find((player) => player.id === 'b').action, 'defeated');
});
