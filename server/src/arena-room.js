import { ARENA, LIMITS } from './constants.js';
import { applyArenaInput, createArenaState, finishArena, publicArenaSnapshot, stepArena } from './arena-sim.js';
import { cleanDisplayName, safeJson, socketSend, validateArenaInput } from './protocol.js';
import { TokenBucket } from './rate-limit.js';

export class ArenaRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sim = null;
    this.config = null;
    this.rateLimits = new WeakMap();
    this.tickHandle = null;
    this.lastSnapshotAt = 0;
    this.endAnnounced = false;
    this.tickInFlight = false;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/configure' && request.method === 'POST') return this.configure(request);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    await this.ensureLoaded();
    const playerId = request.headers.get('x-player-id');
    const nonce = request.headers.get('x-ticket-nonce');
    const rulesetVersion = request.headers.get('x-ruleset-version');
    if (!this.config || !this.config.playerIds.includes(playerId) || !nonce || rulesetVersion !== this.env.RULESET_VERSION) {
      return new Response('Invalid arena admission', { status: 403 });
    }
    const nonceKey = `nonce:${nonce}`;
    const consumedBy = await this.state.storage.get(nonceKey);
    const player = this.sim.players[playerId];
    const reconnecting = consumedBy === playerId && !player.connected && player.disconnectedAt && Date.now() - player.disconnectedAt <= LIMITS.reconnectGraceMs;
    if (consumedBy && !reconnecting) return new Response('Ticket already used', { status: 409 });
    if (!consumedBy) await this.state.storage.put(nonceKey, playerId);

    const previous = this.findSocket(playerId);
    if (previous) {
      try { previous.close(4001, 'Reconnected elsewhere'); } catch {}
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({ playerId, nonce });
    this.state.acceptWebSocket(server, [`player:${playerId}`]);
    this.rateLimits.set(server, { inputs: new TokenBucket(50, 35), strikes: 0 });
    player.connected = true;
    player.disconnectedAt = null;
    this.startTicking();
    socketSend(server, {
      type: 'arena_snapshot',
      arenaId: this.config.arenaId,
      rulesetVersion: this.config.rulesetVersion,
      you: playerId,
      ...publicArenaSnapshot(this.sim),
    });
    if (this.sim.endedAt != null || this.sim.winnerId) {
      socketSend(server, this.endPayload(Date.now()));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async configure(request) {
    if (request.headers.get('x-internal-arena-key') !== this.env.SESSION_SIGNING_KEY) return new Response('Forbidden', { status: 403 });
    let body;
    try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
    if (!body || typeof body.arenaId !== 'string' || !Array.isArray(body.playerIds) || body.playerIds.length !== 2 || body.rulesetVersion !== this.env.RULESET_VERSION) {
      return new Response('Invalid configuration', { status: 400 });
    }
    const existing = await this.state.storage.get('config');
    if (existing && (existing.arenaId !== body.arenaId || existing.playerIds.join() !== body.playerIds.join())) return new Response('Already configured', { status: 409 });
    if (existing) {
      this.config = existing;
      this.sim = (await this.state.storage.get('sim')) || createArenaState(existing.playerIds, Date.now(), existing.playerNames);
      return new Response(null, { status: 204 });
    }
    const playerNames = {};
    if (body.players !== undefined) {
      if (!Array.isArray(body.players) || body.players.length !== 2 || new Set(body.players.map((player) => player?.id)).size !== 2) {
        return new Response('Invalid player profiles', { status: 400 });
      }
      for (const player of body.players) {
        if (!player || Object.keys(player).some((key) => key !== 'id' && key !== 'name') || !body.playerIds.includes(player.id)) {
          return new Response('Invalid player profile', { status: 400 });
        }
        const name = cleanDisplayName(player.name);
        if (!name) return new Response('Invalid player profile', { status: 400 });
        playerNames[player.id] = name;
      }
    }
    this.config = { arenaId: body.arenaId, playerIds: [...body.playerIds], playerNames, rulesetVersion: body.rulesetVersion };
    this.sim = createArenaState(this.config.playerIds, Date.now(), playerNames);
    await this.state.storage.put({ config: this.config, sim: this.sim });
    return new Response(null, { status: 204 });
  }

  async ensureLoaded() {
    if (!this.config) this.config = await this.state.storage.get('config');
    if (!this.sim) this.sim = (await this.state.storage.get('sim')) || (this.config ? createArenaState(this.config.playerIds, Date.now(), this.config.playerNames) : null);
  }

  async webSocketMessage(socket, data) {
    await this.ensureLoaded();
    if (!this.sim || !this.config || this.sim.endedAt != null || this.sim.winnerId) return;
    this.startTicking();
    if (typeof data !== 'string') return this.strike(socket, 'Binary message');
    const limits = this.rateLimits.get(socket) || { inputs: new TokenBucket(50, 35), strikes: 0 };
    this.rateLimits.set(socket, limits);
    // Input is disposable state. Dropping excess packets protects the room without
    // disconnecting high-refresh-rate browsers and leaving their arena UI stranded.
    if (!limits.inputs.take()) return;
    const message = safeJson(data);
    const input = validateArenaInput(message);
    const { playerId } = socket.deserializeAttachment() || {};
    if (!input || message.arenaId !== this.config.arenaId || !playerId || !applyArenaInput(this.sim, playerId, input)) return this.strike(socket, 'Invalid arena input');
  }

  async webSocketClose(socket) {
    if (!this.sim) return;
    const { playerId } = socket.deserializeAttachment() || {};
    if (!playerId || this.findSocket(playerId, socket)) return;
    const player = this.sim.players[playerId];
    if (player) {
      player.connected = false;
      player.disconnectedAt = Date.now();
      await this.state.storage.put('sim', this.sim);
    }
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }

  startTicking() {
    if (this.tickHandle || this.sim?.endedAt != null || this.sim?.winnerId) return;
    this.tickHandle = setInterval(() => {
      if (this.tickInFlight) return;
      this.tickInFlight = true;
      Promise.resolve(this.tick()).catch((error) => this.handleTickFailure(error)).finally(() => { this.tickInFlight = false; });
    }, ARENA.tickMs);
  }

  async tick() {
    if (!this.sim) return;
    const now = Date.now();
    stepArena(this.sim, now);
    const players = Object.values(this.sim.players);
    if (!this.sim.winnerId) {
      const forfeiter = players.find((player) => !player.connected && player.disconnectedAt && now - player.disconnectedAt > LIMITS.reconnectGraceMs);
      if (forfeiter) {
        const opponent = players.find((player) => player.id !== forfeiter.id);
        finishArena(this.sim, opponent?.connected ? opponent.id : 'draw', 'disconnect');
      }
    }
    if (now - this.lastSnapshotAt >= ARENA.snapshotMs || this.sim.winnerId) {
      this.lastSnapshotAt = now;
      this.broadcast(publicArenaSnapshot(this.sim, now));
    }
    if (this.sim.winnerId && !this.endAnnounced) {
      this.endAnnounced = true;
      this.broadcast(this.endPayload(now));
      await this.state.storage.put('sim', this.sim);
      clearInterval(this.tickHandle);
      this.tickHandle = null;
      setTimeout(() => {
        for (const socket of this.state.getWebSockets()) {
          try { socket.close(1000, 'Arena complete'); } catch {}
        }
      }, 2000);
    } else if (now % 1000 < ARENA.tickMs) {
      await this.state.storage.put('sim', this.sim);
    }
  }

  findSocket(playerId, except = null) {
    return this.state.getWebSockets(`player:${playerId}`).find((socket) => socket !== except && socket.readyState === 1) || null;
  }

  broadcast(payload) {
    for (const socket of this.state.getWebSockets()) if (socket.readyState === 1) socketSend(socket, payload);
  }

  endPayload(now = Date.now()) {
    return {
      type: 'arena_end', arenaId: this.config.arenaId,
      winnerId: this.sim.winnerId, reason: this.sim.reason,
      endedAt: this.sim.endedAt || now, serverTime: now,
    };
  }

  async handleTickFailure(error) {
    console.error('Arena tick failed', error);
    if (!this.sim || this.sim.endedAt != null || this.sim.winnerId) return;
    this.sim.updatedAt = Date.now();
    finishArena(this.sim, 'draw', 'server_error');
    this.broadcast(publicArenaSnapshot(this.sim, this.sim.updatedAt));
    this.broadcast(this.endPayload(this.sim.updatedAt));
    this.endAnnounced = true;
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.tickHandle = null;
    await this.state.storage.put('sim', this.sim);
  }

  strike(socket, reason) {
    const limits = this.rateLimits.get(socket) || { inputs: new TokenBucket(50, 35), strikes: 0 };
    limits.strikes += 1;
    this.rateLimits.set(socket, limits);
    if (limits.strikes >= 3) socket.close(1008, reason.slice(0, 100));
    else socketSend(socket, { type: 'error', code: 'invalid_arena_input' });
  }
}
