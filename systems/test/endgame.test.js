"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Endgame = require("../endgame.js");

function fixture(options) {
  const values = { spiritStones: 500 };
  const defeated = new Set(Endgame.DEFAULT_BOSSES);
  const config = Object.assign({
    resources: {
      get: (id) => values[id] || 0,
      spend: (id, amount) => values[id] >= amount && ((values[id] -= amount) >= 0),
      credit: (id, amount) => { values[id] = (values[id] || 0) + amount; }
    },
    progression: {
      getRealm: () => "Nascent Soul",
      getStage: () => 1,
      hasDefeatedBoss: (id) => defeated.has(id)
    }
  }, options);
  return { system: Endgame.createEndgameSystem(config), values, defeated };
}

function clear(system, tier) {
  const begun = system.begin(tier, {});
  assert.equal(begun.code, "begun");
  return system.complete(begun.active.attemptId);
}

test("trial configurations are deterministic, immutable, and escalate", () => {
  const first = Endgame.trialConfig(1);
  const fifth = Endgame.trialConfig(5);
  assert.deepEqual(Endgame.trialConfig(5), fifth);
  assert.equal(Object.isFrozen(fifth), true);
  assert.equal(Object.isFrozen(fifth.waves), true);
  assert.equal(Object.isFrozen(fifth.boss.affixes[0]), true);
  assert.ok(fifth.waves.length > first.waves.length);
  assert.ok(fifth.boss.hpMultiplier > first.boss.hpMultiplier);
  assert.ok(fifth.entryCosts[0].amount > first.entryCosts[0].amount);
});

test("tier milestones map to higher Nascent Soul stages", () => {
  assert.equal(Endgame.stageForTier(0), 1);
  assert.equal(Endgame.stageForTier(2), 1);
  assert.equal(Endgame.stageForTier(3), 2);
  assert.equal(Endgame.stageForTier(6), 3);
  assert.equal(Endgame.stageForTier(45), 9);
  assert.equal(Endgame.stageForTier(999), 9);
  assert.equal(Endgame.thresholdForStage(4), 10);
});

test("deserialize sanitizes corrupt values and rejects invalid active trials", () => {
  assert.deepEqual(Endgame.deserialize("{broken"), {
    version: 1, bestTier: 0, totalCompletions: 0, failedAttempts: 0,
    heavenlyMarks: 0, heavenlyInsight: 0, nascentStage: 1, sequence: 0, active: null
  });
  const state = Endgame.deserialize({
    bestTier: 3.9, totalCompletions: -2, failedAttempts: Infinity,
    heavenlyMarks: "7", heavenlyInsight: 24.8, nascentStage: 99, sequence: 4,
    active: { attemptId: "fake", tier: 4 }
  });
  assert.deepEqual(state, {
    version: 1, bestTier: 3, totalCompletions: 0, failedAttempts: 0,
    heavenlyMarks: 7, heavenlyInsight: 24, nascentStage: 2, sequence: 4, active: null
  });
});

test("the gate requires Nascent Soul and all five existing bosses", () => {
  const value = fixture();
  value.defeated.delete("sectbreaker");
  const report = value.system.inspect(1, {});
  assert.equal(report.code, "requirements_not_met");
  assert.deepEqual(report.missing.map((entry) => entry.id).filter(Boolean), ["sectbreaker"]);
  assert.equal(value.values.spiritStones, 500);

  const mortal = fixture({ progression: { getRealm: () => "Golden Core", getStage: () => 3, hasDefeatedBoss: () => true } });
  assert.equal(mortal.system.inspect(1, {}).missing[0].type, "realm");
});

test("tiers unlock sequentially while cleared tiers remain repeatable", () => {
  const value = fixture();
  assert.equal(value.system.inspect(2, {}).code, "tier_locked");
  clear(value.system, 1);
  assert.equal(value.system.inspect(2, {}).code, "ready");
  assert.equal(value.system.inspect(1, {}).code, "ready");
});

test("begin pays once, persists an active attempt, and blocks another", () => {
  const value = fixture();
  const result = value.system.begin(1, {});
  assert.equal(result.code, "begun");
  assert.equal(result.active.attemptId, "tribulation-1");
  assert.equal(value.values.spiritStones, 475);
  assert.equal(value.system.inspect(1, {}).code, "trial_active");
  assert.deepEqual(value.system.serialize().active, { attemptId: "tribulation-1", tier: 1 });
});

test("entry payment adapter failure leaves persistent state untouched", () => {
  // Tier four also costs marks. A failure in the external wallet must happen
  // before those marks or the active-attempt sequence are changed.
  const throwing = fixture({
    state: { bestTier: 3, heavenlyMarks: 2 },
    resources: {
      get: () => 500,
      spend: () => { throw new Error("wallet unavailable"); },
      credit: () => { throw new Error("nothing was paid, so no refund is due"); }
    }
  });
  assert.equal(throwing.system.begin(4, {}).code, "payment_failed");
  assert.equal(throwing.system.serialize().heavenlyMarks, 2);
  assert.equal(throwing.system.active(), null);
  assert.equal(throwing.system.serialize().sequence, 0);
});

test("completion is single-use and awards persistent marks and insight", () => {
  const value = fixture();
  const begun = value.system.begin(1, {});
  assert.equal(value.system.complete("tribulation-999").code, "stale_attempt");
  const result = value.system.complete(begun.active.attemptId);
  assert.equal(result.code, "completed");
  assert.equal(result.rewards.heavenlyMarks, 2);
  assert.equal(result.state.bestTier, 1);
  assert.equal(result.state.totalCompletions, 1);
  assert.equal(result.state.heavenlyInsight, 12);
  assert.equal(value.system.complete(begun.active.attemptId).code, "no_active_trial");
});

test("failure consumes the entry, records the loss, and grants no reward", () => {
  const value = fixture();
  const begun = value.system.begin(1, {});
  const result = value.system.fail(begun.active.attemptId);
  assert.equal(result.code, "failed");
  assert.equal(result.state.failedAttempts, 1);
  assert.equal(result.state.heavenlyMarks, 0);
  assert.equal(result.state.bestTier, 0);
  assert.equal(value.values.spiritStones, 475);
  assert.equal(value.system.fail(begun.active.attemptId).code, "no_active_trial");
});

test("clearing milestone tier three advances stage and reports the next path", () => {
  const value = fixture();
  clear(value.system, 1);
  clear(value.system, 2);
  const result = clear(value.system, 3);
  assert.equal(result.stageAdvanced, true);
  assert.equal(result.nascentStage, 2);
  assert.deepEqual(value.system.progress(), {
    nascentStage: 2, bestTier: 3, nextStage: 3, nextStageAtTier: 6, tiersRemaining: 3
  });
});

test("valid active attempts survive a serialized round trip", () => {
  const original = fixture();
  const begun = original.system.begin(1, {});
  const restored = fixture({ state: JSON.stringify(original.system.serialize()) });
  assert.equal(restored.system.active().attemptId, begun.active.attemptId);
  assert.equal(restored.system.complete(begun.active.attemptId).code, "completed");
});
