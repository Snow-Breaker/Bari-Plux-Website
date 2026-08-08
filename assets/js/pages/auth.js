// login1.html page logic. Externalized from an inline <script> (was CSP
// script-src 'unsafe-inline'). Auth/session/claim-flow logic is byte-for-byte
// unchanged from the prior inline version - the only changes in this file are
// mechanical: every dynamically-injected onclick="..." attribute has been
// replaced with an addEventListener() call wired right after the innerHTML
// that creates it, and the previously-inline static onclick="..." attributes
// on the page's own markup (tabs, password-toggle buttons, forgot/back links)
// are now wired here too, at the same point in the load order the original
// inline <script> ran (right after the page markup, no defer/async).

// ==================== DESKTOP APP EMBED ====================
function isAppEmbed() {
    try {
        if (new URLSearchParams(window.location.search).get('app') === '1') return true;
        return !!(window.chrome && window.chrome.webview);
    } catch (e) { return false; }
}

function isDesktopFlow() {
    try {
        if (new URLSearchParams(window.location.search).get('desktop') === '1') return true;
        // Survives OAuth redirects that drop ?desktop=1
        return sessionStorage.getItem('desktop_login_flow') === '1'
            || sessionStorage.getItem('discord_desktop_flow') === '1'
            || sessionStorage.getItem('github_desktop_flow') === '1';
    } catch (e) { return false; }
}

function markDesktopFlowIfNeeded() {
    try {
        if (new URLSearchParams(window.location.search).get('desktop') === '1') {
            sessionStorage.setItem('desktop_login_flow', '1');
        }
    } catch (e) {}
}

// ==================== PENDING TOKEN ====================
// Created by Worker (HMAC + rule-bypass write). Client cannot .set() pending_tokens.

async function createPendingToken(user) {
    if (!firebaseInitialized || !auth) {
        console.error('[createPendingToken] Firebase auth not initialized');
        return null;
    }
    try {
        const fbUser = firebase.auth().currentUser;
        if (!fbUser) {
            console.warn('[createPendingToken] firebase.auth().currentUser is null');
            return null;
        }

        const firebaseIdToken = await fbUser.getIdToken(true);
        const refreshToken = fbUser.refreshToken ?? null;

        let clientIp = null;
        try {
            const ipRes = await fetch('https://ipapi.co/json/', {
                signal: AbortSignal.timeout(3000)
            });
            const ipData = await ipRes.json();
            clientIp = ipData.ip || null;
        } catch (e) {
            console.warn('[createPendingToken] could not fetch IP', e);
        }

        const response = await fetch('https://discord-auth-worker.bariattaye2.workers.dev/pending-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + firebaseIdToken
            },
            body: JSON.stringify({
                refreshToken,
                name: user.name || null,
                email: user.email || fbUser.email || '',
                photoURL: user.photoURL || fbUser.photoURL || null,
                allowedIp: clientIp
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[createPendingToken] Worker mint failed:', response.status, errText);
            return null;
        }

        const data = await response.json();
        if (!data.claimToken || !data.claimSecret) {
            console.error('[createPendingToken] Worker response missing claim fields');
            return null;
        }

        currentClaimSecret = data.claimSecret;
        console.log('[createPendingToken] Worker minted pending token');
        return { claimToken: data.claimToken, claimSecret: data.claimSecret };
    } catch (e) {
        console.error('[createPendingToken] Failed:', e);
        return null;
    }
}

// ==================== DESKTOP LOGIN FLOW ====================
let activeTokenListener = null;
let activeTimeoutId = null;

function cleanupDesktopLogin() {
    if (activeTokenListener) {
        activeTokenListener();
        activeTokenListener = null;
    }
    if (activeTimeoutId) {
        clearTimeout(activeTimeoutId);
        activeTimeoutId = null;
    }
}

function showDesktopConnectingView(base64Claim, claimSecret) {
    const secretParam = claimSecret ? `&secret=${claimSecret}` : '';
    document.getElementById('loginFormView').style.display = 'none';
    document.getElementById('loggedInView').classList.add('active');

    // Keep profile card visible; only swap/insert the desktop open-app panel
    let panel = document.getElementById('desktopOpenAppPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'desktopOpenAppPanel';
        panel.style.cssText = 'text-align:center;padding:20px 12px 8px;border-top:1px solid var(--border,rgba(255,255,255,0.08));margin-top:16px;';
        document.getElementById('loggedInView').appendChild(panel);
    }
    panel.innerHTML = `
            <div style="font-size:1.5rem;margin-bottom:8px;">🔗</div>
            <div style="font-size:1rem;font-weight:600;margin-bottom:6px;">
                Ready to open Bari Plux App
            </div>
            <div style="color:var(--muted);font-size:0.85rem;margin-bottom:18px;">
                Click below to launch the app and complete sign-in.
            </div>
            <a href="baripluxtoolwin://login?token=${base64Claim}${secretParam}"
               id="openAppBtn"
               style="display:inline-block;padding:14px 32px;background:var(--accent);
                      color:white;border-radius:12px;font-weight:600;font-size:1rem;
                      text-decoration:none;margin-bottom:12px;">
                🚀 Open Bari Plux App
            </a>
            <br>
            <a href="baripluxtool23://login?token=${base64Claim}${secretParam}"
               style="font-size:0.8rem;color:var(--muted);margin-top:8px;display:inline-block;">
                Using the 2.3 build? Open it here
            </a>
            <br>
            <a href="bptv223://login?token=${base64Claim}${secretParam}"
               style="font-size:0.8rem;color:var(--muted);margin-top:4px;display:inline-block;">
                Try alternate link
            </a>
            <div id="openAppStatus" style="margin-top:16px;color:var(--muted);font-size:0.85rem;">
                <div class="loading-spinner" style="margin:0 auto 8px;"></div>
                Waiting for app to respond...
            </div>
    `;
}

function showDesktopClaimedView() {
    try {
        sessionStorage.removeItem('desktop_login_flow');
        sessionStorage.removeItem('discord_desktop_flow');
        sessionStorage.removeItem('github_desktop_flow');
    } catch (e) {}
    const status = document.getElementById('openAppStatus');
    const btn = document.getElementById('openAppBtn');
    if (btn) {
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
    }
    if (status) {
        status.innerHTML = `
            <span style="color:var(--success,#4CAF50);font-weight:600;font-size:1rem;">
                ✅ Successfully signed in!
            </span>
            <br>
            <span id="closeStatusNote" style="font-size:0.85rem;color:var(--muted);margin-top:4px;display:block;">
                Closing this tab...
            </span>
        `;
    }
    const view = document.getElementById('loggedInView');
    if (view && !view.querySelector('.btn-logout')) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'text-align:center;margin-top:8px;';
        wrap.innerHTML = `<button type="button" class="btn-logout" style="margin-top:20px;"><i class="fas fa-sign-out-alt"></i> Logout</button>`;
        const logoutBtn = wrap.querySelector('.btn-logout');
        if (logoutBtn) logoutBtn.addEventListener('click', doWebsiteLogout);
        view.appendChild(wrap);
    }

    // Best-effort auto-close: browsers only close tabs the page can prove it
    // "owns" (Chrome/Edge use no-back-history as the heuristic, which covers the
    // tab the desktop app opened via Process.Start). If a browser refuses the
    // close, execution continues past it and the note below falls back to the
    // manual-close instruction instead of staying stuck on "Closing this tab...".
    setTimeout(function () {
        window.close();
        const note = document.getElementById('closeStatusNote');
        if (note) note.textContent = 'You can close this tab.';
    }, 1200);
}

