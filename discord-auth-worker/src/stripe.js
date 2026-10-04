/**
 * Stripe Checkout for Bari Plux Pro (PayPal + cards).
 *
 * Plans (Stripe prices are found by lookup key, so a price can be replaced in the Dashboard
 * without touching code - move the lookup key to the new price):
 *   2m / 6m / 12m   one-off  pro_2m_once / pro_6m_once / pro_12m_once
 *                   or auto-renew (subscription)  pro_2m_sub / pro_6m_sub / pro_12m_sub
 *   lifetime        one-off  pro_lifetime
 *
 * The buyer must be signed in: the Firebase uid goes into the session / subscription metadata,
 * so Pro always lands on the account that paid (no email matching). Auto-renew is a normal
 * Stripe subscription - the buyer cancels or changes the card in the Stripe customer portal
 * (POST /stripe/portal); a cancelled subscription keeps Pro until the paid period ends.
 *
 * Sandbox: the admin can start a checkout with { sandbox: true } - it uses STRIPE_SECRET_KEY_TEST,
 * and webhooks are verified against either signing secret and handled with the key matching the
 * event's livemode.
 *
 * Endpoints:
 * - POST /stripe/create-checkout  { plan, autoRenew, sandbox? }   (Authorization: Bearer idToken)
 * - POST /stripe/portal           { sandbox? }                    (Authorization: Bearer idToken)
 * - POST /stripe/webhook          (Stripe-Signature)
 */

import { grantProSafe, grantProUntil, grantLifetimePro, revokeOrShortenPro, proDurationMs } from './proBilling.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Grace after a paid subscription period, so a renewal charged a little late never drops Pro. */
const RENEWAL_GRACE_MS = DAY_MS;

export const PLANS = {
  '2m': { days: 60, once: 'pro_2m_once', sub: 'pro_2m_sub', label: '2 months' },
  '6m': { days: 182, once: 'pro_6m_once', sub: 'pro_6m_sub', label: '6 months' },
  '12m': { days: 365, once: 'pro_12m_once', sub: 'pro_12m_sub', label: '12 months' },
  lifetime: { lifetime: true, once: 'pro_lifetime', label: 'Lifetime' },
};

/** The Stripe lookup key for a plan choice, or null when the combination isn't offered. */
export function lookupKeyFor(plan, autoRenew) {
  const p = PLANS[plan];
  if (!p) return null;
  if (p.lifetime) return p.once;
  return autoRenew ? p.sub : p.once;
}

function json(status, body, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function legacyAmountCents(env) {
  const n = Number(env.STRIPE_PRICE_CENTS || '200');
  return Number.isFinite(n) && n >= 50 ? Math.round(n) : 200;
}

function roleTree(uid) {
  return uid.startsWith('discord_') ? 'discordUsers' : 'users';
}

/** Live or test secret key. */
function stripeKey(env, live) {
  return live ? env.STRIPE_SECRET_KEY : env.STRIPE_SECRET_KEY_TEST;
}

/** RTDB field names differ per mode so a sandbox customer never shadows the real one. */
function customerField(live) {
  return live ? 'stripeCustomerId' : 'stripeCustomerIdTest';
}
function subField(live) {
  return live ? 'stripeSub' : 'stripeSubTest';
}

async function stripeRequest(env, live, method, path, params) {
  const key = stripeKey(env, live);
  if (!key) throw new Error(live ? 'STRIPE_SECRET_KEY missing' : 'STRIPE_SECRET_KEY_TEST missing');
  const url = `https://api.stripe.com/v1/${path}` + (method === 'GET' && params ? `?${new URLSearchParams(params)}` : '');
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' })
    },
    body: method === 'GET' ? undefined : new URLSearchParams(params || {})
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || `stripe_${res.status}`);
    err.status = res.status;
    err.stripe = data;
    throw err;
  }
  return data;
}

/** Active price for a lookup key. */
async function priceByLookupKey(env, live, lookupKey) {
  const params = new URLSearchParams();
  params.append('lookup_keys[]', lookupKey);
  params.append('active', 'true');
  params.append('limit', '1');
  const list = await stripeRequest(env, live, 'GET', 'prices', params);
  return Array.isArray(list?.data) && list.data.length ? list.data[0] : null;
}

/** HMAC-SHA256 hex for Stripe webhook verification (v1 signatures). */
async function hmacSha256Hex(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a, b) {
  const aa = String(a || '').toLowerCase();
  const bb = String(b || '').toLowerCase();
  if (aa.length !== bb.length || aa.length === 0) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
}

