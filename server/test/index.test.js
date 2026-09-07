import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { verifyToken } from '../src/tokens.js';

const secret = 'test-only-secret-at-least-32-characters-long';
const env = {
  SESSION_SIGNING_KEY: secret,
  ALLOWED_ORIGINS: 'https://zzxc-w.github.io',
  PROTOCOL_VERSION: '1', MAP_VERSION: '1', RULESET_VERSION: '1',
};

function sessionRequest(body, origin = 'https://zzxc-w.github.io') {
  return new Request('https://multiplayer.example/v1/session', {
    method: 'POST', headers: { Origin: origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

const validBody = { world: 'verdant-star', protocolVersion: 1, mapVersion: 1, rulesetVersion: 1, name: 'Jade Fox' };

test('session endpoint returns a signed world ticket and secure websocket URL', async () => {
  const response = await worker.fetch(sessionRequest(validBody), env);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://zzxc-w.github.io');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.match(body.playerId, /^[a-f0-9-]{36}$/i);
  assert.equal(body.websocketUrl, 'wss://multiplayer.example/v1/world');
  const claims = await verifyToken(body.ticket, secret, 'world');
  assert.equal(claims.sid, body.playerId);
  assert.equal(claims.name, 'Jade Fox');
});

test('session endpoint rejects foreign origins, version drift and extra authority fields', async () => {
  assert.equal((await worker.fetch(sessionRequest(validBody, 'https://evil.example'), env)).status, 403);
  assert.equal((await worker.fetch(sessionRequest({ ...validBody, mapVersion: 2 }), env)).status, 400);
  assert.equal((await worker.fetch(sessionRequest({ ...validBody, hp: 999 }), env)).status, 400);
});

test('preflight is restricted to an allowed exact origin', async () => {
  const response = await worker.fetch(new Request('https://multiplayer.example/v1/session', { method: 'OPTIONS', headers: { Origin: 'https://zzxc-w.github.io' } }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://zzxc-w.github.io');
});
