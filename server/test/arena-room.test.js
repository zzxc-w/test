import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaRoom } from '../src/arena-room.js';
import { createArenaState, finishArena } from '../src/arena-sim.js';

function makeRoom() {
  const room = new ArenaRoom({ storage: {} }, {});
  room.config = { arenaId: 'arena-1', playerIds: ['a', 'b'], rulesetVersion: '1' };
  room.sim = createArenaState(['a', 'b'], 1000);
  room.startTicking = () => {};
  return room;
}

function memoryStorage() {
  const values = new Map();
  return {
    async get(key) { return values.get(key); },
    async put(key, value) {
      if (typeof key === 'object') for (const [entryKey, entryValue] of Object.entries(key)) values.set(entryKey, entryValue);
      else values.set(key, value);
    },
  };
}

test('excess disposable arena input is dropped without disconnecting the player', async () => {
  const room = makeRoom();
  let closes = 0;
  const socket = {
    deserializeAttachment: () => ({ playerId: 'a' }),
    close: () => { closes += 1; },
  };
  const limits = { inputs: { take: () => false }, strikes: 0 };
  room.rateLimits.set(socket, limits);
  await room.webSocketMessage(socket, JSON.stringify({
    type: 'arena_input', arenaId: 'arena-1', seq: 1,
    moveX: 1, moveY: 0, aimX: 1, aimY: 0,
    attack: false, parry: false, dash: false,
  }));
  assert.equal(closes, 0);
  assert.equal(limits.strikes, 0);
  assert.equal(room.sim.players.a.input.seq, -1);
});

test('completed rooms retain a self-contained arena end payload for reconnects', () => {
  const room = makeRoom();
  room.sim.updatedAt = 2500;
  finishArena(room.sim, 'a', 'defeat');
  assert.deepEqual(room.endPayload(2600), {
    type: 'arena_end', arenaId: 'arena-1', winnerId: 'a', reason: 'defeat', endedAt: 2500, serverTime: 2600,
  });
});

test('arena configuration accepts exactly two sanitized fighter profiles', async () => {
  const storage = memoryStorage();
  const room = new ArenaRoom({ storage }, { SESSION_SIGNING_KEY: 'internal-secret', RULESET_VERSION: '1' });
  const response = await room.configure(new Request('https://internal/configure', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-arena-key': 'internal-secret' },
    body: JSON.stringify({
      arenaId: 'arena-1', playerIds: ['a', 'b'], rulesetVersion: '1',
      players: [{ id: 'a', name: ' Azure   Crane ' }, { id: 'b', name: 'Jade Fox' }],
    }),
  }));
  assert.equal(response.status, 204);
  assert.equal(room.sim.players.a.name, 'Azure Crane');
  assert.equal(room.sim.players.b.name, 'Jade Fox');

  const invalidRoom = new ArenaRoom({ storage: memoryStorage() }, { SESSION_SIGNING_KEY: 'internal-secret', RULESET_VERSION: '1' });
  const invalid = await invalidRoom.configure(new Request('https://internal/configure', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-arena-key': 'internal-secret' },
    body: JSON.stringify({
      arenaId: 'arena-2', playerIds: ['a', 'b'], rulesetVersion: '1',
      players: [{ id: 'a', name: 'Azure Crane' }, { id: 'a', name: 'Impostor' }],
    }),
  }));
  assert.equal(invalid.status, 400);
});