function showDesktopTokenError(retryFn) {
    const status = document.getElementById('openAppStatus');
    if (status) {
        status.innerHTML = `
            <span style="color:var(--danger);font-weight:600;">
                ⚠️ Could not create login token.
            </span>
            <br>
            <span style="font-size:0.8rem;color:var(--muted);">
                Check your internet connection and try again.
            </span>
            <br><br>
            <button type="button" class="btn-retry-login"
                style="padding:10px 24px;background:var(--accent);color:white;
                       border:none;border-radius:8px;cursor:pointer;
                       font-family:'Poppins',sans-serif;font-size:0.85rem;">
                ↺ Retry
            </button>
        `;
        const retryBtn = status.querySelector('.btn-retry-login');
        if (retryBtn) retryBtn.addEventListener('click', retryFn);
    }
}

function showDesktopTimeoutView(base64Claim, retryFn) {
    cleanupDesktopLogin();
    const status = document.getElementById('openAppStatus');
    const btn = document.getElementById('openAppBtn');
    if (btn) btn.style.opacity = '0.5';
    if (status) {
        status.innerHTML = `
            <span style="color:var(--warning,#FFA000);font-weight:600;">
                ⏱️ The app did not respond.
            </span>
            <br>
            <span style="font-size:0.8rem;color:var(--muted);">
                Make sure Bari Plux is installed and running.
            </span>
            <br><br>
            <button type="button" class="btn-copy-token"
                style="padding:8px 18px;background:var(--glass-bg);color:var(--text);
                       border:1px solid var(--glass-border);border-radius:8px;
                       cursor:pointer;font-family:'Poppins',sans-serif;
                       font-size:0.82rem;margin-right:8px;">
                📋 Copy Token
            </button>
            <button type="button" class="btn-retry-login"
                style="padding:8px 18px;background:var(--accent);color:white;
                       border:none;border-radius:8px;cursor:pointer;
                       font-family:'Poppins',sans-serif;font-size:0.82rem;">
                ↺ Retry
            </button>
        `;
        const copyBtn = status.querySelector('.btn-copy-token');
        if (copyBtn) copyBtn.addEventListener('click', function () {
            navigator.clipboard.writeText('BPT23_LOGIN:' + base64Claim).then(function () {
                copyBtn.textContent = '✅ Copied!';
            });
        });
        const retryBtn = status.querySelector('.btn-retry-login');
        if (retryBtn) retryBtn.addEventListener('click', retryFn);
    }
}

function startDesktopLoginFlow(user) {
    cleanupDesktopLogin();

    createPendingToken(user).then(result => {
        if (!result || !result.claimToken) {
            showDesktopTokenError(function() { startDesktopLoginFlow(user); });
            return;
        }
        const { claimToken, claimSecret } = result;

        const base64Claim = btoa(claimToken);
        const parts = claimToken.split(':');
        const uid = parts[0];
        const sessionId = parts[1];

        // Show UI with clickable button (browser requires user gesture for protocol links)
        showDesktopConnectingView(base64Claim, claimSecret);

        if (!database) {
            document.getElementById('openAppStatus').innerHTML =
                '<span style="color:var(--danger);">⚠️ Database unavailable — token polling disabled.</span>';
            return;
        }

        const tokenRef = database.ref('pending_tokens/' + uid + '/' + sessionId);
        let claimed = false;
        let sawToken = false;

        const listener = tokenRef.on('value', function(snapshot) {
            const data = snapshot.val();
            if (data) sawToken = true;
            // claimed===true (preferred) OR node removed after we saw it (legacy worker delete)
            if (!claimed && ((data && data.claimed === true) || (sawToken && data === null))) {
                claimed = true;
                cleanupDesktopLogin();
                showDesktopClaimedView();
            }
        });

        activeTokenListener = function() { tokenRef.off('value', listener); };

        // Browsers often block custom-protocol without a gesture; still try once.
        setTimeout(function() {
            const btn = document.getElementById('openAppBtn');
            if (btn) {
                try { btn.click(); } catch (e) {}
            }
        }, 500);

        activeTimeoutId = setTimeout(function() {
            if (!claimed) {
                showDesktopTimeoutView(base64Claim, function() { startDesktopLoginFlow(user); });
            }
        }, 300000);
    });
}

// ==================== NOTIFY DESKTOP APP (EMBED) ====================
function notifyDesktopApp(user) {
    const payload = { type: 'bariplux-login-success', id: user.id, name: user.name, email: user.email || '', loginMethod: user.loginMethod || 'website', photoURL: user.photoURL || null };
    try {
        if (window.chrome && window.chrome.webview) { window.chrome.webview.postMessage(JSON.stringify(payload)); return true; }
    } catch (e) {}
    return false;
}

function showAppSigningInView() {
    const view = document.getElementById('loggedInView');
    if (!view) return;
    document.getElementById('loginFormView').style.display = 'none';
    view.classList.add('active');
    view.innerHTML = '<div class="app-signing-in"><div class="loading-spinner"></div><p>Signing you in to Bari Plux Tool...</p></div>';
}

// ==================== FIREBASE CONFIGURATION ====================
// Use default firebaseapp.com authDomain so Google OAuth uses the
// auto-registered redirect URI (...firebaseapp.com/__/auth/handler).
// Custom authDomain (login.bariplux.com) requires manually adding
// https://login.bariplux.com/__/auth/handler in Google Cloud Console;
// GitHub/Discord no longer use Firebase redirect providers.
const firebaseConfig = {
    apiKey: "AIzaSyBH_t3Uue7fbb-DahwjSJGjG2-quCqiLEs",
    authDomain: 'baripluxwebsite.firebaseapp.com',
    databaseURL: "https://baripluxwebsite-default-rtdb.firebaseio.com",
    projectId: "baripluxwebsite",
    storageBucket: "baripluxwebsite.firebasestorage.app",
    messagingSenderId: "280043766563",
    appId: "1:280043766563:web:409e6b78c1c24b568fc296"
};

const DISCORD_CLIENT_ID = '1504446428959871127';

let auth = null, database = null, firebaseInitialized = false, currentUser = null, currentClaimSecret = null;

