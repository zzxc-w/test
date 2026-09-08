import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldRoom, withinChallengeRange } from '../src/world-room.js';

test('challenge distance is enforced from authoritative world positions', () => {
  assert.equal(withinChallengeRange({ x: 0, y: 0 }, { x: 360, y: 0 }), true);
  assert.equal(withinChallengeRange({ x: 0, y: 0 }, { x: 361, y: 0 }), false);
  assert.equal(withinChallengeRange({ x: 10, y: 10 }, { x: Number.NaN, y: 10 }), false);
});

function fakeSocket(player) {
  return {
    readyState: 1, messages: [],
    deserializeAttachment: () => player,
    send(text) { this.messages.push(JSON.parse(text)); },
  };
}

function fakeState(sockets) {
  let alarm = null;
  const values = new Map();
  return {
    getWebSockets: () => sockets,
    storage: {
      async get(key) { return values.get(key); },
      async put(key, value) { values.set(key, structuredClone(value)); },
      async getAlarm() { return alarm; },
      async setAlarm(value) { alarm = value; },
    },
  };
}

test('world drops are server-positioned, shared and awarded to only one claimant', async () => {
  const creatorPlayer = { id: 'creator', x: 100, y: 100, facing: 0 };
  const claimantPlayer = { id: 'claimant', x: 128, y: 100, facing: Math.PI };
  const creator = fakeSocket(creatorPlayer), claimant = fakeSocket(claimantPlayer);
  const room = new WorldRoom(fakeState([creator, claimant]), {});
  room.drops = {};
  await room.createDrop(creator, creatorPlayer, { requestId: 'make1', itemId: 'sect_iron_sword' });
  const created = creator.messages.find(message => message.type === 'drop_created');
  assert(created && created.drop.x === 128 && created.drop.y === 100);
  assert.equal(claimant.messages.some(message => message.type === 'drop_spawn' && message.drop.id === created.drop.id), true);
  claimant.messages.length = 0;
  await Promise.all([
    room.claimDrop(claimant, claimantPlayer, { requestId: 'take1', dropId: created.drop.id }),
    room.claimDrop(creator, creatorPlayer, { requestId: 'take2', dropId: created.drop.id }),
  ]);
  const awards = [...creator.messages, ...claimant.messages].filter(message => message.type === 'drop_award');
  assert.equal(awards.length, 1, 'a shared drop must not be awarded twice');
});
