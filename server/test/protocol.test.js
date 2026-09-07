import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDisplayName, isAllowedOrigin, safeJson, validateArenaInput, validateChallengeRequest, validatePresence } from '../src/protocol.js';

test('safeJson rejects oversized, malformed and non-object messages', () => {
  assert.deepEqual(safeJson('{"type":"ping"}'), { type: 'ping' });
  assert.equal(safeJson('{'), null);
  assert.equal(safeJson('[]'), null);
  assert.equal(safeJson('x'.repeat(4097)), null);
});

test('display names are short and safe', () => {
  assert.equal(cleanDisplayName('  Jade   Fox  '), 'Jade Fox');
  assert.equal(cleanDisplayName('<script>'), null);
  assert.equal(cleanDisplayName('x'.repeat(21)), null);
});

test('presence enforces map bounds, sequence and strict fields', () => {
  const valid = { type: 'presence', seq: 4, x: 100, y: 200, facing: 'left', moving: true, emote: 'bow' };
  assert.deepEqual(validatePresence(valid), { seq: 4, x: 100, y: 200, facing: 'left', moving: true, emote: 'bow', action: 'none' });
  assert.equal(validatePresence({ ...valid, x: -1 }), null);
  assert.ok(validatePresence({ ...valid, x: 144 * 24, y: 108 * 24 }));
  assert.equal(validatePresence({ ...valid, x: 144 * 24 + 1 }), null);
  assert.equal(validatePresence({ ...valid, hp: 999 }), null);
});

test('presence accepts only the allowlisted cosmetic combat actions', () => {
  const base = { type: 'presence', seq: 1, x: 100, y: 100, facing: 'east', moving: false };
  for (const action of ['none', 'attack', 'parry', 'dash']) {
    assert.equal(validatePresence({ ...base, action }).action, action);
  }
  assert.equal(validatePresence({ ...base, action: 'admin-strike' }).action, 'none');
  assert.equal(validatePresence({ ...base, action: { attack: true } }).action, 'none');
});

test('challenge and arena input match the browser contract', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  assert.deepEqual(validateChallengeRequest({ type: 'challenge_request', targetPlayerId: id }), { targetPlayerId: id });
  assert.equal(validateChallengeRequest({ type: 'challenge_request', targetId: id }), null);
  assert.deepEqual(validateArenaInput({ type: 'arena_input', arenaId: id, seq: 1, moveX: 0.5, moveY: -1, attack: true, dash: false, parry: false }), {
    seq: 1, moveX: 0.5, moveY: -1, aimX: 0.5, aimY: -1, attack: true, dash: false, parry: false,
  });
});

test('origin allowlist uses exact matches', () => {
  assert.equal(isAllowedOrigin(new Request('https://worker.test', { headers: { Origin: 'https://zzxc-w.github.io' } }), 'https://zzxc-w.github.io'), true);
  assert.equal(isAllowedOrigin(new Request('https://worker.test', { headers: { Origin: 'https://zzxc-w.github.io.attacker.test' } }), 'https://zzxc-w.github.io'), false);
});
