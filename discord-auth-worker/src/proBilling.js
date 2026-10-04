/**
 * Shared Pro grant / revoke / expiry for Stripe billing.
 * RTDB index path remains payhip_subscriptions for existing subscribers.
 */

import { announceProGranted } from './discordProAnnounce.js';

const ROLE_RANK = { free: 0, pro: 1, dev: 2, founder: 3 };

function normalizeRole(raw) {
  if (typeof raw !== 'string') return 'free';
  const r = raw.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_RANK, r) ? r : 'free';
}

function roleTree(uid) {
  return uid.startsWith('discord_') ? 'discordUsers' : 'users';
}

export function proDurationMs(env) {
  const days = Number(env.PRO_DAYS || env.PAYHIP_PRO_DAYS || '60');
  const safeDays = Number.isFinite(days) && days > 0 ? days : 60;
  return Math.round(safeDays * 24 * 60 * 60 * 1000);
}

export async function grantProSafe(uids, env, deps, meta = {}) {
  const granted = [];
  const skipped = [];
  const expiresAtByUid = {};
  const durationMs =
    Number(meta.durationMs) > 0 ? Math.round(Number(meta.durationMs)) : proDurationMs(env);
  const now = Date.now();
  const assignedBy = meta.assignedBy || 'stripe';

  for (const uid of uids) {
    const tree = roleTree(uid);
    const current = normalizeRole(await deps.adminGet(`${tree}/${uid}/role`));
    if (ROLE_RANK[current] >= ROLE_RANK.dev) {
      skipped.push({ uid, reason: 'protected_role', role: current });
      continue;
    }
    // Lifetime Pro never gets an expiry put back on it by a purchase or grant.
    if (current === 'pro' && (await deps.adminGet(`${tree}/${uid}/lifetime`)) === true) {
      skipped.push({ uid, reason: 'lifetime', role: current });
      continue;
    }

    const existingExp = Number(await deps.adminGet(`${tree}/${uid}/proExpiresAtMs`)) || 0;
    const base = Math.max(now, existingExp);
    const expiresAtMs = base + durationMs;

    const ok = await deps.adminPut(`${tree}/${uid}/role`, 'pro');
    await deps.adminPut(`${tree}/${uid}/roles`, ['pro']);
    await deps.adminPut(`${tree}/${uid}/proExpiresAtMs`, expiresAtMs);
    await deps.adminPut(`${tree}/${uid}/role_assigned_at`, new Date().toISOString());
    await deps.adminPut(`${tree}/${uid}/role_assigned_by`, assignedBy);
    await deps.adminPut(`payhip_subscriptions/${uid}`, {
      expiresAtMs,
      updatedAt: now,
      source: assignedBy,
      durationMs
    });

    if (ok) {
      granted.push(uid);
      expiresAtByUid[uid] = expiresAtMs;
      if (meta.silent) continue; // e.g. free trials - not a purchase, no Discord announcement
      try {
        await announceProGranted(env, deps, {
          uid,
          expiresAtMs,
          durationMs,
          source: assignedBy,
          email: meta.email || null,
          amountTotal: meta.amountTotal ?? null,
          currency: meta.currency || null,
          sessionId: meta.sessionId || null
        });
      } catch (err) {
        console.warn('[Pro] Discord announce failed', uid, err);
      }
    }
  }
  return { granted, skipped, expiresAtByUid, durationMs };
}

/**
 * Subscription renewals: Pro until a fixed time (the paid period's end + a grace day), never
 * shortening a later expiry the account already has. Skips staff roles and Lifetime.
 */
export async function grantProUntil(uid, untilMs, deps, meta = {}) {
  const tree = roleTree(uid);
  const current = normalizeRole(await deps.adminGet(`${tree}/${uid}/role`));
  if (ROLE_RANK[current] >= ROLE_RANK.dev) return { uid, action: 'skip_protected_role', role: current };
  if (current === 'pro' && (await deps.adminGet(`${tree}/${uid}/lifetime`)) === true) return { uid, action: 'skip_lifetime' };

  const existingExp = current === 'pro' ? Number(await deps.adminGet(`${tree}/${uid}/proExpiresAtMs`)) || 0 : 0;
  const expiresAtMs = Math.max(existingExp, Math.round(Number(untilMs)));
  await deps.adminPut(`${tree}/${uid}/role`, 'pro');
  await deps.adminPut(`${tree}/${uid}/roles`, ['pro']);
  await deps.adminPut(`${tree}/${uid}/proExpiresAtMs`, expiresAtMs);
  await deps.adminPut(`${tree}/${uid}/role_assigned_at`, new Date().toISOString());
  await deps.adminPut(`${tree}/${uid}/role_assigned_by`, meta.assignedBy || 'stripe');
  await deps.adminPut(`payhip_subscriptions/${uid}`, {
    expiresAtMs,
    updatedAt: Date.now(),
    source: meta.assignedBy || 'stripe',
    durationMs: Math.max(0, expiresAtMs - Date.now())
  });
  return { uid, action: 'granted', expiresAtMs };
}

