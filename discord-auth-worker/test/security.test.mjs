import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceRateLimit, withSecurityHeaders } from '../src/security.js';

const req = (path, ip = '1.2.3.4', method = 'POST') =>
  new Request('https://w.example' + path, { method, headers: { 'CF-Connecting-IP': ip, Origin: 'https://bariplux.com' } });
const env = (ok) => ({
  ALLOWED_ORIGINS: 'https://bariplux.com',
  RL_STRICT: { limit: async () => ({ success: ok }) },
  RL_GENERAL: { limit: async () => ({ success: ok }) },
});

test('over the limit -> 429 with CORS for an allowed origin', async () => {
  const res = await enforceRateLimit(req('/claim-token'), env(false));
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://bariplux.com');
});

test('under the limit -> null', async () => {
  assert.equal(await enforceRateLimit(req('/chat/message/send'), env(true)), null);
});

test('webhooks, health and preflight are never limited', async () => {
  assert.equal(await enforceRateLimit(req('/stripe/webhook'), env(false)), null);
  assert.equal(await enforceRateLimit(req('/health', 'x', 'GET'), env(false)), null);
  assert.equal(await enforceRateLimit(req('/claim-token', 'x', 'OPTIONS'), env(false)), null);
});

test('missing binding or limiter error fails open', async () => {
  assert.equal(await enforceRateLimit(req('/'), { ALLOWED_ORIGINS: '' }), null);
  const broken = { RL_STRICT: { limit: async () => { throw new Error('x'); } } };
  assert.equal(await enforceRateLimit(req('/'), broken), null);
});

test('security headers added without overriding handler values', async () => {
  const res = withSecurityHeaders(new Response('x', { headers: { 'Cache-Control': 'public, max-age=60' } }));
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=60');
});

test('chat image signature must match its declared type', async () => {
  const { imageMagicMatches } = await import('../src/index.js');
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0]);
  assert.equal(imageMagicMatches(png, 'png'), true);
  assert.equal(imageMagicMatches(png, 'jpg'), false);
  assert.equal(imageMagicMatches(new TextEncoder().encode('<html><script>x</script>'), 'png'), false);
});
