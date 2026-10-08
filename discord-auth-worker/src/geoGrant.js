/**
 * Regional free-access for users in countries with no access to the international banking system
 * (Iran and other comprehensively sanctioned / card-cut-off places). These users cannot pay through
 * Stripe at all, so the only way to reach them is to grant Pro directly - but a naive "free if your
 * IP says country X" is trivially spoofed with a VPN by anyone in the world.
 *
 * This module is the multi-layer gate that makes that spoof expensive and annoying instead of free:
 *
 *   Layer 0  Hard country filter            - IP country must be an eligible one.
 *   Layer 1  Consumer-ISP ASN allowlist     - the IP must originate from a KNOWN in-country consumer
 *                                              ISP (mobile/broadband), not a datacenter/VPN ASN. This
 *                                              is the backbone: VPN exit nodes are almost never on a
 *                                              real Iranian consumer ISP, and one that is costs money.
 *   Layer 2  Device/locale consistency      - timezone offset (Iran's +03:30 is distinctive) and UI
 *                                              language add confidence; configurable whether required.
 *   Layer 4  Binding + continuous re-check   - the grant is device-bound, time-limited, and re-verified
 *                                              on every hourly entitlement mint; if the account later
 *                                              appears from outside the eligible network for several
 *                                              checks in a row it is revoked. (Layer 3 - possession
 *                                              proof - is the redeem-code path in index.js.)
 *
 * All thresholds, the country set and the ASN allowlists live in config (app_config/geo_grant),
 * admin-editable at runtime; the defaults below ship as a safe starting point. Nothing here is a
 * perfect lock - a determined attacker with a real residential in-country proxy still passes - but
 * for a $1 product that is far more effort than it is worth, which is the whole point.
 */

// Minutes east of UTC that a genuine device in each country usually reports, and the UI languages
// its users usually run. Iran = +03:30 (210) is deliberately odd and casual VPN users won't match it.
export const DEFAULT_GEO_CONFIG = {
  enabled: true,
  grantDays: 30,
  minScore: 2,            // ISP match alone (score 2) passes; raise to 3 to also require a device signal
  reverifyFailLimit: 3,   // consecutive failed hourly re-checks before a geo grant is revoked
  requireIspMatch: true,  // fail-closed: a country with no ASN allowlist can only use redeem codes
  countries: {
    IR: { tz: [210], langs: ['fa'], asns: [
      44244, 197207, 58224, 48159, 12880, 31549, 16322, 43754, 50810, 25184,
      42337, 49100, 56402, 44285, 39308, 60976, 61173, 51759, 57218, 206065
    ] },
    AF: { tz: [270], langs: ['fa', 'ps'], asns: [
      38742, 138322, 131284, 45178, 55424, 59317, 133894
    ] },
    SY: { tz: [180], langs: ['ar'], asns: [
      29256, 29386, 201550, 48065, 214707, 216472, 210557
    ] },
    SD: { tz: [120], langs: ['ar'], asns: [] },
    CU: { tz: [-300, -240], langs: ['es'], asns: [] },
    KP: { tz: [540], langs: ['ko'], asns: [] },
  },
};

