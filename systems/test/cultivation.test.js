const test = require("node:test");
const assert = require("node:assert/strict");
const { createCultivationSystem } = require("../cultivation.js");

function fixture(options) {
  const items = { herb: 3 };
  const values = { qi: 20 };
  let stage = 1;
  const system = createCultivationSystem(Object.assign({
    recipes: {
      foundation: {
        requirements: [{ type: "stage", atLeast: 1 }, { type: "flag", id: "foundVein" }],
        costs: [{ type: "item", id: "herb", amount: 2 }, { type: "resource", id: "qi", amount: 10 }],
        result: { stage: 2 },
      },
    },
    inventory: {
      count: (id) => items[id] || 0,
      remove: (id, n) => items[id] >= n && ((items[id] -= n) >= 0),
      add: (id, n) => { items[id] = (items[id] || 0) + n; },
    },
    resources: {
      get: (id) => values[id] || 0,
      spend: (id, n) => values[id] >= n && ((values[id] -= n) >= 0),
      credit: (id, n) => { values[id] = (values[id] || 0) + n; },
    },
    state: { hasFlag: (id, ctx) => !!ctx.flags[id], getStage: () => stage },
    compareStage: (a, b) => a - b,
    applyResult: (result) => { stage = result.stage; },
  }, options));
  return { system, items, values, stage: () => stage };
}

test("inspection reports each missing requirement without mutation", () => {
  const value = fixture();
  const report = value.system.inspect("foundation", { flags: {} });
  assert.equal(report.code, "requirements_not_met");
  assert.deepEqual(report.missing.map((entry) => entry.type), ["flag"]);
  assert.equal(value.items.herb, 3);
  assert.equal(value.values.qi, 20);
});

test("successful attempt consumes costs and applies result", () => {
  const value = fixture();
  assert.equal(value.system.attempt("foundation", { flags: { foundVein: true } }).code, "cultivated");
  assert.equal(value.items.herb, 1);
  assert.equal(value.values.qi, 10);
  assert.equal(value.stage(), 2);
});

test("before hook can veto and failed result rolls back costs", () => {
  const vetoed = fixture({ hooks: { beforeAttempt: () => ({ ok: false, code: "wrong_beacon" }) } });
  assert.equal(vetoed.system.attempt("foundation", { flags: { foundVein: true } }).code, "wrong_beacon");
  assert.equal(vetoed.items.herb, 3);

  const failed = fixture({ applyResult: () => { throw new Error("boom"); } });
  assert.equal(failed.system.attempt("foundation", { flags: { foundVein: true } }).code, "apply_failed");
  assert.equal(failed.items.herb, 3);
  assert.equal(failed.values.qi, 20);
});