function initFirebase() {
    try {
        if (firebaseConfig.apiKey === "YOUR_API_KEY") {
            document.getElementById('firebaseConfigNote').style.display = 'block';
            return false;
        }
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        try { database = firebase.database(); } catch(e) {
            console.error('Firebase database initialization failed. Check that databaseURL is set in firebaseConfig.', e);
        }
        firebaseInitialized = true;
        document.getElementById('firebaseConfigNote').style.display = 'none';
        return true;
    } catch (error) { console.error("Firebase initialization error:", error); return false; }
}

// ==================== LOCATION FETCH ====================
async function fetchLocation() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        return {
            country: data.country_name || null,
            countryCode: data.country_code || null,
            city: data.city || null,
            ip: data.ip || null
        };
    } catch (e) {
        console.log('Location fetch failed:', e);
        return { country: null, countryCode: null, city: null, ip: null };
    }
}

// ==================== FIREBASE DATABASE SYNC ====================
async function syncLoginToFirebase(user) {
    if (!firebaseInitialized || !database) return;
    // Discord users are synced in handleDiscordCallback() — skip here
    if (user.loginMethod === 'discord') return;
    try {
        const location = await fetchLocation();

        const isDiscord = user.loginMethod === 'discord';
        const nodePath = isDiscord ? 'discordUsers/' + user.id : 'users/' + user.id;

        const data = {
            name: user.name,
            email: user.email,
            loginMethod: user.loginMethod,
            loginTime: user.loginTime || new Date().toISOString(),
            photoURL: user.photoURL || null,
            lastActive: firebase.database.ServerValue.TIMESTAMP,
            platform: 'website',
            country: location.country,
            countryCode: location.countryCode,
            city: location.city,
            ip: location.ip
        };

        const userRef = database.ref(nodePath);
        userRef.update(data).then(() => {
            console.log('Login synced to Firebase! (' + nodePath + ')');
        }).catch(err => {
            console.log('Firebase sync note:', err.code);
            if (err.code === 'PERMISSION_DENIED') {
                showNotification('Discord account sync failed. Your login succeeded but profile data could not be saved. Please contact support.', 'error');
            }
        });
    } catch (error) {
        console.error("Sync error:", error);
    }
}

