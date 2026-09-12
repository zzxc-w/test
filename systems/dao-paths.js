(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VerdantDaoPaths = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const RESOURCE_IDS = Object.freeze({ shards: "shards", sigils: "sigils" });

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  const PATHS = deepFreeze({
    starblade: {
      id: "starblade",
      name: "Starblade Constellation",
      discipline: "offense",
      description: "Turn celestial pressure into decisive strikes.",
      nodes: [
        { id: "piercing_star", name: "Piercing Star", description: "Attacks carry greater force.", cost: { shards: 18, sigils: 1 }, bonuses: { attackPowerPct: 0.06 } },
        { id: "blood_comet", name: "Blood Comet", description: "A relentless rhythm creates openings.", cost: { shards: 32, sigils: 2 }, bonuses: { critChance: 0.05, attackSpeedPct: 0.04 } },
        { id: "heaven_sunder", name: "Heaven Sunder", description: "Strikes bite deeply into mighty foes.", cost: { shards: 50, sigils: 3 }, bonuses: { bossDamagePct: 0.12 } }
      ]
    },
    moon_aegis: {
      id: "moon_aegis",
      name: "Moon-Aegis Constellation",
      discipline: "defense_parry",
      description: "Meet violence with stillness, then return it twofold.",
      nodes: [
        { id: "still_moon", name: "Still Moon", description: "The body endures like a moonlit bastion.", cost: { shards: 18, sigils: 1 }, bonuses: { maxHealth: 18 } },
        { id: "returning_tide", name: "Returning Tide", description: "Perfect guards become easier and restore qi.", cost: { shards: 32, sigils: 2 }, bonuses: { parryWindowMs: 50, parryQiRefund: 6 } },
        { id: "adamant_heaven", name: "Adamant Heaven", description: "Incoming force wanes before a punishing riposte.", cost: { shards: 50, sigils: 3 }, bonuses: { damageReductionPct: 0.1, riposteDamagePct: 0.2 } }
      ]
    },
    boundless_step: {
      id: "boundless_step",
      name: "Boundless-Step Constellation",
      discipline: "mobility_qi",
      description: "Flow through the world on inexhaustible meridians.",
      nodes: [
        { id: "windborne_meridian", name: "Windborne Meridian", description: "Movement quickens and the qi sea deepens.", cost: { shards: 18, sigils: 1 }, bonuses: { moveSpeedPct: 0.05, maxQi: 12 } },
        { id: "empty_crossing", name: "Empty Crossing", description: "Dashing demands less qi and returns sooner.", cost: { shards: 32, sigils: 2 }, bonuses: { dashCooldownReductionPct: 0.1, dashQiCostReduction: 2 } },
        { id: "boundless_meridian", name: "Boundless Meridian", description: "Qi renews itself while every step crosses farther.", cost: { shards: 50, sigils: 3 }, bonuses: { qiRegenPerSecond: 2, dashDistancePct: 0.12 } }
      ]
    }
  });

  const PATH_IDS = Object.freeze(Object.keys(PATHS));
  const NODE_LOOKUP = Object.freeze(Object.fromEntries(PATH_IDS.flatMap((pathId) =>
    PATHS[pathId].nodes.map((node, index) => [node.id, Object.freeze({ pathId: pathId, index: index, node: node })])
  )));

  function blankState() {
    return { version: VERSION, unlocked: Object.fromEntries(PATH_IDS.map((id) => [id, []])), attunedPath: null };
  }

  function parse(raw) {
    if (typeof raw !== "string") return raw;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function deserialize(raw) {
    const source = parse(raw);
    const state = blankState();
    if (!source || typeof source !== "object" || Array.isArray(source)) return state;
    PATH_IDS.forEach((pathId) => {
      const saved = source.unlocked && source.unlocked[pathId];
      if (!Array.isArray(saved)) return;
      const savedIds = new Set(saved.filter((id) => typeof id === "string"));
      for (const node of PATHS[pathId].nodes) {
        if (!savedIds.has(node.id)) break;
        state.unlocked[pathId].push(node.id);
      }
    });
    const attuned = source.attunedPath;
    if (PATHS[attuned] && state.unlocked[attuned].length > 0) state.attunedPath = attuned;
    return state;
  }

  function serialize(state) {
    const safe = deserialize(state);
    return {
      version: VERSION,
      unlocked: Object.fromEntries(PATH_IDS.map((id) => [id, safe.unlocked[id].slice()])),
      attunedPath: safe.attunedPath
    };
  }

  function createDaoPathSystem(config) {
    config = config || {};
    const resources = config.resources || {};
    const state = deserialize(config.state);

    function snapshot() { return serialize(state); }

    function available(resourceId, context) {
      try {
        const value = Number(resources.get ? resources.get(resourceId, context) : 0);
        return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
      } catch (_) {
        return 0;
      }
    }

    function inspect(pathId, nodeId, context) {
      const path = PATHS[pathId];
      if (!path) return { ok: false, code: "unknown_path", pathId: pathId };
      const unlocked = state.unlocked[pathId];
      if (nodeId === undefined || nodeId === null) {
        const nextNode = path.nodes[unlocked.length] || null;
        return {
          ok: true, code: "path", path: path, unlocked: unlocked.slice(), nextNode: nextNode,
          complete: unlocked.length === path.nodes.length, attuned: state.attunedPath === pathId
        };
      }
      const found = NODE_LOOKUP[nodeId];
      if (!found || found.pathId !== pathId) return { ok: false, code: "unknown_node", path: path, nodeId: nodeId };
      const alreadyUnlocked = unlocked.includes(nodeId);
      const prerequisite = found.index > 0 ? path.nodes[found.index - 1] : null;
      const prerequisiteMet = !prerequisite || unlocked.includes(prerequisite.id);
      const checks = Object.entries(found.node.cost).map(([resourceId, amount]) => {
        const held = available(RESOURCE_IDS[resourceId], context);
        return { resourceId: RESOURCE_IDS[resourceId], amount: amount, available: held, met: held >= amount };
      });
      let code = "ready";
      if (alreadyUnlocked) code = "already_unlocked";
      else if (!prerequisiteMet) code = "prerequisite_locked";
      else if (checks.some((check) => !check.met)) code = "insufficient_resources";
      return {
        ok: alreadyUnlocked || code === "ready", code: code, path: path, node: found.node,
        index: found.index, alreadyUnlocked: alreadyUnlocked, prerequisite: prerequisite,
        checks: checks, missing: checks.filter((check) => !check.met)
      };
    }

    function pay(costs, context) {
      if (typeof resources.transact === "function") {
        try {
          const accepted = resources.transact(costs.map((cost) => ({ ...cost })), context);
          return accepted === false ? { ok: false, code: "payment_failed" } : { ok: true };
        } catch (_) {
          return { ok: false, code: "payment_failed" };
        }
      }
      if (typeof resources.spend !== "function") return { ok: false, code: "payment_failed" };
      const paid = [];
      try {
        for (const cost of costs) {
          if (resources.spend(cost.resourceId, cost.amount, context) === false) throw new Error("spend_failed");
          paid.push(cost);
        }
      } catch (_) {
        let rollbackFailed = false;
        for (const cost of paid.slice().reverse()) {
          try {
            if (typeof resources.credit !== "function" || resources.credit(cost.resourceId, cost.amount, context) === false) rollbackFailed = true;
          } catch (_) { rollbackFailed = true; }
        }
        return { ok: false, code: rollbackFailed ? "rollback_failed" : "payment_failed" };
      }
      return { ok: true };
    }

    function unlock(pathId, nodeId, context) {
      const report = inspect(pathId, nodeId, context);
      if (!report.ok) return report;
      if (report.alreadyUnlocked) return { ...report, state: snapshot() };
      const payment = pay(report.checks.map((check) => ({ resourceId: check.resourceId, amount: check.amount })), context);
      if (!payment.ok) return { ...report, ok: false, code: payment.code };
      state.unlocked[pathId].push(nodeId);
      return { ...report, ok: true, code: "unlocked", state: snapshot() };
    }

    function attune(pathId) {
      if (pathId === null) {
        state.attunedPath = null;
        return { ok: true, code: "unattuned", path: null, bonuses: {} };
      }
      const path = PATHS[pathId];
      if (!path) return { ok: false, code: "unknown_path", pathId: pathId };
      if (state.unlocked[pathId].length === 0) return { ok: false, code: "path_locked", path: path };
      const unchanged = state.attunedPath === pathId;
      state.attunedPath = pathId;
      return { ok: true, code: unchanged ? "already_attuned" : "attuned", path: path, bonuses: aggregateBonuses(), state: snapshot() };
    }

    function aggregateBonuses() {
      if (!state.attunedPath) return {};
      const result = {};
      const unlocked = new Set(state.unlocked[state.attunedPath]);
      PATHS[state.attunedPath].nodes.forEach((node) => {
        if (!unlocked.has(node.id)) return;
        Object.entries(node.bonuses).forEach(([key, value]) => { result[key] = (result[key] || 0) + value; });
      });
      return result;
    }

    return Object.freeze({
      inspect: inspect,
      unlock: unlock,
      attune: attune,
      aggregateBonuses: aggregateBonuses,
      serialize: snapshot
    });
  }

  return Object.freeze({
    VERSION: VERSION,
    PATHS: PATHS,
    PATH_IDS: PATH_IDS,
    RESOURCE_IDS: RESOURCE_IDS,
    deserialize: deserialize,
    serialize: serialize,
    createDaoPathSystem: createDaoPathSystem
  });
});
