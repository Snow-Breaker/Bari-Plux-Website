import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLoginInfo, profilePathForUid, recordLoginInfo } from '../src/loginInfo.js';

const req = (ip, cf) => ({ headers: new Headers(ip ? { 'CF-Connecting-IP': ip } : {}), cf });

test('profile path follows the discord_ prefix', () => {
  assert.equal(profilePathForUid('discord_123'), 'discordUsers/discord_123');
  assert.equal(profilePathForUid('abc'), 'users/abc');
});

test('records edge IP, country, city and server time', () => {
  const info = buildLoginInfo(req('1.2.3.4', { country: 'DE', city: 'Berlin' }), 'desktop', 1700000000000);
  assert.equal(info.ip, '1.2.3.4');
  assert.equal(info.countryCode, 'DE');
  assert.equal(info.country, 'Germany');
  assert.equal(info.city, 'Berlin');
  assert.equal(info.lastActive, 1700000000000);
  assert.equal(info.loginTime, '2023-11-14T22:13:20.000Z');
  assert.equal(info.platform, 'desktop');
});

test('unknown / Tor country codes are dropped; website logins keep their platform', () => {
  const info = buildLoginInfo(req(null, { country: 'T1' }), 'website');
  assert.equal(info.countryCode, null);
  assert.equal(info.ip, null);
  assert.equal('platform' in info, false);
});

test('a failing write never throws', async () => {
  assert.equal(await recordLoginInfo('u', req('1.1.1.1', {}), 'desktop', async () => { throw new Error('x'); }), false);
});