// ==================== NOTIFICATIONS ====================
function showNotification(message, type, duration) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i><span>${message}</span>`;
    document.body.appendChild(notification);
    const ms = duration || (type === 'error' ? 5000 : 2700);
    setTimeout(() => { notification.style.animation = 'slideIn 0.3s ease reverse forwards'; setTimeout(() => notification.remove(), 300); }, ms);
}

function showFormError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg; el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 5000);
}

function clearFormError(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

function getFirebaseErrorMessage(code) {
    const messages = {
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password',
        'auth/invalid-credential': 'Invalid email or password',
        'auth/email-already-in-use': 'This email is already registered',
        'auth/weak-password': 'Password must be at least 6 characters',
        'auth/invalid-email': 'Invalid email address',
        'auth/too-many-requests': 'Too many attempts. Please try again later',
        'auth/network-request-failed': 'Network error. Check your connection',
        'auth/operation-not-allowed': 'This login method is not enabled in Firebase'
    };
    return messages[code] || 'An error occurred. Please try again';
}

const authErrorMessages = {
    'auth/account-exists-with-different-credential': null,
    'auth/popup-closed-by-user': 'Login cancelled. Please try again.',
    'auth/popup-blocked': 'Popup was blocked. Please allow popups for this site, or try Discord.',
    'auth/network-request-failed': '⚠️ Network error. Check your connection (or try Discord if Google is blocked).',
    'auth/too-many-requests': '⚠️ Too many attempts. Please wait a moment.',
    'auth/user-disabled': '⚠️ This account has been disabled.',
    'auth/cancelled-popup-request': null,
    'auth/internal-error': '⚠️ Google/GitHub sign-in failed (popup/script blocked). Try again, allow popups, or use Discord.',
    'auth/unauthorized-domain': '⚠️ This domain is not authorized for Firebase Auth. Contact support.',
    'auth/operation-not-allowed': '⚠️ This sign-in method is disabled in Firebase. Try Discord or email.',
};

async function handleAuthError(error, context) {
    console.error('Auth error [' + context + ']:', error);

    if (error.code === 'auth/account-exists-with-different-credential') {
        const email = error.customData?.email || '';
        let providerName = 'another provider';
        try {
            const methods = await firebase.auth().fetchSignInMethodsForEmail(email);
            providerName = methods.includes('google.com') ? 'Google' :
                          methods.includes('github.com') ? 'GitHub' :
                          methods[0] || 'another provider';
        } catch (e) {}

        showNotification(
            '⚠️ This email (' + email + ') is already linked to ' + providerName + '. ' +
            'Please sign in with ' + providerName + '.',
            'warning',
            8000
        );

        const btnId = providerName === 'Google' ? 'btnGoogleLogin' :
                      providerName === 'GitHub' ? 'btnGitHubLogin' : null;
        if (btnId) {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.classList.add('highlight-pulse');
                setTimeout(function() { btn.classList.remove('highlight-pulse'); }, 3000);
            }
        }
        return;
    }

    if (error.code === 'auth/cancelled-popup-request') return;

    const message = authErrorMessages[error.code] ||
        'Login failed: ' + error.message;
    if (message) showNotification(message, 'error');
}

async function signInWithOAuthProvider(provider, preferRedirect) {
    markDesktopFlowIfNeeded();
    // bariplux.com (GitHub Pages) has NO /__/auth/handler — never start redirect from apex.
    // login.bariplux.com / web.app / firebaseapp are fine for redirect.
    const host = location.hostname;
    const redirectSafe = host === 'login.bariplux.com'
        || host === 'baripluxwebsite.web.app'
        || host.endsWith('.firebaseapp.com')
        || host === 'localhost'
        || host === '127.0.0.1';
    // GitHub popup is unreliable (often auth/popup-blocked or auth/internal-error).
    const forceRedirect = preferRedirect || isAppEmbed()
        || (provider && provider.providerId === 'github.com');

    if (forceRedirect) {
        if (!redirectSafe) {
            showNotification(
                'Open login on login.bariplux.com to use GitHub sign-in.',
                'error',
                7000
            );
            return null;
        }
        try { sessionStorage.setItem('oauth_pending_redirect', provider.providerId || 'github.com'); } catch (e) {}
        await auth.signInWithRedirect(provider);
        return null;
    }

    try {
        return await auth.signInWithPopup(provider);
    } catch (error) {
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/internal-error') {
            console.warn('[OAuth] Popup failed:', error.code);
            if (redirectSafe) {
                try { sessionStorage.setItem('oauth_pending_redirect', provider.providerId || '1'); } catch (e) {}
                showNotification('Popup blocked — continuing with full-page sign-in…', 'warning', 5000);
                await auth.signInWithRedirect(provider);
                return null;
            }
            showNotification(
                'Popup blocked — allow popups for this page, then try Google/GitHub again.',
                'warning',
                8000
            );
            return null;
        }
        throw error;
    }
}

function applyOAuthUser(user, loginMethod) {
    const userData = {
        id: user.uid,
        name: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
        email: user.email || '',
        loginMethod: loginMethod || user.providerData[0]?.providerId || 'firebase',
        loginTime: new Date().toISOString(),
        photoURL: user.photoURL
    };
    localStorage.setItem('bariplux_user', JSON.stringify(userData));
    showLoggedInView(userData);
    return userData;
}

// ==================== TAB SWITCHING ====================
function switchMainTab(tab) {
    document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
    document.getElementById('mainTab-' + tab).classList.add('active');
    document.getElementById(tab + 'Form').classList.add('active');
}

function switchSubTab(tab) {
    document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sub-form').forEach(f => f.classList.remove('active'));
    document.getElementById('subTab-' + tab).classList.add('active');
    document.getElementById('subForm-' + tab).classList.add('active');
}

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') { input.type = 'text'; icon.className = 'fas fa-eye-slash'; }
    else { input.type = 'password'; icon.className = 'fas fa-eye'; }
}

// ==================== LOGGED IN / OUT VIEWS ====================
function paintLoggedInProfile(user) {
    document.getElementById('loginFormView').style.display = 'none';
    document.getElementById('loggedInView').classList.add('active');
    const displayName = user.name || user.displayName || user.username ||
        (user.email ? String(user.email).split('@')[0] : 'User');
    let photo = user.photoURL || user.photoUrl || user.avatar || '';
    if (photo && !/^https?:\/\//i.test(String(photo))) {
        let discordId = user.discordId || '';
        try {
            const d = JSON.parse(localStorage.getItem('discord_user') || 'null');
            if (d && d.id) discordId = d.id;
            if (d && d.avatar && String(photo).indexOf('/') === -1) photo = d.avatar;
        } catch (e) {}
        if (discordId && String(photo).indexOf('/') === -1 && String(photo).length >= 16) {
            photo = 'https://cdn.discordapp.com/avatars/' + discordId + '/' + photo + '.png?size=128';
        }
    }
    const nameEl = document.getElementById('loginUserName');
    const emailEl = document.getElementById('loginUserEmail');
    const idEl = document.getElementById('loginUserId');
    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = user.email || '';
    if (idEl) idEl.textContent = user.id || user.uid || '—';
    const methodEl = document.getElementById('loginUserMethod');
    if (methodEl) {
        const m = String(user.loginMethod || '').toLowerCase();
        let label = '';
        if (m.indexOf('google') >= 0) label = 'Google';
        else if (m.indexOf('github') >= 0) label = 'GitHub';
        else if (m.indexOf('discord') >= 0) label = 'Discord';
        else if (m.indexOf('email') >= 0) label = 'Email';
        if (label) {
            methodEl.textContent = label;
            methodEl.hidden = false;
            methodEl.removeAttribute('hidden');
        } else {
            methodEl.hidden = true;
            methodEl.setAttribute('hidden', '');
        }
    }

    const avatarEl = document.getElementById('loginUserAvatar');
    const avatarImg = document.getElementById('loginUserAvatarImg');
    if (avatarEl) {
        if (photo && avatarImg) {
            avatarImg.src = photo;
            avatarImg.alt = '';
            avatarImg.style.display = 'block';
            avatarImg.referrerPolicy = 'no-referrer';
            Array.prototype.slice.call(avatarEl.childNodes).forEach(function (n) {
                if (n !== avatarImg) avatarEl.removeChild(n);
            });
            if (!avatarEl.contains(avatarImg)) avatarEl.appendChild(avatarImg);
        } else {
            if (avatarImg) avatarImg.style.display = 'none';
            avatarEl.textContent = displayName.charAt(0).toUpperCase();
        }
    }
    return displayName;
}

function showLoggedInView(user) {
    currentUser = user;
    localStorage.setItem('bariplux_user', JSON.stringify(user));
    syncLoginToFirebase(user).catch(e => console.error(e));

    if (isAppEmbed()) {
        if (notifyDesktopApp(user)) { showAppSigningInView(); return; }
    }

    // Always show account card (name / method / logout) first
    paintLoggedInProfile(user);

    if (isDesktopFlow()) {
        startDesktopLoginFlow(user);
        return;
    }

    const tokenSection = document.getElementById('appTokenSection');
    if (isAppEmbed() || isDesktopFlow()) {
        if (tokenSection) tokenSection.style.display = 'none';
    } else {
        createPendingToken(user).then(result => {
            if (result && result.claimToken) {
                const { claimToken, claimSecret } = result;
                const base64Claim = btoa(claimToken);
                localStorage.setItem('bariplux_login_token',
                    'BPT23_LOGIN:' + base64Claim);
                if (claimSecret) localStorage.setItem('bariplux_login_secret', claimSecret);

                if (tokenSection) {
                    tokenSection.style.display = 'block';
                    const statusEl = document.getElementById('openAppStatus');
                    if (statusEl) {
                        statusEl.style.display = 'block';
                        statusEl.innerHTML = `
                            <div style="text-align:center;padding:10px 0;">
                                <button type="button" class="btn-open-app-fallback"
                                        style="display:inline-block;padding:12px 28px;
                                               background:var(--accent);color:white;
                                               border:none;border-radius:12px;
                                               font-weight:600;font-size:0.95rem;
                                               cursor:pointer;">
                                    🚀 Open Bari Plux App
                                </button>
                                <div style="margin-top:10px;font-size:0.8rem;
                                            color:var(--muted);">
                                    Click to launch the app and sign in automatically
                                </div>
                            </div>
                        `;
                        const openBtn = statusEl.querySelector('.btn-open-app-fallback');
                        if (openBtn) openBtn.addEventListener('click', handleOpenApp);
                    }
                }
            } else {
                if (tokenSection) {
                    tokenSection.style.display = 'block';
                    const statusEl = document.getElementById('openAppStatus');
                    if (statusEl) {
                        statusEl.style.display = 'block';
                        statusEl.innerHTML = '<span style="color:var(--danger);font-size:0.85rem;">⚠️ Could not connect to server. Please check your internet connection.</span>';
                    }
                }
            }
        });
    }
}

function showLoginFormView() {
    document.getElementById('loggedInView').classList.remove('active');
    document.getElementById('loginFormView').style.display = 'block';
}

// ==================== CHECK LOGIN STATUS ====================
function checkLoginStatus() {
    if (firebaseInitialized && auth) {
        auth.onAuthStateChanged((user) => {
            // Fresh read every time — stale closure was overwriting GitHub profile as "GitHub User"
            let storedUser = null;
            try { storedUser = localStorage.getItem('bariplux_user'); } catch (e) {}

            if (user) {
                // Block duplicate paint while GitHub code exchange is in progress
                if (window.__BPT_GH_LOGIN_IN_PROGRESS) return;
                // OAuth callbacks (?code=) own first paint for custom-token providers
                if (new URLSearchParams(location.search).get('code') &&
                    (user.uid.startsWith('discord_') || user.uid.startsWith('github_'))) {
                    return;
                }
                if (user.uid.startsWith('discord_') || user.uid.startsWith('github_')) {
                    let userData = null;
                    try {
                        if (storedUser) {
                            const parsed = JSON.parse(storedUser);
                            if (parsed && parsed.id === user.uid) userData = parsed;
                        }
                    } catch (e) {}
                    if (!userData) {
                        const isGh = user.uid.startsWith('github_');
                        let photoURL = user.photoURL || null;
                        if (isGh) {
                            try {
                                const g = JSON.parse(localStorage.getItem('github_user') || 'null');
                                if (g) {
                                    photoURL = g.avatar_url || photoURL;
                                    userData = {
                                        id: user.uid,
                                        githubId: g.id,
                                        name: g.name || g.login || user.displayName || 'GitHub User',
                                        email: user.email || g.email || '',
                                        loginMethod: 'github',
                                        loginTime: new Date().toISOString(),
                                        photoURL
                                    };
                                }
                            } catch (e) {
                                userData = null;
                            }
                        } else {
                            try {
                                const d = JSON.parse(localStorage.getItem('discord_user') || 'null');
                                if (d && d.id && d.avatar) {
                                    photoURL = String(d.avatar).startsWith('http')
                                        ? d.avatar
                                        : ('https://cdn.discordapp.com/avatars/' + d.id + '/' + d.avatar + '.png?size=128');
                                }
                                userData = {
                                    id: user.uid,
                                    discordId: d && d.id ? d.id : undefined,
                                    name: (d && (d.global_name || d.username)) || user.displayName || 'Discord User',
                                    email: user.email || (d && d.email) || '',
                                    loginMethod: 'discord',
                                    loginTime: new Date().toISOString(),
                                    photoURL
                                };
                            } catch (e) {
                                userData = null;
                            }
                        }
                        if (!userData) {
                            userData = {
                                id: user.uid,
                                name: user.displayName || (isGh ? 'GitHub User' : 'Discord User'),
                                email: user.email || '',
                                loginMethod: isGh ? 'github' : 'discord',
                                loginTime: new Date().toISOString(),
                                photoURL
                            };
                        }
                    }
                    localStorage.setItem('bariplux_user', JSON.stringify(userData));
                    showLoggedInView(userData);
                    return;
                }
                const name = user.displayName || (user.email ? user.email.split('@')[0] : user.uid);
                const firebaseUser = { id: user.uid, name, email: user.email, loginMethod: user.providerData[0]?.providerId || 'firebase', loginTime: new Date().toISOString(), photoURL: user.photoURL };
                localStorage.setItem('bariplux_user', JSON.stringify(firebaseUser));
                showLoggedInView(firebaseUser);
            } else if (storedUser) {
                const parsed = JSON.parse(storedUser);
                if (parsed.loginMethod === 'discord' || parsed.loginMethod === 'github') { showLoggedInView(parsed); }
                else { localStorage.removeItem('bariplux_user'); showLoginFormView(); }
            } else { showLoginFormView(); }
        });
    } else {
        try {
            const storedUser = localStorage.getItem('bariplux_user');
            if (storedUser) showLoggedInView(JSON.parse(storedUser));
            else showLoginFormView();
        } catch (e) { showLoginFormView(); }
    }
}

// ==================== GOOGLE LOGIN ====================
document.getElementById('btnGoogleLogin').addEventListener('click', async function() {
    const btn = this;
    if (firebaseInitialized && auth) {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        provider.addScope('email');
        provider.addScope('profile');
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner" style="border-color:#333;border-top-color:#666;"></div> Connecting...';
        try {
            const result = await signInWithOAuthProvider(provider, false);
            if (result && result.user) {
                applyOAuthUser(result.user, 'firebase.google');
            } else {
                btn.disabled = false;
                btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google"> Sign in with Google';
            }
        } catch (error) {
            btn.disabled = false;
            btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google"> Sign in with Google';
            await handleAuthError(error, 'Google');
        }
    } else {
        showNotification('Firebase is not available. Please ensure internet connection and try again.', 'error');
    }
});

// ==================== GITHUB LOGIN (full-page OAuth via Worker) ====================
const GITHUB_OAUTH_CLIENT_ID = 'Ov23liYBk9X5ykqEvjCA';
const GITHUB_BTN_HTML = '<i class="fab fa-github" style="font-size:1.2rem;"></i> Sign in with GitHub';

function githubRedirectUri() {
    // Must exactly match GitHub OAuth App Authorization callback URL
    return 'https://login.bariplux.com/';
}

function resetGithubButton() {
    const btn = document.getElementById('btnGitHubLogin');
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = GITHUB_BTN_HTML;
}

function buildGithubAuthUrl(state) {
    const params = new URLSearchParams({
        client_id: GITHUB_OAUTH_CLIENT_ID,
        redirect_uri: githubRedirectUri(),
        scope: 'read:user user:email',
        state,
        allow_signup: 'true',
        // Always show GitHub account picker so users can switch accounts
        prompt: 'select_account'
    });
    return 'https://github.com/login/oauth/authorize?' + params.toString();
}

async function finishGithubLoginWithCode(code, state) {
    const savedState = sessionStorage.getItem('github_oauth_state');
    if (!savedState || !state || state !== savedState) {
        throw new Error('GitHub OAuth state mismatch. Please try again.');
    }
    sessionStorage.removeItem('github_oauth_state');

    const wasDesktopFlow = sessionStorage.getItem('github_desktop_flow') === '1'
        || sessionStorage.getItem('desktop_login_flow') === '1'
        || new URLSearchParams(location.search).get('desktop') === '1';
    sessionStorage.removeItem('github_desktop_flow');

    window.__BPT_GH_LOGIN_IN_PROGRESS = true;
    showNotification('Connecting GitHub account...', 'success');

    try {
        const response = await fetch('https://discord-auth-worker.bariattaye2.workers.dev/github', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirectUri: githubRedirectUri() }),
            signal: AbortSignal.timeout(15000)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(
                (typeof payload.detail === 'string' ? payload.detail : null)
                || payload.error
                || 'GitHub worker request failed'
            );
        }
        if (!payload.customToken) throw new Error('GitHub custom token missing');
        if (!firebaseInitialized || !auth) throw new Error('Firebase is not available');

        const gh = payload.githubUser || {};
        try { localStorage.setItem('github_user', JSON.stringify(gh)); } catch (e) {}

        await auth.signInWithCustomToken(payload.customToken);
        const firebaseUser = auth.currentUser;

        const displayName = gh.name || gh.login || 'GitHub User';
        const photoURL = gh.avatar_url || null;
        if (firebaseUser) {
            try {
                await firebaseUser.updateProfile({
                    displayName: displayName,
                    photoURL: photoURL || undefined
                });
            } catch (e) {
                console.warn('[github] updateProfile failed', e);
            }
        }

        const userData = {
            id: firebaseUser ? firebaseUser.uid : ('github_' + gh.id),
            githubId: gh.id,
            name: displayName,
            email: gh.email || ((gh.login || 'user') + '@users.noreply.github.com'),
            loginMethod: 'github',
            loginTime: new Date().toISOString(),
            photoURL: photoURL
        };
        localStorage.setItem('bariplux_user', JSON.stringify(userData));

        if (wasDesktopFlow) {
            try { sessionStorage.setItem('desktop_login_flow', '1'); } catch (e) {}
        }

        window.__BPT_GH_LOGIN_IN_PROGRESS = false;
        showLoggedInView(userData);
        resetGithubButton();
        return userData;
    } catch (error) {
        window.__BPT_GH_LOGIN_IN_PROGRESS = false;
        throw error;
    }
}

function handleGithubLogin() {
    // Canonical host only — otherwise GitHub rejects redirect_uri
    if (location.hostname !== 'login.bariplux.com') {
        window.location.replace('https://login.bariplux.com/' + (location.search || ''));
        return;
    }

    markDesktopFlowIfNeeded();
    const state = crypto.randomUUID();
    try {
        sessionStorage.setItem('github_oauth_state', state);
        if (isDesktopFlow()) sessionStorage.setItem('github_desktop_flow', '1');
    } catch (e) {}

    window.location.href = buildGithubAuthUrl(state);
}

async function handleGithubCallback() {
    const params = new URLSearchParams(window.location.search);
    const oauthErr = params.get('error');
    const code = params.get('code');
    const state = params.get('state');

    if (oauthErr) {
        const desc = params.get('error_description') || oauthErr;
        showNotification('GitHub OAuth error: ' + decodeURIComponent(String(desc).replace(/\+/g, ' ')), 'error', 10000);
        window.history.replaceState({}, document.title, '/' + (isDesktopFlow() ? '?desktop=1' : ''));
        resetGithubButton();
        return;
    }

    if (!code) return;

    const savedState = sessionStorage.getItem('github_oauth_state');
    if (!savedState) return;

    try {
        await finishGithubLoginWithCode(code, state);
        window.history.replaceState({}, document.title, '/' + (isDesktopFlow() ? '?desktop=1' : ''));
    } catch (error) {
        console.error('GitHub login error:', error);
        window.history.replaceState({}, document.title, '/' + (isDesktopFlow() ? '?desktop=1' : ''));
        showNotification('GitHub login failed: ' + (error.message || 'Unknown error'), 'error', 10000);
        resetGithubButton();
    }
}

document.getElementById('btnGitHubLogin').addEventListener('click', function(e) {
    e.preventDefault();
    const btn = this;
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner"></div> Redirecting to GitHub...';
    try {
        handleGithubLogin();
    } catch (error) {
        resetGithubButton();
        handleAuthError(error, 'GitHub');
    }
});

// ── PKCE helpers ──────────────────────────────────────────
function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// ── Discord login button handler ──────────────────────────
async function handleDiscordLogin() {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = crypto.randomUUID();

    // Save desktop flow state before leaving the page
    if (isDesktopFlow()) {
        sessionStorage.setItem('discord_desktop_flow', '1');
    }

    sessionStorage.setItem('discord_code_verifier', codeVerifier);
    sessionStorage.setItem('discord_oauth_state', state);

    const redirectUri = 'https://login.bariplux.com/';
    const params = new URLSearchParams({
        client_id: '1504446428959871127',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'identify email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    });

    window.location.href = `https://discord.com/api/oauth2/authorize?${params}`;
}

