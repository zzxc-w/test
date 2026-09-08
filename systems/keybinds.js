(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VerdantKeybinds = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ACTIONS = Object.freeze([
    { id: "moveUp", label: "Move up", group: "movement" },
    { id: "moveDown", label: "Move down", group: "movement" },
    { id: "moveLeft", label: "Move left", group: "movement" },
    { id: "moveRight", label: "Move right", group: "movement" },
    { id: "attack", label: "Attack", group: "combat" },
    { id: "parry", label: "Parry", group: "combat" },
    { id: "dash", label: "Dash", group: "combat" },
    { id: "talisman", label: "Use talisman", group: "combat" },
    { id: "skill", label: "Use learned art", group: "combat" },
    { id: "interact", label: "Interact / gather", group: "world" },
    { id: "cultivate", label: "Cultivate", group: "world" },
    { id: "inventory", label: "Inventory", group: "interface" },
    { id: "map", label: "Map", group: "interface" },
  ]);

  const DEFAULT_BINDINGS = Object.freeze({
    moveUp: Object.freeze(["w", "arrowup"]),
    moveDown: Object.freeze(["s", "arrowdown"]),
    moveLeft: Object.freeze(["a", "arrowleft"]),
    moveRight: Object.freeze(["d", "arrowright"]),
    attack: Object.freeze(["space", "j"]),
    parry: Object.freeze(["f", "l"]),
    dash: Object.freeze(["shift", "k"]),
    talisman: Object.freeze(["q"]),
    skill: Object.freeze(["r"]),
    interact: Object.freeze(["e"]),
    cultivate: Object.freeze(["c"]),
    inventory: Object.freeze(["i"]),
    map: Object.freeze(["m"]),
  });

  const ACTION_IDS = new Set(ACTIONS.map((action) => action.id));
  const KEY_ALIASES = Object.freeze({
    " ": "space",
    spacebar: "space",
    esc: "escape",
    control: "ctrl",
    ctl: "ctrl",
    return: "enter",
    del: "delete",
    left: "arrowleft",
    right: "arrowright",
    up: "arrowup",
    down: "arrowdown",
  });

  function normalizeKey(input) {
    let value = input;
    if (input && typeof input === "object") value = input.key || input.code;
    if (typeof value !== "string") return "";
    value = value.trim() ? value.trim().toLowerCase() : value === " " ? " " : "";
    if (!value) return "";
    if (/^key[a-z]$/.test(value)) value = value.slice(3);
    if (/^digit[0-9]$/.test(value)) value = value.slice(5);
    if (/^shift(left|right)$/.test(value)) value = "shift";
    if (/^(control|ctrl)(left|right)$/.test(value)) value = "ctrl";
    if (/^alt(left|right)$/.test(value)) value = "alt";
    return KEY_ALIASES[value] || value;
  }

  function cloneDefaults() {
    return Object.fromEntries(Object.entries(DEFAULT_BINDINGS).map(([id, keys]) => [id, keys.slice()]));
  }

  function cleanBindings(value) {
    const result = cloneDefaults();
    if (!value || typeof value !== "object") return result;
    for (const action of ACTIONS) {
      const candidate = value[action.id];
      if (!Array.isArray(candidate)) continue;
      const seen = new Set();
      const keys = candidate.map(normalizeKey).filter((key) => key && !seen.has(key) && seen.add(key));
      if (keys.length) result[action.id] = keys.slice(0, 2);
    }
    const claimed = new Set();
    for (const action of ACTIONS) {
      result[action.id] = result[action.id].filter((key) => !claimed.has(key) && claimed.add(key));
      if (!result[action.id].length) {
        const fallback = DEFAULT_BINDINGS[action.id].find((key) => !claimed.has(key));
        if (fallback) {
          result[action.id] = [fallback];
          claimed.add(fallback);
        }
      }
    }
    return result;
  }

  function deserializeBindings(value) {
    if (typeof value === "string") {
      try { return cleanBindings(JSON.parse(value)); } catch (_) { return cloneDefaults(); }
    }
    return cleanBindings(value);
  }

  function createKeybinds(savedBindings) {
    let bindings = deserializeBindings(savedBindings);

    function get(actionId) {
      return bindings[actionId] ? bindings[actionId].slice() : [];
    }

    function findOwner(key, exceptAction, exceptSlot) {
      for (const action of ACTIONS) {
        const keys = bindings[action.id] || [];
        for (let slot = 0; slot < keys.length; slot += 1) {
          if (keys[slot] === key && (action.id !== exceptAction || slot !== exceptSlot)) {
            return { actionId: action.id, slot };
          }
        }
      }
      return null;
    }

    function setBinding(actionId, input, slot) {
      slot = Number.isInteger(slot) && slot >= 0 ? Math.min(slot, 1) : 0;
      if (!ACTION_IDS.has(actionId)) return { ok: false, code: "unknown_action" };
      const key = normalizeKey(input);
      if (!key) return { ok: false, code: "invalid_key" };
      const keys = bindings[actionId].slice();
      const previousKey = keys[slot] || "";
      const conflict = findOwner(key, actionId, slot);
      keys[slot] = key;
      bindings[actionId] = keys.filter(Boolean);
      if (conflict) {
        const displaced = bindings[conflict.actionId].slice();
        if (previousKey && previousKey !== key) displaced[conflict.slot] = previousKey;
        else displaced.splice(conflict.slot, 1);
        bindings[conflict.actionId] = displaced.filter(Boolean);
      }
      return { ok: true, actionId, key, slot, previousKey, conflict };
    }

    function removeBinding(actionId, slot) {
      if (!ACTION_IDS.has(actionId)) return { ok: false, code: "unknown_action" };
      slot = Number.isInteger(slot) && slot >= 0 ? slot : 0;
      const keys = bindings[actionId].slice();
      if (slot >= keys.length) return { ok: false, code: "missing_binding" };
      const removedKey = keys.splice(slot, 1)[0];
      bindings[actionId] = keys;
      return { ok: true, actionId, removedKey };
    }

    function matches(actionId, input) {
      const key = normalizeKey(input);
      return !!key && !!bindings[actionId] && bindings[actionId].includes(key);
    }

    function actionsFor(input) {
      const key = normalizeKey(input);
      return key ? ACTIONS.filter((action) => bindings[action.id].includes(key)).map((action) => action.id) : [];
    }

    function reset() {
      bindings = cloneDefaults();
      return snapshot();
    }

    function snapshot() {
      return Object.fromEntries(ACTIONS.map((action) => [action.id, get(action.id)]));
    }

    return {
      get,
      matches,
      actionsFor,
      setBinding,
      removeBinding,
      reset,
      snapshot,
      serialize: () => JSON.stringify(snapshot()),
    };
  }

  return { ACTIONS, DEFAULT_BINDINGS, normalizeKey, deserializeBindings, createKeybinds };
});
