(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VerdantMultiplayer = Object.assign(root.VerdantMultiplayer || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
  const ACTIONS = ["attack", "dash", "parry"];
  const RULES = Object.freeze({ maxHp: 100, attackWindupMs: 170, attackActiveMs: 90, attackCooldownMs: 680, parryWindowMs: 155, parryCooldownMs: 780, dashInvulnerabilityMs: 190, dashCooldownMs: 950 });

  class ArenaClient {
    constructor(options) {
      options = options || {};
      this.send = options.send || function () { return false; };
      this.now = options.now || Date.now;
      this.inputHz = options.inputHz || 30;
      this.listeners = new Set(); this.reset();
    }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit(event, detail) { this.listeners.forEach((listener) => listener(event, detail)); }
    reset() {
      this.active = false; this.arenaId = null; this.playerId = null; this.snapshot = null; this.snapshotReceivedAt = 0;
      this.names = Object.create(null); this.seq = 0; this.lastInputAt = -Infinity;
      this.lastInput = { moveX: 0, moveY: 0, aimX: 1, aimY: 0, attack: false, dash: false, parry: false };
      this.pendingActions = { attack: false, dash: false, parry: false };
    }
    start(message) {
      if (!message || !message.arenaId) return false;
      this.active = true; this.arenaId = String(message.arenaId); this.playerId = message.playerId == null ? null : String(message.playerId);
      this.snapshot = message.snapshot || null; this.snapshotReceivedAt = this.now();
      this.names = Object.assign(Object.create(null), message.playerNames || {}); this.emit("start", message); return true;
    }
    receiveSnapshot(snapshot) {
      if (!this.active || !snapshot || (snapshot.arenaId && String(snapshot.arenaId) !== this.arenaId)) return false;
      if (this.snapshot && Number(snapshot.tick) <= Number(this.snapshot.tick)) return false;
      this.snapshot = snapshot; this.snapshotReceivedAt = this.now(); this.emit("snapshot", snapshot); return true;
    }
    setInput(input, force) {
      if (!this.active) return false;
      input = input || {};
      const clean = { moveX: clamp(input.moveX, -1, 1), moveY: clamp(input.moveY, -1, 1), aimX: input.aimX == null ? this.lastInput.aimX : clamp(input.aimX, -1, 1), aimY: input.aimY == null ? this.lastInput.aimY : clamp(input.aimY, -1, 1), attack: Boolean(input.attack), dash: Boolean(input.dash), parry: Boolean(input.parry) };
      const now = this.now(), changed = Object.keys(clean).some((key) => clean[key] !== this.lastInput[key]);
      for (const action of ACTIONS) if (clean[action] && !this.lastInput[action]) this.pendingActions[action] = true;
      this.lastInput = clean;
      // `force` means send an unchanged heartbeat, not bypass the 30 Hz wire cap.
      if (!force && !changed && now - this.lastInputAt < 1000 / this.inputHz) return false;
      if (now - this.lastInputAt < 1000 / this.inputHz) return false;
      const outgoing = Object.assign({}, clean);
      for (const action of ACTIONS) outgoing[action] = outgoing[action] || this.pendingActions[action];
      const sent = this.send(Object.assign({ type: "arena_input", arenaId: this.arenaId, seq: ++this.seq }, outgoing));
      if (sent) this.pendingActions = { attack: false, dash: false, parry: false };
      this.lastInputAt = now; return sent;
    }
    end(message) { if (this.active) { this.emit("end", message || {}); this.reset(); } }
  }

  function createArenaInputState() {
    const pressed = new Set(); let aimX = 1, aimY = 0;
    const snapshot = () => {
      const moveX = (pressed.has("right") ? 1 : 0) - (pressed.has("left") ? 1 : 0), moveY = (pressed.has("down") ? 1 : 0) - (pressed.has("up") ? 1 : 0);
      if (moveX || moveY) { const length = Math.hypot(moveX, moveY); aimX = moveX / length; aimY = moveY / length; }
      return { moveX, moveY, aimX, aimY, attack: pressed.has("attack"), dash: pressed.has("dash"), parry: pressed.has("parry") };
    };
    return { press(action) { pressed.add(action); return snapshot(); }, release(action) { pressed.delete(action); return snapshot(); }, releaseAll() { pressed.clear(); return snapshot(); }, snapshot };
  }

  function combatVisualState(player, serverNow) {
    player = player || {}; const now = Number(serverNow) || 0, attackAge = now - Number(player.attackAt || 0);
    const dashAt = Number(player.invulnerableUntil || 0) - RULES.dashInvulnerabilityMs, parryAt = Number(player.parryUntil || 0) - RULES.parryWindowMs;
    return {
      attackPhase: attackAge >= 0 && attackAge < RULES.attackWindupMs ? "windup" : attackAge >= 0 && attackAge < RULES.attackWindupMs + RULES.attackActiveMs ? "active" : "idle",
      attackProgress: clamp(attackAge / RULES.attackWindupMs, 0, 1), attackCooldown: clamp(1 - attackAge / RULES.attackCooldownMs, 0, 1),
      parrying: now <= Number(player.parryUntil || 0), parryCooldown: clamp((parryAt + RULES.parryCooldownMs - now) / RULES.parryCooldownMs, 0, 1),
      dashing: now <= Number(player.invulnerableUntil || 0), dashCooldown: clamp((dashAt + RULES.dashCooldownMs - now) / RULES.dashCooldownMs, 0, 1), staggered: now <= Number(player.staggeredUntil || 0)
    };
  }

  function drawPixelFighter(ctx, player, visual, options) {
    const x = Number(options.x), y = Number(options.y), facing = Number(player.facing) || 0, local = Boolean(options.local);
    const color = local ? { robe: "#4eb9c7", light: "#98eff0", dark: "#276f7e" } : { robe: "#c85e60", light: "#f39a87", dark: "#78383f" };
    const fx = Math.cos(facing), fy = Math.sin(facing); ctx.save();
    if (visual.staggered) ctx.translate(Math.floor(options.now / 45) % 2 ? 2 : -2, 0);
    if (visual.dashing) ctx.globalAlpha = .78;
    ctx.fillStyle = "rgba(0,0,0,.38)"; ctx.fillRect(x - 13, y + 13, 26, 6);
    ctx.fillStyle = color.dark; ctx.fillRect(x - 10, y - 7, 20, 21); ctx.fillStyle = color.robe; ctx.fillRect(x - 8, y - 10, 16, 22);
    ctx.fillStyle = color.light; ctx.fillRect(x - 6, y - 8, 5, 15); ctx.fillStyle = "#f0d480"; ctx.fillRect(x - 9, y + 1, 18, 3);
    ctx.fillStyle = "#e6b98a"; ctx.fillRect(x - 6, y - 19, 12, 10); ctx.fillStyle = "#241f25"; ctx.fillRect(x - 7, y - 21, 14, 5); ctx.fillRect(x + (fx >= 0 ? 3 : -6), y - 16, 3, 3);
    ctx.fillStyle = color.dark; ctx.fillRect(x - 9, y + 12, 7, 5); ctx.fillRect(x + 2, y + 12, 7, 5);
    const handX = x + fx * 10, handY = y - 3 + fy * 10;
    let swordAngle = facing - .75; if (visual.attackPhase === "windup") swordAngle = facing - 1.5 + visual.attackProgress * .35; if (visual.attackPhase === "active") swordAngle = facing + .9;
    ctx.strokeStyle = visual.parrying ? "#fff1a6" : "#dfe8e5"; ctx.lineWidth = visual.parrying ? 5 : 3; ctx.beginPath(); ctx.moveTo(handX, handY); ctx.lineTo(handX + Math.cos(swordAngle) * 27, handY + Math.sin(swordAngle) * 27); ctx.stroke();
    ctx.fillStyle = "#c59e54"; ctx.fillRect(Math.round(handX) - 3, Math.round(handY) - 3, 6, 6);
    if (visual.attackPhase !== "idle") { ctx.strokeStyle = visual.attackPhase === "active" ? "#fff1a0" : "rgba(241,207,112,.55)"; ctx.lineWidth = visual.attackPhase === "active" ? 6 : 2; ctx.beginPath(); ctx.arc(x, y - 2, 56, facing - 1.1, facing + 1.1); ctx.stroke(); }
    if (visual.parrying) { ctx.strokeStyle = "#91f4e1"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y - 2, 27, facing - 1.2, facing + 1.2); ctx.stroke(); ctx.fillStyle = "#fff9c8"; ctx.fillRect(x + fx * 25 - 3, y - 5 + fy * 25, 6, 6); }
    ctx.restore();
  }

  function drawCooldown(ctx, x, label, amount, color) {
    ctx.fillStyle = "#0a1213"; ctx.fillRect(x, 512, 76, 8); ctx.fillStyle = amount > 0 ? "#344442" : color; ctx.fillRect(x + 1, 513, 74 * (amount > 0 ? 1 - amount : 1), 6);
    ctx.fillStyle = "#e9dec0"; ctx.font = "10px monospace"; ctx.textAlign = "left"; ctx.fillText(label, x, 508);
  }

  function mountArenaOverlay(arena, options) {
    options = options || {}; const doc = options.document || (typeof document !== "undefined" ? document : null);
    if (!doc) return { render() {}, destroy() {} };
    const root = doc.createElement("section"); root.hidden = true; root.setAttribute("aria-label", "Arena realm"); root.style.cssText = "position:fixed;inset:0;z-index:70;background:#07110f;color:#f6edcc;touch-action:none;overscroll-behavior:none;overflow:hidden";
    const canvas = doc.createElement("canvas"); canvas.width = 960; canvas.height = 540; canvas.style.cssText = "width:100%;height:100%;image-rendering:pixelated"; root.appendChild(canvas);
    const status = doc.createElement("div"); status.style.cssText = "position:absolute;top:max(8px,env(safe-area-inset-top));left:110px;right:110px;text-align:center;font:700 16px system-ui;text-shadow:0 2px #000"; root.appendChild(status);
    const notice = doc.createElement("div"); notice.style.cssText = "position:absolute;top:max(34px,calc(env(safe-area-inset-top) + 30px));left:20%;right:20%;padding:7px;text-align:center;border-radius:8px;background:rgba(4,10,9,.76);font:12px system-ui;pointer-events:none"; notice.textContent = "Move to aim · gold arc means attack · parry just before impact"; root.appendChild(notice);
    const leave = doc.createElement("button"); leave.type = "button"; leave.textContent = "Leave Realm"; leave.style.cssText = "position:absolute;top:max(8px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));min-height:44px;padding:7px 12px;border:1px solid #8c7650;border-radius:9px;background:#2b2424;color:#f4e6c5;touch-action:manipulation;-webkit-tap-highlight-color:transparent"; root.appendChild(leave);
    const input = createArenaInputState(), submitInput = (state) => typeof options.onInput === "function" ? options.onInput(state) : arena.setInput(state, true);
    const makeControl = (label, action) => {
      const button = doc.createElement("button"); button.type = "button"; button.textContent = label; button.setAttribute("aria-label", label); button.style.cssText = "width:58px;height:58px;padding:0;border:2px solid #d5bd78;border-radius:14px;background:rgba(35,67,53,.92);color:#fff;font:700 13px system-ui;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;box-shadow:0 3px 0 #10271f";
      const release = (event) => { event.preventDefault(); button.style.transform = ""; button.style.background = "rgba(35,67,53,.92)"; submitInput(input.release(action)); };
      button.addEventListener("pointerdown", (event) => { event.preventDefault(); if (button.setPointerCapture) button.setPointerCapture(event.pointerId); button.style.transform = "translateY(2px)"; button.style.background = "#4d8065"; submitInput(input.press(action)); });
      button.addEventListener("pointerup", release); button.addEventListener("pointercancel", release); button.addEventListener("lostpointercapture", release); button.addEventListener("contextmenu", (event) => event.preventDefault()); return button;
    };
    const movement = doc.createElement("div"); movement.style.cssText = "position:absolute;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));display:grid;grid-template:repeat(3,58px)/repeat(3,58px);gap:5px";
    for (const [label, action, column, row] of [["UP","up",2,1],["LEFT","left",1,2],["DOWN","down",2,3],["RIGHT","right",3,2]]) { const button = makeControl(label, action); button.style.gridColumn = column; button.style.gridRow = row; movement.appendChild(button); } root.appendChild(movement);
    const actions = doc.createElement("div"); actions.style.cssText = "position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(2,70px);gap:9px";
    const attack = makeControl("Attack", "attack"), parry = makeControl("Parry", "parry"), dash = makeControl("Dash", "dash"); attack.style.width = parry.style.width = "70px"; dash.style.width = "149px"; dash.style.gridColumn = "1 / 3"; actions.append(attack, parry, dash); root.appendChild(actions); (options.parent || doc.body).appendChild(root);
    const trails = new Map(), previous = new Map(); let endTimer = null, connectionMessage = ""; const localClock = () => arena.now ? arena.now() : Date.now();
    leave.addEventListener("click", () => typeof arena.leave === "function" ? arena.leave() : arena.end({ reason: "left" }));
    const render = () => {
      root.hidden = !arena.active; if (!arena.active || !arena.snapshot) return;
      const ctx = canvas.getContext("2d"), localNow = localClock(), serverNow = Number(arena.snapshot.serverTime || 0) + Math.max(0, localNow - Number(arena.snapshotReceivedAt || localNow)); ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#07110f"; ctx.fillRect(0, 0, 960, 540); ctx.fillStyle = "#13251f"; ctx.fillRect(120, 60, 720, 420);
      for (let y = 60; y < 480; y += 24) for (let x = 120; x < 840; x += 24) { ctx.fillStyle = ((x + y) / 24) % 2 ? "#172c24" : "#142820"; ctx.fillRect(x, y, 24, 24); }
      ctx.strokeStyle = "#9d8048"; ctx.lineWidth = 5; ctx.strokeRect(117, 57, 726, 426); ctx.strokeStyle = "rgba(218,184,103,.18)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(480, 270, 92, 0, Math.PI * 2); ctx.stroke();
      const players = Array.isArray(arena.snapshot.players) ? arena.snapshot.players : [];
      for (const player of players) { const id = String(player.id), old = previous.get(id); if (old && Math.hypot(Number(player.x) - old.x, Number(player.y) - old.y) > 35) trails.set(id, { x: old.x, y: old.y, until: localNow + 230 }); previous.set(id, { x: Number(player.x), y: Number(player.y) }); }
      for (const [id, trail] of trails) { if (trail.until <= localNow) { trails.delete(id); continue; } ctx.globalAlpha = (trail.until - localNow) / 230 * .45; ctx.fillStyle = id === arena.playerId ? "#65dce2" : "#ed746e"; ctx.fillRect(111 + trail.x, 43 + trail.y, 18, 32); ctx.globalAlpha = 1; }
      for (const player of players) {
        const id = String(player.id), local = id === arena.playerId, visual = combatVisualState(player, serverNow), x = 120 + Number(player.x), y = 60 + Number(player.y); drawPixelFighter(ctx, player, visual, { x, y, local, now: localNow });
        ctx.font = "bold 12px monospace"; ctx.textAlign = "center"; ctx.fillStyle = local ? "#a7f7f1" : "#ffb4a1"; ctx.fillText(player.name || arena.names[id] || (local ? "You" : "Rival Cultivator"), x, y - 29);
        ctx.fillStyle = "#180f12"; ctx.fillRect(x - 31, y - 26, 62, 5); ctx.fillStyle = "#d84f55"; ctx.fillRect(x - 30, y - 25, 60 * clamp(Number(player.hp) / RULES.maxHp, 0, 1), 3); if (visual.staggered) { ctx.fillStyle = "#ffe18b"; ctx.fillText("STAGGERED", x, y - 40); }
      }
      const mine = players.find((player) => String(player.id) === arena.playerId); if (mine) { const visual = combatVisualState(mine, serverNow); drawCooldown(ctx, 356, "ATTACK", visual.attackCooldown, "#e8c86e"); drawCooldown(ctx, 442, "PARRY", visual.parryCooldown, "#65d9cb"); drawCooldown(ctx, 528, "DASH", visual.dashCooldown, "#73bfea"); }
      status.textContent = `${connectionMessage || "Arena Realm"} · ${Math.max(0, Math.ceil(Number(arena.snapshot.timeLeft) || 0))}s`;
    };
    const releaseAll = () => submitInput(input.releaseAll());
    const showEnd = (result) => { const won = result && result.winnerId === arena.playerId, draw = result && result.winnerId === "draw"; root.hidden = false; notice.textContent = result && (result.reason === "connection-lost" || result.reason === "connection-stalled") ? "Connection stalled — returning to the world" : result && result.reason === "left" ? "Leaving the arena — returning to the world" : draw ? "Draw — returning to the world" : won ? "Victory — returning to the world" : "Defeat — returning to the world"; notice.style.fontSize = "18px"; if (endTimer) clearTimeout(endTimer); endTimer = setTimeout(() => { root.hidden = true; notice.style.fontSize = "12px"; notice.textContent = "Move to aim · gold arc means attack · parry just before impact"; }, 1400); };
    const releaseWhenHidden = () => { if (doc.hidden) releaseAll(); };
    const unsubscribe = arena.subscribe((event, detail) => { if (event === "end") { releaseAll(); showEnd(detail); } if (event === "start") { connectionMessage = ""; previous.clear(); trails.clear(); } if (event === "start" || event === "snapshot") render(); });
    if (doc.defaultView) doc.defaultView.addEventListener("blur", releaseAll); doc.addEventListener("visibilitychange", releaseWhenHidden);
    return { element: root, canvas, input, render, releaseAll, setConnectionState(state) { connectionMessage = state === "reconnecting" ? "Reconnecting…" : ""; render(); }, destroy() { if (endTimer) clearTimeout(endTimer); releaseAll(); unsubscribe(); if (doc.defaultView) doc.defaultView.removeEventListener("blur", releaseAll); doc.removeEventListener("visibilitychange", releaseWhenHidden); root.remove(); } };
  }

  return { ArenaClient, createArenaInputState, combatVisualState, drawPixelFighter, mountArenaOverlay };
});