// ── Discord callback handler (runs on page load if ?code= present) ──
async function handleDiscordCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code) return; // not an OAuth callback
    // Don't steal GitHub (or other) ?code= callbacks
    const savedState = sessionStorage.getItem('discord_oauth_state');
    if (!savedState) return;
    if (!state || state !== savedState) {
        showNotification('Security error: OAuth state mismatch. Please try again.', 'error');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }
    sessionStorage.removeItem('discord_oauth_state');

    const codeVerifier = sessionStorage.getItem('discord_code_verifier');
    if (!codeVerifier) {
        showNotification('Session expired. Please try logging in again.', 'error');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }
    sessionStorage.removeItem('discord_code_verifier');

    // Save desktop flag BEFORE replaceState strips ?desktop=1
    const wasDesktopFlow = params.get('desktop') === '1' ||
                           sessionStorage.getItem('discord_desktop_flow') === '1';
    sessionStorage.removeItem('discord_desktop_flow');

    const redirectUri = 'https://login.bariplux.com/';

    // Show loading state
    showNotification('Connecting Discord account...', 'success');

    try {
        // Call Cloudflare Worker with 10s timeout
        const response = await fetch('https://discord-auth-worker.bariattaye2.workers.dev', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, codeVerifier, redirectUri }),
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Worker request failed');
        }

        const { customToken, discordUser } = await response.json();

        // Sign in to Firebase with custom token
        await firebase.auth().signInWithCustomToken(customToken);
        const firebaseUser = firebase.auth().currentUser;

        // Fire-and-forget — profile write is non-critical, don't block UI
        if (database) {
            database.ref(`discordUsers/${firebaseUser.uid}`).update({
                uid: firebaseUser.uid,
                discordId: discordUser.id,
                username: discordUser.username,
                email: discordUser.email || '',
                avatar: discordUser.avatar || '',
                provider: 'discord',
                lastLogin: Date.now()
            }).catch(function(err) {
                console.warn('Discord profile sync failed:', err);
            });
        } else {
            console.warn('Discord login: database not available, skipping RTDB profile save');
        }

        // Store locally and show UI immediately
        localStorage.setItem('discord_user', JSON.stringify(discordUser));
        window.history.replaceState({}, document.title, window.location.pathname);
        const avatarUrl = discordUser.avatar
            ? (String(discordUser.avatar).startsWith('http')
                ? discordUser.avatar
                : `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`)
            : null;
        const userData = {
            id: firebaseUser.uid,
            discordId: discordUser.id,
            name: discordUser.global_name || discordUser.username,
            email: discordUser.email || discordUser.username + '@discord',
            loginMethod: 'discord',
            loginTime: new Date().toISOString(),
            photoURL: avatarUrl
        };
        localStorage.setItem('bariplux_user', JSON.stringify(userData));

        // Ensure Firebase Auth state is settled before proceeding
        await new Promise(resolve => {
            const unsub = firebase.auth().onAuthStateChanged(u => {
                if (u) { unsub(); resolve(u); }
            });
            setTimeout(() => { unsub(); resolve(null); }, 3000);
        });

        if (wasDesktopFlow) {
            startDesktopLoginFlow(userData);
        } else {
            showLoggedInView(userData);
        }

    } catch (error) {
        console.error('Discord login error:', error);

        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            showNotification('⏱️ Discord login timed out. Please try again.', 'error', 6000);
        } else if (error.message?.includes('permission_denied')) {
            showNotification('⚠️ Discord account sync failed. Login succeeded but profile could not be saved.', 'warning', 6000);
        } else {
            showNotification('Discord login failed: ' + (error.message || 'Unknown error'), 'error', 5000);
        }

        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// ── Wire up Discord login button ─────────────────────────
