(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VerdantImmortalRealm = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const MAX_RESOURCE = 1000000000;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return value;
  }

  const REGIONS = deepFreeze({
    celestial_ruins: {
      id: 'celestial_ruins', name: 'Celestial Ruins',
      description: 'Broken palaces orbit a silent star altar.',
      hazard: { id: 'starfall', name: 'Starfall', damage: 18, interval: 4.5 },
      enemies: ['rift_stalker', 'astral_sentinel']
    },
    ember_wastes: {
      id: 'ember_wastes', name: 'Ember Wastes',
      description: 'Ash storms scour the bones of an ancient phoenix road.',
      hazard: { id: 'cinder_surge', name: 'Cinder Surge', damage: 12, interval: 2.8 },
      enemies: ['ashbound_guardian', 'rift_stalker']
    },
    mirror_mire: {
      id: 'mirror_mire', name: 'Mirror Mire',
      description: 'Reflections move before their owners beneath a drowned moon.',
      hazard: { id: 'false_reflection', name: 'False Reflection', damage: 15, interval: 3.6 },
      enemies: ['mirror_wraith', 'void_harbinger']
    }
  });

  const ENEMIES = deepFreeze({
    rift_stalker: { id: 'rift_stalker', name: 'Rift Stalker', hp: 150, damage: 24, speed: 96, shards: 2, style: 'ambush' },
    astral_sentinel: { id: 'astral_sentinel', name: 'Astral Sentinel', hp: 240, damage: 30, speed: 60, shards: 3, style: 'beam' },
    ashbound_guardian: { id: 'ashbound_guardian', name: 'Ashbound Guardian', hp: 320, damage: 38, speed: 52, shards: 4, style: 'area_denial' },
    mirror_wraith: { id: 'mirror_wraith', name: 'Mirror Wraith', hp: 190, damage: 34, speed: 82, shards: 3, style: 'feint' },
    void_harbinger: { id: 'void_harbinger', name: 'Void Harbinger', hp: 1100, damage: 72, speed: 58, shards: 15, sigils: 1, style: 'boss' }
  });

  const RIFTS = deepFreeze({
    star_crown_rift: {
      id: 'star_crown_rift', name: 'Star-Crown Rift', regionId: 'celestial_ruins', waves: 4,
      enemyPool: ['rift_stalker', 'astral_sentinel'], reward: { shards: 12, sigils: 1 },
      hazard: { id: 'falling_constellations', name: 'Falling Constellations', damage: 22 }
    },
    phoenix_ash_rift: {
      id: 'phoenix_ash_rift', name: 'Phoenix-Ash Rift', regionId: 'ember_wastes', waves: 5,
      enemyPool: ['ashbound_guardian', 'rift_stalker'], reward: { shards: 15, sigils: 1 },
      hazard: { id: 'burning_ground', name: 'Burning Ground', damage: 16 }
    },
    drowned_moon_rift: {
      id: 'drowned_moon_rift', name: 'Drowned-Moon Rift', regionId: 'mirror_mire', waves: 5,
      enemyPool: ['mirror_wraith', 'rift_stalker'], reward: { shards: 18, sigils: 1 },
      hazard: { id: 'mirror_burst', name: 'Mirror Burst', damage: 25 }
    }
  });

  const BOUNTY_TARGETS = Object.freeze(['rift_stalker', 'astral_sentinel', 'ashbound_guardian', 'mirror_wraith']);
  const OBJECTIVE_IDS = Object.freeze(['entered', 'harbinger_defeated', 'first_bounty', 'soul_transformation']);

  function finiteInt(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(number)));
  }

  function targetForCycle(cycle) {
    return BOUNTY_TARGETS[(cycle - 1) % BOUNTY_TARGETS.length];
  }

  function requiredForCycle(cycle) {
    return 4 + ((cycle - 1) % 3);
  }

  function blankState() {
    return {
      version: VERSION,
      discovered: [],
      objectives: [],
      resources: { shards: 0, sigils: 0 },
      rifts: Object.fromEntries(Object.keys(RIFTS).map((id) => [id, { progress: 0, stabilized: false }])),
      kills: Object.fromEntries(Object.keys(ENEMIES).map((id) => [id, 0])),
      bounty: { cycle: 1, target: targetForCycle(1), required: requiredForCycle(1), progress: 0 },
      stats: { enemiesDefeated: 0, riftsStabilized: 0, bountiesClaimed: 0 }
    };
  }

  function createState(raw) {
    return deserialize(raw);
  }

  function deserialize(raw) {
    let source = raw;
    if (typeof source === 'string') {
      try { source = JSON.parse(source); } catch (_) { source = null; }
    }
    const state = blankState();
    if (!source || typeof source !== 'object' || Array.isArray(source)) return state;

    state.discovered = [...new Set(Array.isArray(source.discovered) ? source.discovered.filter((id) => REGIONS[id]) : [])];
    state.objectives = [...new Set(Array.isArray(source.objectives) ? source.objectives.filter((id) => OBJECTIVE_IDS.includes(id)) : [])];
    state.resources.shards = finiteInt(source.resources && source.resources.shards, 0, 0, MAX_RESOURCE);
    state.resources.sigils = finiteInt(source.resources && source.resources.sigils, 0, 0, MAX_RESOURCE);

    Object.keys(RIFTS).forEach((id) => {
      const saved = source.rifts && source.rifts[id];
      if (!saved || typeof saved !== 'object') return;
      const stabilized = saved.stabilized === true;
      state.rifts[id] = {
        progress: stabilized ? RIFTS[id].waves : finiteInt(saved.progress, 0, 0, RIFTS[id].waves),
        stabilized: stabilized
      };
    });
    Object.keys(ENEMIES).forEach((id) => {
      state.kills[id] = finiteInt(source.kills && source.kills[id], 0, 0, MAX_RESOURCE);
    });

    const cycle = finiteInt(source.bounty && source.bounty.cycle, 1, 1, MAX_RESOURCE);
    const required = requiredForCycle(cycle);
    state.bounty = {
      cycle: cycle,
      target: targetForCycle(cycle),
      required: required,
      progress: finiteInt(source.bounty && source.bounty.progress, 0, 0, required)
    };
    state.stats.enemiesDefeated = finiteInt(source.stats && source.stats.enemiesDefeated, 0, 0, MAX_RESOURCE);
    state.stats.riftsStabilized = Object.values(state.rifts).filter((rift) => rift.stabilized).length;
    state.stats.bountiesClaimed = finiteInt(source.stats && source.stats.bountiesClaimed, 0, 0, MAX_RESOURCE);
    return state;
  }

  function serialize(state) {
    const safe = deserialize(state);
    return {
      version: VERSION,
      discovered: safe.discovered.slice(),
      objectives: safe.objectives.slice(),
      resources: { ...safe.resources },
      rifts: Object.fromEntries(Object.entries(safe.rifts).map(([id, rift]) => [id, { ...rift }])),
      kills: { ...safe.kills },
      bounty: { ...safe.bounty },
      stats: { ...safe.stats }
    };
  }

  function completeObjective(state, id) {
    if (!state.objectives.includes(id)) state.objectives.push(id);
  }

  function addRewards(state, reward) {
    const shards = finiteInt(reward && reward.shards, 0, 0, MAX_RESOURCE);
    const sigils = finiteInt(reward && reward.sigils, 0, 0, MAX_RESOURCE);
    state.resources.shards = Math.min(MAX_RESOURCE, state.resources.shards + shards);
    state.resources.sigils = Math.min(MAX_RESOURCE, state.resources.sigils + sigils);
    return { shards: shards, sigils: sigils };
  }

  function discoverRegion(state, regionId) {
    const region = REGIONS[regionId];
    if (!region) return { ok: false, reason: 'unknown-region' };
    const alreadyDiscovered = state.discovered.includes(regionId);
    if (!alreadyDiscovered) state.discovered.push(regionId);
    completeObjective(state, 'entered');
    return { ok: true, region: region, alreadyDiscovered: alreadyDiscovered };
  }

  function defeatEnemy(state, enemyId, context) {
    const enemy = ENEMIES[enemyId];
    if (!enemy) return { ok: false, reason: 'unknown-enemy' };
    state.kills[enemyId] = finiteInt(state.kills[enemyId], 0, 0, MAX_RESOURCE - 1) + 1;
    state.stats.enemiesDefeated = Math.min(MAX_RESOURCE, state.stats.enemiesDefeated + 1);
    const reward = addRewards(state, { shards: enemy.shards, sigils: enemy.sigils });
    if (enemyId === 'void_harbinger') completeObjective(state, 'harbinger_defeated');

    if (enemyId === state.bounty.target && state.bounty.progress < state.bounty.required) state.bounty.progress += 1;
    let riftProgress = null;
    const rift = context && RIFTS[context.riftId];
    const riftState = rift && state.rifts[rift.id];
    if (rift && riftState && !riftState.stabilized && state.discovered.includes(rift.regionId) && rift.enemyPool.includes(enemyId)) {
      riftState.progress = Math.min(rift.waves, riftState.progress + 1);
      riftProgress = { current: riftState.progress, required: rift.waves, ready: riftState.progress >= rift.waves };
    }
    return { ok: true, enemy: enemy, reward: reward, riftProgress: riftProgress, bounty: inspectBounty(state) };
  }

  function inspectRift(state, riftId) {
    const rift = RIFTS[riftId];
    if (!rift) return { ok: false, reason: 'unknown-rift' };
    const progress = state.rifts[riftId];
    const discovered = state.discovered.includes(rift.regionId);
    return {
      ok: true, rift: rift, discovered: discovered, progress: progress.progress,
      required: rift.waves, ready: discovered && progress.progress >= rift.waves,
      stabilized: progress.stabilized
    };
  }

  function stabilizeRift(state, riftId) {
    const report = inspectRift(state, riftId);
    if (!report.ok) return report;
    if (report.stabilized) return { ...report, ok: true, reason: 'already-stabilized', reward: { shards: 0, sigils: 0 } };
    if (!report.discovered) return { ...report, ok: false, reason: 'region-undiscovered' };
    if (!report.ready) return { ...report, ok: false, reason: 'rift-incomplete' };
    state.rifts[riftId].stabilized = true;
    state.stats.riftsStabilized += 1;
    const reward = addRewards(state, report.rift.reward);
    return { ...report, ok: true, stabilized: true, reason: 'stabilized', reward: reward };
  }

  function inspectBounty(state) {
    const bounty = state.bounty;
    return {
      cycle: bounty.cycle,
      target: ENEMIES[bounty.target],
      progress: bounty.progress,
      required: bounty.required,
      ready: bounty.progress >= bounty.required,
      reward: { shards: 10 + bounty.cycle * 2, sigils: 1 }
    };
  }

  function claimBounty(state) {
    const report = inspectBounty(state);
    if (!report.ready) return { ...report, ok: false, reason: 'bounty-incomplete' };
    const reward = addRewards(state, report.reward);
    state.stats.bountiesClaimed = Math.min(MAX_RESOURCE, state.stats.bountiesClaimed + 1);
    completeObjective(state, 'first_bounty');
    const nextCycle = Math.min(MAX_RESOURCE, state.bounty.cycle + 1);
    state.bounty = {
      cycle: nextCycle,
      target: targetForCycle(nextCycle),
      required: requiredForCycle(nextCycle),
      progress: 0
    };
    return { ...report, ok: true, reason: 'claimed', reward: reward, next: inspectBounty(state) };
  }

  function inspectTransformation(state) {
    const missing = [];
    if (state.discovered.length < Object.keys(REGIONS).length) missing.push({ type: 'regions', current: state.discovered.length, required: 3 });
    const stabilized = Object.values(state.rifts).filter((rift) => rift.stabilized).length;
    if (stabilized < Object.keys(RIFTS).length) missing.push({ type: 'rifts', current: stabilized, required: 3 });
    if (!state.objectives.includes('harbinger_defeated')) missing.push({ type: 'objective', id: 'harbinger_defeated' });
    if (state.resources.shards < 60) missing.push({ type: 'shards', current: state.resources.shards, required: 60 });
    if (state.resources.sigils < 5) missing.push({ type: 'sigils', current: state.resources.sigils, required: 5 });
    return { ok: missing.length === 0, transformed: state.objectives.includes('soul_transformation'), missing: missing, costs: { shards: 60, sigils: 5 } };
  }

  function completeTransformation(state) {
    const report = inspectTransformation(state);
    if (report.transformed) return { ...report, ok: true, reason: 'already-transformed' };
    if (!report.ok) return { ...report, reason: 'requirements-not-met' };
    state.resources.shards -= report.costs.shards;
    state.resources.sigils -= report.costs.sigils;
    completeObjective(state, 'soul_transformation');
    return { ...report, ok: true, transformed: true, reason: 'transformed' };
  }

  function listObjectives(state) {
    const stableRifts = Object.values(state.rifts).filter((rift) => rift.stabilized).length;
    return [
      { id: 'enter', label: 'Cross into the Immortal Realm', current: state.objectives.includes('entered') ? 1 : 0, required: 1 },
      { id: 'discover', label: 'Chart its three domains', current: state.discovered.length, required: 3 },
      { id: 'rifts', label: 'Stabilize the realm rifts', current: stableRifts, required: 3 },
      { id: 'harbinger', label: 'Defeat the Void Harbinger', current: state.objectives.includes('harbinger_defeated') ? 1 : 0, required: 1 },
      { id: 'bounty', label: 'Complete an immortal hunt', current: state.objectives.includes('first_bounty') ? 1 : 0, required: 1 },
      { id: 'transform', label: 'Achieve Soul Transformation', current: state.objectives.includes('soul_transformation') ? 1 : 0, required: 1 }
    ].map((objective) => ({ ...objective, complete: objective.current >= objective.required }));
  }

  return Object.freeze({
    VERSION: VERSION,
    REGIONS: REGIONS,
    RIFTS: RIFTS,
    ENEMIES: ENEMIES,
    createState: createState,
    deserialize: deserialize,
    serialize: serialize,
    discoverRegion: discoverRegion,
    defeatEnemy: defeatEnemy,
    inspectRift: inspectRift,
    stabilizeRift: stabilizeRift,
    inspectBounty: inspectBounty,
    claimBounty: claimBounty,
    inspectTransformation: inspectTransformation,
    completeTransformation: completeTransformation,
    listObjectives: listObjectives
  });
});
