'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Events = require('../celestial-events.js');

function finishActive(state) {
  let event = Events.inspect(state);
  while (event.progress < event.required) {
    Events.recordKill(state, event.definition.targetId);
    event = Events.inspect(state);
  }
  if (event.definition.elite) {
    Events.recordKill(state, event.definition.elite.enemyId, { elite: true });
  }
  return Events.complete(state);
}

test('defines an immutable rotation using existing higher-realm identities', () => {
  assert.equal(Object.isFrozen(Events.DEFINITIONS), true);
  assert.ok(Events.DEFINITIONS.length >= 3);
  const validRegions = new Set(['celestial_ruins', 'ember_wastes', 'mirror_mire']);
  const validEnemies = new Set(['rift_stalker', 'astral_sentinel', 'ashbound_guardian', 'mirror_wraith']);
  Events.DEFINITIONS.forEach((event) => {
    assert.equal(Object.isFrozen(event), true);
    assert.equal(Object.isFrozen(event.reward), true);
    assert.ok(validRegions.has(event.regionId));
    assert.ok(validEnemies.has(event.targetId));
    if (event.elite) assert.ok(validEnemies.has(event.elite.enemyId));
  });
});

test('fresh state offers the first event but does not start it implicitly', () => {
  const state = Events.createState();
  const report = Events.inspect(state);
  assert.equal(report.ok, true);
  assert.equal(report.active, false);
  assert.equal(report.cycle, 1);
  assert.equal(report.definition, Events.DEFINITIONS[0]);
  assert.deepEqual(state.claimed, { shards: 0, sigils: 0 });
});

test('start is idempotent and unrelated kills do not advance progress', () => {
  const state = Events.createState();
  assert.equal(Events.start(state).reason, 'started');
  const before = Events.serialize(state);
  assert.equal(Events.start(state).reason, 'already-active');
  assert.equal(Events.recordKill(state, 'mirror_wraith').reason, 'unrelated-enemy');
  assert.deepEqual(Events.serialize(state), before);
});

test('matching kills fill and cap the quota', () => {
  const state = Events.createState();
  const started = Events.start(state);
  for (let kill = 0; kill < started.required; kill += 1) {
    Events.recordKill(state, started.definition.targetId);
  }
  assert.equal(Events.inspect(state).progress, started.required);
  assert.equal(Events.recordKill(state, started.definition.targetId).reason, 'quota-already-complete');
  assert.equal(Events.inspect(state).progress, started.required);
});

test('elite finales unlock after the quota and are required once', () => {
  const state = Events.createState();
  const started = Events.start(state);
  assert.ok(started.definition.elite);
  assert.equal(Events.recordKill(state, started.definition.elite.enemyId, { elite: true }).reason, 'elite-locked');
  for (let kill = 0; kill < started.required; kill += 1) Events.recordKill(state, started.definition.targetId);
  assert.equal(Events.inspect(state).ready, false);
  assert.equal(Events.recordKill(state, 'mirror_wraith', { elite: true }).reason, 'wrong-elite');
  assert.equal(Events.recordKill(state, started.definition.elite.enemyId, { elite: true }).reason, 'elite-defeated');
  assert.equal(Events.inspect(state).ready, true);
  assert.equal(Events.recordKill(state, started.definition.elite.enemyId, { elite: true }).reason, 'elite-already-defeated');
});

test('events without an elite become ready when their quota is met', () => {
  const state = Events.createState({ completionCount: 1 });
  const started = Events.start(state);
  assert.equal(started.definition.elite, null);
  for (let kill = 0; kill < started.required; kill += 1) Events.recordKill(state, started.definition.targetId);
  assert.equal(Events.inspect(state).ready, true);
});

test('completion pays exactly once and advances the deterministic rotation', () => {
  const state = Events.createState();
  Events.start(state);
  const first = finishActive(state);
  assert.equal(first.reason, 'completed');
  assert.deepEqual(first.reward, Events.DEFINITIONS[0].reward);
  assert.deepEqual(state.claimed, Events.DEFINITIONS[0].reward);
  assert.equal(state.completionCount, 1);
  assert.equal(first.next.definition, Events.DEFINITIONS[1]);
  const claimed = { ...state.claimed };
  assert.equal(Events.complete(state).reason, 'no-active-event');
  assert.deepEqual(state.claimed, claimed);
});

test('rotation wraps without using real time or random state', () => {
  const state = Events.createState();
  const visited = [];
  for (let cycle = 0; cycle <= Events.DEFINITIONS.length; cycle += 1) {
    visited.push(Events.start(state).definition.id);
    finishActive(state);
  }
  assert.equal(visited[0], visited[Events.DEFINITIONS.length]);
  const restored = Events.createState({ completionCount: Events.DEFINITIONS.length });
  assert.equal(Events.start(restored).definition.id, visited[0]);
});

test('abandon discards progress, records the attempt, and preserves rotation', () => {
  const state = Events.createState();
  const started = Events.start(state);
  Events.recordKill(state, started.definition.targetId);
  const result = Events.abandon(state);
  assert.equal(result.reason, 'abandoned');
  assert.equal(state.abandonedCount, 1);
  assert.equal(state.completionCount, 0);
  assert.equal(Events.start(state).definition.id, started.definition.id);
  assert.equal(Events.inspect(state).progress, 0);
});

test('serialization round trips active progress without shared references', () => {
  const state = Events.createState();
  const started = Events.start(state);
  Events.recordKill(state, started.definition.targetId);
  const encoded = Events.serialize(state);
  const restored = Events.deserialize(JSON.stringify(encoded));
  assert.deepEqual(Events.serialize(restored), encoded);
  restored.active.progress += 1;
  assert.equal(encoded.active.progress, 1);
});

test('malformed saves are clamped and inconsistent active events are discarded', () => {
  const state = Events.deserialize({
    completionCount: '2.9',
    active: { eventId: Events.DEFINITIONS[0].id, progress: 999, eliteDefeated: true },
    claimed: { shards: -40, sigils: Infinity },
    abandonedCount: '8.7'
  });
  assert.equal(state.completionCount, 2);
  assert.equal(state.active, null);
  assert.deepEqual(state.claimed, { shards: 0, sigils: 0 });
  assert.equal(state.abandonedCount, 8);

  const expected = Events.DEFINITIONS[2];
  const restored = Events.deserialize({
    completionCount: 2,
    active: { eventId: expected.id, progress: 999, eliteDefeated: true }
  });
  assert.equal(restored.active.progress, expected.quota);
  assert.equal(restored.active.eliteDefeated, Boolean(expected.elite));
});

test('broken JSON and invalid runtime state fail safely', () => {
  const blank = Events.serialize(Events.createState());
  ['{broken', null, [], 42].forEach((raw) => assert.deepEqual(Events.serialize(Events.deserialize(raw)), blank));
  assert.equal(Events.start(null).reason, 'invalid-state');
  assert.equal(Events.recordKill({}, 'rift_stalker').reason, 'invalid-state');
  assert.equal(Events.complete([]).reason, 'invalid-state');
  assert.equal(Events.abandon('bad').reason, 'invalid-state');
});
