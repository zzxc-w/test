(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VerdantCultivation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createCultivationSystem(config) {
    config = config || {};
    const recipes = config.recipes || {};
    const inventory = config.inventory || {};
    const resources = config.resources || {};
    const state = config.state || {};
    const hooks = config.hooks || {};

    function availableFor(requirement, context) {
      if (requirement.type === "item") return Number(inventory.count ? inventory.count(requirement.id, context) : 0);
      if (requirement.type === "resource") return Number(resources.get ? resources.get(requirement.id, context) : 0);
      if (requirement.type === "flag") return state.hasFlag ? !!state.hasFlag(requirement.id, context) : false;
      if (requirement.type === "stage") return state.getStage ? state.getStage(context) : null;
      if (requirement.type === "predicate") return !!(requirement.test && requirement.test(context));
      return undefined;
    }

    function check(requirement, context) {
      const available = availableFor(requirement, context);
      let met = false;
      if (requirement.type === "item" || requirement.type === "resource") met = available >= (requirement.amount || 1);
      else if (requirement.type === "flag" || requirement.type === "predicate") met = !!available === (requirement.value !== false);
      else if (requirement.type === "stage") {
        met = config.compareStage ? config.compareStage(available, requirement.atLeast, context) >= 0 : available === requirement.atLeast;
      }
      return Object.assign({}, requirement, { available, met });
    }

    function inspect(recipeId, context) {
      const recipe = recipes[recipeId];
      if (!recipe) return { ok: false, code: "unknown_recipe", recipeId, checks: [] };
      if (recipe.condition && !recipe.condition(context)) return { ok: false, code: "locked", recipeId, recipe, checks: [] };
      const checks = (recipe.requirements || []).concat(recipe.costs || []).map((requirement) => check(requirement, context));
      const missing = checks.filter((result) => !result.met);
      return { ok: missing.length === 0, code: missing.length ? "requirements_not_met" : "ready", recipeId, recipe, checks, missing };
    }

    function consume(cost, context) {
      const amount = cost.amount || 1;
      if (cost.type === "item") return !!inventory.remove && inventory.remove(cost.id, amount, context) !== false;
      if (cost.type === "resource") return !!resources.spend && resources.spend(cost.id, amount, context) !== false;
      return true;
    }

    function refund(cost, context) {
      const amount = cost.amount || 1;
      if (cost.type === "item" && inventory.add) inventory.add(cost.id, amount, context);
      if (cost.type === "resource" && resources.credit) resources.credit(cost.id, amount, context);
    }

    function attempt(recipeId, context) {
      const report = inspect(recipeId, context);
      if (!report.ok) return report;
      if (hooks.beforeAttempt) {
        const gate = hooks.beforeAttempt(report.recipe, context, report);
        if (gate === false || (gate && gate.ok === false)) return Object.assign({}, report, { ok: false, code: gate.code || "blocked" });
      }
      const consumed = [];
      for (const cost of report.recipe.costs || []) {
        if (!consume(cost, context)) {
          consumed.reverse().forEach((paid) => refund(paid, context));
          return Object.assign({}, report, { ok: false, code: "consume_failed" });
        }
        consumed.push(cost);
      }
      try {
        if (config.applyResult) config.applyResult(report.recipe.result, context, report.recipe);
      } catch (error) {
        consumed.reverse().forEach((paid) => refund(paid, context));
        return Object.assign({}, report, { ok: false, code: "apply_failed", error });
      }
      const result = Object.assign({}, report, { ok: true, code: "cultivated" });
      if (hooks.afterAttempt) hooks.afterAttempt(result, context);
      return result;
    }

    return { inspect, attempt };
  }

  return { createCultivationSystem };
});
