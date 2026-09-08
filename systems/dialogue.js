(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VerdantDialogue = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createDialogueEngine(dialogues, options) {
    dialogues = dialogues || {};
    options = options || {};
    const evaluateCondition = options.evaluateCondition || ((condition, context) => {
      if (typeof condition === "function") return condition(context);
      if (condition == null) return true;
      if (typeof condition === "string") return !!(context && context.flags && context.flags[condition]);
      return !!condition;
    });
    const runAction = options.runAction || ((action, context) => {
      if (typeof action === "function") return action(context);
      return undefined;
    });

    function definition(id) {
      const value = dialogues[id];
      if (!value || !value.nodes) throw new Error("Unknown dialogue: " + id);
      return value;
    }

    function runActions(actions, context, session) {
      for (const action of actions || []) runAction(action, context, session);
    }

    function enter(session, nodeId, context) {
      const dialogue = definition(session.dialogueId);
      const node = dialogue.nodes[nodeId];
      if (!node) throw new Error("Unknown dialogue node: " + nodeId);
      session.nodeId = nodeId;
      session.history.push(nodeId);
      runActions(node.onEnter, context, session);
      return session;
    }

    function start(dialogueId, context) {
      const dialogue = definition(dialogueId);
      const session = { version: 1, dialogueId, nodeId: "", history: [], ended: false };
      return enter(session, dialogue.start || Object.keys(dialogue.nodes)[0], context);
    }

    function view(session, context) {
      if (!session || session.ended) return { ended: true, choices: [] };
      const node = definition(session.dialogueId).nodes[session.nodeId];
      const resolve = (value) => typeof value === "function" ? value(context, session) : value;
      return {
        ended: false,
        dialogueId: session.dialogueId,
        nodeId: session.nodeId,
        speaker: resolve(node.speaker) || "",
        text: resolve(node.text) || "",
        choices: (node.choices || []).filter((choice) => evaluateCondition(choice.condition, context, session))
          .map((choice) => ({ id: choice.id, text: resolve(choice.text), disabled: !!resolve(choice.disabled) })),
      };
    }

    function choose(session, choiceId, context) {
      if (!session || session.ended) return { ok: false, code: "ended", session };
      const dialogue = definition(session.dialogueId);
      const node = dialogue.nodes[session.nodeId];
      const choice = (node.choices || []).find((candidate) => candidate.id === choiceId);
      if (!choice) return { ok: false, code: "unknown_choice", session };
      if (!evaluateCondition(choice.condition, context, session)) return { ok: false, code: "unavailable", session };
      if (typeof choice.disabled === "function" ? choice.disabled(context, session) : choice.disabled) {
        return { ok: false, code: "disabled", session };
      }
      runActions(node.onExit, context, session);
      runActions(choice.actions, context, session);
      const next = typeof choice.next === "function" ? choice.next(context, session) : choice.next;
      if (!next) {
        session.ended = true;
        runActions(dialogue.onEnd, context, session);
      } else {
        enter(session, next, context);
      }
      return { ok: true, code: session.ended ? "ended" : "advanced", session, view: view(session, context) };
    }

    function serialize(session) {
      return JSON.stringify({ version: 1, dialogueId: session.dialogueId, nodeId: session.nodeId,
        history: session.history.slice(), ended: !!session.ended });
    }

    function restore(value) {
      const raw = typeof value === "string" ? JSON.parse(value) : value;
      const dialogue = definition(raw.dialogueId);
      if (!raw.ended && !dialogue.nodes[raw.nodeId]) throw new Error("Cannot restore missing dialogue node");
      return { version: 1, dialogueId: raw.dialogueId, nodeId: raw.nodeId,
        history: Array.isArray(raw.history) ? raw.history.slice() : [], ended: !!raw.ended };
    }

    return { start, view, choose, serialize, restore };
  }

  return { createDialogueEngine };
});