document.getElementById('btnDiscordLogin').addEventListener('click', function(e) {
    e.preventDefault();
    handleDiscordLogin();
});

// ==================== EMAIL / PASSWORD LOGIN ====================
document.getElementById('btnEmailSignIn').addEventListener('click', async function() {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    clearFormError('signInError');
    if (!email || !password) { showFormError('signInError', 'Please fill in all fields'); return; }
    if (firebaseInitialized && auth) {
        this.disabled = true;
        this.innerHTML = '<div class="loading-spinner"></div> Signing in...';
        try {
            const result = await auth.signInWithEmailAndPassword(email, password);
            const user = result.user;
            const userData = { id: user.uid, name: user.displayName || email.split('@')[0], email: user.email, loginMethod: 'email', loginTime: new Date().toISOString(), photoURL: user.photoURL };
            localStorage.setItem('bariplux_user', JSON.stringify(userData));
            showLoggedInView(userData);
        } catch (error) {
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
            showFormError('signInError', getFirebaseErrorMessage(error.code));
        }
    } else {
        showNotification('Firebase is not available. Please ensure internet connection and try again.', 'error');
    }
});

// ==================== REGISTER ====================
document.getElementById('btnRegister').addEventListener('click', async function() {
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;
    clearFormError('regError');
    if (!name || !email || !password || !confirm) { showFormError('regError', 'Please fill in all fields'); return; }
    if (password !== confirm) { showFormError('regError', 'Passwords do not match'); return; }
    if (password.length < 6) { showFormError('regError', 'Password must be at least 6 characters'); return; }
    if (firebaseInitialized && auth) {
        this.disabled = true;
        this.innerHTML = '<div class="loading-spinner"></div> Creating account...';
        try {
            const result = await auth.createUserWithEmailAndPassword(email, password);
            await result.user.updateProfile({ displayName: name });
            const userData = { id: result.user.uid, name: name, email: email, loginMethod: 'email', loginTime: new Date().toISOString() };
            localStorage.setItem('bariplux_user', JSON.stringify(userData));
            showNotification('Account created successfully!', 'success');
            showLoggedInView(userData);
        } catch (error) {
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
            showFormError('regError', getFirebaseErrorMessage(error.code));
        }
    } else { showFormError('regError', 'Firebase is required for registration'); }
});

