import { purgeExpiredPro, enforceProExpiryForUid, grantProSafe, proDurationMs } from './proBilling.js';
import { handleStripeCreateCheckout, handleStripeWebhook } from './stripe.js';
import { createAdminAuthRouter } from './adminAuth.js';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
    const isAllowed = origin.length > 0 && allowedOrigins.includes(origin);

    const corsHeaders = {
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (isAllowed) {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // GET /my-ip — IP echo for WPF token IP binding
    if (request.method === 'GET' && path === '/my-ip') {
      const ip = request.headers.get('CF-Connecting-IP') ||
                  request.headers.get('X-Forwarded-For') ||
                  'unknown';
      return new Response(JSON.stringify({ ip }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET /health — health check
    if (request.method === 'GET' && path === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        worker: 'discord-auth-worker',
        timestamp: new Date().toISOString()
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // POST / — Discord OAuth token exchange (existing)
    if (request.method === 'POST' && path === '/') {
      return handleDiscordOAuth(request, env, corsHeaders);
    }

    // POST /github — GitHub OAuth token exchange → Firebase credential-compatible access token
    if (request.method === 'POST' && path === '/github') {
      return handleGithubOAuth(request, env, corsHeaders);
    }

    // ── Stripe billing (PayPal + cards) ──
    if (request.method === 'POST' && path === '/stripe/create-checkout') {
      return handleStripeCreateCheckout(request, env, corsHeaders);
    }
    if (request.method === 'POST' && path === '/stripe/webhook') {
      const deps = await buildBillingDeps(env);
      return handleStripeWebhook(request, env, corsHeaders, deps);
    }

    // ── Backup endpoints (all require Firebase idToken auth) ──

    // POST /backup/upload — upload a file to R2
    if (request.method === 'POST' && path === '/backup/upload') {
      return handleBackupUpload(request, env, corsHeaders);
    }

    // GET /backup/download — download a file from R2
    if (request.method === 'GET' && path === '/backup/download') {
      return handleBackupDownload(request, env, corsHeaders);
    }

    // GET /backup/list — list version folders for a user
    if (request.method === 'GET' && path === '/backup/list') {
      return handleBackupList(request, env, corsHeaders);
    }

    // DELETE /backup/delete — delete a file from R2
    if (request.method === 'DELETE' && path === '/backup/delete') {
      return handleBackupDelete(request, env, corsHeaders);
    }

    // DELETE /backup/admin-wipe — admin wipes all cloud backup files for a user
    if (request.method === 'DELETE' && path === '/backup/admin-wipe') {
      return handleBackupAdminWipe(request, env, corsHeaders);
    }

    // POST /admin/grant-pro — admin grants Pro (+ Discord announce via grantProSafe)
    if (request.method === 'POST' && path === '/admin/grant-pro') {
      return handleAdminGrantPro(request, env, corsHeaders);
    }

    // POST /admin/set-roles — admin assigns 1–2 roles (theadm1n only; service account write)
    if (request.method === 'POST' && path === '/admin/set-roles') {
      return handleAdminSetRoles(request, env, corsHeaders);
    }

    // POST /admin/rtdb-get — admin reads RTDB via Worker (when browser cannot reach firebaseio.com)
    if (request.method === 'POST' && path === '/admin/rtdb-get') {
      return handleAdminRtdbGet(request, env, corsHeaders);
    }

    // POST /admin/rtdb-write — admin writes RTDB via Worker (set/update/remove)
    if (request.method === 'POST' && path === '/admin/rtdb-write') {
      return handleAdminRtdbWrite(request, env, corsHeaders);
    }

    // POST /admin/agent/publish — admin publishes a new Companion Agent APK build
    if (request.method === 'POST' && path === '/admin/agent/publish') {
      return handleAdminAgentPublish(request, env, corsHeaders);
    }

    // GET/POST /admin/legacy-version — fetch download.bariplux.com/version.txt server-side (avoids browser CORS)
    if ((request.method === 'GET' || request.method === 'POST') && path === '/admin/legacy-version') {
      return handleAdminLegacyVersion(request, env, corsHeaders);
    }

    // ── Feature entitlement endpoints ──

    // POST /feature/entitlement — returns signed feature entitlement JWT (requires Firebase idToken)
    if (request.method === 'POST' && path === '/feature/entitlement') {
      return handleFeatureEntitlement(request, env, corsHeaders);
    }

    // GET /feature/public-key — returns JWKS URL for verifying entitlement tokens
    if (request.method === 'GET' && path === '/feature/public-key') {
      return handleFeaturePublicKey(request, env, corsHeaders);
    }

    // GET /manifest/status — signed status manifest (maintenance_3x + update_3x), unauthenticated
    if (request.method === 'GET' && path === '/manifest/status') {
      return handleManifestStatus(request, env, corsHeaders);
    }

    // POST /pending-token — Worker mints pending_tokens + HMAC (client cannot write RTDB)
    if (request.method === 'POST' && path === '/pending-token') {
      return handlePendingTokenCreate(request, env, corsHeaders);
    }

    // POST /claim-token — claim a pending token via secret verification
    if (request.method === 'POST' && path === '/claim-token') {
      return handleClaimToken(request, env, corsHeaders);
    }

    // ── Chat media (any authenticated user) ──
    if (request.method === 'POST' && path === '/chat/media/upload') {
      return handleChatMediaUpload(request, env, corsHeaders);
    }
    if (request.method === 'GET' && path === '/chat/media/download') {
      return handleChatMediaDownload(request, env, corsHeaders);
    }

    // ── Admin panel gate (password + TOTP; does not touch Discord OAuth / claim-token) ──
    const routeAdminAuth = createAdminAuthRouter({
      createFirebaseCustomToken,
      adminGetDatabaseAccess,
      adminPutDatabase,
      verifyFirebaseUser,
      isAdminFirebaseUser,
      sha256Hex
    });
    const adminAuthRes = await routeAdminAuth(request, env, corsHeaders, path);
    if (adminAuthRes) return adminAuthRes;

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  },

  /** Hourly: hard-delete lobby messages older than 24h (+ orphan chat-media). */
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await purgeExpiredLobbyChat(env);
      const deps = await buildBillingDeps(env);
      await purgeExpiredPro(env, deps);
    })());
  }
};