/** True when the signature matches either the live or the test signing secret. */
export async function verifyStripeSignature(header, rawBody, secrets, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = {};
  const v1s = [];
  for (const p of String(header || '').split(',')) {
    const [k, ...rest] = p.trim().split('=');
    if (k === 'v1') v1s.push(rest.join('='));
    else parts[k] = rest.join('=');
  }
  const timestamp = parts.t;
  if (!timestamp || !v1s.length) return false;
  const age = Math.abs(nowSec - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false; // 5 min skew

  for (const secret of secrets.filter(Boolean)) {
    const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
    if (v1s.some((v) => timingSafeEqualHex(expected, v))) return true;
  }
  return false;
}

async function signedInUser(request, deps) {
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  if (!idToken) return null;
  const user = await deps.verifyFirebaseUser(idToken);
  return user?.localId ? user : null;
}

/**
 * POST /stripe/create-checkout   { plan, autoRenew, sandbox? }
 */
export async function handleStripeCreateCheckout(request, env, corsHeaders, deps) {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, corsHeaders);

  const user = await signedInUser(request, deps);
  if (!user) return json(401, { error: 'sign_in_required' }, corsHeaders);

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'invalid_json' }, corsHeaders); }

  const live = body?.sandbox !== true;
  if (!live && !deps.isAdmin(user)) return json(403, { error: 'sandbox_admin_only' }, corsHeaders);
  if (!stripeKey(env, live)) return json(503, { error: 'stripe_not_configured' }, corsHeaders);

  const plan = String(body?.plan || '');
  const autoRenew = body?.autoRenew === true && !PLANS[plan]?.lifetime;
  const lookupKey = lookupKeyFor(plan, autoRenew);
  if (!lookupKey) return json(400, { error: 'invalid_plan' }, corsHeaders);

  const uid = user.localId;
  const tree = roleTree(uid);
  const role = String((await deps.adminGet(`${tree}/${uid}/role`)) || 'free').toLowerCase();
  if ((await deps.adminGet(`${tree}/${uid}/lifetime`)) === true) {
    return json(409, { error: 'already_lifetime' }, corsHeaders);
  }
  if (role === 'dev' || role === 'founder') return json(409, { error: 'staff_role' }, corsHeaders);

  const existingSub = await deps.adminGet(`${tree}/${uid}/${subField(live)}`);
  if (autoRenew && existingSub && ['active', 'trialing', 'past_due'].includes(existingSub.status) && !existingSub.cancelAtPeriodEnd) {
    // One auto-renewing plan per account - changing it is done in the portal.
    return json(409, { error: 'already_subscribed' }, corsHeaders);
  }

  let price;
  try {
    price = await priceByLookupKey(env, live, lookupKey);
  } catch (err) {
    console.error('[Stripe] price lookup failed', lookupKey, err?.message);
  }
  if (!price) return json(503, { error: 'price_not_configured', lookupKey }, corsHeaders);

  const successUrl = env.STRIPE_SUCCESS_URL || 'https://login.bariplux.com/Pro?stripe=success';
  const cancelUrl = env.STRIPE_CANCEL_URL || 'https://login.bariplux.com/Pro?stripe=cancel';
  const customerId = await deps.adminGet(`${tree}/${uid}/${customerField(live)}`);
  const email = normalizeEmail(user.email);

  const params = {
    mode: autoRenew ? 'subscription' : 'payment',
    success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    client_reference_id: uid,
    'metadata[uid]': uid,
    'metadata[plan]': plan,
    'metadata[auto_renew]': autoRenew ? '1' : '0',
    'metadata[expected_cents]': String(price.unit_amount ?? ''),
    'metadata[product]': 'bari_plux_pro',
    'line_items[0][price]': price.id,
    'line_items[0][quantity]': '1',
  };
  if (customerId) params.customer = customerId;
  else if (isValidEmail(email)) params.customer_email = email;
  if (autoRenew) {
    params['subscription_data[metadata][uid]'] = uid;
    params['subscription_data[metadata][plan]'] = plan;
  } else {
    if (!customerId) params.customer_creation = 'always';
    params['payment_intent_data[metadata][uid]'] = uid;
    params['payment_intent_data[metadata][plan]'] = plan;
  }

  try {
    const session = await stripeRequest(env, live, 'POST', 'checkout/sessions', params);
    return json(200, { ok: true, url: session.url, sessionId: session.id }, corsHeaders);
  } catch (err) {
    console.error('[Stripe] create-checkout failed', err?.message || err, err?.stripe);
    return json(502, { error: 'checkout_create_failed' }, corsHeaders);
  }
}