/** Merge the admin override (app_config/geo_grant) over the shipped defaults, defensively. */
export async function getGeoConfig(deps) {
  let override = null;
  try { override = await deps.adminGet('app_config/geo_grant'); } catch { /* use defaults */ }
  if (!override || typeof override !== 'object') return DEFAULT_GEO_CONFIG;
  const cfg = {
    enabled: override.enabled !== undefined ? override.enabled === true : DEFAULT_GEO_CONFIG.enabled,
    grantDays: Number(override.grantDays) > 0 ? Number(override.grantDays) : DEFAULT_GEO_CONFIG.grantDays,
    minScore: Number(override.minScore) > 0 ? Number(override.minScore) : DEFAULT_GEO_CONFIG.minScore,
    reverifyFailLimit: Number(override.reverifyFailLimit) > 0 ? Number(override.reverifyFailLimit) : DEFAULT_GEO_CONFIG.reverifyFailLimit,
    requireIspMatch: override.requireIspMatch !== undefined ? override.requireIspMatch === true : DEFAULT_GEO_CONFIG.requireIspMatch,
    countries: (override.countries && typeof override.countries === 'object') ? override.countries : DEFAULT_GEO_CONFIG.countries,
  };
  // Normalise each country's asns to a numeric array (RTDB may store as object or strings).
  for (const code of Object.keys(cfg.countries)) {
    const c = cfg.countries[code] || {};
    const raw = Array.isArray(c.asns) ? c.asns : (c.asns ? Object.values(c.asns) : []);
    cfg.countries[code] = {
      tz: Array.isArray(c.tz) ? c.tz.map(Number) : (c.tz ? Object.values(c.tz).map(Number) : []),
      langs: Array.isArray(c.langs) ? c.langs : (c.langs ? Object.values(c.langs) : []),
      asns: raw.map(Number).filter(Number.isFinite),
    };
  }
  return cfg;
}

/** The eligible ISO country codes under the current config. */
export function eligibleCountries(cfg) {
  return Object.keys(cfg.countries || {}).filter(c => (cfg.countries[c]?.asns || []).length > 0 || !cfg.requireIspMatch);
}

/**
 * Score one attempt. `signals` = { country, asn, tzOffset, langs } where country/asn come from
 * Cloudflare (request.cf, non-spoofable by the client) and tzOffset/langs are client-reported
 * (spoofable, so they only ADD confidence, never stand alone). Returns
 * { pass, hardFail, score, reasons, country, asn }.
 */
export function evaluateGeo(signals, cfg, { networkOnly = false } = {}) {
  const reasons = [];
  const country = String(signals.country || '').toUpperCase();
  const asn = Number(signals.asn);

  if (!cfg.enabled) return { pass: false, hardFail: true, score: 0, reasons: ['disabled'], country, asn };

  const c = cfg.countries && cfg.countries[country];
  if (!c) return { pass: false, hardFail: true, score: 0, reasons: ['country_not_eligible'], country, asn };

  const allow = Array.isArray(c.asns) ? c.asns : [];
  if (cfg.requireIspMatch) {
    if (allow.length === 0) return { pass: false, hardFail: true, score: 0, reasons: ['no_isp_list'], country, asn };
    if (!Number.isFinite(asn) || !allow.includes(asn)) {
      return { pass: false, hardFail: true, score: 0, reasons: ['isp_not_allowed'], country, asn };
    }
    reasons.push('isp_ok');
  }

  let score = cfg.requireIspMatch ? 2 : 0;

  // Device signals - only when present (the hourly re-check runs network-only).
  if (!networkOnly) {
    const tz = Number(signals.tzOffset);
    if (Number.isFinite(tz) && Array.isArray(c.tz) && c.tz.includes(tz)) { score++; reasons.push('tz_ok'); }
    else if (Number.isFinite(tz)) reasons.push('tz_mismatch');

    const langs = Array.isArray(signals.langs) ? signals.langs.map(x => String(x || '').toLowerCase()) : [];
    if (langs.length && Array.isArray(c.langs) && c.langs.some(pref => langs.some(l => l.startsWith(pref)))) {
      score++; reasons.push('lang_ok');
    }
  }

  const need = networkOnly ? Math.min(cfg.minScore, 2) : cfg.minScore;
  return { pass: score >= need, hardFail: false, score, reasons, country, asn };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
/** A redeem code like BPT-XXXX-XXXX from the crypto RNG. */
export function generateRedeemCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < 8; i++) {
    s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 3) s += '-';
  }
  return 'BPT-' + s;
}

/** Codes are validated case-insensitively and stored uppercased; keep only the safe charset. */
export function normalizeRedeemCode(input) {
  const up = String(input || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return (/^BPT-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(up)) ? up : null;
}
