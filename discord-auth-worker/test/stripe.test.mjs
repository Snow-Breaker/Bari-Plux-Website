import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { lookupKeyFor, verifyStripeSignature, readInvoice, handleStripeWebhook } from '../src/stripe.js';

const LIVE = 'whsec_live';
const TEST = 'whsec_test';

function sign(body, secret, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

function fakeDeps(initial = {}) {
  const data = { ...initial };
  return {
    data,
    adminGet: async (p) => data[p] ?? null,
    adminPut: async (p, v) => { data[p] = v; return true; },
    findUidsByEmail: async () => [],
  };
}

async function deliver(event, deps, secret = LIVE) {
  const body = JSON.stringify(event);
  const req = new Request('https://w/stripe/webhook', { method: 'POST', body, headers: { 'Stripe-Signature': sign(body, secret) } });
  const res = await handleStripeWebhook(req, { STRIPE_WEBHOOK_SECRET: LIVE, STRIPE_WEBHOOK_SECRET_TEST: TEST, STRIPE_SECRET_KEY: 'sk' }, {}, deps);
  return { status: res.status, body: await res.json() };
}

test('plan choice -> lookup key', () => {
  assert.equal(lookupKeyFor('2m', false), 'pro_2m_once');
  assert.equal(lookupKeyFor('6m', true), 'pro_6m_sub');
  assert.equal(lookupKeyFor('12m', true), 'pro_12m_sub');
  assert.equal(lookupKeyFor('lifetime', true), 'pro_lifetime'); // lifetime never renews
  assert.equal(lookupKeyFor('3m', false), null);
});

test('signature: live or test secret, rejects tampering and old timestamps', async () => {
  const body = '{"a":1}';
  assert.equal(await verifyStripeSignature(sign(body, LIVE), body, [LIVE, TEST]), true);
  assert.equal(await verifyStripeSignature(sign(body, TEST), body, [LIVE, TEST]), true);
  assert.equal(await verifyStripeSignature(sign(body, 'whsec_other'), body, [LIVE, TEST]), false);
  assert.equal(await verifyStripeSignature(sign(body, LIVE), '{"a":2}', [LIVE, TEST]), false);
  const old = Math.floor(Date.now() / 1000) - 3600;
  assert.equal(await verifyStripeSignature(sign(body, LIVE, old), body, [LIVE, TEST]), false);
});

test('invoice shape: new (parent.subscription_details) and old API versions', () => {
  const nu = readInvoice({ parent: { subscription_details: { subscription: 'sub_1', metadata: { uid: 'u' } } }, lines: { data: [{ period: { end: 100 } }] } });
  assert.deepEqual([nu.subscriptionId, nu.metadata.uid, nu.periodEndSec], ['sub_1', 'u', 100]);
  const old = readInvoice({ subscription: 'sub_2', subscription_details: { metadata: { uid: 'v' } }, lines: { data: [{ period: { end: 200 } }] }, payment_intent: 'pi_1' });
  assert.deepEqual([old.subscriptionId, old.metadata.uid, old.periodEndSec, old.paymentIntent], ['sub_2', 'v', 200, 'pi_1']);
});

test('one-off 6 months: Pro for 182 days on the signed-in account, once', async () => {
  const deps = fakeDeps({ 'users/u1/role': 'free' });
  const session = { id: 'cs_1', mode: 'payment', payment_status: 'paid', amount_total: 500, customer: 'cus_1', payment_intent: 'pi_9',
    metadata: { uid: 'u1', plan: '6m', expected_cents: '500' } };
  const first = await deliver({ type: 'checkout.session.completed', livemode: true, data: { object: session } }, deps);
  assert.equal(first.body.status, 'granted');
  const exp = deps.data['users/u1/proExpiresAtMs'];
  assert.ok(Math.abs(exp - (Date.now() + 182 * 86400000)) < 60000);
  assert.equal(deps.data['users/u1/stripeCustomerId'], 'cus_1');
  const again = await deliver({ type: 'checkout.session.completed', livemode: true, data: { object: session } }, deps);
  assert.equal(again.body.duplicate, true);
  assert.equal(deps.data['users/u1/proExpiresAtMs'], exp);
});

test('underpaid session is ignored', async () => {
  const deps = fakeDeps({ 'users/u1/role': 'free' });
  const session = { id: 'cs_2', mode: 'payment', payment_status: 'paid', amount_total: 100, metadata: { uid: 'u1', plan: '12m', expected_cents: '900' } };
  const r = await deliver({ type: 'checkout.session.completed', livemode: true, data: { object: session } }, deps);
  assert.equal(r.body.ignored, 'amount');
  assert.equal(deps.data['users/u1/role'], 'free');
});

test('lifetime purchase sets Lifetime Pro; a full refund ends it', async () => {
  const deps = fakeDeps({ 'users/u2/role': 'free' });
  const session = { id: 'cs_3', mode: 'payment', payment_status: 'paid', amount_total: 2500, payment_intent: 'pi_3', metadata: { uid: 'u2', plan: 'lifetime', expected_cents: '2500' } };
  await deliver({ type: 'checkout.session.completed', livemode: true, data: { object: session } }, deps);
  assert.equal(deps.data['users/u2/lifetime'], true);
  assert.equal(deps.data['users/u2/proExpiresAtMs'], null);
  await deliver({ type: 'charge.refunded', livemode: true, data: { object: { payment_intent: 'pi_3', amount: 2500, amount_refunded: 2500 } } }, deps);
  assert.equal(deps.data['users/u2/role'], 'free');
  assert.equal(deps.data['users/u2/lifetime'], null);
});

test('subscription: checkout leaves the grant to invoice.paid; each renewal moves expiry to period end + grace', async () => {
  const deps = fakeDeps({ 'users/u3/role': 'free' });
  const end1 = Math.floor(Date.now() / 1000) + 60 * 86400;
  const r0 = await deliver({ type: 'checkout.session.completed', livemode: true, data: { object: { id: 'cs_4', mode: 'subscription', customer: 'cus_4', metadata: { uid: 'u3', plan: '2m' } } } }, deps);
  assert.equal(r0.body.handledBy, 'invoice.paid');
  assert.equal(deps.data['users/u3/role'], 'free');

  const inv = (id, end) => ({ id, customer: 'cus_4', amount_paid: 200, parent: { subscription_details: { subscription: 'sub_4', metadata: { uid: 'u3', plan: '2m' } } }, lines: { data: [{ period: { end } }] } });
  await deliver({ type: 'invoice.paid', livemode: true, data: { object: inv('in_1', end1) } }, deps);
  assert.equal(deps.data['users/u3/role'], 'pro');
  assert.equal(deps.data['users/u3/proExpiresAtMs'], end1 * 1000 + 86400000);

  const end2 = end1 + 60 * 86400;
  await deliver({ type: 'invoice.paid', livemode: true, data: { object: inv('in_2', end2) } }, deps);
  assert.equal(deps.data['users/u3/proExpiresAtMs'], end2 * 1000 + 86400000);

  await deliver({ type: 'customer.subscription.updated', livemode: true, data: { object: { id: 'sub_4', status: 'active', cancel_at_period_end: true, metadata: { uid: 'u3', plan: '2m' }, items: { data: [{ current_period_end: end2 }] } } } }, deps);
  assert.equal(deps.data['users/u3/stripeSub'].cancelAtPeriodEnd, true);
  assert.equal(deps.data['users/u3/role'], 'pro'); // keeps Pro until the paid period ends
});

test('sandbox events land in the test fields, not the live ones', async () => {
  const deps = fakeDeps({ 'users/u4/role': 'free' });
  await deliver({ type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_5', mode: 'subscription', customer: 'cus_t', metadata: { uid: 'u4' } } } }, deps, TEST);
  assert.equal(deps.data['users/u4/stripeCustomerIdTest'], 'cus_t');
  assert.equal(deps.data['users/u4/stripeCustomerId'], undefined);
});

test('lifetime accounts are never given an expiry by a renewal', async () => {
  const deps = fakeDeps({ 'users/u5/role': 'pro', 'users/u5/lifetime': true });
  await deliver({ type: 'invoice.paid', livemode: true, data: { object: { id: 'in_9', parent: { subscription_details: { subscription: 'sub_9', metadata: { uid: 'u5', plan: '2m' } } }, lines: { data: [{ period: { end: 2000000000 } }] } } } }, deps);
  assert.equal(deps.data['users/u5/proExpiresAtMs'], undefined);
});
