/**
 * Server-side login record: IP, location and time as Cloudflare saw the request.
 *
 * The website's syncLoginToFirebase only covers Google/GitHub/email logins on the site, and its
 * IP/location come from a browser-side ipapi.co call (spoofable, often ad-blocked). Discord logins
 * and every desktop-app sign-in (the claim exchange) never recorded any of it, and the app's own
 * timestamps used the PC clock. This writes the authoritative values from the edge instead.
 */

const regionNames = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
})();

/** Profile tree for a uid, matching the app (AuthSessionService) and the admin panel. */
export function profilePathForUid(uid) {
  const safe = String(uid || '');
  return safe.startsWith('discord_') ? `discordUsers/${safe}` : `users/${safe}`;
}

/** The fields patched onto users/{uid} (or discordUsers/{uid}) for one sign-in. */
export function buildLoginInfo(request, platform, nowMs = Date.now()) {
  const cf = request.cf || {};
  const ip = request.headers.get('CF-Connecting-IP') || null;
  const countryCode = typeof cf.country === 'string' && /^[A-Z]{2}$/.test(cf.country) && cf.country !== 'XX' && cf.country !== 'T1'
    ? cf.country
    : null;
  let country = null;
  if (countryCode && regionNames) {
    try { country = regionNames.of(countryCode) || null; } catch { country = null; }
  }
  const info = {
    ip,
    countryCode,
    country: country || countryCode,
    city: typeof cf.city === 'string' && cf.city ? cf.city.slice(0, 80) : null,
    lastActive: nowMs,
    loginTime: new Date(nowMs).toISOString(),
    lastLoginPlatform: platform
  };
  if (platform === 'desktop') info.platform = 'desktop';
  return info;
}

/** Best-effort: never throws, never blocks or fails the sign-in it records. */
export async function recordLoginInfo(uid, request, platform, patch) {
  if (!uid) return false;
  try {
    return await patch(profilePathForUid(uid), buildLoginInfo(request, platform));
  } catch (err) {
    console.warn('[loginInfo] record failed:', err && err.message);
    return false;
  }
}
