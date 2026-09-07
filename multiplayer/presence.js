(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VerdantMultiplayer = Object.assign(root.VerdantMultiplayer || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const actions = new Set(["attack", "parry", "dash"]);
  const actionDuration = { attack: 280, parry: 320, dash: 260 };

  class PresenceStore {
    constructor(options) {
      options = options || {};
      this.players = new Map();
      this.localPlayerId = options.localPlayerId || null;
      this.interpolationDelayMs = finite(options.interpolationDelayMs, 140);
      this.staleAfterMs = finite(options.staleAfterMs, 10000);
      this.maxSamples = finite(options.maxSamples, 12);
    }

    setLocalPlayerId(id) { this.localPlayerId = id == null ? null : String(id); }

    ingest(player, receivedAt) {
      if (!player || player.id == null || String(player.id) === this.localPlayerId) return false;
      const x = finite(player.x, NaN);
      const y = finite(player.y, NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      const id = String(player.id);
      const now = finite(receivedAt, Date.now());
      const current = this.players.get(id) || { id, samples: [] };
      const seq = player.seq == null ? null : finite(player.seq, NaN);
      if (seq != null && (!Number.isFinite(seq) || (current.seq != null && seq <= current.seq))) return false;
      const sampleTime = finite(player.serverTime, now);
      const previous = current.samples[current.samples.length - 1];
      if (previous && sampleTime < previous.time) return false;
      current.name = String(player.name || current.name || "Wandering Cultivator").slice(0, 32);
      current.facing = String(player.facing ?? current.facing ?? "0").slice(0, 12);
      current.moving = Boolean(player.moving);
      current.emote = player.emote == null || player.emote === "none" ? null : String(player.emote).slice(0, 16);
      const action = actions.has(player.action) ? player.action : "none";
      if (action !== "none") {
        current.action = action;
        current.actionUntil = now + actionDuration[action];
      }
      current.lastSeen = now;
      if (seq != null) current.seq = seq;
      current.samples.push({ x, y, time: sampleTime });
      if (current.samples.length > this.maxSamples) current.samples.splice(0, current.samples.length - this.maxSamples);
      this.players.set(id, current);
      return true;
    }

    ingestSnapshot(players, receivedAt) {
      if (!Array.isArray(players)) return;
      players.forEach((player) => this.ingest(player, receivedAt));
    }

    remove(id) { this.players.delete(String(id)); }
    clear() { this.players.clear(); }

    prune(now) {
      now = finite(now, Date.now());
      for (const [id, player] of this.players) {
        if (now - player.lastSeen > this.staleAfterMs) this.players.delete(id);
      }
    }

    getRenderable(now) {
      now = finite(now, Date.now());
      this.prune(now);
      const target = now - this.interpolationDelayMs;
      return Array.from(this.players.values(), (player) => {
        const samples = player.samples;
        let a = samples[0];
        let b = samples[samples.length - 1];
        for (let i = 1; i < samples.length; i++) {
          if (samples[i].time >= target) { a = samples[i - 1]; b = samples[i]; break; }
          a = samples[i];
        }
        const span = Math.max(1, b.time - a.time);
        const t = clamp((target - a.time) / span, 0, 1);
        return {
          id: player.id,
          name: player.name,
          facing: player.facing,
          moving: player.moving,
          emote: player.emote,
          action: target < Number(player.actionUntil || 0) ? player.action : "none",
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          lastSeen: player.lastSeen
        };
      });
    }

    nearby(x, y, radius, now) {
      const r2 = radius * radius;
      return this.getRenderable(now)
        .map((player) => Object.assign(player, { distance: Math.hypot(player.x - x, player.y - y) }))
        .filter((player) => player.distance * player.distance <= r2)
        .sort((a, b) => a.distance - b.distance);
    }
  }

  function drawRemotePlayers(ctx, players, options) {
    if (!ctx || !Array.isArray(players)) return;
    options = options || {};
    const camera = options.camera || { x: 0, y: 0 };
    const scale = finite(options.scale, 1);
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    for (const player of players) {
      const x = Math.round((player.x - finite(camera.x, 0)) * scale);
      const bob = player.moving ? Math.sin(finite(options.now, Date.now()) / 85 + x * .03) * 1.5 : 0;
      const y = Math.round((player.y - finite(camera.y, 0)) * scale + bob);
      const facing = finite(player.facing, 0), fx = Math.cos(facing), fy = Math.sin(facing);
      const hue = stableHue(player.id), robe = `hsl(${hue} 48% 52%)`, light = `hsl(${hue} 62% 70%)`, dark = `hsl(${hue} 42% 29%)`;
      if (player.action === "dash") { ctx.globalAlpha = .25; ctx.fillStyle = robe; ctx.fillRect(x - fx * 18 - 7, y - fy * 18 - 7, 14, 19); ctx.globalAlpha = 1; }
      ctx.fillStyle = options.shadowColor || "rgba(0,0,0,.38)"; ctx.fillRect(x - 10, y + 8, 20, 4);
      ctx.fillStyle = dark; ctx.fillRect(x - 7, y - 6, 14, 17); ctx.fillStyle = robe; ctx.fillRect(x - 6, y - 8, 12, 17);
      ctx.fillStyle = light; ctx.fillRect(x - 5, y - 6, 4, 12); ctx.fillStyle = "#e8c774"; ctx.fillRect(x - 7, y + 1, 14, 2);
      ctx.fillStyle = "#d9b18a"; ctx.fillRect(x - 4, y - 14, 8, 7); ctx.fillStyle = "#1c2028"; ctx.fillRect(x - 5, y - 16, 10, 4); ctx.fillRect(x - 2, y - 19, 5, 4);
      const handX = x + fx * 7, handY = y - 2 + fy * 7;
      const swordAngle = player.action === "attack" ? facing + .75 : facing - .55;
      ctx.strokeStyle = "#dce7e2"; ctx.lineWidth = player.action === "parry" ? 4 : 2; ctx.beginPath(); ctx.moveTo(handX, handY); ctx.lineTo(handX + Math.cos(swordAngle) * 20, handY + Math.sin(swordAngle) * 20); ctx.stroke();
      if (player.action === "attack") { ctx.strokeStyle = "#f7dc83"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 25, facing - 1, facing + 1); ctx.stroke(); }
      if (player.action === "parry") { ctx.strokeStyle = "#8ff0dd"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + fx * 4, y + fy * 4, 18, facing - 1.1, facing + 1.1); ctx.stroke(); }
      ctx.fillStyle = options.nameColor || "#f6edcc";
      ctx.font = options.font || "10px monospace";
      ctx.fillText(player.name, x, y - 22);
      if (player.emote) ctx.fillText(player.emote, x, y - 34);
    }
    ctx.restore();
  }

  function stableHue(value) {
    let hash = 0;
    for (const char of String(value || "cultivator")) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return 165 + Math.abs(hash) % 115;
  }

  return { PresenceStore, drawRemotePlayers };
});
