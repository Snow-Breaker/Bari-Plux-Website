import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeviceHashes, trialBlockReason, startTrial, trialDurationMs, TRIAL_MAX_PER_IP } from '../src/proTrial.js';

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const DAY = 24 * 60 * 60 * 1000;

function fakeDb(initial = {}) {
  const data = { ...initial };
  return {
    data,
    adminGet: async (p) => data[p] ?? (Object.keys(data).some((k) => k.startsWith(p + '/'))
      ? Object.fromEntries(Object.entries(data).filter(([k]) => k.startsWith(p + '/')).map(([k, v]) => [k.slice(p.length + 1), v]))
      : null),
    adminPut: async (p, v) => { data[p] = v; return true; },
    grantPro: async (uid, ms) => {
      data[`users/${uid}/role`] = 'pro';
      return { expiresAtByUid: { [uid]: 1000 + ms } };
    },
  };
}

test('device hashes: machine required, hardware optional and distinct', () => {
  assert.equal(parseDeviceHashes({}), null);
  assert.equal(parseDeviceHashes({ machine: 'xyz' }), null);
  assert.deepEqual(parseDeviceHashes({ machine: H1.toUpperCase() }), { machine: H1, hardware: null });
  assert.deepEqual(parseDeviceHashes({ machine: H1, hardware: H1 }), { machine: H1, hardware: null });
  assert.deepEqual(parseDeviceHashes({ machine: H1, hardware: H2 }), { machine: H1, hardware: H2 });
});

test('trial length defaults to 3 days and ignores silly values', () => {
  assert.equal(trialDurationMs({}), 3 * DAY);
  assert.equal(trialDurationMs({ PRO_TRIAL_DAYS: '7' }), 7 * DAY);
  assert.equal(trialDurationMs({ PRO_TRIAL_DAYS: '-1' }), 3 * DAY);
  assert.equal(trialDurationMs({ PRO_TRIAL_DAYS: '999' }), 3 * DAY);
});

test('free account on a new device gets the trial, once', async () => {
  const db = fakeDb({ 'users/u1/role': 'free' });
  const first = await startTrial('u1', { machine: H1, hardware: H2 }, 'ip1', db, {}, 1000);
  assert.equal(first.ok, true);
  assert.equal(first.expiresAtMs, 1000 + 3 * DAY);
  assert.equal(db.data['users/u1/trialUsedAt'], 1000);

  db.data['users/u1/role'] = 'free'; // trial ended
  assert.equal(await trialBlockReason('u1', { machine: H1, hardware: H2 }, 'ip1', db, 2000), 'trial_used');
});

test('a second account on the same machine or motherboard is refused', async () => {
  const db = fakeDb({ 'users/u1/role': 'free', 'users/u2/role': 'free', 'users/u3/role': 'free' });
  await startTrial('u1', { machine: H1, hardware: H2 }, null, db, {}, 1000);
  // Windows reinstalled: new MachineGuid, same motherboard.
  assert.equal(await trialBlockReason('u2', { machine: 'c'.repeat(64), hardware: H2 }, null, db), 'device_used');
  assert.equal(await trialBlockReason('u3', { machine: H1, hardware: null }, null, db), 'device_used');
});

test('paid or staff roles never get a trial', async () => {
  const db = fakeDb({ 'users/p/role': 'pro', 'users/d/role': 'dev' });
  assert.equal(await trialBlockReason('p', { machine: H1, hardware: null }, null, db), 'already_pro');
  assert.equal(await trialBlockReason('d', { machine: H1, hardware: null }, null, db), 'already_pro');
});

test('per-IP cap within the window', async () => {
  const now = 100 * DAY;
  const db = fakeDb({ 'users/x/role': 'free' });
  for (let i = 0; i < TRIAL_MAX_PER_IP; i++) db.data[`trials/ips/ip9/old${i}`] = now - DAY;
  assert.equal(await trialBlockReason('x', { machine: H1, hardware: null }, 'ip9', db, now), 'ip_limit');

  const stale = fakeDb({ 'users/x/role': 'free', 'trials/ips/ip9/a': now - 60 * DAY, 'trials/ips/ip9/b': now - 60 * DAY });
  assert.equal(await trialBlockReason('x', { machine: H1, hardware: null }, 'ip9', stale, now), null);
});

test('missing device hash is refused', async () => {
  assert.equal(await trialBlockReason('u', null, null, fakeDb()), 'bad_device');
});
