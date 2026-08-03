/**
 * Stripe Checkout for Bari Plux Pro (PayPal + cards).
 *
 * Endpoints:
 * - POST /stripe/create-checkout  { email }
 * - POST /stripe/webhook          (Stripe-Signature)
 */

import { grantProSafe, revokeOrShortenPro, proDurationMs } from './proBilling.js';

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

function proAmountCents(env) {
  const n = Number(env.STRIPE_PRICE_CENTS || '200');
  return Number.isFinite(n) && n >= 50 ? Math.round(n) : 200;
}

async function stripeForm(env, path, params) {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY missing');
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(params)
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || `stripe_${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.stripe = data;
    throw err;
  }
  return data;
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

async function verifyStripeWebhook(request, env, rawBody) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = request.headers.get('Stripe-Signature') || '';
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, ...rest] = p.trim().split('=');
      return [k, rest.join('=')];
    })
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false; // 5 min skew

  const signed = `${timestamp}.${rawBody}`;
  const expected = await hmacSha256Hex(secret, signed);
  return timingSafeEqualHex(expected, v1);
}

/**
 * POST /stripe/create-checkout
 * Body: { email: "user@..." }
 */
export async function handleStripeCreateCheckout(request, env, corsHeaders) {
  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' }, corsHeaders);
  }
  if (!env.STRIPE_SECRET_KEY) {
    return json(503, { error: 'stripe_not_configured' }, corsHeaders);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_json' }, corsHeaders);
  }

  const email = normalizeEmail(body?.email);
  if (!isValidEmail(email)) {
    return json(400, { error: 'invalid_email' }, corsHeaders);
  }

  const amount = proAmountCents(env);
  const days = Number(env.PRO_DAYS || env.PAYHIP_PRO_DAYS || '60') || 60;
  const successUrl =
    env.STRIPE_SUCCESS_URL ||
    'https://login.bariplux.com/Pro?stripe=success';
  const cancelUrl =
    env.STRIPE_CANCEL_URL ||
    'https://login.bariplux.com/Pro?stripe=cancel';

  try {
    const session = await stripeForm(env, 'checkout/sessions', {
      mode: 'payment',
      success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      customer_email: email,
      client_reference_id: email.slice(0, 200),
      'metadata[bariplux_email]': email,
      'metadata[product]': 'bari_plux_pro',
      'metadata[pro_days]': String(days),
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][price_data][product_data][name]': `Bari Plux Pro (${days} days)`,
      'line_items[0][price_data][product_data][description]':
        'Pro access for Bari Plux Tool. Use the same email as your app login.'
    });

    return json(200, {
      ok: true,
      url: session.url,
      sessionId: session.id
    }, corsHeaders);
  } catch (err) {
    console.error('[Stripe] create-checkout failed', err?.message || err, err?.stripe);
    return json(502, { error: 'checkout_create_failed', detail: err?.message || 'unknown' }, corsHeaders);
  }
}

/**
 * POST /stripe/webhook
 */
export async function handleStripeWebhook(request, env, corsHeaders, deps) {
  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' }, corsHeaders);
  }
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return json(500, { error: 'not_configured' }, corsHeaders);
  }

  const rawBody = await request.text();
  if (!(await verifyStripeWebhook(request, env, rawBody))) {
    console.warn('[Stripe] invalid signature');
    return json(401, { error: 'invalid_signature' }, corsHeaders);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'invalid_json' }, corsHeaders);
  }

  const type = String(event?.type || '');
  const obj = event?.data?.object || {};

  if (type === 'checkout.session.completed') {
    return handleCheckoutCompleted(obj, env, corsHeaders, deps);
  }

  if (type === 'charge.refunded' || type === 'charge.dispute.funds_withdrawn') {
    return handleStripeRefundLike(obj, env, corsHeaders, deps, type);
  }

  return json(200, { ok: true, ignored: type || 'unknown' }, corsHeaders);
}

async function handleCheckoutCompleted(session, env, corsHeaders, deps) {
  const sessionId = String(session?.id || '').trim();
  if (!sessionId) return json(400, { error: 'missing_session' }, corsHeaders);

  // Only paid / complete
  if (session.payment_status && session.payment_status !== 'paid') {
    return json(200, { ok: true, ignored: 'not_paid', payment_status: session.payment_status }, corsHeaders);
  }

  const existing = await deps.adminGet(`stripe_orders/${sessionId}`);
  if (existing?.status === 'granted') {
    return json(200, { ok: true, duplicate: true, sessionId }, corsHeaders);
  }

  const email = normalizeEmail(
    session?.metadata?.bariplux_email ||
      session?.customer_email ||
      session?.customer_details?.email ||
      session?.client_reference_id ||
      ''
  );

  if (!isValidEmail(email)) {
    await deps.adminPut(`stripe_orders/${sessionId}`, {
      status: 'failed',
      error: 'missing_email',
      createdAt: Date.now()
    });
    return json(200, { ok: false, error: 'missing_email' }, corsHeaders);
  }

  const amountTotal = Number(session.amount_total);
  const min = proAmountCents(env);
  if (!Number.isFinite(amountTotal) || amountTotal < min) {
    await deps.adminPut(`stripe_orders/${sessionId}`, {
      status: 'ignored',
      reason: 'amount',
      amountTotal,
      email,
      createdAt: Date.now()
    });
    return json(200, { ok: true, ignored: 'amount' }, corsHeaders);
  }

  const uids = await deps.findUidsByEmail(email);
  const orderBase = {
    sessionId,
    paymentIntent: session.payment_intent || null,
    email,
    amountTotal,
    currency: session.currency || 'usd',
    createdAt: Date.now(),
    source: 'stripe'
  };

  if (!uids.length) {
    await deps.adminPut(`stripe_orders/${sessionId}`, {
      ...orderBase,
      status: 'pending_account',
      note: 'No Firebase user yet — sign up with this email then contact support / re-check'
    });
    return json(200, { ok: true, status: 'pending_account', email }, corsHeaders);
  }

  const { granted, skipped, expiresAtByUid, durationMs } = await grantProSafe(uids, env, deps, {
    assignedBy: 'stripe',
    email,
    amountTotal,
    currency: session.currency || 'usd',
    sessionId
  });

  await deps.adminPut(`stripe_orders/${sessionId}`, {
    ...orderBase,
    status: 'granted',
    grantedUids: granted,
    skipped,
    durationMs,
    expiresAtByUid,
    grantedAt: Date.now()
  });

  // Index by payment_intent for refunds
  if (session.payment_intent) {
    await deps.adminPut(`stripe_payment_intents/${session.payment_intent}`, {
      sessionId,
      email,
      grantedUids: granted,
      durationMs
    });
  }

  return json(200, {
    ok: true,
    status: 'granted',
    email,
    granted,
    expiresAtByUid
  }, corsHeaders);
}

async function handleStripeRefundLike(charge, env, corsHeaders, deps, type) {
  const paymentIntent = String(charge?.payment_intent || '').trim();
  if (!paymentIntent) {
    return json(200, { ok: true, ignored: 'no_payment_intent' }, corsHeaders);
  }

  const link = await deps.adminGet(`stripe_payment_intents/${paymentIntent}`);
  if (!link?.sessionId) {
    return json(200, { ok: true, ignored: 'unknown_payment' }, corsHeaders);
  }

  const order = await deps.adminGet(`stripe_orders/${link.sessionId}`);
  if (!order || order.status !== 'granted') {
    return json(200, { ok: true, ignored: 'order_not_granted' }, corsHeaders);
  }

  // Full refund only (amount_refunded >= amount)
  const amount = Number(charge.amount);
  const refunded = Number(charge.amount_refunded);
  const full = Number.isFinite(amount) && Number.isFinite(refunded) && refunded >= amount;
  if (!full && type === 'charge.refunded') {
    await deps.adminPut(`stripe_orders/${link.sessionId}`, {
      ...order,
      partialRefundAt: Date.now(),
      amountRefunded: refunded
    });
    return json(200, { ok: true, ignored: 'partial_refund' }, corsHeaders);
  }

  const durationMs = Number(order.durationMs) || proDurationMs(env);
  const uids = Array.isArray(order.grantedUids) ? order.grantedUids : [];
  const results = [];
  for (const uid of uids) {
    results.push(await revokeOrShortenPro(uid, env, deps, durationMs));
  }

  await deps.adminPut(`stripe_orders/${link.sessionId}`, {
    ...order,
    status: 'refunded',
    refundResults: results,
    refundedAt: Date.now(),
    refundType: type
  });

  return json(200, { ok: true, status: 'refunded', results }, corsHeaders);
}
