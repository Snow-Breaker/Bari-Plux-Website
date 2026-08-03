/**
 * Admin panel gate — server-side password + TOTP.
 * Secrets never leave the Worker; RTDB totp_secret is read/written only via Admin SDK.
 */

const ADMIN_EMAIL = 'mister.attaye@gmail.com';
const ADMIN_UID = 'ZHMxN5tZkNgLcxFnp98QUqfvw963';
const MAX_ATTEMPTS = 10;
const DELAYS_MS = [0, 1000, 1000, 5000, 5000, 30000, 30000, 120000, 120000, 600000];

/**
 * @param {object} deps
 * @param {(uid: string, claims: object, env: any) => Promise<string>} deps.createFirebaseCustomToken
 * @param {(path: string, env: any) => Promise<any>} deps.adminGetDatabaseAccess
 * @param {(path: string, data: any, env: any) => Promise<boolean>} deps.adminPutDatabase
 * @param {(idToken: string, env: any) => Promise<any>} deps.verifyFirebaseUser
 * @param {(user: any) => boolean} deps.isAdminFirebaseUser
 * @param {(str: string) => Promise<string>} deps.sha256Hex
 */
export function createAdminAuthRouter(deps) {
  return async function routeAdminAuth(request, env, corsHeaders, path) {
    if (request.method === 'POST' && path === '/admin/verify') {
      return handleAdminVerify(request, env, corsHeaders, deps);
    }
    if (request.method === 'POST' && path === '/admin/reauth') {
      return handleAdminReauth(request, env, corsHeaders, deps);
    }
    if (request.method === 'POST' && path === '/admin/session-unlock') {
      return handleAdminSessionUnlock(request, env, corsHeaders, deps);
    }
    if (request.method === 'POST' && path === '/admin/totp/enroll/start') {
      return handleTotpEnrollStart(request, env, corsHeaders, deps);
    }
    if (request.method === 'POST' && path === '/admin/totp/enroll/confirm') {
      return handleTotpEnrollConfirm(request, env, corsHeaders, deps);
    }
    if (request.method === 'GET' && path === '/admin/totp/status') {
      return handleTotpStatus(request, env, corsHeaders, deps);
    }
    return null;
  };
}

function json(corsHeaders, status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders
    }
  });
}

function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    'unknown'
  );
}

async function rateKey(deps, request) {
  const ip = clientIp(request);
  const hash = await deps.sha256Hex(`admin-gate|${ip}`);
  return { ip, hash, path: `admin/gate_rate/${hash}` };
}

async function readRate(deps, env, path) {
  const data = await deps.adminGetDatabaseAccess(path, env);
  if (!data || typeof data !== 'object') {
    return { attempts: 0, lockoutUntil: 0 };
  }
  return {
    attempts: Number(data.attempts) || 0,
    lockoutUntil: Number(data.lockoutUntil) || 0
  };
}

async function writeRate(deps, env, path, state) {
  await deps.adminPutDatabase(
    path,
    {
      attempts: state.attempts,
      lockoutUntil: state.lockoutUntil,
      updatedAt: Date.now()
    },
    env
  );
}

async function enforceRateLimit(deps, env, request) {
  const { path } = await rateKey(deps, request);
  const state = await readRate(deps, env, path);
  const now = Date.now();
  if (state.lockoutUntil > now) {
    const retryAfter = Math.ceil((state.lockoutUntil - now) / 1000);
    return { blocked: true, retryAfter, path, state };
  }
  return { blocked: false, retryAfter: 0, path, state };
}

async function recordFailure(deps, env, path, state) {
  const attempts = Math.min((state.attempts || 0) + 1, MAX_ATTEMPTS);
  const delay = DELAYS_MS[Math.min(attempts, DELAYS_MS.length - 1)] || 600000;
  const lockoutUntil = delay > 0 ? Date.now() + delay : 0;
  await writeRate(deps, env, path, { attempts, lockoutUntil });
  return { attempts, lockoutUntil, delay };
}

async function clearRate(deps, env, path) {
  await writeRate(deps, env, path, { attempts: 0, lockoutUntil: 0 });
}

async function firebaseSignInWithPassword(email, password, env) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data?.error?.message || 'INVALID_PASSWORD' };
  }
  return {
    ok: true,
    uid: data.localId,
    email: data.email,
    idToken: data.idToken
  };
}

function base32Decode(s) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = String(s || '')
    .replace(/=+$/, '')
    .toUpperCase();
  const bits = [];
  for (const c of s) {
    const idx = chars.indexOf(c);
    if (idx === -1) continue;
    for (let i = 4; i >= 0; i--) bits.push((idx >> i) & 1);
  }
  const bytes = [];
  for (let i = 0; i + 7 < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    bytes.push(b);
  }
  return new Uint8Array(bytes);
}

