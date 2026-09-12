(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VerdantCelestialEvents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const MAX_COUNT = 1000000000;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return value;
  }

  // Incursions rotate by completion count, never by wall-clock time. This keeps
  // offline saves reproducible and lets the renderer decide when to offer one.
  const DEFINITIONS = deepFreeze([
    {
      id: 'star_crown_pursuit', name: 'Star-Crown Pursuit', regionId: 'celestial_ruins',
      description: 'Rift Stalkers descend through the broken palace rings.',
      targetId: 'rift_stalker', quota: 7,
      elite: { enemyId: 'astral_sentinel', name: 'Crownless Sentinel' },
      reward: { shards: 18, sigils: 1 }
    },
    {
      id: 'phoenix_road_siege', name: 'Phoenix-Road Siege', regionId: 'ember_wastes',
      description: 'Ashbound Guardians are claiming the old phoenix road.',
      targetId: 'ashbound_guardian', quota: 5,
      elite: null,
      reward: { shards: 20, sigils: 1 }
    },
    {
      id: 'drowned_moon_breach', name: 'Drowned-Moon Breach', regionId: 'mirror_mire',
      description: 'Mirror Wraiths spill from reflections across the mire.',
      targetId: 'mirror_wraith', quota: 6,
      elite: { enemyId: 'mirror_wraith', name: 'Unmoored Reflection' },
      reward: { shards: 24, sigils: 2 }
    },
    {
      id: 'ember_stalker_hunt', name: 'Ember Stalker Hunt', regionId: 'ember_wastes',
      description: 'Rift Stalkers hunt beneath the ash storm.',
      targetId: 'rift_stalker', quota: 8,
      elite: { enemyId: 'ashbound_guardian', name: 'Cinderbound Warden' },
      reward: { shards: 22, sigils: 1 }
    },
    {
      id: 'silent_palace_watch', name: 'Silent Palace Watch', regionId: 'celestial_ruins',
      description: 'Astral Sentinels have awakened around the silent altar.',
      targetId: 'astral_sentinel', quota: 5,
      elite: null,
      reward: { shards: 21, sigils: 1 }
    },
    {
      id: 'glasswater_hunt', name: 'Glasswater Hunt', regionId: 'mirror_mire',
      description: 'Stalkers cross the mire without disturbing its surface.',
      targetId: 'rift_stalker', quota: 7,
      elite: { enemyId: 'mirror_wraith', name: 'Glasswater Shade' },
      reward: { shards: 25, sigils: 2 }
    }
  ]);

  const DEFINITION_BY_ID = Object.freeze(Object.fromEntries(DEFINITIONS.map((definition) => [definition.id, definition])));

  function finiteInt(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(number)));
  }

  function definitionForCompletionCount(completionCount) {
    return DEFINITIONS[completionCount % DEFINITIONS.length];
  }

  function blankState() {
    return {
      version: VERSION,
      completionCount: 0,
      active: null,
      claimed: { shards: 0, sigils: 0 },
      abandonedCount: 0
    };
  }

  function deserialize(raw) {
    let source = raw;
    if (typeof source === 'string') {
      try { source = JSON.parse(source); } catch (_) { source = null; }
    }
    const state = blankState();
    if (!source || typeof source !== 'object' || Array.isArray(source)) return state;

    state.completionCount = finiteInt(source.completionCount, 0, 0, MAX_COUNT);
    state.claimed.shards = finiteInt(source.claimed && source.claimed.shards, 0, 0, MAX_COUNT);
    state.claimed.sigils = finiteInt(source.claimed && source.claimed.sigils, 0, 0, MAX_COUNT);
    state.abandonedCount = finiteInt(source.abandonedCount, 0, 0, MAX_COUNT);

    const expected = definitionForCompletionCount(state.completionCount);
    const saved = source.active;
    if (saved && typeof saved === 'object' && !Array.isArray(saved) && saved.eventId === expected.id) {
      const progress = finiteInt(saved.progress, 0, 0, expected.quota);
      state.active = {
        eventId: expected.id,
        progress: progress,
        eliteDefeated: Boolean(expected.elite && progress >= expected.quota && saved.eliteDefeated === true)
      };
    }
    return state;
  }

  function createState(raw) {
    return deserialize(raw);
  }

  function serialize(state) {
    const safe = deserialize(state);
    return {
      version: VERSION,
      completionCount: safe.completionCount,
      active: safe.active ? { ...safe.active } : null,
      claimed: { ...safe.claimed },
      abandonedCount: safe.abandonedCount
    };
  }

  function isRuntimeState(state) {
    return Boolean(state && typeof state === 'object' && !Array.isArray(state)
      && Number.isInteger(state.completionCount) && state.completionCount >= 0
      && state.claimed && typeof state.claimed === 'object');
  }

  function inspect(state) {
    if (!isRuntimeState(state)) return { ok: false, reason: 'invalid-state' };
    const definition = definitionForCompletionCount(state.completionCount);
    if (!state.active) {
      return {
        ok: true, active: false, cycle: state.completionCount + 1,
        definition: definition, progress: 0, required: definition.quota,
        eliteUnlocked: false, ready: false
      };
    }
    const progress = finiteInt(state.active.progress, 0, 0, definition.quota);
    const eliteDefeated = Boolean(definition.elite && state.active.eliteDefeated === true);
    const quotaMet = progress >= definition.quota;
    return {
      ok: true, active: true, cycle: state.completionCount + 1,
      definition: definition, progress: progress, required: definition.quota,
      eliteUnlocked: quotaMet && Boolean(definition.elite), eliteDefeated: eliteDefeated,
      ready: quotaMet && (!definition.elite || eliteDefeated)
    };
  }

  function start(state) {
    const report = inspect(state);
    if (!report.ok) return report;
    if (report.active) return { ...report, reason: 'already-active' };
    state.active = { eventId: report.definition.id, progress: 0, eliteDefeated: false };
    return { ...inspect(state), reason: 'started' };
  }

  function recordKill(state, enemyId, options) {
    const report = inspect(state);
    if (!report.ok) return report;
    if (!report.active) return { ...report, ok: false, reason: 'no-active-event' };

    const isElite = Boolean(options && options.elite === true);
    let matched = false;
    let reason = 'unrelated-enemy';
    if (isElite) {
      if (!report.definition.elite || enemyId !== report.definition.elite.enemyId) reason = 'wrong-elite';
      else if (!report.eliteUnlocked) reason = 'elite-locked';
      else if (state.active.eliteDefeated) reason = 'elite-already-defeated';
      else {
        state.active.eliteDefeated = true;
        matched = true;
        reason = 'elite-defeated';
      }
    } else if (enemyId === report.definition.targetId && state.active.progress < report.required) {
      state.active.progress += 1;
      matched = true;
      reason = state.active.progress >= report.required
        ? (report.definition.elite ? 'elite-unlocked' : 'quota-complete')
        : 'progress';
    } else if (enemyId === report.definition.targetId) {
      reason = 'quota-already-complete';
    }
    return { ...inspect(state), matched: matched, reason: reason };
  }

  function complete(state) {
    const report = inspect(state);
    if (!report.ok) return report;
    if (!report.active) return { ...report, ok: false, reason: 'no-active-event' };
    if (!report.ready) return { ...report, ok: false, reason: 'incursion-incomplete' };

    const reward = { ...report.definition.reward };
    state.claimed.shards = Math.min(MAX_COUNT, finiteInt(state.claimed.shards, 0, 0, MAX_COUNT) + reward.shards);
    state.claimed.sigils = Math.min(MAX_COUNT, finiteInt(state.claimed.sigils, 0, 0, MAX_COUNT) + reward.sigils);
    state.completionCount = Math.min(MAX_COUNT, state.completionCount + 1);
    state.active = null;
    return {
      ok: true, reason: 'completed', completed: report.definition,
      reward: reward, completionCount: state.completionCount, next: inspect(state)
    };
  }

  function abandon(state) {
    const report = inspect(state);
    if (!report.ok) return report;
    if (!report.active) return { ...report, ok: false, reason: 'no-active-event' };
    state.active = null;
    state.abandonedCount = Math.min(MAX_COUNT, finiteInt(state.abandonedCount, 0, 0, MAX_COUNT) + 1);
    return { ok: true, reason: 'abandoned', abandoned: report.definition, next: inspect(state) };
  }

  return Object.freeze({
    VERSION: VERSION,
    DEFINITIONS: DEFINITIONS,
    DEFINITION_BY_ID: DEFINITION_BY_ID,
    createState: createState,
    deserialize: deserialize,
    serialize: serialize,
    inspect: inspect,
    start: start,
    recordKill: recordKill,
    complete: complete,
    abandon: abandon
  });
});
