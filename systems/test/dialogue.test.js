const test = require("node:test");
const assert = require("node:assert/strict");
const { createDialogueEngine } = require("../dialogue.js");

const dialogues = {
  smith: {
    start: "greeting",
    nodes: {
      greeting: {
        speaker: "Smith",
        text: (ctx) => `Welcome, ${ctx.name}.`,
        choices: [
          { id: "shop", text: "Show me your wares.", condition: "metSmith", next: "wares", actions: ["openedShop"] },
          { id: "leave", text: "Leave.", actions: ["left"] },
        ],
      },
      wares: { speaker: "Smith", text: "Steel for every path.", choices: [{ id: "done", text: "Done." }] },
    },
    onEnd: ["ended"],
  },
};

test("filters choices, advances nodes and runs injected actions", () => {
  const actions = [];
  const engine = createDialogueEngine(dialogues, { runAction: (action) => actions.push(action) });
  const context = { name: "Mei", flags: { metSmith: true } };
  const session = engine.start("smith", context);
  assert.equal(engine.view(session, context).text, "Welcome, Mei.");
  assert.equal(engine.choose(session, "shop", context).code, "advanced");
  assert.deepEqual(actions, ["openedShop"]);
  assert.equal(engine.choose(session, "done", context).code, "ended");
  assert.deepEqual(actions, ["openedShop", "ended"]);
});

test("rejects unavailable choices and restores stable session data", () => {
  const engine = createDialogueEngine(dialogues);
  const session = engine.start("smith", { flags: {} });
  assert.equal(engine.choose(session, "shop", { flags: {} }).code, "unavailable");
  const restored = engine.restore(engine.serialize(session));
  assert.deepEqual(restored, session);
});
