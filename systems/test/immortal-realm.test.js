'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Realm = require('../immortal-realm.js');

test('defines three distinct frozen subregions with hazards and enemy rosters', () => {
  assert.equal(Object.keys(Realm.REGIONS).length, 3);
  assert.equal(new Set(Object.values(Realm.REGIONS).map((region) => region.hazard.id)).size, 3);
  Object.values(Realm.REGIONS).forEach((region) => {
    assert.ok(region.enemies.length >= 2);
    assert.ok(region.enemies.every((id) => Realm.ENEMIES[id]));
    assert.equal(Object.isFrozen(region), true);
    assert.equal(Object.isFrozen(region.hazard), true);
  });
});

test('fresh state exposes persistent expedition objectives and a bounty', () => {
  const state = Realm.createState();
  assert.deepEqual(state.discovered, []);
  assert.deepEqual(state.resources, { shards: 0, sigils: 0 });
  assert.equal(Realm.listObjectives(state).length, 6);
  assert.equal(Realm.inspectBounty(state).target.id, 'rift_stalker');
});

test('discovery is idempotent and rejects unknown regions without mutation', () => {
  const state = Realm.createState();
  assert.equal(Realm.discoverRegion(state, 'celestial_ruins').alreadyDiscovered, false);
  assert.equal(Realm.discoverRegion(state, 'celestial_ruins').alreadyDiscovered, true);
  const before = Realm.serialize(state);
  assert.equal(Realm.discoverRegion(state, 'missing').reason, 'unknown-region');
  assert.deepEqual(Realm.serialize(state), before);
  assert.deepEqual(state.discovered, ['celestial_ruins']);
});

test('rift victories require local discovery and matching enemy archetypes', () => {
  const state = Realm.createState();
  assert.equal(Realm.defeatEnemy(state, 'rift_stalker', { riftId: 'star_crown_rift' }).riftProgress, null);
  Realm.discoverRegion(state, 'celestial_ruins');
  assert.equal(Realm.defeatEnemy(state, 'mirror_wraith', { riftId: 'star_crown_rift' }).riftProgress, null);
  const result = Realm.defeatEnemy(state, 'astral_sentinel', { riftId: 'star_crown_rift' });
  assert.deepEqual(result.riftProgress, { current: 1, required: 4, ready: false });
});

test('rift stabilization is gated, rewarded once, and remains idempotent', () => {
  const state = Realm.createState();
  assert.equal(Realm.stabilizeRift(state, 'star_crown_rift').reason, 'region-undiscovered');
  Realm.discoverRegion(state, 'celestial_ruins');
  assert.equal(Realm.stabilizeRift(state, 'star_crown_rift').reason, 'rift-incomplete');
  for (let index = 0; index < 4; index += 1) Realm.defeatEnemy(state, 'rift_stalker', { riftId: 'star_crown_rift' });
  const sealed = Realm.stabilizeRift(state, 'star_crown_rift');
  assert.deepEqual(sealed.reward, { shards: 12, sigils: 1 });
  const resources = { ...state.resources };
  assert.equal(Realm.stabilizeRift(state, 'star_crown_rift').reason, 'already-stabilized');
  assert.deepEqual(state.resources, resources);
});

test('enemy rewards, boss objective, and unknown enemy behavior are deterministic', () => {
  const state = Realm.createState();
  const before = Realm.serialize(state);
  assert.equal(Realm.defeatEnemy(state, 'not_real').reason, 'unknown-enemy');
  assert.deepEqual(Realm.serialize(state), before);
  const result = Realm.defeatEnemy(state, 'void_harbinger');
  assert.deepEqual(result.reward, { shards: 15, sigils: 1 });
  assert.ok(state.objectives.includes('harbinger_defeated'));
});