async function verifyTotp(secret, userCode) {
  if (!secret || !userCode || String(userCode).trim().length !== 6) return false;
  const timeStep = 30;
  const now = Math.floor(Date.now() / 1000 / timeStep);
  const keyBytes = base32Decode(secret);
  if (!keyBytes.length) return false;
  const code = String(userCode).trim();
  for (let delta = -2; delta <= 2; delta++) {
    const timeBig = BigInt(now + delta);
    const timeBuf = new ArrayBuffer(8);
    new DataView(timeBuf).setBigUint64(0, timeBig, false);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, timeBuf);
    const sigBytes = new Uint8Array(sig);
    const offset = sigBytes[sigBytes.length - 1] & 0x0f;
    const otp =
      (((sigBytes[offset] & 0x7f) << 24) |
        ((sigBytes[offset + 1] & 0xff) << 16) |
        ((sigBytes[offset + 2] & 0xff) << 8) |
        (sigBytes[offset + 3] & 0xff)) %
      1000000;
    if (otp.toString().padStart(6, '0') === code) return true;
  }
  return false;
}

function generateTotpSecret() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let secret = '';
  for (const b of bytes) secret += chars[b & 0x1f];
  return secret;
}

async function loadTotpState(deps, env) {
  // Prefer Worker secret if set; else RTDB via Admin SDK (client cannot read after rules lock).
  const fromEnv = env.ADMIN_TOTP_SECRET ? String(env.ADMIN_TOTP_SECRET).trim() : '';
  const enabledSnap = await deps.adminGetDatabaseAccess('admin/totp_enabled', env);
  const enabled = enabledSnap === true;
  if (fromEnv) {
    return { enabled, secret: fromEnv };
  }
  const secret = await deps.adminGetDatabaseAccess('admin/totp_secret', env);
  return {
    enabled,
    secret: typeof secret === 'string' ? secret : ''
  };
}

async function requireAdminBearer(request, env, deps) {
  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) return { ok: false, status: 401, error: 'missing_token' };
  const user = await deps.verifyFirebaseUser(idToken, env);
  if (!deps.isAdminFirebaseUser(user)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  return { ok: true, user, idToken };
}

