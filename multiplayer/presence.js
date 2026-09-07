(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VerdantMultiplayer = Object.assign(root.VerdantMultiplayer || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
      current.facing = String(player.facing || current.facing || "down").slice(0, 12);
      current.moving = Boolean(player.moving);
      current.emote = player.emote == null ? null : String(player.emote).slice(0, 16);
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
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (const player of players) {
      const x = Math.round((player.x - finite(camera.x, 0)) * scale);
      const y = Math.round((player.y - finite(camera.y, 0)) * scale);
      ctx.fillStyle = options.shadowColor || "rgba(0,0,0,.35)";
      ctx.beginPath(); ctx.ellipse(x, y + 7, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = options.bodyColor || "#73d6e8";
      ctx.fillRect(x - 5, y - 10, 10, 16);
      ctx.fillStyle = options.nameColor || "#f6edcc";
      ctx.font = options.font || "10px monospace";
      ctx.fillText(player.name, x, y - 13);
      if (player.emote) ctx.fillText(player.emote, x, y - 26);
    }
    ctx.restore();
  }

  return { PresenceStore, drawRemotePlayers };
});