// ── Firebase token verification ──────────────────────────────
async function verifyFirebaseToken(idToken, env) {
  const user = await verifyFirebaseUser(idToken, env);
  return user?.localId || null;
}

async function verifyFirebaseUser(idToken, env) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    }
  );

  if (!response.ok) return null;

  const data = await response.json();
  if (!data.users || data.users.length === 0) return null;

  return data.users[0];
}

function isAdminFirebaseUser(user) {
  if (!user) return false;
  if (user.localId === 'ZHMxN5tZkNgLcxFnp98QUqfvw963') return true;
  const email = (user.email || '').toLowerCase();
  return email === 'mister.attaye@gmail.com';
}

function getAuthUid(request) {
  const authHeader = request.headers.get('Authorization') || '';
  return authHeader.replace('Bearer ', '');
}

// ── Firebase RTDB read helpers ─────────────────────────────────
function getDatabaseUrl(env) {
  return `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`;
}

async function readFeatureFlags(env) {
  const url = `${getDatabaseUrl(env)}/feature_flags.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function readUserRole(uid, idToken, env) {
  const url = `${getDatabaseUrl(env)}/users/${uid}/role.json?auth=${encodeURIComponent(idToken)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function readAppConfigNode(node, env) {
  const url = `${getDatabaseUrl(env)}/app_config/${node}.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// ── Discord OAuth handler ────────────────────────────────────
async function handleDiscordOAuth(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { code, codeVerifier, redirectUri } = body;

  if (!code || !codeVerifier || !redirectUri) {
    return new Response(JSON.stringify({
      error: 'Missing required parameters: code, codeVerifier, redirectUri'
    }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return new Response(JSON.stringify({
        error: 'Discord token exchange failed', detail: err
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!userRes.ok) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch Discord user profile'
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const discordUser = await userRes.json();

    const firebaseUid = `discord_${discordUser.id}`;
    const customToken = await createFirebaseCustomToken(firebaseUid, {
      provider: 'discord',
      discordId: discordUser.id,
      username: discordUser.username
    }, env);

    return new Response(JSON.stringify({
      customToken,
      discordUser: {
        id: discordUser.id,
        username: discordUser.username,
        global_name: discordUser.global_name || null,
        display_name: discordUser.global_name || discordUser.username,
        email: discordUser.email || null,
        avatar: discordUser.avatar
          ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
          : null
      }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ── GitHub OAuth handler (custom — avoids Firebase redirect/getRedirectResult breakage) ──
async function handleGithubOAuth(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { code, redirectUri } = body;
  if (!code || !redirectUri) {
    return new Response(JSON.stringify({
      error: 'Missing required parameters: code, redirectUri'
    }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({
      error: 'GitHub OAuth is not configured on the worker (missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)'
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'BariPlux-Auth-Worker'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return new Response(JSON.stringify({
        error: 'GitHub token exchange failed',
        detail: tokenData.error_description || tokenData.error || tokenData
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const accessToken = tokenData.access_token;

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'BariPlux-Auth-Worker'
      }
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch GitHub user profile' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const githubUser = await userRes.json();

    let email = githubUser.email || null;
    if (!email) {
      try {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'BariPlux-Auth-Worker'
          }
        });
        if (emailsRes.ok) {
          const emails = await emailsRes.json();
          const primary = Array.isArray(emails)
            ? (emails.find(e => e.primary && e.verified) || emails.find(e => e.verified) || emails[0])
            : null;
          if (primary && primary.email) email = primary.email;
        }
      } catch (_) { /* optional */ }
    }

    const firebaseUid = `github_${githubUser.id}`;
    const customToken = await createFirebaseCustomToken(firebaseUid, {
      provider: 'github',
      githubId: String(githubUser.id),
      username: githubUser.login
    }, env);

    return new Response(JSON.stringify({
      accessToken,
      customToken,
      githubUser: {
        id: githubUser.id,
        login: githubUser.login,
        name: githubUser.name || githubUser.login,
        email,
        avatar_url: githubUser.avatar_url || null
      }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[handleGithubOAuth]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function buildBillingDeps(env) {
  const identityScope =
    'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase.database';
  return {
    adminGet: (path) => adminGetDatabaseAccess(path, env),
    adminPut: (path, data) => adminPutDatabase(path, data, env),
    getAccessToken: () => getRtdbAccessToken(env),
    verifyFirebaseUser,
    findUidsByEmail: async (email) => {
      try {
        const accessToken = await getRtdbAccessToken(env, identityScope);
        const url = `https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:lookup`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: [email] })
        });
        if (!res.ok) {
          console.error('[Billing] accounts:lookup failed', res.status, await res.text());
          return [];
        }
        const data = await res.json();
        return (data.users || []).map((u) => u.localId).filter(Boolean);
      } catch (err) {
        console.error('[Billing] findUidsByEmail failed', err);
        return [];
      }
    }
  };
}

async function assertCloudBackupEntitled(uid, idToken, env, corsHeaders) {
  const [roleRaw, flags] = await Promise.all([
    readUserRole(uid, idToken, env),
    readFeatureFlags(env)
  ]);
  const role = normalizeRole(roleRaw);
  const flag = flags && typeof flags === 'object' ? flags.cloud_backup : null;
  if (flag && typeof flag === 'object' && flag.enabled === false) {
    return new Response(JSON.stringify({ error: 'Cloud backup is disabled' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  const minRole = normalizeRole(
    flag && typeof flag === 'object' && flag.min_role != null ? flag.min_role : 'pro'
  );
  const userLevel = ROLE_HIERARCHY[role] ?? 0;
  const minLevel = ROLE_HIERARCHY[minRole] ?? ROLE_HIERARCHY.pro;
  if (userLevel < minLevel) {
    return new Response(JSON.stringify({
      error: 'Cloud backup requires a higher subscription',
      role,
      min_role: minRole
    }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  return null;
}

// ── Backup: upload ────────────────────────────────────────────
async function handleBackupUpload(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  if (!idToken) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const uid = await verifyFirebaseToken(idToken, env);
  if (!uid) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const denied = await assertCloudBackupEntitled(uid, idToken, env, corsHeaders);
  if (denied) return denied;

  const url = new URL(request.url);
  const filePath = url.searchParams.get('path');
  if (!filePath) {
    return new Response(JSON.stringify({ error: 'Missing path parameter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (!filePath.startsWith(`users/${uid}/`)) {
    return new Response(JSON.stringify({ error: 'Access denied — path mismatch' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const fileBytes = await request.arrayBuffer();
  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

  await env.CLOUD_BACKUP_BUCKET.put(filePath, fileBytes, {
    httpMetadata: { contentType },
    customMetadata: {
      uid,
      uploadedAt: new Date().toISOString()
    }
  });

  return new Response(JSON.stringify({
    success: true,
    path: filePath,
    size: fileBytes.byteLength
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ── Backup: download ──────────────────────────────────────────
async function handleBackupDownload(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  const uid = await verifyFirebaseToken(idToken, env);
  if (!uid) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const denied = await assertCloudBackupEntitled(uid, idToken, env, corsHeaders);
  if (denied) return denied;

  const url = new URL(request.url);
  const filePath = url.searchParams.get('path');
  if (!filePath || !filePath.startsWith(`users/${uid}/`)) {
    return new Response(JSON.stringify({ error: 'Access denied' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const object = await env.CLOUD_BACKUP_BUCKET.get(filePath);
  if (!object) {
    return new Response(JSON.stringify({ error: 'File not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': object.size.toString(),
    }
  });
}

// ── Backup: list versions ─────────────────────────────────────
// ── Chat media: upload (shared, max 512 KB) ───────────────────
async function handleChatMediaUpload(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  const uid = await verifyFirebaseToken(idToken, env);
  if (!uid) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > 524288) {
    return new Response(JSON.stringify({ error: 'File too large (max 512 KB)' }),
      { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const type = (request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
  const ext =
    type === 'image/png' ? 'png' :
    type === 'image/webp' ? 'webp' :
    (type === 'image/jpeg' || type === 'image/jpg') ? 'jpg' : null;

  if (!ext) {
    return new Response(JSON.stringify({ error: 'Unsupported image type' }),
      { status: 415, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > 524288) {
    return new Response(JSON.stringify({ error: 'File too large (max 512 KB)' }),
      { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)),
    b => b.toString(16).padStart(2, '0')).join('');
  const filePath = `chat-media/${uid}/${Date.now()}-${rand}.${ext}`;

  await env.CLOUD_BACKUP_BUCKET.put(filePath, body, {
    httpMetadata: { contentType: type },
    customMetadata: { uid, uploadedAt: new Date().toISOString() }
  });

  return new Response(JSON.stringify({
    success: true,
    path: filePath,
    size: body.byteLength
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ── Chat media: download (any authenticated user) ─────────────
async function handleChatMediaDownload(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  const uid = await verifyFirebaseToken(idToken, env);
  if (!uid) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const filePath = new URL(request.url).searchParams.get('path') || '';
  if (!/^chat-media\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(filePath) || filePath.includes('..')) {
    return new Response(JSON.stringify({ error: 'Invalid path' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const object = await env.CLOUD_BACKUP_BUCKET.get(filePath);
  if (!object) {
    return new Response(JSON.stringify({ error: 'File not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': object.size.toString(),
    }
  });
}

async function handleBackupList(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  const uid = await verifyFirebaseToken(idToken, env);
  if (!uid) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const denied = await assertCloudBackupEntitled(uid, idToken, env, corsHeaders);
  if (denied) return denied;

  const prefix = `users/${uid}/history/`;
  const listed = await env.CLOUD_BACKUP_BUCKET.list({
    prefix,
    delimiter: '/'
  });

  const versions = listed.delimitedPrefixes || [];

  return new Response(JSON.stringify({
    versions,
    count: versions.length
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ── Backup: delete ────────────────────────────────────────────
async function handleBackupDelete(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  const uid = await verifyFirebaseToken(idToken, env);
  if (!uid) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const denied = await assertCloudBackupEntitled(uid, idToken, env, corsHeaders);
  if (denied) return denied;

  const url = new URL(request.url);
  const filePath = url.searchParams.get('path');
  if (!filePath || !filePath.startsWith(`users/${uid}/`)) {
    return new Response(JSON.stringify({ error: 'Access denied' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  await env.CLOUD_BACKUP_BUCKET.delete(filePath);

  return new Response(JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ── Backup: admin wipe all files for a target uid ─────────────
async function handleBackupAdminWipe(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  const adminUser = await verifyFirebaseUser(idToken, env);
  if (!adminUser || !isAdminFirebaseUser(adminUser)) {
    return new Response(JSON.stringify({ error: 'Admin only' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const targetUid = (new URL(request.url).searchParams.get('uid') || '').trim();
  if (!targetUid || targetUid.length > 128 || targetUid.includes('/') || targetUid.includes('..')) {
    return new Response(JSON.stringify({ error: 'Invalid uid' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const prefix = `users/${targetUid}/`;
  let deleted = 0;
  let cursor = undefined;
  do {
    const listed = await env.CLOUD_BACKUP_BUCKET.list({ prefix, cursor, limit: 1000 });
    const keys = (listed.objects || []).map(o => o.key);
    if (keys.length) {
      await Promise.all(keys.map(k => env.CLOUD_BACKUP_BUCKET.delete(k)));
      deleted += keys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return new Response(JSON.stringify({ success: true, deleted, uid: targetUid }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function isSafeAdminRtdbPath(path) {
  if (!path || typeof path !== 'string') return false;
  if (path.length > 200) return false;
  if (path.includes('..') || path.includes('//') || path.startsWith('/') || path.endsWith('/')) return false;
  if (!/^[A-Za-z0-9_./-]+$/.test(path)) return false;
  // Never expose gate/TOTP secrets through the browser proxy.
  if (path === 'admin/totp_secret' || path.startsWith('admin/totp_secret/')) return false;
  if (path === 'admin/gate_rate' || path.startsWith('admin/gate_rate/')) return false;
  return true;
}

/** Admin-only multi-path RTDB read (service account). Used when client SDK cannot connect. */
async function handleAdminRtdbGet(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  const adminUser = await verifyFirebaseUser(idToken, env);
  if (!adminUser || !isAdminFirebaseUser(adminUser)) {
    return new Response(JSON.stringify({ error: 'Admin only' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const paths = Array.isArray(body?.paths) ? body.paths : [];
  if (!paths.length || paths.length > 24) {
    return new Response(JSON.stringify({ error: 'paths must be 1–24 items' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  for (const p of paths) {
    if (!isSafeAdminRtdbPath(String(p || ''))) {
      return new Response(JSON.stringify({ error: 'Invalid path', path: p }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  const data = {};
  await Promise.all(paths.map(async (p) => {
    const key = String(p);
    data[key] = await adminGetDatabaseAccess(key, env);
  }));

  return new Response(JSON.stringify({ ok: true, via: 'worker', data }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/** Admin-only RTDB write (service account). */
async function handleAdminRtdbWrite(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  const adminUser = await verifyFirebaseUser(idToken, env);
  if (!adminUser || !isAdminFirebaseUser(adminUser)) {
    return new Response(JSON.stringify({ error: 'Admin only' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const op = String(body?.op || '').toLowerCase();
  const path = String(body?.path || '');
  if (!['set', 'update', 'remove'].includes(op)) {
    return new Response(JSON.stringify({ error: 'op must be set|update|remove' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (!isSafeAdminRtdbPath(path)) {
    return new Response(JSON.stringify({ error: 'Invalid path', path }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let ok = false;
  if (op === 'set') {
    ok = await adminPutDatabase(path, body.data === undefined ? null : body.data, env);
  } else if (op === 'update') {
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      return new Response(JSON.stringify({ error: 'update requires object data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    ok = await adminPatchDatabase(path, body.data, env);
  } else {
    ok = await adminDeleteDatabase(path, null, env);
  }

  if (!ok) {
    return new Response(JSON.stringify({ error: 'RTDB write failed', op, path }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true, via: 'worker', op, path }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleAdminLegacyVersion(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  const adminUser = await verifyFirebaseUser(idToken, env);
  if (!adminUser || !isAdminFirebaseUser(adminUser)) {
    return new Response(JSON.stringify({ error: 'Admin only' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const res = await fetch('https://download.bariplux.com/version.txt?t=' + Date.now(), {
      cf: { cacheTtl: 60, cacheEverything: true }
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'version.txt HTTP ' + res.status }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const text = (await res.text()).trim();
    return new Response(JSON.stringify({ ok: true, text }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

async function handleAdminSetRoles(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  const adminUser = await verifyFirebaseUser(idToken, env);
  if (!adminUser || !isAdminFirebaseUser(adminUser)) {
    return new Response(JSON.stringify({ error: 'Admin only' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const uid = String(body?.uid || '').trim();
  if (!uid || uid.length > 128 || uid.includes('/') || uid.includes('..')) {
    return new Response(JSON.stringify({ error: 'Invalid uid' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // staff ranks above founder so it always wins the "primary" role slot in a 2-role combo
  // (e.g. a paying Pro customer who's also a chat moderator) - moderation in database.rules.json
  // is gated on the singular primary `role` field, not the `roles` array, so staff must win that
  // slot for its chat-moderation grant to actually take effect when combined with another role.
  const ROLE_RANK = { free: 0, pro: 1, dev: 2, founder: 3, staff: 4 };
  const raw = Array.isArray(body?.roles) ? body.roles : [];
  let roles = [...new Set(raw.map(r => String(r || '').trim().toLowerCase()).filter(r => Object.prototype.hasOwnProperty.call(ROLE_RANK, r)))];
  if (!roles.length) {
    return new Response(JSON.stringify({ error: 'roles required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (roles.includes('free') && roles.length > 1) {
    return new Response(JSON.stringify({ error: 'FREE cannot be combined with another role' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (roles.length > 2) roles = roles.slice(0, 2);
  roles.sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);
  const primary = roles[0];

  const tree = uid.startsWith('discord_') ? 'discordUsers' : 'users';
  const nowIso = new Date().toISOString();
  let proExpiresAtMs = null;

  // Ensure profile node exists (prefer existing tree; fall back create under expected tree)
  const existingUsers = await adminGetDatabaseAccess(`users/${uid}`, env);
  const existingDiscord = await adminGetDatabaseAccess(`discordUsers/${uid}`, env);
  const writeTree = existingUsers ? 'users' : (existingDiscord ? 'discordUsers' : tree);

  const okRole = await adminPutDatabase(`${writeTree}/${uid}/role`, primary, env);
  const okRoles = await adminPutDatabase(`${writeTree}/${uid}/roles`, roles, env);
  await adminPutDatabase(`${writeTree}/${uid}/role_assigned_at`, nowIso, env);
  await adminPutDatabase(`${writeTree}/${uid}/role_assigned_by`, 'admin', env);

  if (!okRole || !okRoles) {
    return new Response(JSON.stringify({ error: 'Failed to write roles' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (primary === 'free' || !roles.includes('pro')) {
    await adminPutDatabase(`${writeTree}/${uid}/proExpiresAtMs`, null, env);
    await adminDeleteDatabase(`payhip_subscriptions/${uid}`, null, env);
  }

  if (roles.includes('pro')) {
    let daysRaw = Number(body?.days);
    if (!Number.isFinite(daysRaw) || daysRaw <= 0) {
      daysRaw = Number(env.PRO_DAYS || env.PAYHIP_PRO_DAYS || 60);
    }
    const days = Math.min(Math.max(Math.round(daysRaw), 1), 3650);
    const durationMs = Math.round(days * 24 * 60 * 60 * 1000);
    const now = Date.now();
    const existingExp = Number(await adminGetDatabaseAccess(`${writeTree}/${uid}/proExpiresAtMs`, env)) || 0;
    const base = Math.max(now, existingExp);
    proExpiresAtMs = base + durationMs;
    await adminPutDatabase(`${writeTree}/${uid}/proExpiresAtMs`, proExpiresAtMs, env);
    await adminPutDatabase(`payhip_subscriptions/${uid}`, {
      expiresAtMs: proExpiresAtMs,
      updatedAt: now,
      source: 'admin',
      durationMs
    }, env);

    // Discord announce only when Pro is newly part of the assignment and primary isn't already higher staff-only without wanting announce
    if (primary === 'pro') {
      try {
        const deps = await buildBillingDeps(env);
        await announceProGrantedSafe(env, deps, {
          uid,
          expiresAtMs: proExpiresAtMs,
          durationMs,
          email: body?.email || null
        });
      } catch (_) { /* optional */ }
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    uid,
    role: primary,
    roles,
    proExpiresAtMs,
    tree: writeTree
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// POST /admin/agent/publish?version=1.2.3&changelog=... - raw APK bytes as the request body.
// Publishes a new Companion Agent build independently of a BPT app release: uploads to the same
// R2 bucket/custom domain already serving BariPluxToolSetup.exe (dl.bariplux.com), then writes
// app_config/agent_config so BPT clients can compare their connected Agent's own reported
// AgentVersion (from the pairing handshake) against this and offer an in-app update - see BPT's
// AgentUpdateService. Kept as its own endpoint/object key (not folded into handleBackupUpload)
// since this is a public download artifact, not a per-user private backup file.
async function handleAdminAgentPublish(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  const adminUser = await verifyFirebaseUser(idToken, env);
  if (!adminUser || !isAdminFirebaseUser(adminUser)) {
    return new Response(JSON.stringify({ error: 'Admin only' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const url = new URL(request.url);
  const version = String(url.searchParams.get('version') || '').trim();
  if (!version || version.length > 32 || !/^[0-9]+(\.[0-9]+){1,3}$/.test(version)) {
    return new Response(JSON.stringify({ error: 'version query param required, e.g. 1.2.3' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const changelog = String(url.searchParams.get('changelog') || '').slice(0, 4000);

  const fileBytes = await request.arrayBuffer();
  if (!fileBytes.byteLength) {
    return new Response(JSON.stringify({ error: 'Empty request body - send the APK as raw bytes' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  // Cheap sanity check that this is actually an APK (a ZIP) and not something pasted/uploaded by
  // mistake - real validation (signature, manifest) happens on-device at adb install time anyway.
  const magic = new Uint8Array(fileBytes.slice(0, 4));
  if (!(magic[0] === 0x50 && magic[1] === 0x4b)) {
    return new Response(JSON.stringify({ error: 'Not a valid APK (missing ZIP signature)' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const digest = await crypto.subtle.digest('SHA-256', fileBytes);
  const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');

  await env.DOWNLOADS_BUCKET.put('BariPluxAgent.apk', fileBytes, {
    httpMetadata: { contentType: 'application/vnd.android.package-archive' },
    customMetadata: { version, uploadedBy: adminUser.email || adminUser.uid, uploadedAt: new Date().toISOString() }
  });

  const downloadUrl = 'https://dl.bariplux.com/BariPluxAgent.apk';
  const okConfig = await adminPutDatabase('app_config/agent_config', {
    version, download_url: downloadUrl, sha256, changelog, updated_at: Date.now()
  }, env);
  if (!okConfig) {
    return new Response(JSON.stringify({ error: 'APK uploaded but failed to write app_config/agent_config' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    ok: true, version, sha256, size: fileBytes.byteLength, download_url: downloadUrl
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function announceProGrantedSafe(env, deps, meta) {
  try {
    const { announceProGranted } = await import('./discordProAnnounce.js');
    await announceProGranted(env, deps, {
      ...meta,
      source: 'admin',
      sessionId: `admin-roles-${meta.uid}-${Date.now()}`
    });
  } catch (e) {
    console.warn('[set-roles] announce failed', e);
  }
}

async function handleAdminGrantPro(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  const adminUser = await verifyFirebaseUser(idToken, env);
  if (!adminUser || !isAdminFirebaseUser(adminUser)) {
    return new Response(JSON.stringify({ error: 'Admin only' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const uid = String(body?.uid || '').trim();
  if (!uid || uid.length > 128 || uid.includes('/') || uid.includes('..')) {
    return new Response(JSON.stringify({ error: 'Invalid uid' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let daysRaw = Number(body?.days);
  if (!Number.isFinite(daysRaw) || daysRaw <= 0) {
    daysRaw = Number(env.PRO_DAYS || env.PAYHIP_PRO_DAYS || 60);
  }
  const days = Math.min(Math.max(Math.round(daysRaw), 1), 3650);
  const durationMs = Math.round(days * 24 * 60 * 60 * 1000);

  const deps = await buildBillingDeps(env);
  const result = await grantProSafe([uid], env, deps, {
    assignedBy: 'admin',
    email: body?.email || null,
    sessionId: `admin-${adminUser.localId}-${Date.now()}`,
    durationMs
  });

  return new Response(JSON.stringify({
    ok: true,
    ...result,
    days,
    durationMs
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ── Feature entitlement handlers ─────────────────────────────
// staff sits at entitlement level 0, same as free - it grants no Pro-tier feature-flag
// unlock (that's the deliberate scope: chat moderation only, not app entitlement). It still
// needs its own key here (rather than falling through to normalizeRole's 'free' default) so a
// "staff" role string survives into the signed JWT's `role` claim intact instead of being
// silently downgraded to "free" - BPT's own client-side UserRole.Staff depends on that string
// arriving unchanged.
const ROLE_HIERARCHY = { free: 0, pro: 1, dev: 2, founder: 3, staff: 0 };

/** Normalize role strings so "Founder" / "PRO" still map into the hierarchy. */
function normalizeRole(role) {
  if (typeof role !== 'string') return 'free';
  const key = role.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY, key) ? key : 'free';
}

async function handleFeatureEntitlement(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  if (!idToken) {
    return new Response(JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const uid = await verifyFirebaseToken(idToken, env);
  if (!uid) {
    return new Response(JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const [roleRaw, featureFlags] = await Promise.all([
    readUserRole(uid, idToken, env),
    readFeatureFlags(env)
  ]);

  // Time-limited Pro — demote if expired before minting JWT.
  let role = normalizeRole(roleRaw);
  if (role === 'pro') {
    try {
      const deps = await buildBillingDeps(env);
      role = normalizeRole(await enforceProExpiryForUid(uid, env, deps));
    } catch (err) {
      console.warn('[feature] pro expiry check failed', err);
    }
  }

  const userLevel = ROLE_HIERARCHY[role] ?? 0;

  const features = {};
  const now = Math.floor(Date.now() / 1000);

  if (featureFlags) {
    for (const [key, flag] of Object.entries(featureFlags)) {
      if (typeof flag !== 'object' || flag === null) continue;
      const minRole = normalizeRole(flag.min_role);
      const minLevel = ROLE_HIERARCHY[minRole] ?? 0;
      // Founder (3) ≥ Dev (2) ≥ Pro (1) ≥ Free (0) — higher roles unlock lower mins.
      features[key] = flag.enabled === true && userLevel >= minLevel;
    }
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const privateKey = await importPrivateKey(serviceAccount.private_key);
  const token = await signJwt({
    uid,
    role,
    features,
    iat: now,
    exp: now + 3600
  }, privateKey, serviceAccount.private_key_id);

  return new Response(JSON.stringify({
    token,
    expires_at: (now + 3600) * 1000
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleFeaturePublicKey(request, env, corsHeaders) {
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const jwksUrl = `https://www.googleapis.com/service_accounts/v1/jwk/${serviceAccount.client_email}`;
  return new Response(JSON.stringify({
    jwks_url: jwksUrl,
    client_email: serviceAccount.client_email
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/**
 * Signed status manifest — aggregates the two security/business-critical BPT-only kill-switch
 * nodes (app_config/maintenance_3x, app_config/update_3x, both already publicly .read:true) into
 * one RS256 JWT using the same service-account key/signJwt() pair as /feature/entitlement, so BPT
 * can trust a verified "pause the app" / "force update" signal even if the raw unauthenticated RTDB
 * read path were ever spoofed. Deliberately excludes access/license data — per product decision,
 * the Manifest configures behavior, it does not become a new security-trust boundary; app_config/
 * access_3x stays gated solely by AppAccessGate's existing unsigned direct read.
 */
async function handleManifestStatus(request, env, corsHeaders) {
  const [maintenanceRaw, updateRaw] = await Promise.all([
    readAppConfigNode('maintenance_3x', env),
    readAppConfigNode('update_3x', env)
  ]);

  const now = Math.floor(Date.now() / 1000);

  const maintenance = {
    enabled: !!(maintenanceRaw && maintenanceRaw.enabled === true),
    title: (maintenanceRaw && typeof maintenanceRaw.title === 'string') ? maintenanceRaw.title : '',
    message: (maintenanceRaw && typeof maintenanceRaw.message === 'string') ? maintenanceRaw.message : '',
    updated_at: (maintenanceRaw && typeof maintenanceRaw.updated_at === 'number') ? maintenanceRaw.updated_at : 0
  };

  const update = {
    version: (updateRaw && typeof updateRaw.version === 'string') ? updateRaw.version : '',
    mandatory: !!(updateRaw && updateRaw.mandatory === true),
    check_enabled: !updateRaw || updateRaw.check_enabled !== false,
    download_url: (updateRaw && typeof updateRaw.download_url === 'string') ? updateRaw.download_url : '',
    changelog: (updateRaw && typeof updateRaw.changelog === 'string') ? updateRaw.changelog : ''
  };

  const payload = {
    manifestVersion: 1,
    generatedAt: now,
    maintenance,
    update,
    iat: now,
    exp: now + 300
  };

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const privateKey = await importPrivateKey(serviceAccount.private_key);
  const token = await signJwt(payload, privateKey, serviceAccount.private_key_id);

  return new Response(JSON.stringify({
    token,
    expires_at: (now + 300) * 1000
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ── JWT signing helpers ──────────────────────────────────────
async function signJwt(payload, privateKey, kid) {
  const header = { alg: 'RS256', typ: 'JWT' };
  if (kid) header.kid = kid;

  const encHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signingInput = `${encHeader}.${encPayload}`;

  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  const encSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${signingInput}.${encSignature}`;
}

async function createFirebaseCustomToken(uid, claims, env) {
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid,
    claims
  };

  const privateKey = await importPrivateKey(serviceAccount.private_key);
  return signJwt(payload, privateKey);
}

async function importPrivateKey(pem) {
  const pemBody = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');

  const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

// ── SHA-256 / HMAC / AES helpers ────────────────────────────
async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function uuidToBytes(uuid) {
  const hex = String(uuid).replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** AES-128-CBC, key = UUID bytes of sessionId; output = base64(IV || ciphertext). Matches AuthSessionService. */
async function encryptTokenAes(plaintext, sessionId) {
  if (!plaintext) return null;
  const keyBytes = uuidToBytes(sessionId);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bytesToBase64(combined);
}

function pendingTokenHmacMessage(uid, sessionId, expiresAt, csHash, allowedIp, hasToken) {
  const ip = allowedIp == null ? '' : String(allowedIp);
  const ht = hasToken ? '1' : '0';
  return `${uid}|${sessionId}|${expiresAt}|${csHash}|${ip}|${ht}`;
}

async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

async function computePendingTokenHmac(env, fields) {
  const secret = env.PENDING_TOKEN_HMAC_SECRET;
  if (!secret) throw new Error('PENDING_TOKEN_HMAC_SECRET not configured');
  const msg = pendingTokenHmacMessage(
    fields.uid,
    fields.sessionId,
    fields.expiresAt,
    fields.csHash,
    fields.allowedIp,
    fields.hasToken
  );
  return hmacSha256Hex(secret, msg);
}

async function verifyPendingTokenHmac(env, tokenData, uid, sessionId) {
  const expected = tokenData.pt_hmac;
  if (!expected || typeof expected !== 'string') return false;
  const computed = await computePendingTokenHmac(env, {
    uid,
    sessionId,
    expiresAt: tokenData.expires_at,
    csHash: tokenData.cs_hash,
    allowedIp: tokenData.allowed_ip ?? null,
    hasToken: !!(tokenData.has_token || tokenData.firebase_id_token_enc || tokenData.firebase_id_token)
  });
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ── Admin RTDB helpers ──────────────────────────────────────
// Custom-token idToken respects security rules (owner read).
// Service-account access_token bypasses rules (needed when .write is false).

async function getAdminIdToken(uid, env) {
  const customToken = await createFirebaseCustomToken(uid, {
    provider: 'service-account',
    admin: true
  }, env);

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    console.error('[getAdminIdToken] Custom token exchange failed:', res.status, errBody);
    throw new Error('Failed to mint admin idToken');
  }

  const data = await res.json();
  return data.idToken;
}

let _rtdbAccessTokenCache = { token: null, exp: 0, scope: '' };

async function getRtdbAccessToken(env, scopeOverride = null) {
  const now = Math.floor(Date.now() / 1000);
  const scope = scopeOverride ||
    'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';
  if (
    _rtdbAccessTokenCache.token &&
    _rtdbAccessTokenCache.scope === scope &&
    _rtdbAccessTokenCache.exp > now + 60
  ) {
    return _rtdbAccessTokenCache.token;
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const iat = now;
  const exp = now + 3600;
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp,
    scope
  };
  const privateKey = await importPrivateKey(serviceAccount.private_key);
  const assertion = await signJwt(payload, privateKey, serviceAccount.private_key_id);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('[getRtdbAccessToken] Failed:', res.status, errBody);
    throw new Error('Failed to mint RTDB access token');
  }

  const data = await res.json();
  _rtdbAccessTokenCache = {
    token: data.access_token,
    exp: now + (Number(data.expires_in) || 3600),
    scope
  };
  return data.access_token;
}

async function adminGetDatabase(path, idToken, env) {
  const url = `${getDatabaseUrl(env)}/${path}.json?auth=${encodeURIComponent(idToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    console.error(`[adminGetDatabase] Failed: ${res.status} for ${path}`);
    return null;
  }
  return res.json();
}

/** Rule-bypassing read (service account access_token). */
async function adminGetDatabaseAccess(path, env) {
  const accessToken = await getRtdbAccessToken(env);
  const url = `${getDatabaseUrl(env)}/${path}.json?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    console.error(`[adminGetDatabaseAccess] Failed: ${res.status} for ${path}`);
    return null;
  }
  return res.json();
}

/** Rule-bypassing write (service account access_token). */
async function adminPutDatabase(path, data, env) {
  const accessToken = await getRtdbAccessToken(env);
  const url = `${getDatabaseUrl(env)}/${path}.json?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[adminPutDatabase] Failed: ${res.status} for ${path}: ${errBody}`);
    return false;
  }
  return true;
}

async function adminPatchDatabase(path, data, env) {
  const accessToken = await getRtdbAccessToken(env);
  const url = `${getDatabaseUrl(env)}/${path}.json?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[adminPatchDatabase] Failed: ${res.status} for ${path}: ${errBody}`);
    return false;
  }
  return true;
}

/** Rule-bypassing delete (service account access_token). */
async function adminDeleteDatabase(path, _idTokenIgnored, env) {
  const accessToken = await getRtdbAccessToken(env);
  const url = `${getDatabaseUrl(env)}/${path}.json?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    const errBody = await res.text();
    console.error(`[adminDeleteDatabase] Failed: ${res.status} for ${path}: ${errBody}`);
    return false;
  }
  return true;
}

const LOBBY_CHAT_RETENTION_MS = 24 * 60 * 60 * 1000;
const LOBBY_CHAT_PURGE_BATCH = 250;

/** Delete lobby_chat/messages older than 24h; also remove linked chat-media from R2. */
async function purgeExpiredLobbyChat(env) {
  const cutoff = Date.now() - LOBBY_CHAT_RETENTION_MS;
  let accessToken;
  try {
    accessToken = await getRtdbAccessToken(env);
  } catch (err) {
    console.error('[purgeExpiredLobbyChat] token failed:', err);
    return { deleted: 0, error: 'token' };
  }

  const listUrl =
    `${getDatabaseUrl(env)}/lobby_chat/messages.json` +
    `?orderBy=${encodeURIComponent('"ts"')}` +
    `&endAt=${cutoff}` +
    `&limitToFirst=${LOBBY_CHAT_PURGE_BATCH}` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  let data;
  try {
    const res = await fetch(listUrl);
    if (!res.ok) {
      const body = await res.text();
      console.error('[purgeExpiredLobbyChat] list failed:', res.status, body);
      return { deleted: 0, error: 'list' };
    }
    data = await res.json();
  } catch (err) {
    console.error('[purgeExpiredLobbyChat] list exception:', err);
    return { deleted: 0, error: 'list_ex' };
  }

  if (!data || typeof data !== 'object') {
    console.log('[purgeExpiredLobbyChat] nothing to purge');
    return { deleted: 0 };
  }

  let deleted = 0;
  const mediaKeys = [];
  for (const [id, msg] of Object.entries(data)) {
    if (!id || typeof msg !== 'object' || msg === null) continue;
    const ts = typeof msg.ts === 'number' ? msg.ts : 0;
    if (ts > 0 && ts >= cutoff) continue;

    const ok = await adminDeleteDatabase(`lobby_chat/messages/${id}`, null, env);
    if (ok) {
      deleted++;
      if (typeof msg.imageKey === 'string' && msg.imageKey.startsWith('chat-media/')) {
        mediaKeys.push(msg.imageKey);
      }
    }
  }

  if (env.CLOUD_BACKUP_BUCKET && mediaKeys.length > 0) {
    await Promise.allSettled(mediaKeys.map(k => env.CLOUD_BACKUP_BUCKET.delete(k)));
  }

  console.log(`[purgeExpiredLobbyChat] deleted=${deleted} media=${mediaKeys.length} cutoff=${cutoff}`);
  return { deleted, media: mediaKeys.length };
}

// ── Pending token mint (Worker-only write + HMAC) ───────────

async function handlePendingTokenCreate(request, env, corsHeaders) {
  const idToken = getAuthUid(request);
  if (!idToken) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const firebaseUser = await verifyFirebaseUser(idToken, env);
  if (!firebaseUser?.localId) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : null;
  const name = typeof body.name === 'string' ? body.name.slice(0, 128) : null;
  const email = typeof body.email === 'string' ? body.email.slice(0, 256) : (firebaseUser.email || '');
  const photoURL = typeof body.photoURL === 'string' ? body.photoURL.slice(0, 1024) : null;
  const allowedIp = typeof body.allowedIp === 'string' && body.allowedIp.length <= 64
    ? body.allowedIp
    : null;

  const uid = firebaseUser.localId;
  const sessionId = crypto.randomUUID();
  const claimSecret = crypto.randomUUID();
  const csHash = await sha256Hex(claimSecret);
  const expiresAt = Date.now() + 300000;
  const hasToken = !!(idToken);

  let firebaseIdTokenEnc = null;
  let refreshTokenEnc = null;
  try {
    firebaseIdTokenEnc = await encryptTokenAes(idToken, sessionId);
    refreshTokenEnc = await encryptTokenAes(refreshToken, sessionId);
  } catch (e) {
    console.error('[handlePendingTokenCreate] encrypt failed:', e);
    return new Response(JSON.stringify({ error: 'Failed to encrypt tokens' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let ptHmac;
  try {
    ptHmac = await computePendingTokenHmac(env, {
      uid,
      sessionId,
      expiresAt,
      csHash,
      allowedIp,
      hasToken
    });
  } catch (e) {
    console.error('[handlePendingTokenCreate] HMAC failed:', e);
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const tokenPayload = {
    uid,
    email: email || '',
    name: name || (email ? String(email).split('@')[0] : 'User'),
    photoURL: photoURL || null,
    created_at: Date.now(),
    expires_at: expiresAt,
    claimed: false,
    allowed_ip: allowedIp,
    firebase_id_token_enc: firebaseIdTokenEnc,
    refresh_token_enc: refreshTokenEnc,
    has_token: hasToken,
    cs_hash: csHash,
    pt_hmac: ptHmac
  };

  const path = `pending_tokens/${uid}/${sessionId}`;
  const written = await adminPutDatabase(path, tokenPayload, env);
  if (!written) {
    return new Response(JSON.stringify({ error: 'Failed to store pending token' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  console.log(`[handlePendingTokenCreate] Minted pending token for uid=${uid}`);
  return new Response(JSON.stringify({
    claimToken: `${uid}:${sessionId}`,
    claimSecret
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ── Claim token handler ─────────────────────────────────────

async function handleClaimToken(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { uid, sessionId, claimSecret } = body;
  if (!uid || !sessionId || !claimSecret) {
    return new Response(JSON.stringify({
      error: 'Missing required fields: uid, sessionId, claimSecret'
    }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const idToken = await getAdminIdToken(uid, env);
    const path = `pending_tokens/${uid}/${sessionId}`;
    // Prefer rule-bypass read so claim works even if owner rules change
    let tokenData = null;
    try {
      const accessToken = await getRtdbAccessToken(env);
      const url = `${getDatabaseUrl(env)}/${path}.json?access_token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(url);
      if (res.ok) tokenData = await res.json();
    } catch (e) {
      console.warn('[handleClaimToken] access_token read failed, falling back to idToken', e);
      tokenData = await adminGetDatabase(path, idToken, env);
    }

    if (!tokenData || tokenData === null) {
      console.log(`[handleClaimToken] Token not found: ${uid}/${sessionId}`);
      return new Response(JSON.stringify({ error: 'Token not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check already claimed
    if (tokenData.claimed === true) {
      console.log(`[handleClaimToken] Token already claimed: ${uid}/${sessionId}`);
      return new Response(JSON.stringify({ error: 'Token already claimed' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check expired
    if (tokenData.expires_at) {
      const now = Date.now();
      if (now > tokenData.expires_at) {
        console.log(`[handleClaimToken] Token expired: ${uid}/${sessionId}`);
        return new Response(JSON.stringify({ error: 'Token expired' }), {
          status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Verify Worker HMAC (fail closed — no unsigned legacy tokens)
    const hmacOk = await verifyPendingTokenHmac(env, tokenData, uid, sessionId);
    if (!hmacOk) {
      console.error(`[handleClaimToken] Invalid or missing pt_hmac for ${uid}/${sessionId}`);
      return new Response(JSON.stringify({ error: 'Invalid token integrity' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify claimSecret against stored cs_hash
    const expectedHash = tokenData.cs_hash;
    if (!expectedHash) {
      console.error(`[handleClaimToken] Missing cs_hash in token: ${uid}/${sessionId}`);
      return new Response(JSON.stringify({
        error: 'Token missing security hash — incompatible version'
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const computedHash = await sha256Hex(claimSecret);
    if (computedHash !== expectedHash) {
      console.error(`[handleClaimToken] Secret mismatch for ${uid}/${sessionId}`);
      return new Response(JSON.stringify({ error: 'Invalid claim secret' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // IP binding — fail closed when allowed_ip is set
    if (tokenData.allowed_ip) {
      const requestIp = request.headers.get('CF-Connecting-IP')
        || (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim()
        || '';
      if (!requestIp || requestIp === 'unknown') {
        console.warn(`[handleClaimToken] Could not verify IP for ${uid}/${sessionId} — rejecting`);
        return new Response(JSON.stringify({ error: 'Unable to verify client IP' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (requestIp !== tokenData.allowed_ip) {
        console.warn(`[handleClaimToken] IP mismatch for ${uid}/${sessionId}: bound=${tokenData.allowed_ip} got=${requestIp}`);
        return new Response(JSON.stringify({ error: 'IP binding mismatch' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Mark claimed for the browser poller (login page listens for claimed===true).
    // Strip secrets so the node is single-use even if it remains briefly.
    const marked = await adminPutDatabase(path, {
      claimed: true,
      claimed_at: Date.now(),
      uid: tokenData.uid || uid
    }, env);
    if (!marked) {
      console.error(`[handleClaimToken] Failed to mark token claimed: ${uid}/${sessionId}`);
      // Fall back to delete so the token cannot be reused
      await adminDeleteDatabase(path, idToken, env);
    }

    console.log(`[handleClaimToken] Token claimed: ${uid}/${sessionId}`);

    return new Response(JSON.stringify({
      uid: tokenData.uid || uid,
      email: tokenData.email || '',
      name: tokenData.name || null,
      photoURL: tokenData.photoURL || null,
      firebase_id_token_enc: tokenData.firebase_id_token_enc || null,
      refresh_token_enc: tokenData.refresh_token_enc || null,
      firebase_id_token: tokenData.firebase_id_token || null,
      refresh_token: tokenData.refresh_token || null,
      has_token: !!(tokenData.has_token || tokenData.firebase_id_token_enc || tokenData.firebase_id_token),
      expires_at: tokenData.expires_at || null,
      claimed: true
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[handleClaimToken] Internal error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
