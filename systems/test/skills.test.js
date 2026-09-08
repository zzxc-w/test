"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Skills = require("../skills.js");

function fixture(options) {
  const values = { spiritStones: 40 };
  const items = { iron_ore: 4 };
  let stage = 3;
  const flags = { met_suye: true };
  const config = Object.assign({
    resources: {
      get: (id) => values[id] || 0,
      spend: (id, amount) => values[id] >= amount && ((values[id] -= amount) >= 0),
      credit: (id, amount) => { values[id] = (values[id] || 0) + amount; }
    },
    inventory: {
      count: (id) => items[id] || 0,
      remove: (id, amount) => items[id] >= amount && ((items[id] -= amount) >= 0),
      add: (id, amount) => { items[id] = (items[id] || 0) + amount; }
    },
    progression: {
      getStage: () => stage,
      hasFlag: (id) => !!flags[id]
    }
  }, options);
  return { system: Skills.createSkillSystem(config), values, items, flags, setStage: (value) => { stage = value; } };
}

test("built-in definitions and tutor indexes are deeply immutable", () => {
  assert.equal(Object.isFrozen(Skills.CATALOG), true);
  assert.equal(Object.isFrozen(Skills.CATALOG.ember_palm.effect), true);
  assert.equal(Object.isFrozen(Skills.TUTOR_INDEX.tutor_meilin), true);
  assert.deepEqual(Skills.TUTOR_INDEX.tutor_meilin, ["ember_palm", "gale_step"]);
});

test("deserialize keeps only unique known learned skills", () => {
  assert.deepEqual(Skills.deserialize({ learned: ["ember_palm", "fake", "ember_palm", 42, "iron_root"] }), {
    version: 1,
    learned: ["ember_palm", "iron_root"]
  });
  assert.deepEqual(Skills.deserialize("{broken"), { version: 1, learned: [] });
});

test("tutor queries include each offering and its current status", () => {
  const value = fixture();
  const offerings = value.system.listByTutor("tutor_meilin", {});
  assert.deepEqual(offerings.map((entry) => entry.skill.id), ["ember_palm", "gale_step"]);
  assert.equal(offerings[0].status.code, "ready");
  assert.equal(offerings[1].status.code, "requirements_not_met");
  assert.equal(value.system.listByTutor("unknown", {}).length, 0);
});

test("inspection reports prerequisites and costs without spending", () => {
  const value = fixture();
  value.setStage(1);
  const report = value.system.inspect("iron_root", {});
  assert.equal(report.code, "requirements_not_met");
  assert.equal(report.missing[0].type, "stage");
  assert.equal(value.values.spiritStones, 40);
  assert.equal(value.items.iron_ore, 4);
});

test("successful learning pays costs once and persists sanitized state", () => {
  const value = fixture();
  const result = value.system.learn("iron_root", {});
  assert.equal(result.code, "learned");
  assert.equal(value.values.spiritStones, 28);
  assert.equal(value.items.iron_ore, 1);
  assert.equal(value.system.hasLearned("iron_root"), true);
  assert.deepEqual(value.system.serialize(), { version: 1, learned: ["iron_root"] });
  assert.equal(value.system.learn("iron_root", {}).code, "already_learned");
  assert.equal(value.values.spiritStones, 28);
});

test("a prerequisite skill unlocks its dependent move", () => {
  const value = fixture();
  assert.equal(value.system.inspect("gale_step", {}).code, "requirements_not_met");
  assert.equal(value.system.learn("ember_palm", {}).ok, true);
  assert.equal(value.system.inspect("gale_step", {}).code, "ready");
  assert.equal(value.system.learn("gale_step", {}).ok, true);
  assert.equal(value.system.passiveEffects()[0].dashCooldownMultiplier, 0.88);
});

test("partial payment failure is rolled back and does not learn the skill", () => {
  const value = fixture({
    inventory: {
      count: () => 4,
      remove: () => false,
      add: () => { throw new Error("an unspent item must not be refunded"); }
    }
  });
  const result = value.system.learn("iron_root", {});
  assert.equal(result.code, "payment_failed");
  assert.equal(value.values.spiritStones, 40);
  assert.equal(value.system.hasLearned("iron_root"), false);
});

test("vetoes and failed apply hooks spend nothing or fully roll back", () => {
  const vetoed = fixture({ hooks: { beforeLearn: () => ({ ok: false, code: "tutor_busy" }) } });
  assert.equal(vetoed.system.learn("ember_palm", {}).code, "tutor_busy");
  assert.equal(vetoed.values.spiritStones, 40);

  const failed = fixture({ hooks: { afterLearn: () => { throw new Error("boom"); } } });
  assert.equal(failed.system.learn("ember_palm", {}).code, "apply_failed");
  assert.equal(failed.values.spiritStones, 40);
  assert.equal(failed.system.hasLearned("ember_palm"), false);
});
