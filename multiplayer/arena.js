(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VerdantMultiplayer = Object.assign(root.VerdantMultiplayer || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));

  class ArenaClient {
    constructor(options) {
      options = options || {};
      this.send = options.send || function () { return false; };
      this.now = options.now || Date.now;
      this.inputHz = options.inputHz || 30;
      this.listeners = new Set();
      this.reset();
    }

    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit(event, detail) { this.listeners.forEach((listener) => listener(event, detail)); }
    reset() {
      this.active = false;
      this.arenaId = null;
      this.playerId = null;
      this.snapshot = null;
      this.seq = 0;
      this.lastInputAt = -Infinity;
      this.lastInput = { moveX: 0, moveY: 0, aimX: 1, aimY: 0, attack: false, dash: false, parry: false };
    }

    start(message) {
      if (!message || !message.arenaId) return false;
      this.active = true;
      this.arenaId = String(message.arenaId);
      this.playerId = message.playerId == null ? null : String(message.playerId);
      this.snapshot = message.snapshot || null;
      this.emit("start", message);
      return true;
    }

    receiveSnapshot(snapshot) {
      if (!this.active || !snapshot || (snapshot.arenaId && String(snapshot.arenaId) !== this.arenaId)) return false;
      if (this.snapshot && Number(snapshot.tick) <= Number(this.snapshot.tick)) return false;
      this.snapshot = snapshot;
      this.emit("snapshot", snapshot);
      return true;
    }

    setInput(input, force) {
      if (!this.active) return false;
      input = input || {};
      const clean = {
        moveX: clamp(input.moveX, -1, 1), moveY: clamp(input.moveY, -1, 1),
        aimX: input.aimX == null ? this.lastInput.aimX : clamp(input.aimX, -1, 1),
        aimY: input.aimY == null ? this.lastInput.aimY : clamp(input.aimY, -1, 1),
        attack: Boolean(input.attack), dash: Boolean(input.dash), parry: Boolean(input.parry)
      };
      const now = this.now();
      const changed = Object.keys(clean).some((key) => clean[key] !== this.lastInput[key]);
      if (!force && !changed && now - this.lastInputAt < 1000 / this.inputHz) return false;
      if (!force && now - this.lastInputAt < 1000 / this.inputHz) return false;
      this.lastInput = clean;
      this.lastInputAt = now;
      return this.send(Object.assign({ type: "arena_input", arenaId: this.arenaId, seq: ++this.seq }, clean));
    }

    end(message) {
      if (!this.active) return;
      const result = message || {};
      this.emit("end", result);
      this.reset();
    }
  }

  function createArenaInputState() {
    const pressed = new Set();
    let aimX = 1, aimY = 0;
    const snapshot = () => {
      const moveX = (pressed.has("right") ? 1 : 0) - (pressed.has("left") ? 1 : 0);
      const moveY = (pressed.has("down") ? 1 : 0) - (pressed.has("up") ? 1 : 0);
      if (moveX || moveY) {
        const length = Math.hypot(moveX, moveY);
        aimX = moveX / length; aimY = moveY / length;
      }
      return { moveX, moveY, aimX, aimY, attack: pressed.has("attack"), dash: pressed.has("dash"), parry: pressed.has("parry") };
    };
    return {
      press(action) { pressed.add(action); return snapshot(); },
      release(action) { pressed.delete(action); return snapshot(); },
      releaseAll() { pressed.clear(); return snapshot(); },
      snapshot
    };
  }

  function mountArenaOverlay(arena, options) {
    options = options || {};
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    if (!doc) return { render() {}, destroy() {} };
    const root = doc.createElement("section");
    root.hidden = true;
    root.setAttribute("aria-label", "Arena realm");
    root.style.cssText = "position:fixed;inset:0;z-index:70;background:#08110f;color:#f6edcc;touch-action:none;overscroll-behavior:none";
    const canvas = doc.createElement("canvas"); canvas.width = 960; canvas.height = 540;
    canvas.style.cssText = "width:100%;height:100%;image-rendering:pixelated"; root.appendChild(canvas);
    const status = doc.createElement("div"); status.style.cssText = "position:absolute;top:max(12px,env(safe-area-inset-top));left:12px;right:12px;text-align:center;font:600 16px system-ui"; root.appendChild(status);
    const input = createArenaInputState();
    const submitInput = (state) => {
      if (typeof options.onInput === "function") options.onInput(state);
      else arena.setInput(state, true);
    };
    const makeControl = (label, action) => {
      const button = doc.createElement("button");
      button.type = "button"; button.textContent = label; button.setAttribute("aria-label", label);
      button.style.cssText = "width:58px;height:58px;padding:0;border:1px solid #d5bd78;border-radius:14px;background:rgba(35,67,53,.9);color:#fff;font:700 15px system-ui;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent";
      const release = (event) => { event.preventDefault(); submitInput(input.release(action)); };
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
        submitInput(input.press(action));
      });
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
      button.addEventListener("contextmenu", (event) => event.preventDefault());
      return button;
    };
    const movement = doc.createElement("div");
    movement.style.cssText = "position:absolute;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));display:grid;grid-template:repeat(3,58px)/repeat(3,58px);gap:5px";
    const up = makeControl("↑", "up"); up.style.gridColumn = "2"; up.style.gridRow = "1";
    const left = makeControl("←", "left"); left.style.gridColumn = "1"; left.style.gridRow = "2";
    const down = makeControl("↓", "down"); down.style.gridColumn = "2"; down.style.gridRow = "3";
    const right = makeControl("→", "right"); right.style.gridColumn = "3"; right.style.gridRow = "2";
    movement.append(up, left, down, right); root.appendChild(movement);
    const actions = doc.createElement("div");
    actions.style.cssText = "position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(2,70px);gap:9px";
    const attack = makeControl("Attack", "attack"); attack.style.width = "70px";
    const parry = makeControl("Parry", "parry"); parry.style.width = "70px";
    const dash = makeControl("Dash", "dash"); dash.style.width = "149px"; dash.style.gridColumn = "1 / 3";
    actions.append(attack, parry, dash); root.appendChild(actions);
    (options.parent || doc.body).appendChild(root);
    const render = () => {
      root.hidden = !arena.active;
      if (!arena.active || !arena.snapshot) return;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#10251e"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#947843"; ctx.lineWidth = 4; ctx.strokeRect(50, 50, 860, 440);
      const players = Array.isArray(arena.snapshot.players) ? arena.snapshot.players : [];
      players.forEach((player) => {
        ctx.fillStyle = String(player.id) === arena.playerId ? "#70d5e6" : "#e07168";
        ctx.fillRect(Number(player.x) - 8, Number(player.y) - 8, 16, 16);
      });
      status.textContent = arena.snapshot.timeLeft == null ? "Arena 意境" : `Arena 意境 · ${Math.ceil(arena.snapshot.timeLeft)}s`;
    };
    const releaseAll = () => submitInput(input.releaseAll());
    const releaseWhenHidden = () => { if (doc.hidden) releaseAll(); };
    const unsubscribe = arena.subscribe((event) => {
      if (event === "end") releaseAll();
      if (event === "start" || event === "snapshot" || event === "end") render();
    });
    if (doc.defaultView) doc.defaultView.addEventListener("blur", releaseAll);
    doc.addEventListener("visibilitychange", releaseWhenHidden);
    return {
      element: root, canvas, input, render, releaseAll,
      destroy() {
        releaseAll(); unsubscribe();
        if (doc.defaultView) doc.defaultView.removeEventListener("blur", releaseAll);
        doc.removeEventListener("visibilitychange", releaseWhenHidden);
        root.remove();
      }
    };
  }

  return { ArenaClient, createArenaInputState, mountArenaOverlay };
});
