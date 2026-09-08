(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VerdantSkills = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  const definitions = [
    {
      id: "ember_palm", name: "Ember Palm", kind: "active", tutorId: "tutor_meilin",
      description: "Release a short cone of flame that scorches nearby enemies.",
      prerequisites: [{ type: "stage", atLeast: 1 }],
      costs: [{ type: "resource", id: "spiritStones", amount: 8 }],
      effect: { move: "ember_palm", damageMultiplier: 1.35, cooldown: 4.5, element: "fire" }
    },
    {
      id: "gale_step", name: "Gale Step", kind: "passive", tutorId: "tutor_meilin",
      description: "Refine footwork to recover from dashes more quickly.",
      prerequisites: [{ type: "skill", id: "ember_palm" }],
      costs: [{ type: "resource", id: "spiritStones", amount: 14 }],
      effect: { dashCooldownMultiplier: 0.88, moveSpeedMultiplier: 1.03 }
    },
    {
      id: "iron_root", name: "Iron Root", kind: "passive", tutorId: "tutor_bao",
      description: "Root the body like a mountain to endure heavier blows.",
      prerequisites: [{ type: "stage", atLeast: 2 }],
      costs: [
        { type: "resource", id: "spiritStones", amount: 12 },
        { type: "item", id: "iron_ore", amount: 3 }
      ],
      effect: { defense: 0.06, maxHpBonus: 12 }
    },
    {
      id: "flowing_guard", name: "Flowing Guard", kind: "passive", tutorId: "tutor_suye",
      description: "Guide hostile force aside with a wider parry window.",
      prerequisites: [{ type: "flag", id: "met_suye" }],
      costs: [{ type: "resource", id: "spiritStones", amount: 16 }],
      effect: { parryWindowMultiplier: 1.18, parryRecoveryMultiplier: 0.92 }
    }
  ];

  const CATALOG = deepFreeze(Object.fromEntries(definitions.map((skill) => [skill.id, skill])));
  const TUTOR_INDEX = deepFreeze(definitions.reduce((index, skill) => {
    if (!index[skill.tutorId]) index[skill.tutorId] = [];
    index[skill.tutorId].push(skill.id);
    return index;
  }, {}));

  function validSkillId(value) {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(CATALOG, value);
  }

  function deserialize(raw) {
    let source = raw;
    if (typeof source === "string") {
      try { source = JSON.parse(source); } catch (_) { source = null; }
    }
    const candidates = source && Array.isArray(source.learned) ? source.learned : [];
    const learned = [];
    const seen = new Set();
    candidates.forEach((id) => {
      if (validSkillId(id) && !seen.has(id)) {
        seen.add(id);
        learned.push(id);
      }
    });
    return { version: VERSION, learned: learned };
  }

  function serialize(state) {
    return deserialize(state);
  }

  function createSkillSystem(config) {
    config = config || {};
    const resources = config.resources || {};
    const inventory = config.inventory || {};
    const progression = config.progression || {};
    const hooks = config.hooks || {};
    const state = deserialize(config.state);

    function hasLearned(skillId) {
      return state.learned.includes(skillId);
    }

    function getStage(context) {
      return progression.getStage ? progression.getStage(context) : 0;
    }

    function compareStage(current, required, context) {
      if (config.compareStage) return config.compareStage(current, required, context);
      if (Number.isFinite(Number(current)) && Number.isFinite(Number(required))) {
        return Number(current) - Number(required);
      }
      return current === required ? 0 : -1;
    }

    function check(requirement, context, isCost) {
      let available;
      let met = false;
      const amount = Math.max(1, Number(requirement.amount) || 1);
      if (requirement.type === "skill") {
        available = hasLearned(requirement.id);
        met = available;
      } else if (requirement.type === "flag") {
        available = progression.hasFlag ? !!progression.hasFlag(requirement.id, context) : false;
        met = available === (requirement.value !== false);
      } else if (requirement.type === "stage") {
        available = getStage(context);
        met = compareStage(available, requirement.atLeast, context) >= 0;
      } else if (requirement.type === "resource") {
        available = Number(resources.get ? resources.get(requirement.id, context) : 0) || 0;
        met = available >= amount;
      } else if (requirement.type === "item") {
        available = Number(inventory.count ? inventory.count(requirement.id, context) : 0) || 0;
        met = available >= amount;
      } else if (requirement.type === "predicate") {
        available = !!(requirement.test && requirement.test(context));
        met = available;
      }
      return Object.assign({}, requirement, { amount: amount, available: available, met: met, cost: !!isCost });
    }

    function inspect(skillId, context) {
      const skill = validSkillId(skillId) ? CATALOG[skillId] : null;
      if (!skill) return { ok: false, code: "unknown_skill", skillId: skillId, checks: [], missing: [] };
      if (hasLearned(skillId)) return { ok: false, code: "already_learned", skillId: skillId, skill: skill, checks: [], missing: [] };
      const prerequisiteChecks = skill.prerequisites.map((entry) => check(entry, context, false));
      const costChecks = skill.costs.map((entry) => check(entry, context, true));
      const checks = prerequisiteChecks.concat(costChecks);
      const missing = checks.filter((entry) => !entry.met);
      return {
        ok: missing.length === 0,
        code: missing.length ? "requirements_not_met" : "ready",
        skillId: skillId,
        skill: skill,
        checks: checks,
        missing: missing
      };
    }

    function spend(cost, context) {
      if (cost.type === "resource") {
        return !!resources.spend && resources.spend(cost.id, cost.amount, context) !== false;
      }
      if (cost.type === "item") {
        return !!inventory.remove && inventory.remove(cost.id, cost.amount, context) !== false;
      }
      return true;
    }

    function refund(cost, context) {
      if (cost.type === "resource" && resources.credit) resources.credit(cost.id, cost.amount, context);
      if (cost.type === "item" && inventory.add) inventory.add(cost.id, cost.amount, context);
    }

    function learn(skillId, context) {
      const report = inspect(skillId, context);
      if (!report.ok) return report;
      if (hooks.beforeLearn) {
        const gate = hooks.beforeLearn(report.skill, context, report);
        if (gate === false || (gate && gate.ok === false)) {
          return Object.assign({}, report, { ok: false, code: gate && gate.code || "blocked" });
        }
      }

      const paid = [];
      for (const cost of report.skill.costs) {
        const checkedCost = check(cost, context, true);
        if (!checkedCost.met || !spend(checkedCost, context)) {
          paid.slice().reverse().forEach((entry) => refund(entry, context));
          return Object.assign({}, report, { ok: false, code: "payment_failed" });
        }
        paid.push(checkedCost);
      }

      state.learned.push(skillId);
      try {
        if (hooks.afterLearn) hooks.afterLearn(report.skill, context, snapshot());
      } catch (error) {
        state.learned.splice(state.learned.indexOf(skillId), 1);
        paid.slice().reverse().forEach((entry) => refund(entry, context));
        return Object.assign({}, report, { ok: false, code: "apply_failed", error: error });
      }
      return Object.assign({}, report, { ok: true, code: "learned", state: snapshot() });
    }

    function listByTutor(tutorId, context) {
      const ids = typeof tutorId === "string" ? TUTOR_INDEX[tutorId] || [] : [];
      return ids.map((id) => ({ skill: CATALOG[id], status: inspect(id, context) }));
    }

    function learnedSkills() {
      return state.learned.map((id) => CATALOG[id]);
    }

    function passiveEffects() {
      return learnedSkills().filter((skill) => skill.kind === "passive").map((skill) => skill.effect);
    }

    function snapshot() {
      return serialize(state);
    }

    return Object.freeze({
      inspect: inspect,
      learn: learn,
      hasLearned: hasLearned,
      listByTutor: listByTutor,
      learnedSkills: learnedSkills,
      passiveEffects: passiveEffects,
      serialize: snapshot
    });
  }

  return Object.freeze({
    VERSION: VERSION,
    CATALOG: CATALOG,
    TUTOR_INDEX: TUTOR_INDEX,
    deserialize: deserialize,
    serialize: serialize,
    createSkillSystem: createSkillSystem
  });
});
