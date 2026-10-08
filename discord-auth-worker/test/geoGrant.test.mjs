import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GEO_CONFIG, evaluateGeo, normalizeRedeemCode, generateRedeemCode } from '../src/geoGrant.js';

const cfg = DEFAULT_GEO_CONFIG;
const IR_ASN = cfg.countries.IR.asns[0]; // a real Iranian consumer ISP ASN

test('real Iranian ISP IP passes (ISP match alone meets default minScore 2)', () => {
  const r = evaluateGeo({ country: 'IR', asn: IR_ASN }, cfg);
  assert.equal(r.pass, true);
  assert.ok(r.reasons.includes('isp_ok'));
});

test('Iranian country but datacenter/VPN ASN (not in allowlist) hard-fails', () => {
  const r = evaluateGeo({ country: 'IR', asn: 16509 /* AWS */ }, cfg);
  assert.equal(r.pass, false);
  assert.equal(r.hardFail, true);
  assert.ok(r.reasons.includes('isp_not_allowed'));
});

test('non-eligible country fails even with some ASN', () => {
  const r = evaluateGeo({ country: 'US', asn: IR_ASN }, cfg);
  assert.equal(r.pass, false);
  assert.ok(r.reasons.includes('country_not_eligible'));
});

test('country with empty ASN allowlist fails closed (redeem code only)', () => {
  const r = evaluateGeo({ country: 'CU', asn: 12345 }, cfg);
  assert.equal(r.pass, false);
  assert.ok(r.reasons.includes('no_isp_list'));
});

test('device timezone/lang add confidence score', () => {
  const r = evaluateGeo({ country: 'IR', asn: IR_ASN, tzOffset: 210, langs: ['fa-IR', 'en'] }, cfg);
  assert.ok(r.score >= 4);
  assert.ok(r.reasons.includes('tz_ok') && r.reasons.includes('lang_ok'));
});

test('network-only re-verify passes on real ISP, fails off-network', () => {
  assert.equal(evaluateGeo({ country: 'IR', asn: IR_ASN }, cfg, { networkOnly: true }).pass, true);
  assert.equal(evaluateGeo({ country: 'DE', asn: 3320 }, cfg, { networkOnly: true }).pass, false);
});

test('redeem code normalize accepts valid, rejects junk', () => {
  assert.equal(normalizeRedeemCode('bpt-abcd-2345'), 'BPT-ABCD-2345');
  assert.equal(normalizeRedeemCode('nope'), null);
  const g = generateRedeemCode();
  assert.ok(/^BPT-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(g));
  assert.equal(normalizeRedeemCode(g), g);
});
