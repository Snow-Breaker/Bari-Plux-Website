// 3-day BPT Pro free trial - granted and enforced only here (server time, admin RTDB writes).
//
// One trial per account AND per device: the app sends two SHA-256 hashes (Windows MachineGuid and
// the motherboard's SMBIOS UUID - the second survives a Windows reinstall). Either one already
// used refuses the trial, and a per-IP cap stops mass account farming from one network. The
// grant itself is ordinary time-limited Pro (proExpiresAtMs), so the existing expiry paths
// (enforceProExpiryForUid on every entitlement mint, the hourly purgeExpiredPro) end it - nothing
// in the client can extend it.

export const TRIAL_MAX_PER_IP = 2;
export const TRIAL_IP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const HASH_RE = /^[0-9a-f]{64}$/;

export function trialDurationMs(env) {
  const days = Number(env?.PRO_TRIAL_DAYS || '3');
  const safe = Number.isFinite(days) && days > 0 && days <= 30 ? days : 3;
  return Math.round(safe * 24 * 60 * 60 * 1000);
}

function roleTree(uid) {
  return uid.startsWith('discord_') ? 'discordUsers' : 'users';
}

/** Valid device hashes from the request body: machine is required, hardware optional. */
export function parseDeviceHashes(body) {
  const machine = typeof body?.machine === 'string' ? body.machine.trim().toLowerCase() : '';
  const hardwareRaw = typeof body?.hardware === 'string' ? body.hardware.trim().toLowerCase() : '';
  if (!HASH_RE.test(machine)) return null;
  const hardware = HASH_RE.test(hardwareRaw) && hardwareRaw !== machine ? hardwareRaw : null;
  return { machine, hardware };
}

/**
 * Why the trial is (not) available: null when it can be started, else a reason code
 * ('already_pro' | 'trial_used' | 'device_used' | 'ip_limit' | 'bad_device').
 */
export async function trialBlockReason(uid, hashes, ipHash, deps, nowMs = Date.now()) {
  if (!hashes) return 'bad_device';
  const tree = roleTree(uid);
  const role = String((await deps.adminGet(`${tree}/${uid}/role`)) || 'free').toLowerCase();
  if (role !== 'free') return 'already_pro';
  if (await deps.adminGet(`${tree}/${uid}/trialUsedAt`)) return 'trial_used';

  for (const h of [hashes.machine, hashes.hardware]) {
    if (h && (await deps.adminGet(`trials/devices/${h}`))) return 'device_used';
  }

  if (ipHash) {
    const byIp = (await deps.adminGet(`trials/ips/${ipHash}`)) || {};
    const recent = Object.values(byIp).filter((at) => Number(at) > nowMs - TRIAL_IP_WINDOW_MS).length;
    if (recent >= TRIAL_MAX_PER_IP) return 'ip_limit';
  }
  return null;
}

/** Starts the trial: { ok: true, expiresAtMs } or { ok: false, reason }. */
export async function startTrial(uid, hashes, ipHash, deps, env, nowMs = Date.now()) {
  const reason = await trialBlockReason(uid, hashes, ipHash, deps, nowMs);
  if (reason) return { ok: false, reason };

  const tree = roleTree(uid);
  // Mark the account and devices first, so a second parallel request finds them taken.
  await deps.adminPut(`${tree}/${uid}/trialUsedAt`, nowMs);
  await deps.adminPut(`trials/devices/${hashes.machine}`, { uid, at: nowMs });
  if (hashes.hardware) await deps.adminPut(`trials/devices/${hashes.hardware}`, { uid, at: nowMs });
  if (ipHash) await deps.adminPut(`trials/ips/${ipHash}/${uid}`, nowMs);

  const result = await deps.grantPro(uid, trialDurationMs(env));
  const expiresAtMs = result?.expiresAtByUid?.[uid];
  if (!expiresAtMs) return { ok: false, reason: 'grant_failed' };
  return { ok: true, expiresAtMs };
}
