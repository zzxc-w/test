import { LIMITS } from './constants.js';
import { safeJson, socketSend, validateChallengeRequest, validateChallengeResponse, validatePresence } from './protocol.js';
import { TokenBucket } from './rate-limit.js';
import { signToken } from './tokens.js';

export class WorldRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.rateLimits = new WeakMap();
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const playerId = request.headers.get('x-player-id');
    const displayName = decodeURIComponent(request.headers.get('x-display-name') || '');
    const protocolVersion = request.headers.get('x-protocol-version');
    const mapVersion = request.headers.get('x-map-version');
    const nonce = request.headers.get('x-ticket-nonce');
    if (!playerId || !displayName || !nonce || protocolVersion !== this.env.PROTOCOL_VERSION || mapVersion !== this.env.MAP_VERSION) {
      return new Response('Invalid admission', { status: 403 });
    }
    this.publicWebsocketBase = request.headers.get('x-public-websocket-base');

    const existing = this.findSocket(playerId);
    const nonceKey = `nonce:${nonce}`;
    const consumedBy = await this.state.storage.get(nonceKey);
    const disconnect = await this.state.storage.get(`disconnect:${playerId}`);
    const reconnecting = consumedBy === playerId && !existing && disconnect?.deadline > Date.now();
    if (consumedBy && !reconnecting) return new Response('Ticket already used', { status: 409 });
    if (!consumedBy) await this.state.storage.put(nonceKey, playerId);
    const activeCount = this.state.getWebSockets().filter((socket) => socket.readyState === 1 && socket !== existing).length;
    if (!existing && activeCount >= LIMITS.maxPlayers) return new Response('World is full', { status: 503 });
    if (existing) {
      try { existing.close(4001, 'Reconnected elsewhere'); } catch {}
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const prior = existing?.deserializeAttachment?.() || disconnect?.player || {};
    const player = {
      id: playerId,
      name: displayName,
      x: Number.isFinite(prior.x) ? prior.x : LIMITS.worldWidth / 2,
      y: Number.isFinite(prior.y) ? prior.y : LIMITS.worldHeight / 2,
      facing: Number.isFinite(prior.facing) ? prior.facing : 0,
      emote: 'none',
      action: 'none',
      seq: Number.isSafeInteger(prior.seq) ? prior.seq : -1,
      lastPresenceAt: Date.now(),
    };
    server.serializeAttachment(player);
    this.state.acceptWebSocket(server, [`player:${playerId}`]);
    this.rateLimits.set(server, this.newLimits());
    await this.state.storage.delete(`disconnect:${playerId}`);

    socketSend(server, {
      type: 'welcome', playerId, protocolVersion: Number(protocolVersion), mapVersion: Number(mapVersion),
      reconnectGraceMs: LIMITS.reconnectGraceMs,
    });
    socketSend(server, {
      type: 'world_snapshot',
      serverTime: Date.now(),
      players: this.players().filter((item) => item.id !== playerId).map(publicPlayer),
    });
    this.broadcast({ type: 'presence', player: publicPlayer(player), serverTime: Date.now() }, playerId);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, data) {
    if (typeof data !== 'string') return this.protocolStrike(socket, 'Binary messages are not supported');
    const message = safeJson(data);
    if (!message || typeof message.type !== 'string') return this.protocolStrike(socket, 'Malformed message');
    const player = socket.deserializeAttachment();
    if (!player?.id) return socket.close(4003, 'Missing session');
    const limits = this.rateLimits.get(socket) || this.newLimits();
    this.rateLimits.set(socket, limits);

    if (message.type === 'presence') {
      if (!limits.presence.take()) return;
      const presence = validatePresence(message);
      if (!presence || presence.seq <= player.seq) return this.protocolStrike(socket, 'Invalid presence');
      const now = Date.now();
      const elapsed = Math.max(50, now - player.lastPresenceAt);
      const distance = Math.hypot(presence.x - player.x, presence.y - player.y);
      if (player.seq >= 0 && distance > 80 + elapsed * 0.8) return this.protocolStrike(socket, 'Impossible movement');
      Object.assign(player, presence, { lastPresenceAt: now });
      socket.serializeAttachment(player);
      this.broadcast({ type: 'presence', player: publicPlayer(player), serverTime: now }, player.id);
      return;
    }

    if (!limits.actions.take()) return this.protocolStrike(socket, 'Rate limit exceeded');
    if (message.type === 'challenge_request') {
      const request = validateChallengeRequest(message);
      return request ? this.createChallenge(socket, player, request.targetPlayerId) : this.protocolStrike(socket, 'Invalid challenge');
    }
    if (message.type === 'challenge_response') {
      const response = validateChallengeResponse(message);
      return response ? this.respondToChallenge(socket, player, response) : this.protocolStrike(socket, 'Invalid challenge response');
    }
    if (message.type === 'ping') return socketSend(socket, { type: 'pong', serverTime: Date.now() });
    return this.protocolStrike(socket, 'Unknown message type');
  }

  async createChallenge(socket, challenger, targetId) {
    const targetSocket = this.findSocket(targetId);
    if (!targetSocket || targetId === challenger.id) return socketSend(socket, { type: 'challenge_update', status: 'unavailable', targetPlayerId: targetId });
    const target = targetSocket.deserializeAttachment();
    if (!withinChallengeRange(challenger, target)) {
      return socketSend(socket, { type: 'challenge_update', status: 'too_far', targetPlayerId: targetId });
    }
    const challenges = await this.loadChallenges();
    if (Object.values(challenges).some((item) => item.status === 'pending' && [item.fromId, item.toId].some((id) => id === challenger.id || id === targetId))) {
      return socketSend(socket, { type: 'challenge_update', status: 'busy' });
    }
    const challenge = {
      id: crypto.randomUUID(), fromId: challenger.id, toId: targetId,
      fromName: challenger.name, status: 'pending', expiresAt: Date.now() + LIMITS.challengeTimeoutMs,
    };
    challenges[challenge.id] = challenge;
    await this.saveChallenges(challenges);
    socketSend(socket, { type: 'challenge_update', challengeId: challenge.id, status: 'pending', targetPlayerId: targetId, expiresAt: challenge.expiresAt });
    socketSend(targetSocket, { type: 'challenge_offer', challengeId: challenge.id, fromPlayerId: challenger.id, fromName: challenger.name, expiresAt: challenge.expiresAt });
  }

  async respondToChallenge(socket, player, response) {
    const challenges = await this.loadChallenges();
    const challenge = challenges[response.challengeId];
    if (!challenge || challenge.status !== 'pending' || challenge.toId !== player.id || challenge.expiresAt <= Date.now()) {
      return socketSend(socket, { type: 'challenge_update', challengeId: response.challengeId, status: 'expired' });
    }
    const challengerSocket = this.findSocket(challenge.fromId);
    if (!challengerSocket) response.accept = false;
    challenge.status = response.accept ? 'accepted' : 'declined';
    delete challenges[challenge.id];
    await this.saveChallenges(challenges);
    const update = { type: 'challenge_update', challengeId: challenge.id, status: challenge.status };
    socketSend(socket, update);
    if (challengerSocket) socketSend(challengerSocket, update);
    if (response.accept && challengerSocket) await this.startArena(challenge, challengerSocket, socket);
  }

  async startArena(challenge, challengerSocket, challengedSocket) {
    const arenaId = crypto.randomUUID();
    const ids = [challenge.fromId, challenge.toId];
    const arena = this.env.ARENA_ROOMS.get(this.env.ARENA_ROOMS.idFromName(arenaId));
    await arena.fetch('https://internal/configure', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-arena-key': this.env.SESSION_SIGNING_KEY },
      body: JSON.stringify({
        arenaId, playerIds: ids, rulesetVersion: this.env.RULESET_VERSION,
        players: [challengerSocket, challengedSocket].map((socket) => {
          const player = socket.deserializeAttachment();
          return { id: player.id, name: player.name };
        }),
      }),
    });
    const expires = Date.now() + LIMITS.arenaTicketLifetimeMs;
    for (const [socket, playerId] of [[challengerSocket, ids[0]], [challengedSocket, ids[1]]]) {
      const ticket = await signToken({ kind: 'arena', sid: playerId, arenaId, nonce: crypto.randomUUID(), exp: expires }, this.env.SESSION_SIGNING_KEY);
      socketSend(socket, {
        type: 'arena_start', arenaId, playerId, websocketUrl: `${this.publicWebsocketBase}/v1/arena/${arenaId}`, ticket,
        rulesetVersion: this.env.RULESET_VERSION, expiresAt: expires,
      });
    }
  }

  async webSocketClose(socket) {
    const player = socket.deserializeAttachment();
    if (!player?.id || this.findSocket(player.id, socket)) return;
    const deadline = Date.now() + LIMITS.reconnectGraceMs;
    await this.state.storage.put(`disconnect:${player.id}`, { deadline, player: publicPlayer(player) });
    const alarm = await this.state.storage.getAlarm();
    if (!alarm || alarm > deadline) await this.state.storage.setAlarm(deadline);
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }

  async alarm() {
    const now = Date.now();
    const disconnected = await this.state.storage.list({ prefix: 'disconnect:' });
    let next = null;
    for (const [key, value] of disconnected) {
      const playerId = key.slice('disconnect:'.length);
      if (this.findSocket(playerId)) {
        await this.state.storage.delete(key);
      } else if (value.deadline <= now) {
        await this.state.storage.delete(key);
        this.broadcast({ type: 'player_leave', playerId, serverTime: now });
      } else {
        next = next === null ? value.deadline : Math.min(next, value.deadline);
      }
    }
    const challenges = await this.loadChallenges();
    for (const challenge of Object.values(challenges)) {
      if (challenge.expiresAt <= now) {
        delete challenges[challenge.id];
        const update = { type: 'challenge_update', challengeId: challenge.id, status: 'expired' };
        socketSend(this.findSocket(challenge.fromId), update);
        socketSend(this.findSocket(challenge.toId), update);
      } else {
        next = next === null ? challenge.expiresAt : Math.min(next, challenge.expiresAt);
      }
    }
    await this.saveChallenges(challenges, false);
    if (next !== null) await this.state.storage.setAlarm(next);
  }

  players() {
    return this.state.getWebSockets().filter((socket) => socket.readyState === 1).map((socket) => socket.deserializeAttachment()).filter(Boolean);
  }

  findSocket(playerId, except = null) {
    return this.state.getWebSockets(`player:${playerId}`).find((socket) => socket !== except && socket.readyState === 1) || null;
  }

  broadcast(payload, exceptId = null) {
    for (const socket of this.state.getWebSockets()) {
      const attached = socket.deserializeAttachment();
      if (socket.readyState === 1 && attached?.id !== exceptId) socketSend(socket, payload);
    }
  }

  newLimits() {
    return { presence: new TokenBucket(12, LIMITS.presencePerSecond), actions: new TokenBucket(6, LIMITS.actionsPerSecond), strikes: 0 };
  }

  protocolStrike(socket, reason) {
    const limits = this.rateLimits.get(socket) || this.newLimits();
    limits.strikes += 1;
    this.rateLimits.set(socket, limits);
    if (limits.strikes >= 3) socket.close(1008, reason.slice(0, 100));
    else socketSend(socket, { type: 'error', code: 'invalid_message' });
  }

  async loadChallenges() {
    return (await this.state.storage.get('challenges')) || {};
  }

  async saveChallenges(challenges, schedule = true) {
    await this.state.storage.put('challenges', challenges);
    if (!schedule) return;
    const next = Object.values(challenges).reduce((min, item) => Math.min(min, item.expiresAt), Infinity);
    if (Number.isFinite(next)) {
      const alarm = await this.state.storage.getAlarm();
      if (!alarm || alarm > next) await this.state.storage.setAlarm(next);
    }
  }
}

function publicPlayer(player) {
  return {
    id: player.id, name: player.name, x: player.x, y: player.y,
    facing: player.facing, emote: player.emote, action: player.action || 'none', seq: player.seq,
  };
}

export function withinChallengeRange(a, b) {
  return Boolean(a && b && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(b.x) && Number.isFinite(b.y)) &&
    Math.hypot(a.x - b.x, a.y - b.y) <= LIMITS.challengeDistance;
}