/**
 * POST /stripe/portal   { sandbox? }  - the signed-in buyer's Stripe customer portal.
 */
export async function handleStripePortal(request, env, corsHeaders, deps) {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, corsHeaders);
  const user = await signedInUser(request, deps);
  if (!user) return json(401, { error: 'sign_in_required' }, corsHeaders);

  let body = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }
  const live = body?.sandbox !== true;
  if (!live && !deps.isAdmin(user)) return json(403, { error: 'sandbox_admin_only' }, corsHeaders);

  const uid = user.localId;
  const customerId = await deps.adminGet(`${roleTree(uid)}/${uid}/${customerField(live)}`);
  if (!customerId) return json(404, { error: 'no_billing_account' }, corsHeaders);

  try {
    const session = await stripeRequest(env, live, 'POST', 'billing_portal/sessions', {
      customer: customerId,
      return_url: env.STRIPE_PORTAL_RETURN_URL || 'https://login.bariplux.com/Pro'
    });
    return json(200, { ok: true, url: session.url }, corsHeaders);
  } catch (err) {
    console.error('[Stripe] portal failed', err?.message || err, err?.stripe);
    return json(502, { error: 'portal_create_failed' }, corsHeaders);
  }
}

/**
 * POST /stripe/webhook
 */
export async function handleStripeWebhook(request, env, corsHeaders, deps) {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, corsHeaders);
  if (!env.STRIPE_WEBHOOK_SECRET && !env.STRIPE_WEBHOOK_SECRET_TEST) {
    return json(500, { error: 'not_configured' }, corsHeaders);
  }

  const rawBody = await request.text();
  const ok = await verifyStripeSignature(
    request.headers.get('Stripe-Signature'), rawBody,
    [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_WEBHOOK_SECRET_TEST]);
  if (!ok) {
    console.warn('[Stripe] invalid signature');
    return json(401, { error: 'invalid_signature' }, corsHeaders);
  }

  let event;
  try { event = JSON.parse(rawBody); } catch { return json(400, { error: 'invalid_json' }, corsHeaders); }

  const type = String(event?.type || '');
  const obj = event?.data?.object || {};
  const live = event?.livemode !== false;

  try {
    if (type === 'checkout.session.completed') return await handleCheckoutCompleted(obj, env, corsHeaders, deps, live);
    if (type === 'invoice.paid') return await handleInvoicePaid(obj, env, corsHeaders, deps, live);
    if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
      return await handleSubscriptionChanged(obj, env, corsHeaders, deps, live);
    }
    if (type === 'charge.refunded' || type === 'charge.dispute.funds_withdrawn') {
      return await handleStripeRefundLike(obj, env, corsHeaders, deps, type);
    }
  } catch (err) {
    // A 500 makes Stripe retry the event later - every handler is idempotent.
    console.error('[Stripe] webhook handler failed', type, err?.message || err);
    return json(500, { error: 'handler_failed' }, corsHeaders);
  }
  return json(200, { ok: true, ignored: type || 'unknown' }, corsHeaders);
}