async function handleAdminVerify(request, env, corsHeaders, deps) {
  const rate = await enforceRateLimit(deps, env, request);
  if (rate.blocked) {
    return json(
      corsHeaders,
      429,
      {
        error: 'rate_limited',
        message: `Too many attempts. Try again in ${rate.retryAfter}s.`,
        retryAfter: rate.retryAfter
      },
      { 'Retry-After': String(rate.retryAfter) }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(corsHeaders, 400, { error: 'invalid_json' });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const totpCode = typeof body.totpCode === 'string' ? body.totpCode : '';
  if (!password) {
    return json(corsHeaders, 400, { error: 'password_required' });
  }

  const signIn = await firebaseSignInWithPassword(ADMIN_EMAIL, password, env);
  if (!signIn.ok) {
    const fail = await recordFailure(deps, env, rate.path, rate.state);
    const retryAfter = fail.lockoutUntil
      ? Math.ceil((fail.lockoutUntil - Date.now()) / 1000)
      : 0;
    return json(
      corsHeaders,
      401,
      {
        error: 'invalid_credentials',
        attempts: fail.attempts,
        retryAfter: Math.max(0, retryAfter)
      },
      retryAfter > 0 ? { 'Retry-After': String(retryAfter) } : {}
    );
  }

  if (signIn.uid !== ADMIN_UID && (signIn.email || '').toLowerCase() !== ADMIN_EMAIL) {
    await recordFailure(deps, env, rate.path, rate.state);
    return json(corsHeaders, 403, { error: 'forbidden' });
  }

  const totp = await loadTotpState(deps, env);
  if (totp.enabled) {
    if (!totpCode) {
      // Password OK — do not clear rate yet; TOTP still required.
      return json(corsHeaders, 200, { needTotp: true });
    }
    if (!totp.secret || !(await verifyTotp(totp.secret, totpCode))) {
      const fail = await recordFailure(deps, env, rate.path, rate.state);
      const retryAfter = fail.lockoutUntil
        ? Math.ceil((fail.lockoutUntil - Date.now()) / 1000)
        : 0;
      return json(
        corsHeaders,
        401,
        {
          error: 'invalid_totp',
          attempts: fail.attempts,
          retryAfter: Math.max(0, retryAfter)
        },
        retryAfter > 0 ? { 'Retry-After': String(retryAfter) } : {}
      );
    }
  }

  await clearRate(deps, env, rate.path);
  const customToken = await deps.createFirebaseCustomToken(
    signIn.uid,
    { admin_gate: true, provider: 'admin-password' },
    env
  );
  return json(corsHeaders, 200, {
    customToken,
    uid: signIn.uid,
    email: signIn.email || ADMIN_EMAIL
  });
}

async function handleAdminReauth(request, env, corsHeaders, deps) {
  // Same checks as verify, but no session mint — for destructive confirmations.
  const rate = await enforceRateLimit(deps, env, request);
  if (rate.blocked) {
    return json(
      corsHeaders,
      429,
      {
        error: 'rate_limited',
        message: `Too many attempts. Try again in ${rate.retryAfter}s.`,
        retryAfter: rate.retryAfter
      },
      { 'Retry-After': String(rate.retryAfter) }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(corsHeaders, 400, { error: 'invalid_json' });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const totpCode = typeof body.totpCode === 'string' ? body.totpCode : '';
  if (!password) return json(corsHeaders, 400, { error: 'password_required' });

  const signIn = await firebaseSignInWithPassword(ADMIN_EMAIL, password, env);
  if (!signIn.ok) {
    await recordFailure(deps, env, rate.path, rate.state);
    return json(corsHeaders, 401, { error: 'invalid_credentials' });
  }

  const totp = await loadTotpState(deps, env);
  if (totp.enabled) {
    if (!totpCode || !(await verifyTotp(totp.secret, totpCode))) {
      await recordFailure(deps, env, rate.path, rate.state);
      return json(corsHeaders, 401, { error: 'invalid_totp', needTotp: true });
    }
  }

  await clearRate(deps, env, rate.path);
  return json(corsHeaders, 200, { ok: true });
}

async function handleAdminSessionUnlock(request, env, corsHeaders, deps) {
  // Google (or existing Firebase) session → optional TOTP gate before opening panel.
  const auth = await requireAdminBearer(request, env, deps);
  if (!auth.ok) return json(corsHeaders, auth.status, { error: auth.error });

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* empty body ok when TOTP off */
  }

  const totp = await loadTotpState(deps, env);
  if (totp.enabled) {
    const totpCode = typeof body.totpCode === 'string' ? body.totpCode.trim() : '';
    // No code yet → ask client to show TOTP UI (200, not 401).
    if (!totpCode) {
      return json(corsHeaders, 200, { ok: false, needTotp: true });
    }
    if (!(await verifyTotp(totp.secret, totpCode))) {
      return json(corsHeaders, 401, { error: 'invalid_totp', needTotp: true });
    }
  }

  return json(corsHeaders, 200, { ok: true, needTotp: false });
}

async function handleTotpStatus(request, env, corsHeaders, deps) {
  const auth = await requireAdminBearer(request, env, deps);
  if (!auth.ok) return json(corsHeaders, auth.status, { error: auth.error });
  const totp = await loadTotpState(deps, env);
  return json(corsHeaders, 200, { enabled: !!totp.enabled });
}

async function handleTotpEnrollStart(request, env, corsHeaders, deps) {
  const auth = await requireAdminBearer(request, env, deps);
  if (!auth.ok) return json(corsHeaders, auth.status, { error: auth.error });

  const secret = generateTotpSecret();
  const issuer = 'BariPlux Admin';
  const account = ADMIN_EMAIL;
  const otpauthUrl =
    'otpauth://totp/' +
    encodeURIComponent(issuer) +
    ':' +
    encodeURIComponent(account) +
    '?secret=' +
    secret +
    '&issuer=' +
    encodeURIComponent(issuer) +
    '&algorithm=SHA1&digits=6&period=30';

  // Secret is returned once for QR; persisted only after confirm.
  return json(corsHeaders, 200, { secret, otpauthUrl });
}

async function handleTotpEnrollConfirm(request, env, corsHeaders, deps) {
  const auth = await requireAdminBearer(request, env, deps);
  if (!auth.ok) return json(corsHeaders, auth.status, { error: auth.error });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(corsHeaders, 400, { error: 'invalid_json' });
  }

  const secret = typeof body.secret === 'string' ? body.secret.trim() : '';
  const totpCode = typeof body.totpCode === 'string' ? body.totpCode : '';
  if (!secret || secret.length < 16) {
    return json(corsHeaders, 400, { error: 'invalid_secret' });
  }
  if (!(await verifyTotp(secret, totpCode))) {
    return json(corsHeaders, 401, { error: 'invalid_totp' });
  }

  const okSecret = await deps.adminPutDatabase('admin/totp_secret', secret, env);
  const okEnabled = await deps.adminPutDatabase('admin/totp_enabled', true, env);
  if (!okSecret || !okEnabled) {
    return json(corsHeaders, 500, { error: 'persist_failed' });
  }

  return json(corsHeaders, 200, { ok: true, enabled: true });
}
