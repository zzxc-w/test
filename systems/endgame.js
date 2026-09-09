(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VerdantEndgame = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const MAX_TIER = 999;
  const MAX_NASCENT_STAGE = 9;
  const DEFAULT_BOSSES = Object.freeze([
    "jadehorn", "tempest_crane", "mirecoil_matriarch", "sectbreaker", "starfallen_warden"
  ]);
  const AFFIXES = Object.freeze([
    Object.freeze({ id: "storm_step", name: "Storm Step", description: "Enemies reposition when lightning falls." }),
    Object.freeze({ id: "seeking_thunder", name: "Seeking Thunder", description: "Lightning follows a cultivator who stands still." }),
    Object.freeze({ id: "fractured_ground", name: "Fractured Ground", description: "Old impact sites remain dangerous." }),
    Object.freeze({ id: "qi_suppression", name: "Qi Suppression", description: "Arts recover more slowly inside the formation." }),
    Object.freeze({ id: "heavenly_echo", name: "Heavenly Echo", description: "Elite techniques repeat after a short pause." })
  ]);

  function integer(value, fallback, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.floor(number)));
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function stageForTier(tier) {
    const cleared = integer(tier, 0, 0, MAX_TIER);
    if (!cleared) return 1;
    return Math.min(MAX_NASCENT_STAGE, Math.max(1, Math.floor((Math.sqrt(8 * cleared + 1) - 1) / 2)));
  }

  function thresholdForStage(stage) {
    const target = integer(stage, 1, 1, MAX_NASCENT_STAGE);
    return target <= 1 ? 0 : target * (target + 1) / 2;
  }

  function trialConfig(tier) {
    const value = integer(tier, 0, 1, MAX_TIER);
    if (!value) return null;
    const waveCount = Math.min(7, 3 + Math.floor((value - 1) / 3));
    const affixCount = Math.min(AFFIXES.length, 1 + Math.floor((value - 1) / 3));
    const waves = [];
    for (let wave = 1; wave <= waveCount; wave += 1) {
      waves.push({
        wave: wave,
        enemyCount: Math.min(30, 3 + value + wave),
        eliteCount: Math.min(8, Math.floor((value + wave) / 3)),
        hpMultiplier: round(1 + value * 0.13 + wave * 0.04),
        damageMultiplier: round(1 + value * 0.09 + wave * 0.025),
        speedMultiplier: round(Math.min(1.55, 1 + value * 0.012 + wave * 0.008))
      });
    }
    const targetStage = stageForTier(value);
    return deepFreeze({
      id: "heavenly_tribulation_" + value,
      tier: value,
      name: "Heavenly Tribulation · Tier " + value,
      omen: value % 3 === 0
        ? "The clouds gather without offering an answer."
        : "Thunder waits beyond the sanctuary wards.",
      entryCosts: [
        { type: "resource", id: "spiritStones", amount: 18 + value * 7 },
        ...(value >= 4 ? [{ type: "heavenlyMarks", id: "heavenlyMarks", amount: Math.ceil((value - 3) / 2) }] : [])
      ],
      rewards: {
        heavenlyMarks: 2 + Math.floor(value / 2),
        heavenlyInsight: 10 + value * 2,
        lootRank: 1 + Math.floor((value - 1) / 3)
      },
      waves: waves,
      boss: {
        hpMultiplier: round(1.3 + value * 0.28),
        damageMultiplier: round(1.15 + value * 0.16),
        speedMultiplier: round(Math.min(1.5, 1 + value * 0.018)),
        affixes: AFFIXES.slice(0, affixCount)
      },
      cultivation: {
        resultingStage: targetStage,
        advancesStage: value === thresholdForStage(targetStage) && targetStage > 1
      }
    });
  }

  function deserialize(raw) {
    let source = raw;
    if (typeof source === "string") {
      try { source = JSON.parse(source); } catch (_) { source = null; }
    }
    source = source && typeof source === "object" ? source : {};
    const bestTier = integer(source.bestTier, 0, 0, MAX_TIER);
    const sequence = integer(source.sequence, 0, 0, Number.MAX_SAFE_INTEGER);
    let active = null;
    if (source.active && typeof source.active === "object") {
      const tier = integer(source.active.tier, 0, 1, MAX_TIER);
      const attemptId = typeof source.active.attemptId === "string" && /^tribulation-\d+$/.test(source.active.attemptId)
        ? source.active.attemptId : "";
      if (tier && tier <= bestTier + 1 && attemptId) active = { attemptId: attemptId, tier: tier };
    }
    return {
      version: VERSION,
      bestTier: bestTier,
      totalCompletions: integer(source.totalCompletions, 0, 0, Number.MAX_SAFE_INTEGER),
      failedAttempts: integer(source.failedAttempts, 0, 0, Number.MAX_SAFE_INTEGER),
      heavenlyMarks: integer(source.heavenlyMarks, 0, 0, Number.MAX_SAFE_INTEGER),
      heavenlyInsight: integer(source.heavenlyInsight, 0, 0, Number.MAX_SAFE_INTEGER),
      nascentStage: stageForTier(bestTier),
      sequence: sequence,
      active: active
    };
  }

  function serialize(state) {
    return deserialize(state);
  }

  function createEndgameSystem(config) {
    config = config || {};
    const resources = config.resources || {};
    const progression = config.progression || {};
    const requiredBossIds = Array.isArray(config.requiredBossIds)
      ? config.requiredBossIds.filter((id, index, all) => typeof id === "string" && id && all.indexOf(id) === index)
      : DEFAULT_BOSSES.slice();
    const state = deserialize(config.state);

    function snapshot() {
      return serialize(state);
    }

    function eligible(context) {
      if (progression.isEligible) return !!progression.isEligible(context);
      const realm = progression.getRealm ? progression.getRealm(context) : null;
      const stage = Number(progression.getStage ? progression.getStage(context) : 0) || 0;
      const atNascentSoul = realm === "Nascent Soul" && stage >= 1;
      const missingBosses = requiredBossIds.filter((id) => !progression.hasDefeatedBoss || !progression.hasDefeatedBoss(id, context));
      return atNascentSoul && missingBosses.length === 0;
    }

    function inspect(tier, context) {
      const trial = trialConfig(tier);
      if (!trial) return { ok: false, code: "invalid_tier", tier: tier, checks: [], missing: [] };
      if (state.active) return { ok: false, code: "trial_active", tier: trial.tier, trial: trial, active: { ...state.active }, checks: [], missing: [] };
      if (trial.tier > state.bestTier + 1) return { ok: false, code: "tier_locked", tier: trial.tier, trial: trial, checks: [], missing: [] };

      const checks = [];
      if (progression.isEligible) {
        checks.push({ type: "eligibility", met: eligible(context) });
      } else {
        const realm = progression.getRealm ? progression.getRealm(context) : null;
        const stage = Number(progression.getStage ? progression.getStage(context) : 0) || 0;
        checks.push({ type: "realm", realm: realm, stage: stage, met: realm === "Nascent Soul" && stage >= 1 });
        requiredBossIds.forEach((id) => checks.push({
          type: "boss", id: id, met: !!progression.hasDefeatedBoss && !!progression.hasDefeatedBoss(id, context)
        }));
      }
      trial.entryCosts.forEach((cost) => {
        const available = cost.type === "heavenlyMarks"
          ? state.heavenlyMarks
          : Number(resources.get ? resources.get(cost.id, context) : 0) || 0;
        checks.push({ ...cost, available: available, met: available >= cost.amount });
      });
      const missing = checks.filter((check) => !check.met);
      return {
        ok: missing.length === 0,
        code: missing.length ? "requirements_not_met" : "ready",
        tier: trial.tier,
        trial: trial,
        checks: checks,
        missing: missing
      };
    }

    function pay(cost, context) {
      if (cost.type === "heavenlyMarks") {
        if (state.heavenlyMarks < cost.amount) return false;
        state.heavenlyMarks -= cost.amount;
        return true;
      }
      return !!resources.spend && resources.spend(cost.id, cost.amount, context) !== false;
    }

    function refund(cost, context) {
      if (cost.type === "heavenlyMarks") state.heavenlyMarks += cost.amount;
      else if (resources.credit) resources.credit(cost.id, cost.amount, context);
    }

    function begin(tier, context) {
      const report = inspect(tier, context);
      if (!report.ok) return report;
      const paid = [];
      try {
        for (const cost of report.trial.entryCosts) {
          if (!pay(cost, context)) throw new Error("payment_failed");
          paid.push(cost);
        }
      } catch (_) {
        paid.slice().reverse().forEach((cost) => refund(cost, context));
        return { ...report, ok: false, code: "payment_failed" };
      }
      state.sequence += 1;
      state.active = { attemptId: "tribulation-" + state.sequence, tier: report.trial.tier };
      return { ...report, ok: true, code: "begun", active: { ...state.active }, state: snapshot() };
    }

    function matchAttempt(attemptId) {
      return state.active && typeof attemptId === "string" && state.active.attemptId === attemptId;
    }

    function complete(attemptId) {
      if (!state.active) return { ok: false, code: "no_active_trial" };
      if (!matchAttempt(attemptId)) return { ok: false, code: "stale_attempt", active: { ...state.active } };
      const tier = state.active.tier;
      const trial = trialConfig(tier);
      const previousStage = state.nascentStage;
      state.active = null;
      state.totalCompletions += 1;
      state.bestTier = Math.max(state.bestTier, tier);
      state.heavenlyMarks += trial.rewards.heavenlyMarks;
      state.heavenlyInsight += trial.rewards.heavenlyInsight;
      state.nascentStage = stageForTier(state.bestTier);
      return {
        ok: true,
        code: "completed",
        tier: tier,
        rewards: { ...trial.rewards },
        stageAdvanced: state.nascentStage > previousStage,
        nascentStage: state.nascentStage,
        state: snapshot()
      };
    }

    function fail(attemptId) {
      if (!state.active) return { ok: false, code: "no_active_trial" };
      if (!matchAttempt(attemptId)) return { ok: false, code: "stale_attempt", active: { ...state.active } };
      const tier = state.active.tier;
      state.active = null;
      state.failedAttempts += 1;
      return { ok: true, code: "failed", tier: tier, state: snapshot() };
    }

    function progress() {
      const current = state.nascentStage;
      const nextStage = Math.min(MAX_NASCENT_STAGE, current + 1);
      const nextTier = current >= MAX_NASCENT_STAGE ? null : thresholdForStage(nextStage);
      return {
        nascentStage: current,
        bestTier: state.bestTier,
        nextStage: current >= MAX_NASCENT_STAGE ? null : nextStage,
        nextStageAtTier: nextTier,
        tiersRemaining: nextTier === null ? 0 : Math.max(0, nextTier - state.bestTier)
      };
    }

    return Object.freeze({
      inspect: inspect,
      begin: begin,
      complete: complete,
      fail: fail,
      active: function () { return state.active ? { ...state.active, trial: trialConfig(state.active.tier) } : null; },
      progress: progress,
      serialize: snapshot,
      trialConfig: trialConfig
    });
  }

  return Object.freeze({
    VERSION: VERSION,
    MAX_TIER: MAX_TIER,
    MAX_NASCENT_STAGE: MAX_NASCENT_STAGE,
    DEFAULT_BOSSES: DEFAULT_BOSSES,
    AFFIXES: AFFIXES,
    stageForTier: stageForTier,
    thresholdForStage: thresholdForStage,
    trialConfig: trialConfig,
    deserialize: deserialize,
    serialize: serialize,
    createEndgameSystem: createEndgameSystem
  });
});