async function handleCheckoutCompleted(session, env, corsHeaders, deps, live) {
  const sessionId = String(session?.id || '').trim();
  if (!sessionId) return json(400, { error: 'missing_session' }, corsHeaders);

  const uid = String(session?.metadata?.uid || session?.client_reference_id || '').trim();
  if (uid && session.customer) {
    await deps.adminPut(`${roleTree(uid)}/${uid}/${customerField(live)}`, session.customer);
  }

  // Subscriptions are granted by invoice.paid (first invoice and every renewal).
  if (session.mode === 'subscription') {
    return json(200, { ok: true, handledBy: 'invoice.paid', sessionId }, corsHeaders);
  }

  if (session.payment_status && session.payment_status !== 'paid') {
    return json(200, { ok: true, ignored: 'not_paid', payment_status: session.payment_status }, corsHeaders);
  }

  const existing = await deps.adminGet(`stripe_orders/${sessionId}`);
  if (existing?.status === 'granted') return json(200, { ok: true, duplicate: true, sessionId }, corsHeaders);

  const amountTotal = Number(session.amount_total);
  const plan = String(session?.metadata?.plan || '');
  const planInfo = PLANS[plan];
  const orderBase = {
    sessionId,
    paymentIntent: session.payment_intent || null,
    uid: uid || null,
    plan: planInfo ? plan : 'legacy',
    amountTotal,
    currency: session.currency || 'usd',
    livemode: live,
    createdAt: Date.now(),
    source: 'stripe'
  };

  // Amount check against the price the server itself chose for this session.
  const expected = planInfo ? Number(session?.metadata?.expected_cents) : legacyAmountCents(env);
  if (!Number.isFinite(amountTotal) || !Number.isFinite(expected) || amountTotal < expected) {
    await deps.adminPut(`stripe_orders/${sessionId}`, { ...orderBase, status: 'ignored', reason: 'amount', expected });
    return json(200, { ok: true, ignored: 'amount' }, corsHeaders);
  }

  // Signed-in purchase (uid) - or a legacy email-only session still in flight.
  let uids = uid ? [uid] : [];
  if (!uids.length) {
    const email = normalizeEmail(session?.metadata?.bariplux_email || session?.customer_email || session?.customer_details?.email);
    if (isValidEmail(email)) uids = await deps.findUidsByEmail(email);
    if (!uids.length) {
      await deps.adminPut(`stripe_orders/${sessionId}`, { ...orderBase, status: 'pending_account', email: email || null });
      return json(200, { ok: true, status: 'pending_account' }, corsHeaders);
    }
  }

  let granted = [];
  let skipped = [];
  let durationMs = null;
  let expiresAtByUid = {};
  if (planInfo?.lifetime) {
    for (const u of uids) {
      const r = await grantLifetimePro(u, deps, { assignedBy: 'stripe' });
      (r.action === 'granted_lifetime' ? granted : skipped).push(r.action === 'granted_lifetime' ? u : r);
    }
  } else {
    const days = planInfo ? planInfo.days : Number(env.PRO_DAYS || env.PAYHIP_PRO_DAYS || '60') || 60;
    ({ granted, skipped, expiresAtByUid, durationMs } = await grantProSafe(uids, env, deps, {
      assignedBy: 'stripe',
      durationMs: days * DAY_MS,
      amountTotal,
      currency: session.currency || 'usd',
      sessionId
    }));
  }

  await deps.adminPut(`stripe_orders/${sessionId}`, {
    ...orderBase, status: 'granted', grantedUids: granted, skipped, durationMs, expiresAtByUid, grantedAt: Date.now()
  });
  if (session.payment_intent) {
    await deps.adminPut(`stripe_payment_intents/${session.payment_intent}`, {
      sessionId, grantedUids: granted, durationMs, plan: orderBase.plan
    });
  }
  return json(200, { ok: true, status: 'granted', granted, expiresAtByUid }, corsHeaders);
}

/** Subscription id / metadata / paid period end across Stripe API versions. */
export function readInvoice(invoice) {
  const subDetails = invoice?.parent?.subscription_details || invoice?.subscription_details || {};
  const subscriptionId = String(subDetails.subscription || invoice?.subscription || '').trim() || null;
  const line = Array.isArray(invoice?.lines?.data) ? invoice.lines.data[0] : null;
  const periodEndSec = Number(line?.period?.end) || Number(invoice?.period_end) || 0;
  const paymentIntent = invoice?.payment_intent
    || invoice?.payments?.data?.[0]?.payment?.payment_intent
    || null;
  return { subscriptionId, metadata: subDetails.metadata || {}, periodEndSec, paymentIntent };
}

