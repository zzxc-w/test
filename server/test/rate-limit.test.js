import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucket } from '../src/rate-limit.js';

test('token bucket bursts, rejects, then refills', () => {
  const bucket = new TokenBucket(2, 2, 1000);
  assert.equal(bucket.take(1000), true);
  assert.equal(bucket.take(1000), true);
  assert.equal(bucket.take(1000), false);
  assert.equal(bucket.take(1500), true);
});