// ==================== FORGOT PASSWORD ====================
document.getElementById('btnForgotPassword').addEventListener('click', async function() {
    const email = document.getElementById('forgotEmail').value.trim();
    clearFormError('forgotError');
    const successEl = document.getElementById('forgotSuccess');
    successEl.classList.remove('active');
    if (!email) { showFormError('forgotError', 'Please enter your email address'); return; }
    if (firebaseInitialized && auth) {
        this.disabled = true;
        this.innerHTML = '<div class="loading-spinner"></div> Sending...';
        try {
            await auth.sendPasswordResetEmail(email);
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
            successEl.textContent = '✓ Password reset email sent! Check your inbox.';
            successEl.classList.add('active');
            document.getElementById('forgotEmail').value = '';
        } catch (error) {
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
            showFormError('forgotError', getFirebaseErrorMessage(error.code));
        }
    } else { showFormError('forgotError', 'Firebase is required for password reset'); }
});

// ==================== OPEN APP ====================
function tryProtocolUrls(base64Claim) {
    const secretParam = currentClaimSecret ? ('&secret=' + encodeURIComponent(currentClaimSecret)) : '';
    const appUrls = [
        'baripluxtoolwin://login?token=' + base64Claim + secretParam,
        'baripluxtool23://login?token=' + base64Claim + secretParam,
        'bptv223://login?token=' + base64Claim + secretParam
    ];
    let tried = 0;
    const tick = function () {
        if (tried >= appUrls.length) return;
        try {
            window.location.href = appUrls[tried++];
        } catch (e) {}
        if (tried < appUrls.length) setTimeout(tick, 400);
    };
    tick();
}

function handleOpenApp() {
    const storedUser = localStorage.getItem('bariplux_user');
    if (!storedUser) { showNotification('Please login first!', 'error'); return; }
    const loginToken = localStorage.getItem('bariplux_login_token');
    if (!loginToken) { showNotification('No login token available', 'error'); return; }
    const parts = loginToken.split(':BPT23_LOGIN:');
    const base64Claim = parts.length > 1 ? parts[1] : loginToken;
    currentClaimSecret = localStorage.getItem('bariplux_login_secret') || currentClaimSecret || '';
    tryProtocolUrls(base64Claim);
}