/** Lifetime Pro: no expiry, nothing for the hourly purge, lifetime flag (see set-roles). */
export async function grantLifetimePro(uid, deps, meta = {}) {
  const tree = roleTree(uid);
  const current = normalizeRole(await deps.adminGet(`${tree}/${uid}/role`));
  if (ROLE_RANK[current] >= ROLE_RANK.dev) return { uid, action: 'skip_protected_role', role: current };
  await deps.adminPut(`${tree}/${uid}/role`, 'pro');
  await deps.adminPut(`${tree}/${uid}/roles`, ['pro']);
  await deps.adminPut(`${tree}/${uid}/lifetime`, true);
  await deps.adminPut(`${tree}/${uid}/proExpiresAtMs`, null);
  await deps.adminPut(`${tree}/${uid}/role_assigned_at`, new Date().toISOString());
  await deps.adminPut(`${tree}/${uid}/role_assigned_by`, meta.assignedBy || 'stripe');
  await deps.adminPut(`payhip_subscriptions/${uid}`, null);
  return { uid, action: 'granted_lifetime' };
}

export async function revokeOrShortenPro(uid, env, deps, durationMs) {
  const tree = roleTree(uid);
  const current = normalizeRole(await deps.adminGet(`${tree}/${uid}/role`));
  if (current !== 'pro') return { uid, action: 'skip_not_pro' };

  const by = await deps.adminGet(`${tree}/${uid}/role_assigned_by`);
  // Legacy payhip grants remain revocable; admin/manual sources are protected.
  if (by && by !== 'payhip' && by !== 'payhip_license' && by !== 'stripe') {
    return { uid, action: 'skip_protected_source', by };
  }

  const now = Date.now();
  if ((await deps.adminGet(`${tree}/${uid}/lifetime`)) === true) {
    await deps.adminPut(`${tree}/${uid}/role`, 'free');
    await deps.adminPut(`${tree}/${uid}/lifetime`, null);
    await deps.adminPut(`${tree}/${uid}/proExpiresAtMs`, null);
    await deps.adminPut(`payhip_subscriptions/${uid}`, null);
    return { uid, action: 'revoked_lifetime' };
  }
  const existingExp = Number(await deps.adminGet(`${tree}/${uid}/proExpiresAtMs`)) || 0;
  const nextExp = existingExp > 0 ? existingExp - durationMs : now;

  if (nextExp <= now) {
    await deps.adminPut(`${tree}/${uid}/role`, 'free');
    await deps.adminPut(`${tree}/${uid}/proExpiresAtMs`, null);
    await deps.adminPut(`payhip_subscriptions/${uid}`, null);
    return { uid, action: 'revoked' };
  }

  await deps.adminPut(`${tree}/${uid}/proExpiresAtMs`, nextExp);
  await deps.adminPut(`payhip_subscriptions/${uid}`, {
    expiresAtMs: nextExp,
    updatedAt: now,
    source: by || 'stripe',
    durationMs
  });
  return { uid, action: 'shortened', expiresAtMs: nextExp };
}

/** Hourly: demote expired Pro back to free. */
export async function purgeExpiredPro(env, deps) {
  const accessToken = await deps.getAccessToken();
  const now = Date.now();
  const db = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`;
  const listUrl =
    `${db}/payhip_subscriptions.json` +
    `?orderBy=${encodeURIComponent('"expiresAtMs"')}` +
    `&endAt=${now}` +
    `&limitToFirst=200` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  let data;
  try {
    const res = await fetch(listUrl);
    if (!res.ok) {
      console.error('[Pro] expiry list failed', res.status, await res.text());
      return { expired: 0, error: 'list' };
    }
    data = await res.json();
  } catch (err) {
    console.error('[Pro] expiry list exception', err);
    return { expired: 0, error: 'exception' };
  }

  if (!data || typeof data !== 'object') return { expired: 0 };

  let expired = 0;
  for (const uid of Object.keys(data)) {
    const tree = roleTree(uid);
    const current = normalizeRole(await deps.adminGet(`${tree}/${uid}/role`));
    if (ROLE_RANK[current] >= ROLE_RANK.dev) {
      await deps.adminPut(`payhip_subscriptions/${uid}`, null);
      continue;
    }
    if (current === 'pro') {
      await deps.adminPut(`${tree}/${uid}/role`, 'free');
      await deps.adminPut(`${tree}/${uid}/proExpiresAtMs`, null);
      await deps.adminPut(`${tree}/${uid}/role_assigned_by`, 'pro_expired');
      expired++;
    }
    await deps.adminPut(`payhip_subscriptions/${uid}`, null);
  }

  console.log(`[Pro] purgeExpiredPro expired=${expired}`);
  return { expired };
}

/** If role is pro but proExpiresAtMs is past, demote to free. */
export async function enforceProExpiryForUid(uid, env, deps) {
  const tree = roleTree(uid);
  const role = normalizeRole(await deps.adminGet(`${tree}/${uid}/role`));
  if (role !== 'pro') return role;

  const exp = Number(await deps.adminGet(`${tree}/${uid}/proExpiresAtMs`)) || 0;
  if (!exp) return role;
  if (exp > Date.now()) return role;

  await deps.adminPut(`${tree}/${uid}/role`, 'free');
  await deps.adminPut(`${tree}/${uid}/proExpiresAtMs`, null);
  await deps.adminPut(`${tree}/${uid}/role_assigned_by`, 'pro_expired');
  await deps.adminPut(`payhip_subscriptions/${uid}`, null);
  return 'free';
}
