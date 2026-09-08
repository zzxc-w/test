const test = require("node:test");
const assert = require("node:assert/strict");
const { createKeybinds, normalizeKey, deserializeBindings } = require("../keybinds.js");

test("normalizes browser key variants", () => {
  assert.equal(normalizeKey(" "), "space");
  assert.equal(normalizeKey({ code: "ShiftLeft" }), "shift");
  assert.equal(normalizeKey({ key: "W" }), "w");
  assert.equal(normalizeKey("Esc"), "escape");
});

test("defaults retain keyboard alternatives", () => {
  const keys = createKeybinds();
  assert.equal(keys.matches("moveUp", "ArrowUp"), true);
  assert.equal(keys.matches("attack", { key: " " }), true);
  assert.deepEqual(keys.actionsFor("q"), ["talisman"]);
});

test("remapping swaps a conflicting binding without duplicates", () => {
  const keys = createKeybinds();
  const result = keys.setBinding("attack", "f", 0);
  assert.equal(result.ok, true);
  assert.deepEqual(result.conflict, { actionId: "parry", slot: 0 });
  assert.equal(keys.matches("attack", "f"), true);
  assert.equal(keys.matches("parry", "space"), true);
  assert.equal(keys.matches("parry", "f"), false);
});

test("serialization is sanitized and malformed saved data falls back", () => {
  const keys = createKeybinds({ inventory: ["B", "b", ""] });
  assert.deepEqual(keys.get("inventory"), ["b"]);
  assert.deepEqual(deserializeBindings("not json").moveUp, ["w", "arrowup"]);
  assert.deepEqual(createKeybinds(keys.serialize()).get("inventory"), ["b"]);
});

test("deserialization resolves duplicate assignments deterministically", () => {
  const keys = createKeybinds({ attack: ["f"], parry: ["f", "l"] });
  assert.deepEqual(keys.get("attack"), ["f"]);
  assert.deepEqual(keys.get("parry"), ["l"]);
  assert.deepEqual(keys.actionsFor("f"), ["attack"]);
});
