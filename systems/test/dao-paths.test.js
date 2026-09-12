"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Dao = require("../dao-paths.js");

function harness(initial, overrides) {
  const wallet = { shards: initial && initial.shards || 0, sigils: initial && initial.sigils || 0 };
  const resources = {
    get(id) { return wallet[id] || 0; },
    spend(id, amount) {
      if ((wallet[id] || 0) < amount) return false;
      wallet[id] -= amount;
      return true;
    },
    credit(id, amount) { wallet[id] = (wallet[id] || 0) + amount; return true; },
    ...(overrides || {})
  };
  return { wallet: wallet, system: Dao.createDaoPathSystem({ resources: resources }) };
}

test("defines three immutable, distinct paths with three sequential nodes", () => {
  assert.deepEqual(Dao.PATH_IDS, ["starblade", "moon_aegis", "boundless_step"]);
  assert.equal(new Set(Object.values(Dao.PATHS).map((path) => path.discipline)).size, 3);
  Object.values(Dao.PATHS).forEach((path) => {
    assert.equal(path.nodes.length, 3);
    assert.equal(Object.isFrozen(path), true);
    assert.equal(Object.isFrozen(path.nodes), true);
    assert.equal(Object.isFrozen(path.nodes[0].bonuses), true);
  });
});

test("fresh state is blank and serialized snapshots do not share arrays", () => {
  const system = harness().system;
  const first = system.serialize();
  first.unlocked.starblade.push("piercing_star");
  assert.deepEqual(system.serialize().unlocked.starblade, []);
  assert.equal(system.serialize().attunedPath, null);
});

test("unlock enforces sequence and exact resource costs", () => {
  const run = harness({ shards: 100, sigils: 10 });
  assert.equal(run.system.unlock("starblade", "blood_comet").code, "prerequisite_locked");
  const result = run.system.unlock("starblade", "piercing_star");
  assert.equal(result.code, "unlocked");
  assert.deepEqual(run.wallet, { shards: 82, sigils: 9 });
  assert.deepEqual(run.system.serialize().unlocked.starblade, ["piercing_star"]);
});

test("insufficient resources and invalid identifiers never mutate progress", () => {
  const run = harness({ shards: 17, sigils: 50 });
  const before = run.system.serialize();
  assert.equal(run.system.unlock("starblade", "piercing_star").code, "insufficient_resources");
  assert.equal(run.system.unlock("missing", "piercing_star").code, "unknown_path");
  assert.equal(run.system.unlock("starblade", "missing").code, "unknown_node");
  assert.deepEqual(run.system.serialize(), before);
});

test("duplicate unlocks are idempotent and never charge twice", () => {
  const run = harness({ shards: 100, sigils: 10 });
  run.system.unlock("starblade", "piercing_star");
  const wallet = { ...run.wallet };
  assert.equal(run.system.unlock("starblade", "piercing_star").code, "already_unlocked");
  assert.deepEqual(run.wallet, wallet);
});

test("one unlocked path may be freely attuned and bonuses aggregate only there", () => {
  const run = harness({ shards: 200, sigils: 20 });
  run.system.unlock("starblade", "piercing_star");
  run.system.unlock("starblade", "blood_comet");
  run.system.unlock("moon_aegis", "still_moon");
  assert.equal(run.system.attune("starblade").code, "attuned");
  assert.deepEqual(run.system.aggregateBonuses(), { attackPowerPct: 0.06, critChance: 0.05, attackSpeedPct: 0.04 });
  run.system.attune("moon_aegis");
  assert.deepEqual(run.system.aggregateBonuses(), { maxHealth: 18 });
  assert.equal(run.system.attune("boundless_step").code, "path_locked");
  assert.deepEqual(run.system.aggregateBonuses(), { maxHealth: 18 });
  assert.equal(run.system.attune(null).code, "unattuned");
  assert.deepEqual(run.system.aggregateBonuses(), {});
});

test("malformed saves keep only valid sequential prefixes and valid attunement", () => {
  const state = Dao.deserialize({
    unlocked: {
      starblade: ["blood_comet", "heaven_sunder", "piercing_star", "piercing_star", 42],
      moon_aegis: ["returning_tide"],
      boundless_step: "all"
    },
    attunedPath: "starblade"
  });
  assert.deepEqual(state.unlocked.starblade, ["piercing_star", "blood_comet", "heaven_sunder"]);
  assert.deepEqual(state.unlocked.moon_aegis, []);
  assert.deepEqual(state.unlocked.boundless_step, []);
  assert.equal(state.attunedPath, "starblade");
  assert.deepEqual(Dao.deserialize({ unlocked: {}, attunedPath: "moon_aegis" }).attunedPath, null);
  assert.deepEqual(Dao.deserialize("{broken"), Dao.deserialize(null));
});

test("failed second payment rolls back the first resource and keeps state atomic", () => {
  const run = harness({ shards: 100, sigils: 10 }, {
    spend(id, amount) {
      if (id === "sigils") return false;
      run.wallet[id] -= amount;
      return true;
    }
  });
  const before = { ...run.wallet };
  const result = run.system.unlock("starblade", "piercing_star");
  assert.equal(result.code, "payment_failed");
  assert.deepEqual(run.wallet, before);
  assert.deepEqual(run.system.serialize().unlocked.starblade, []);
});

test("throwing and explicitly rejected atomic adapters never unlock nodes", () => {
  for (const transact of [() => false, () => { throw new Error("offline"); }]) {
    const system = Dao.createDaoPathSystem({
      resources: { get: () => 999, transact: transact }
    });
    assert.equal(system.unlock("starblade", "piercing_star").code, "payment_failed");
    assert.deepEqual(system.serialize().unlocked.starblade, []);
  }
});

test("successful atomic adapters receive both costs and unlock exactly once", () => {
  const calls = [];
  const system = Dao.createDaoPathSystem({
    resources: {
      get: () => 999,
      transact(costs, context) { calls.push({ costs: costs, context: context }); return true; }
    }
  });
  assert.equal(system.unlock("boundless_step", "windborne_meridian", { source: "formation" }).code, "unlocked");
  assert.deepEqual(calls, [{ costs: [{ resourceId: "shards", amount: 18 }, { resourceId: "sigils", amount: 1 }], context: { source: "formation" } }]);
});