async function handleInvoicePaid(invoice, env, corsHeaders, deps, live) {
  const invoiceId = String(invoice?.id || '').trim();
  const { subscriptionId, metadata, periodEndSec, paymentIntent } = readInvoice(invoice);
  if (!invoiceId || !subscriptionId) return json(200, { ok: true, ignored: 'not_subscription' }, corsHeaders);

  const existing = await deps.adminGet(`stripe_orders/${invoiceId}`);
  if (existing?.status === 'granted') return json(200, { ok: true, duplicate: true }, corsHeaders);

  let uid = String(metadata.uid || '').trim();
  let plan = String(metadata.plan || '').trim();
  let sub = null;
  if (!uid || !periodEndSec) {
    sub = await stripeRequest(env, live, 'GET', `subscriptions/${subscriptionId}`);
    uid = uid || String(sub?.metadata?.uid || '').trim();
    plan = plan || String(sub?.metadata?.plan || '').trim();
  }
  if (!uid) {
    await deps.adminPut(`stripe_orders/${invoiceId}`, { status: 'failed', error: 'missing_uid', subscriptionId, createdAt: Date.now() });
    return json(200, { ok: false, error: 'missing_uid' }, corsHeaders);
  }

  const endSec = periodEndSec || Number(sub?.items?.data?.[0]?.current_period_end) || Number(sub?.current_period_end) || 0;
  if (!endSec) return json(500, { error: 'missing_period_end' }, corsHeaders);
  const untilMs = endSec * 1000 + RENEWAL_GRACE_MS;

  const result = await grantProUntil(uid, untilMs, deps, { assignedBy: 'stripe' });
  if (invoice.customer) await deps.adminPut(`${roleTree(uid)}/${uid}/${customerField(live)}`, invoice.customer);

  const durationMs = PLANS[plan]?.days ? PLANS[plan].days * DAY_MS : Math.max(0, untilMs - Date.now());
  await deps.adminPut(`stripe_orders/${invoiceId}`, {
    status: 'granted', kind: 'subscription', uid, plan: plan || null, subscriptionId, livemode: live,
    amountTotal: Number(invoice.amount_paid) || 0, currency: invoice.currency || 'usd',
    grantedUids: result.action === 'granted' ? [uid] : [], result, durationMs, periodEndMs: endSec * 1000, grantedAt: Date.now()
  });
  if (paymentIntent) {
    await deps.adminPut(`stripe_payment_intents/${paymentIntent}`, {
      sessionId: invoiceId, grantedUids: result.action === 'granted' ? [uid] : [], durationMs, plan: plan || null
    });
  }
  return json(200, { ok: true, status: 'granted', uid, untilMs }, corsHeaders);
}

/** Keeps users/{uid}/stripeSub in step, for the app's "Renews on ... / Ends on ..." line. */
async function handleSubscriptionChanged(sub, env, corsHeaders, deps, live) {
  const uid = String(sub?.metadata?.uid || '').trim();
  if (!uid) return json(200, { ok: true, ignored: 'no_uid' }, corsHeaders);
  const periodEndSec = Number(sub?.items?.data?.[0]?.current_period_end) || Number(sub?.current_period_end) || 0;
  await deps.adminPut(`${roleTree(uid)}/${uid}/${subField(live)}`, {
    id: sub.id,
    status: sub.status || 'unknown',
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    currentPeriodEnd: periodEndSec ? periodEndSec * 1000 : null,
    plan: sub?.metadata?.plan || null,
    updatedAt: Date.now()
  });
  // Cancelled: nothing to revoke - Pro already ends with the paid period (proExpiresAtMs).
  return json(200, { ok: true, status: sub.status }, corsHeaders);
}

async function handleStripeRefundLike(charge, env, corsHeaders, deps, type) {
  const paymentIntent = String(charge?.payment_intent || '').trim();
  if (!paymentIntent) return json(200, { ok: true, ignored: 'no_payment_intent' }, corsHeaders);

  const link = await deps.adminGet(`stripe_payment_intents/${paymentIntent}`);
  if (!link?.sessionId) return json(200, { ok: true, ignored: 'unknown_payment' }, corsHeaders);

  const order = await deps.adminGet(`stripe_orders/${link.sessionId}`);
  if (!order || order.status !== 'granted') return json(200, { ok: true, ignored: 'order_not_granted' }, corsHeaders);

  // Full refund only (amount_refunded >= amount)
  const amount = Number(charge.amount);
  const refunded = Number(charge.amount_refunded);
  const full = Number.isFinite(amount) && Number.isFinite(refunded) && refunded >= amount;
  if (!full && type === 'charge.refunded') {
    await deps.adminPut(`stripe_orders/${link.sessionId}`, { ...order, partialRefundAt: Date.now(), amountRefunded: refunded });
    return json(200, { ok: true, ignored: 'partial_refund' }, corsHeaders);
  }

  const durationMs = Number(order.durationMs) || proDurationMs(env);
  const uids = Array.isArray(order.grantedUids) ? order.grantedUids : [];
  const results = [];
  for (const uid of uids) results.push(await revokeOrShortenPro(uid, env, deps, durationMs));

  await deps.adminPut(`stripe_orders/${link.sessionId}`, {
    ...order, status: 'refunded', refundResults: results, refundedAt: Date.now(), refundType: type
  });
  return json(200, { ok: true, status: 'refunded', results }, corsHeaders);
}
