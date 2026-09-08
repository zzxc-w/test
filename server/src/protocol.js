import { LIMITS } from './constants.js';

const encoder = new TextEncoder();
const namePattern = /^[\p{L}\p{N} _.-]{1,20}$/u;
const emotes = new Set(['bow', 'wave', 'meditate', 'none']);
const presenceActions = new Set(['none', 'attack', 'parry', 'dash']);

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function safeJson(text, maxBytes = LIMITS.maxMessageBytes) {
  if (typeof text !== 'string' || encoder.encode(text).byteLength > maxBytes) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function cleanDisplayName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return namePattern.test(name) ? name : null;
}

export function validatePresence(message) {
  if (message?.type !== 'presence') return null;
  if (!hasOnly(message, ['type', 'seq', 'x', 'y', 'facing', 'moving', 'emote', 'action'])) return null;
  const x = Number(message.x);
  const y = Number(message.y);
  const seq = Number(message.seq);
  if (![x, y, seq].every(Number.isFinite)) return null;
  if (x < 0 || x > LIMITS.worldWidth || y < 0 || y > LIMITS.worldHeight) return null;
  if (!Number.isSafeInteger(seq) || seq < 0) return null;
  const emote = emotes.has(message.emote) ? message.emote : 'none';
  const action = presenceActions.has(message.action) ? message.action : 'none';
  const facing = typeof message.facing === 'string' ? message.facing.slice(0, 12) : normalizeAngle(Number(message.facing) || 0);
  return { x, y, facing, moving: message.moving === true, seq, emote, action };
}

export function validateChallengeRequest(message) {
  if (message?.type !== 'challenge_request' || typeof message.targetPlayerId !== 'string') return null;
  if (!hasOnly(message, ['type', 'targetPlayerId'])) return null;
  return /^[a-f0-9-]{16,64}$/i.test(message.targetPlayerId) ? { targetPlayerId: message.targetPlayerId } : null;
}

export function validateChallengeResponse(message) {
  if (message?.type !== 'challenge_response' || typeof message.challengeId !== 'string') return null;
  if (!hasOnly(message, ['type', 'challengeId', 'accept'])) return null;
  if (!/^[a-f0-9-]{16,64}$/i.test(message.challengeId) || typeof message.accept !== 'boolean') return null;
  return { challengeId: message.challengeId, accept: message.accept };
}

export function validateDropCreate(message) {
  if (message?.type !== 'drop_create' || !hasOnly(message, ['type', 'requestId', 'itemId'])) return null;
  if (!validRequestId(message.requestId) || typeof message.itemId !== 'string' || !/^[a-z0-9_]{1,48}$/.test(message.itemId)) return null;
  return { requestId: message.requestId, itemId: message.itemId };
}

export function validateDropClaim(message) {
  if (message?.type !== 'drop_claim' || !hasOnly(message, ['type', 'requestId', 'dropId'])) return null;
  if (!validRequestId(message.requestId) || typeof message.dropId !== 'string' || !/^[a-f0-9-]{16,64}$/i.test(message.dropId)) return null;
  return { requestId: message.requestId, dropId: message.dropId };
}

export function validateArenaInput(message) {
  if (message?.type !== 'arena_input') return null;
  if (!hasOnly(message, ['type', 'arenaId', 'seq', 'moveX', 'moveY', 'aimX', 'aimY', 'attack', 'parry', 'dash'])) return null;
  const seq = Number(message.seq);
  const moveX = Number(message.moveX);
  const moveY = Number(message.moveY);
  const aimX = Number.isFinite(Number(message.aimX)) ? Number(message.aimX) : moveX;
  const aimY = Number.isFinite(Number(message.aimY)) ? Number(message.aimY) : moveY;
  if (![seq, moveX, moveY].every(Number.isFinite)) return null;
  if (!Number.isSafeInteger(seq) || seq < 0) return null;
  if (Math.abs(moveX) > 1 || Math.abs(moveY) > 1 || Math.abs(aimX) > 1 || Math.abs(aimY) > 1) return null;
  return {
    seq, moveX, moveY, aimX, aimY,
    attack: message.attack === true,
    parry: message.parry === true,
    dash: message.dash === true,
  };
}

export function isAllowedOrigin(request, configured) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  const allowed = String(configured || '').split(',').map((item) => item.trim()).filter(Boolean);
  return allowed.includes(origin);
}

export function corsHeaders(request) {
  return {
    'access-control-allow-origin': request.headers.get('Origin') || '',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  };
}

export function normalizeAngle(angle) {
  let value = angle % (Math.PI * 2);
  if (value < -Math.PI) value += Math.PI * 2;
  if (value > Math.PI) value -= Math.PI * 2;
  return value;
}

export function socketSend(socket, payload) {
  try {
    if (socket.readyState === 1) socket.send(JSON.stringify(payload));
  } catch {
    // The close callback owns presence cleanup.
  }
}

function hasOnly(object, allowed) {
  const keys = Object.keys(object);
  return keys.every((key) => allowed.includes(key));
}

function validRequestId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}
