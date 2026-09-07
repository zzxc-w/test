import { LIMITS } from './constants.js';
import { cleanDisplayName, corsHeaders, isAllowedOrigin, jsonResponse } from './protocol.js';
import { signToken, verifyToken } from './tokens.js';
export { WorldRoom } from './world-room.js';
export { ArenaRoom } from './arena-room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ ok: true, protocolVersion: Number(env.PROTOCOL_VERSION), mapVersion: Number(env.MAP_VERSION), rulesetVersion: Number(env.RULESET_VERSION) });
    }
    if (url.pathname.startsWith('/v1/') && !isAllowedOrigin(request, env.ALLOWED_ORIGINS)) {
      return jsonResponse({ error: 'origin_not_allowed' }, 403);
    }
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/v1/')) {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (!env.SESSION_SIGNING_KEY || env.SESSION_SIGNING_KEY.length < 32) {
      return jsonResponse({ error: 'service_not_configured' }, 503, url.pathname.startsWith('/v1/') ? corsHeaders(request) : {});
    }

    if (url.pathname === '/v1/session' && request.method === 'POST') return createSession(request, env, url);
    if (url.pathname === '/v1/world' && request.method === 'GET') return enterWorld(request, env, url);
    const arenaMatch = url.pathname.match(/^\/v1\/arena\/([a-f0-9-]{36})$/i);
    if (arenaMatch && request.method === 'GET') return enterArena(request, env, url, arenaMatch[1]);
    return jsonResponse({ error: 'not_found' }, 404, url.pathname.startsWith('/v1/') ? corsHeaders(request) : {});
  },
};

async function createSession(request, env, url) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > LIMITS.maxMessageBytes) return jsonResponse({ error: 'body_too_large' }, 413, corsHeaders(request));
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid_json' }, 400, corsHeaders(request)); }
  const name = cleanDisplayName(body?.name);
  if (
    !hasOnly(body, ['world', 'protocolVersion', 'mapVersion', 'rulesetVersion', 'name']) ||
    body?.world !== 'verdant-star' || !name ||
    Number(body.protocolVersion) !== Number(env.PROTOCOL_VERSION) ||
    Number(body.mapVersion) !== Number(env.MAP_VERSION) ||
    Number(body.rulesetVersion) !== Number(env.RULESET_VERSION)
  ) return jsonResponse({ error: 'invalid_session_request' }, 400, corsHeaders(request));

  const playerId = crypto.randomUUID();
  const expiresAt = Date.now() + LIMITS.sessionLifetimeMs;
  const ticket = await signToken({
    kind: 'world', sid: playerId, name,
    protocolVersion: env.PROTOCOL_VERSION, mapVersion: env.MAP_VERSION,
    nonce: crypto.randomUUID(), exp: expiresAt,
  }, env.SESSION_SIGNING_KEY);
  return jsonResponse({
    playerId, ticket, expiresAt,
    websocketUrl: websocketBase(url) + '/v1/world',
  }, 201, { ...corsHeaders(request), 'cache-control': 'no-store' });
}

async function enterWorld(request, env, url) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return jsonResponse({ error: 'upgrade_required' }, 426, corsHeaders(request));
  const claims = await verifyToken(url.searchParams.get('ticket'), env.SESSION_SIGNING_KEY, 'world');
  if (!claims || claims.protocolVersion !== env.PROTOCOL_VERSION || claims.mapVersion !== env.MAP_VERSION) {
    return jsonResponse({ error: 'invalid_ticket' }, 401, corsHeaders(request));
  }
  const room = env.WORLD_ROOMS.get(env.WORLD_ROOMS.idFromName(env.WORLD_SHARD));
  return room.fetch(request.url, {
    headers: {
      Upgrade: 'websocket',
      'x-player-id': claims.sid,
      'x-display-name': encodeURIComponent(claims.name),
      'x-protocol-version': claims.protocolVersion,
      'x-map-version': claims.mapVersion,
      'x-ticket-nonce': claims.nonce,
      'x-public-websocket-base': websocketBase(url),
    },
  });
}

async function enterArena(request, env, url, arenaId) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return jsonResponse({ error: 'upgrade_required' }, 426, corsHeaders(request));
  const claims = await verifyToken(url.searchParams.get('ticket'), env.SESSION_SIGNING_KEY, 'arena');
  if (!claims || claims.arenaId !== arenaId) return jsonResponse({ error: 'invalid_ticket' }, 401, corsHeaders(request));
  const room = env.ARENA_ROOMS.get(env.ARENA_ROOMS.idFromName(arenaId));
  return room.fetch(request.url, {
    headers: {
      Upgrade: 'websocket',
      'x-player-id': claims.sid,
      'x-ticket-nonce': claims.nonce,
      'x-ruleset-version': env.RULESET_VERSION,
    },
  });
}

function websocketBase(url) {
  return `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
}

function hasOnly(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key));
}