document.getElementById('openAppBtn')?.addEventListener('click', async function() {
    const storedUser = localStorage.getItem('bariplux_user');
    if (!storedUser) { showNotification('Please login first!', 'error'); return; }
    try {
        const user = JSON.parse(storedUser);
        const statusEl = document.getElementById('openAppStatus');
        const btn = this;
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.innerHTML =
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
                    '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px;flex-shrink:0;"></div>' +
                    '<span style="color:var(--muted);font-size:0.85rem;">🔗 Connecting to Bari Plux App...</span>' +
                '</div>';
        }
        btn.disabled = true;

        const pendingResult = await createPendingToken(user);
        if (!pendingResult || !pendingResult.claimToken) {
            if (statusEl) {
                statusEl.innerHTML = '<span style="color:var(--danger);font-size:0.85rem;">⚠️ Could not create login token. Please check your internet connection and try again.</span>';
            }
            btn.disabled = false;
            return;
        }
        const { claimToken, claimSecret } = pendingResult;

        const base64Claim = btoa(claimToken);
        const parts = claimToken.split(':');
        const uid = parts[0];
        const sessionId = parts[1];

        currentClaimSecret = claimSecret;
        tryProtocolUrls(base64Claim);

        if (!database) {
            if (statusEl) {
                statusEl.innerHTML =
                    '<div style="font-size:0.85rem;color:var(--warning);">⏱️ Could not verify connection. ' +
                    'Token copied! Paste it in the app: <code style="display:block;margin-top:4px;padding:6px;background:rgba(0,0,0,0.3);border-radius:4px;word-break:break-all;">BPT23_LOGIN:' + base64Claim + '</code></div>' +
                    '<button type="button" class="btn-copy-token" style="margin-top:8px;padding:6px 14px;background:var(--accent-2);color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;"><i class="fas fa-copy"></i> Copy Token</button>';
                const copyBtn = statusEl.querySelector('.btn-copy-token');
                if (copyBtn) copyBtn.addEventListener('click', function () {
                    navigator.clipboard.writeText('BPT23_LOGIN:' + base64Claim);
                });
            }
            btn.disabled = false;
            return;
        }

        const tokenRef = database.ref('pending_tokens/' + uid + '/' + sessionId);
        let claimed = false;
        let sawToken = false;

        const listener = tokenRef.on('value', function(snapshot) {
            const data = snapshot.val();
            if (data) sawToken = true;
            if (!claimed && ((data && data.claimed === true) || (sawToken && data === null))) {
                claimed = true;
                if (activeTokenListener) { activeTokenListener(); }
                if (statusEl) {
                    statusEl.innerHTML = '<span style="color:var(--success);font-size:0.85rem;">✅ Successfully signed in! You can close this tab.</span>';
                }
                btn.disabled = false;
            }
        });

        const cleanup = function() { tokenRef.off('value', listener); };

        setTimeout(function() {
            if (!claimed) {
                cleanup();
                if (statusEl) {
                    statusEl.innerHTML =
                        '<div style="font-size:0.85rem;color:var(--warning);">⏱️ The app did not respond. Try again or copy the token manually.</div>' +
                        '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">' +
                            '<button type="button" class="btn-retry-openapp" style="padding:6px 14px;background:var(--accent);color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;"><i class="fas fa-redo"></i> Retry</button>' +
                            '<button type="button" class="btn-copy-token" style="padding:6px 14px;background:var(--accent-2);color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;"><i class="fas fa-copy"></i> Copy Token</button>' +
                        '</div>';
                    const retryBtn = statusEl.querySelector('.btn-retry-openapp');
                    if (retryBtn) retryBtn.addEventListener('click', function () {
                        const openBtn = document.querySelector('#appTokenSection #openAppBtn');
                        if (openBtn) openBtn.click();
                    });
                    const copyBtn = statusEl.querySelector('.btn-copy-token');
                    if (copyBtn) copyBtn.addEventListener('click', function () {
                        navigator.clipboard.writeText('BPT23_LOGIN:' + base64Claim).then(function () {
                            showNotification('Token copied!', 'success');
                        });
                    });
                }
                btn.disabled = false;
            }
        }, 300000);
    } catch (e) {
        showNotification('Error: ' + e.message, 'error');
        const btn = this;
        btn.disabled = false;
    }
});


async function doWebsiteLogout() {
    if (!confirm('Are you sure you want to logout?')) return;
    cleanupDesktopLogin();
    try {
        sessionStorage.removeItem('desktop_login_flow');
        sessionStorage.removeItem('discord_desktop_flow');
        sessionStorage.removeItem('github_desktop_flow');
        sessionStorage.removeItem('github_oauth_state');
        sessionStorage.removeItem('oauth_pending_redirect');
    } catch (e) {}
    localStorage.removeItem('discord_user');
    localStorage.removeItem('github_user');
    try { localStorage.removeItem('bariplux_github_oauth_result'); } catch (e) {}
    localStorage.removeItem('bariplux_user');
    localStorage.removeItem('bariplux_login_token');
    localStorage.removeItem('bariplux_login_secret');
    currentUser = null;
    currentClaimSecret = null;
    if (firebaseInitialized && auth) {
        try { await auth.signOut(); } catch (e) {}
    }
    // Restore default logged-in shell so next login has Logout again
    location.href = location.pathname + (location.search.includes('desktop=1')
        ? '?desktop=1&v=20260729gh'
        : '?v=20260729gh');
}

// ==================== LOGOUT ====================
const btnLogoutEl = document.getElementById('btnLogout');
if (btnLogoutEl) btnLogoutEl.addEventListener('click', function() { doWebsiteLogout(); });

// ==================== STATIC TAB / TOGGLE / LINK WIRING ====================
// Externalized from inline onclick="..." attributes on the page's own markup
// (was CSP script-src 'unsafe-inline'). Behavior unchanged, including the
// forgot/back links' preventDefault() (they used `onclick="...; return false;"`).
document.getElementById('mainTab-social')?.addEventListener('click', function () { switchMainTab('social'); });
document.getElementById('mainTab-email')?.addEventListener('click', function () { switchMainTab('email'); });
document.getElementById('subTab-signin')?.addEventListener('click', function () { switchSubTab('signin'); });
document.getElementById('subTab-register')?.addEventListener('click', function () { switchSubTab('register'); });
document.getElementById('subTab-forgot')?.addEventListener('click', function () { switchSubTab('forgot'); });

document.querySelectorAll('.password-toggle[data-target]').forEach(function (btn) {
    btn.addEventListener('click', function () { togglePassword(btn.dataset.target, btn); });
});

document.getElementById('linkForgotPassword')?.addEventListener('click', function (e) {
    e.preventDefault();
    switchSubTab('forgot');
});
document.getElementById('linkBackToSignIn')?.addEventListener('click', function (e) {
    e.preventDefault();
    switchSubTab('signin');
});

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    if (isAppEmbed()) document.body.classList.add('app-embed');
    markDesktopFlowIfNeeded();
    initFirebase();
    handleDiscordCallback();
    handleGithubCallback();
    if (firebaseInitialized && auth) {
        auth.getRedirectResult().then((result) => {
            let pending = null;
            try { pending = sessionStorage.getItem('oauth_pending_redirect'); sessionStorage.removeItem('oauth_pending_redirect'); } catch (e) {}
            if (result && result.user) {
                const providerId = result.credential?.providerId || result.user.providerData[0]?.providerId || 'firebase';
                const method = providerId === 'google.com' ? 'firebase.google'
                    : providerId === 'github.com' ? 'github'
                    : providerId;
                applyOAuthUser(result.user, method);
            } else if (pending) {
                console.warn('[getRedirectResult] empty after pending redirect for', pending);
                showNotification(
                    'GitHub sign-in did not complete. Confirm the GitHub OAuth App callback is https://login.bariplux.com/__/auth/handler then try again.',
                    'error',
                    10000
                );
            }
        }).catch((err) => {
            console.error('[getRedirectResult]', err);
            handleAuthError(err, 'Redirect');
        });
    }
    checkLoginStatus();

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const storedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
        document.documentElement.setAttribute('data-theme', storedTheme);
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
        });
    }

    window.addEventListener('scroll', () => {
        const scrolled = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
        const bar = document.getElementById('scrollProgress');
        if (bar) bar.style.width = scrolled + '%';
    });

    setInterval(() => {
        const storedUser = localStorage.getItem('bariplux_user');
        if (storedUser) localStorage.setItem('bariplux_user_new', storedUser);
    }, 3000);
});
