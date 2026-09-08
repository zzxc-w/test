(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VerdantMultiplayer = Object.assign(root.VerdantMultiplayer || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ITEM_ID = /^[a-z0-9_]{1,48}$/;
  const DROP_ID = /^[a-f0-9-]{16,64}$/i;

  class WorldDropStore {
    constructor() { this.drops = new Map(); }

    ingest(raw) {
      const drop = cleanDrop(raw);
      if (!drop) return false;
      this.drops.set(drop.id, drop);
      return true;
    }

    ingestSnapshot(drops) {
      this.drops.clear();
      if (Array.isArray(drops)) drops.forEach((drop) => this.ingest(drop));
    }

    remove(id) { return this.drops.delete(String(id)); }
    clear() { this.drops.clear(); }

    list(now) {
      const time = Number.isFinite(Number(now)) ? Number(now) : Date.now();
      for (const [id, drop] of this.drops) if (drop.expiresAt <= time) this.drops.delete(id);
      return Array.from(this.drops.values(), (drop) => Object.assign({}, drop));
    }

    nearby(x, y, radius, now) {
      const px = Number(x), py = Number(y), max = Math.max(0, Number(radius) || 0);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return [];
      return this.list(now).map((drop) => Object.assign(drop, { distance: Math.hypot(drop.x - px, drop.y - py) }))
        .filter((drop) => drop.distance <= max).sort((a, b) => a.distance - b.distance);
    }
  }

  function cleanDrop(raw) {
    if (!raw || typeof raw !== "object" || !DROP_ID.test(String(raw.id || "")) || !ITEM_ID.test(String(raw.itemId || ""))) return null;
    const x = Number(raw.x), y = Number(raw.y), expiresAt = Number(raw.expiresAt), createdAt = Number(raw.createdAt);
    if (![x, y, expiresAt].every(Number.isFinite)) return null;
    return { id: String(raw.id), itemId: String(raw.itemId), x, y, createdAt: Number.isFinite(createdAt) ? createdAt : 0, expiresAt };
  }

  function drawWorldDrops(ctx, drops, options) {
    if (!ctx || !Array.isArray(drops)) return;
    options = options || {};
    const camera = options.camera || { x: 0, y: 0 };
    const scale = Number(options.scale) || 1;
    const now = Number(options.now) || Date.now();
    ctx.save();
    for (const drop of drops) {
      const x = Math.round((drop.x - Number(camera.x || 0)) * scale);
      const y = Math.round((drop.y - Number(camera.y || 0)) * scale + Math.sin(now / 180 + x) * 2);
      ctx.globalAlpha = .24; ctx.fillStyle = "#8ff0dd"; ctx.fillRect(x - 8, y - 8, 16, 16);
      ctx.globalAlpha = 1; ctx.fillStyle = "#f4d77d"; ctx.fillRect(x - 4, y - 5, 8, 10);
      ctx.fillStyle = "#fff2b8"; ctx.fillRect(x - 2, y - 7, 4, 3);
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x - 6, y + 7, 12, 2);
    }
    ctx.restore();
  }

  return { WorldDropStore, drawWorldDrops };
});
