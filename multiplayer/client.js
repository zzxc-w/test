(function (root, factory) {
  let dependencies = root.VerdantMultiplayer || {};
  if (typeof module === "object" && module.exports) {
    dependencies = Object.assign({}, require("./config.js"), require("./presence.js"), require("./drops.js"), require("./challenges.js"), require("./arena.js"));
    module.exports = factory(dependencies);
  } else {
    root.VerdantMultiplayer = Object.assign(dependencies, factory(dependencies));
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (mp) {
  "use strict";

  class MultiplayerClient {
    constructor(options) {
      options = options || {};
      this.config = mp.createConfig(options.config);
      this.fetch = options.fetch || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
      this.WebSocket = options.WebSocket || (typeof WebSocket !== "undefined" ? WebSocket : null);
      this.now = options.now || Date.now;
      this.random = options.random || Math.random;
      this.timer = options.timer || { setTimeout, clearTimeout };
      this.listeners = new Set();
      this.status = "offline";
      this.socket = null;
      this.arenaSocket = null;
      this.arenaGraceTimer = null;
      this.arenaConnection = null;
      this.arenaDisconnectedAt = null;
      this.arenaReconnectAttempt = 0;
      this.arenaWatchdogTimer = null;
      this.session = null;
      this.closedByUser = false;
      this.reconnectAttempt = 0;
      this.reconnectTimer = null;
      this.lastPresenceAt = -Infinity;
      this.presenceSeq = 0;
      this.presence = new mp.PresenceStore();
      this.drops = new mp.WorldDropStore();
      this.dropRequestSeq = 0;
      this.challenges = new mp.ChallengeController({ send: (message) => this.send(message), timeoutMs: this.config.challengeTimeoutMs, now: this.now });
      this.arena = new mp.ArenaClient({ send: (message) => this.sendArena(message), now: this.now });
      this.arena.leave = () => this.leaveArena();
    }

    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit(event, detail) { this.listeners.forEach((listener) => listener(event, detail)); }
    setStatus(status, detail) { if (status !== this.status) { this.status = status; this.emit("status", { status, detail: detail || null }); } }

    async connect(profile) {
      if (!this.config.enabled) { this.setStatus("offline", "disabled"); return false; }
      if (!this.fetch || !this.WebSocket || !this.config.apiBase) { this.setStatus("offline", "unavailable"); return false; }
      this.closedByUser = false;
      this.profile = profile || this.profile || {};
      this.setStatus("connecting");
      try {
        const response = await this.fetch(`${this.config.apiBase}/v1/session`, {
          method: "POST", credentials: "omit", cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            world: this.config.world,
            protocolVersion: this.config.protocolVersion,
            mapVersion: this.config.mapVersion,
            rulesetVersion: this.config.rulesetVersion,
            name: String(profile && profile.name || "Wandering Cultivator").slice(0, 32)
          })
        });
        if (!response.ok) throw new Error(`session-${response.status}`);
        const session = await response.json();
        if (!session.ticket || !session.websocketUrl || !session.playerId) throw new Error("invalid-session");
        this.session = session;
        this.presence.setLocalPlayerId(String(session.playerId));
        this.openSocket(session.websocketUrl, session.ticket);
        return true;
      } catch (error) {
        this.setStatus("offline", error.message);
        this.scheduleReconnect(this.profile);
        return false;
      }
    }

    openSocket(url, ticket) {
      if (this.socket) { this.socket.onclose = null; this.socket.close(); }
      const separator = String(url).includes("?") ? "&" : "?";
      const socket = new this.WebSocket(`${url}${separator}ticket=${encodeURIComponent(ticket)}`);
      this.socket = socket;
      socket.onopen = () => { if (socket !== this.socket) return; this.reconnectAttempt = 0; this.setStatus("online"); this.emit("online", this.session); };
      socket.onmessage = (event) => { if (socket === this.socket) this.handleMessage(event.data); };
      socket.onerror = () => { if (socket === this.socket) this.setStatus("reconnecting", "socket-error"); };
      socket.onclose = () => {
        if (socket !== this.socket) return;
        this.socket = null; this.presence.clear(); this.challenges.reset();
        if (!this.closedByUser) { this.setStatus("reconnecting"); this.scheduleReconnect(this.profile); }
        else this.setStatus("offline");
      };
    }

    handleMessage(raw) {
      if (typeof raw !== "string" || raw.length > this.config.maxMessageBytes) return false;
      let message;
      try { message = JSON.parse(raw); } catch (_) { return false; }
      if (!message || typeof message.type !== "string") return false;
      switch (message.type) {
        case "welcome": this.emit("welcome", message); break;
        case "world_snapshot": this.presence.ingestSnapshot(message.players, this.now()); this.drops.ingestSnapshot(message.drops); break;
        case "presence": this.presence.ingest(message.player, this.now()); break;
        case "player_leave": this.presence.remove(message.playerId); break;
        case "drop_created":
        case "drop_spawn": this.drops.ingest(message.drop); this.emit(message.type, message); break;
        case "drop_remove": this.drops.remove(message.dropId); this.emit("drop_remove", message); break;
        case "drop_award": this.drops.remove(message.drop && message.drop.id); this.emit("drop_award", message); break;
        case "drop_rejected": this.emit("drop_rejected", message); break;
        case "challenge_offer": this.challenges.receiveOffer(message); break;
        case "challenge_update": this.challenges.receiveUpdate(message); break;
        case "arena_start": this.challenges.receiveUpdate(message); this.openArenaSocket(message, false); break;
        case "pong": break;
        default: return false;
      }
      this.emit("message", message);
      return true;
    }

    openArenaSocket(message, reconnecting) {
      if (!message || !message.arenaId || !message.ticket || !message.websocketUrl) return false;
      if (this.arenaSocket) { this.arenaSocket.onclose = null; this.arenaSocket.close(); }
      if (this.arenaGraceTimer) this.timer.clearTimeout(this.arenaGraceTimer);
      this.arenaGraceTimer = null;
      this.arenaConnection = message;
      if (!reconnecting) { this.arenaDisconnectedAt = null; this.arenaReconnectAttempt = 0; this.arena.start(message); }
      const separator = String(message.websocketUrl).includes("?") ? "&" : "?";
      const socket = new this.WebSocket(`${message.websocketUrl}${separator}ticket=${encodeURIComponent(message.ticket)}`);
      this.arenaSocket = socket;
      socket.onopen = () => {
        if (socket !== this.arenaSocket) return;
        this.arenaDisconnectedAt = null;
        this.arenaReconnectAttempt = 0;
        this.emit("arena_online", { arenaId: this.arena.arenaId, resumed: Boolean(reconnecting) });
        this.armArenaWatchdog();
      };
      socket.onmessage = (event) => {
        if (socket !== this.arenaSocket || typeof event.data !== "string" || event.data.length > this.config.maxMessageBytes) return;
        let packet;
        try { packet = JSON.parse(event.data); } catch (_) { return; }
        if (packet.type === "arena_snapshot") {
          if (this.arena.receiveSnapshot(packet)) this.armArenaWatchdog();
          if (packet.status === "finished" || packet.winnerId) this.finishArena(packet);
        } else if (packet.type === "arena_end") this.finishArena(packet);
      };
      socket.onerror = () => this.emit("arena_reconnecting", { arenaId: this.arena.arenaId, graceMs: this.config.reconnectGraceMs });
      socket.onclose = () => {
        if (socket !== this.arenaSocket) return;
        this.arenaSocket = null;
        this.clearArenaWatchdog();
        if (this.arenaDisconnectedAt == null) this.arenaDisconnectedAt = this.now();
        this.emit("arena_reconnecting", { arenaId: this.arena.arenaId, graceMs: this.config.reconnectGraceMs });
        const elapsed = this.now() - this.arenaDisconnectedAt;
        const remaining = this.config.reconnectGraceMs - elapsed;
        if (remaining <= 0) {
          this.finishArena({ reason: "connection-lost" }); return;
        }
        const baseDelay = Math.min(4000, 500 * Math.pow(2, this.arenaReconnectAttempt++));
        const retryDelay = Math.min(remaining, Math.round(baseDelay * (0.8 + this.random() * 0.4)));
        this.arenaGraceTimer = this.timer.setTimeout(() => {
          this.arenaGraceTimer = null;
          if (this.arena.active && !this.arenaSocket && this.arenaConnection) this.openArenaSocket(this.arenaConnection, true);
        }, retryDelay);
      };
      return true;
    }

    clearArenaWatchdog() {
      if (this.arenaWatchdogTimer) this.timer.clearTimeout(this.arenaWatchdogTimer);
      this.arenaWatchdogTimer = null;
    }

    armArenaWatchdog() {
      this.clearArenaWatchdog();
      if (!this.arena.active) return;
      this.arenaWatchdogTimer = this.timer.setTimeout(() => {
        this.arenaWatchdogTimer = null;
        if (!this.arena.active) return;
        const staleFor = this.now() - Number(this.arena.snapshotReceivedAt || 0);
        if (staleFor < 6000) { this.armArenaWatchdog(); return; }
        this.finishArena({ reason: "connection-stalled" });
      }, 6500);
    }

    finishArena(result) {
      this.clearArenaWatchdog();
      if (this.arenaGraceTimer) this.timer.clearTimeout(this.arenaGraceTimer);
      this.arenaGraceTimer = null; this.arenaConnection = null; this.arenaDisconnectedAt = null; this.arenaReconnectAttempt = 0;
      if (this.arenaSocket) { const socket = this.arenaSocket; this.arenaSocket = null; socket.onclose = null; socket.close(1000, "arena-finished"); }
      this.arena.end(result || {});
    }

    leaveArena() {
      if (!this.arena.active) return false;
      this.finishArena({ reason: "left" });
      return true;
    }

    send(message) {
      if (!this.socket || this.socket.readyState !== 1) return false;
      if (Number(this.socket.bufferedAmount) > this.config.maxBufferedBytes) return false;
      const encoded = JSON.stringify(message);
      if (encoded.length > this.config.maxMessageBytes) return false;
      this.socket.send(encoded);
      return true;
    }

    sendArena(message) {
      if (!this.arenaSocket || this.arenaSocket.readyState !== 1) return false;
      if (Number(this.arenaSocket.bufferedAmount) > this.config.maxBufferedBytes) return false;
      const encoded = JSON.stringify(message);
      if (encoded.length > this.config.maxMessageBytes) return false;
      this.arenaSocket.send(encoded);
      return true;
    }

    updatePresence(state, force) {
      const now = this.now();
      if (!force && now - this.lastPresenceAt < 1000 / this.config.presenceHz) return false;
      state = state || {};
      const message = {
        type: "presence", seq: ++this.presenceSeq,
        x: Number(state.x), y: Number(state.y),
        facing: String(state.facing || "down").slice(0, 12),
        moving: Boolean(state.moving)
      };
      if (!Number.isFinite(message.x) || !Number.isFinite(message.y)) return false;
      if (state.emote != null) message.emote = String(state.emote).slice(0, 16);
      message.action = ["attack", "parry", "dash"].includes(state.action) ? state.action : "none";
      if (!this.send(message)) return false;
      this.lastPresenceAt = now;
      return true;
    }

    createDrop(itemId) {
      if (typeof itemId !== "string" || !/^[a-z0-9_]{1,48}$/.test(itemId)) return false;
      const requestId = this.nextDropRequestId();
      return this.send({ type: "drop_create", requestId, itemId }) ? requestId : false;
    }

    claimDrop(dropId) {
      if (typeof dropId !== "string" || !/^[a-f0-9-]{16,64}$/i.test(dropId)) return false;
      const requestId = this.nextDropRequestId();
      return this.send({ type: "drop_claim", requestId, dropId }) ? requestId : false;
    }

    listDrops(now) { return this.drops.list(now == null ? this.now() : now); }

    nextDropRequestId() {
      this.dropRequestSeq = (this.dropRequestSeq + 1) % 1_000_000_000;
      return `d${Math.floor(this.now()).toString(36)}_${this.dropRequestSeq.toString(36)}`;
    }

    scheduleReconnect(profile) {
      if (this.closedByUser || this.reconnectTimer || !this.config.enabled) return;
      const base = Math.min(this.config.reconnectMaxMs, this.config.reconnectMinMs * Math.pow(2, this.reconnectAttempt++));
      const delay = Math.round(base * (0.8 + this.random() * 0.4));
      this.reconnectTimer = this.timer.setTimeout(() => { this.reconnectTimer = null; this.connect(profile); }, delay);
    }

    disconnect() {
      this.closedByUser = true;
      if (this.reconnectTimer) this.timer.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      if (this.socket) { const socket = this.socket; this.socket = null; socket.close(1000, "client-close"); }
      if (this.arenaSocket) { const socket = this.arenaSocket; this.arenaSocket = null; socket.close(1000, "client-close"); }
      if (this.arenaGraceTimer) this.timer.clearTimeout(this.arenaGraceTimer);
      this.arenaGraceTimer = null;
      this.clearArenaWatchdog();
      this.arenaConnection = null;
      this.arenaDisconnectedAt = null;
      this.arenaReconnectAttempt = 0;
      this.presence.clear(); this.drops.clear(); this.challenges.reset(); this.arena.end({ reason: "disconnect" });
      this.setStatus("offline");
    }

    snapshot(now) {
      return { status: this.status, playerId: this.session && this.session.playerId, players: this.presence.getRenderable(now), drops: this.listDrops(now), arena: this.arena.snapshot };
    }
  }

  function createClient(options) { return new MultiplayerClient(options); }
  return { MultiplayerClient, createClient };
});
