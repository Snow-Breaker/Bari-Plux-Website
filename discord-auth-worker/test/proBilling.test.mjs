import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grantProSafe, enforceProExpiryForUid } from '../src/proBilling.js';

function fakeDeps(initial = {}) {
  const data = { ...initial };
  return { data, adminGet: async (p) => data[p] ?? null, adminPut: async (p, v) => { data[p] = v; return true; } };
}

test('a purchase never puts an expiry on Lifetime Pro', async () => {
  const deps = fakeDeps({ 'users/u/role': 'pro', 'users/u/lifetime': true });
  const res = await grantProSafe(['u'], {}, deps, { durationMs: 1000, silent: true });
  assert.deepEqual(res.granted, []);
  assert.equal(res.skipped[0].reason, 'lifetime');
  assert.equal(deps.data['users/u/proExpiresAtMs'], undefined);
});

test('time-limited Pro is extended and announced only when not silent', async () => {
  const deps = fakeDeps({ 'users/u/role': 'free' });
  const res = await grantProSafe(['u'], {}, deps, { durationMs: 1000, silent: true, assignedBy: 'trial' });
  assert.deepEqual(res.granted, ['u']);
  assert.equal(deps.data['users/u/role'], 'pro');
  assert.equal(deps.data['users/u/role_assigned_by'], 'trial');
  assert.ok(deps.data['users/u/proExpiresAtMs'] > Date.now());
});

test('Pro with no expiry (Lifetime) is never demoted', async () => {
  const deps = fakeDeps({ 'users/u/role': 'pro', 'users/u/lifetime': true });
  assert.equal(await enforceProExpiryForUid('u', {}, deps), 'pro');
});

test('expired time-limited Pro is demoted to free', async () => {
  const deps = fakeDeps({ 'users/u/role': 'pro', 'users/u/proExpiresAtMs': 1 });
  assert.equal(await enforceProExpiryForUid('u', {}, deps), 'free');
  assert.equal(deps.data['users/u/role'], 'free');
});