test('repeatable bounty claims rotate targets and never pay twice', () => {
  const state = Realm.createState();
  const first = Realm.inspectBounty(state);
  assert.equal(Realm.claimBounty(state).reason, 'bounty-incomplete');
  for (let index = 0; index < first.required; index += 1) Realm.defeatEnemy(state, first.target.id);
  const claim = Realm.claimBounty(state);
  assert.equal(claim.ok, true);
  assert.equal(state.bounty.cycle, 2);
  assert.notEqual(claim.next.target.id, first.target.id);
  const resources = { ...state.resources };
  assert.equal(Realm.claimBounty(state).reason, 'bounty-incomplete');
  assert.deepEqual(state.resources, resources);
  assert.ok(state.objectives.includes('first_bounty'));
});

test('transformation reports exact missing goals and consumes its costs once', () => {
  const state = Realm.createState();
  Object.keys(Realm.REGIONS).forEach((regionId) => Realm.discoverRegion(state, regionId));
  Object.entries(Realm.RIFTS).forEach(([riftId, rift]) => {
    for (let wave = 0; wave < rift.waves; wave += 1) Realm.defeatEnemy(state, rift.enemyPool[0], { riftId: riftId });
    Realm.stabilizeRift(state, riftId);
  });
  Realm.defeatEnemy(state, 'void_harbinger');
  let report = Realm.inspectTransformation(state);
  assert.deepEqual(report.missing.map((entry) => entry.type), ['sigils']);
  while (state.resources.sigils < 5) {
    const bounty = Realm.inspectBounty(state);
    for (let index = 0; index < bounty.required; index += 1) Realm.defeatEnemy(state, bounty.target.id);
    Realm.claimBounty(state);
  }
  report = Realm.completeTransformation(state);
  assert.equal(report.reason, 'transformed');
  const resources = { ...state.resources };
  assert.equal(Realm.completeTransformation(state).reason, 'already-transformed');
  assert.deepEqual(state.resources, resources);
});

test('serialization round trips progress without sharing nested references', () => {
  const state = Realm.createState();
  Realm.discoverRegion(state, 'mirror_mire');
  Realm.defeatEnemy(state, 'mirror_wraith', { riftId: 'drowned_moon_rift' });
  const encoded = Realm.serialize(state);
  const restored = Realm.deserialize(JSON.stringify(encoded));
  assert.deepEqual(Realm.serialize(restored), encoded);
  restored.rifts.drowned_moon_rift.progress = 4;
  assert.equal(encoded.rifts.drowned_moon_rift.progress, 1);
});

test('malformed saves recover known progress and clamp forged values safely', () => {
  const state = Realm.deserialize({
    discovered: ['mirror_mire', 'mirror_mire', 'removed_region', null],
    objectives: ['entered', 'removed_objective', 'entered'],
    resources: { shards: -20, sigils: Infinity },
    rifts: {
      drowned_moon_rift: { progress: 999, stabilized: false },
      star_crown_rift: { progress: -8, stabilized: true }
    },
    kills: { mirror_wraith: '12.8', void_harbinger: -4 },
    bounty: { cycle: 2.9, target: 'void_harbinger', required: 1, progress: 999 },
    stats: { enemiesDefeated: 'bad', riftsStabilized: 999, bountiesClaimed: -3 }
  });
  assert.deepEqual(state.discovered, ['mirror_mire']);
  assert.deepEqual(state.objectives, ['entered']);
  assert.deepEqual(state.resources, { shards: 0, sigils: 0 });
  assert.deepEqual(state.rifts.star_crown_rift, { progress: 4, stabilized: true });
  assert.deepEqual(state.rifts.drowned_moon_rift, { progress: 5, stabilized: false });
  assert.equal(state.kills.mirror_wraith, 12);
  assert.deepEqual(state.bounty, { cycle: 2, target: 'astral_sentinel', required: 5, progress: 5 });
  assert.equal(state.stats.riftsStabilized, 1);
});

test('broken JSON and unrelated legacy values safely become fresh state', () => {
  const blank = Realm.serialize(Realm.createState());
  ['{broken', null, [], 42].forEach((raw) => assert.deepEqual(Realm.serialize(Realm.deserialize(raw)), blank));
});
