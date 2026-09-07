import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken } from '../src/tokens.js';

const secret = 'test-only-secret-at-least-32-characters-long';

test('signed tickets round-trip and enforce kind/expiry', async () => {
  const claims = { kind: 'world', sid: 'player-1', exp: 20_000 };
  const token = await signToken(claims, secret);
  assert.deepEqual(await verifyToken(token, secret, 'world', 10_000), claims);
  assert.equal(await verifyToken(token, secret, 'arena', 10_000), null);
  assert.equal(await verifyToken(token, secret, 'world', 20_001), null);
});

test('tampered tickets fail verification', async () => {
  const token = await signToken({ kind: 'world', exp: 20_000 }, secret);
  assert.equal(await verifyToken(`x${token}`, secret, 'world', 1), null);
});
