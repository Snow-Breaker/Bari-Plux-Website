
const ADMIN_EMAIL = 'mister.attaye@gmail.com';
const ADMIN_UID = 'ZHMxN5tZkNgLcxFnp98QUqfvw963';
const WORKER_URL = 'https://discord-auth-worker.bariattaye2.workers.dev';
const MAX_ATTEMPTS = 10;

const firebaseConfig = {
    apiKey: "AIzaSyBH_t3Uue7fbb-DahwjSJGjG2-quCqiLEs",
    authDomain: "baripluxwebsite.firebaseapp.com",
    projectId: "baripluxwebsite",
    storageBucket: "baripluxwebsite.firebasestorage.app",
    messagingSenderId: "280043766563",
    appId: "1:280043766563:web:409e6b78c1c24b568fc296",
    databaseURL: "https://baripluxwebsite-default-rtdb.firebaseio.com"
};

let allUsers = [], allReports = [];
let allChatModUsers = [], allChatReports = [];
let cmUserFilter = 'all', cmReportFilter = 'all';
let activeFilter = 'all', activeReportFilter = 'all';
let userPage = 1, reportPage = 1;
const PAGE_SIZE = 15;
let db = null, _currentUser = null;
let usersListener = null, reportsListener = null, errorsListener = null;
let allErrors = [];
let activeErrorFilter = 'all';
let errorPage = 1;
let _confirmAction = null;
let _totpEnabled = false;
let _pendingGatePassword = '';
let _appInited = false;
let _connectedBound = false;
let _usingProxyMode = false;

firebase.initializeApp(firebaseConfig);

/** Admin panel never talks to firebaseio.com from the browser — ISP blocks are common. */
function ensureDb() {
    if (db && db.__proxy) return db;
    _usingProxyMode = true;
    db = createProxyDb();
    setDbBannerMode('proxy');
    return db;
}

async function workerRtdbGet(paths) {
    const authUser = firebase.auth().currentUser;
    if (!authUser) throw new Error('Not signed in');
    const idToken = await authUser.getIdToken(true);
    const { ok, status, data } = await adminWorkerPost('/admin/rtdb-get', { paths }, idToken);
    if (!ok || !data?.ok) {
        throw new Error((data && (data.error || data.message)) || ('Worker rtdb-get failed (' + status + ')'));
    }
    return data.data || {};
}

async function workerRtdbWrite(op, path, writeData) {
    const authUser = firebase.auth().currentUser;
    if (!authUser) throw new Error('Not signed in');
    const idToken = await authUser.getIdToken(true);
    const body = { op, path };
    if (op !== 'remove') body.data = writeData;
    const { ok, status, data } = await adminWorkerPost('/admin/rtdb-write', body, idToken);
    if (!ok || !data?.ok) {
        throw new Error((data && (data.error || data.message)) || ('Worker rtdb-write failed (' + status + ')'));
    }
    return true;
}

/** Firebase-compatible DB shim backed by Cloudflare Worker + service account. */
function createProxyDb() {
    function makeSnap(val) {
        return {
            val: () => (val === undefined ? null : val),
            exists: () => val !== null && val !== undefined
        };
    }

    function ref(path) {
        const p = String(path || '').replace(/^\/+|\/+$/g, '');
        const api = {
            once(event) {
                if (event !== 'value') return Promise.reject(new Error('proxy only supports value'));
                if (p === '.info/connected') return Promise.resolve(makeSnap(true));
                return workerRtdbGet([p]).then(data => makeSnap(data[p]));
            },
            on(event, cb) {
                if (event !== 'value') return cb;
                const key = p;
                const tick = async () => {
                    try {
                        if (key === '.info/connected') {
                            cb(makeSnap(true));
                            return;
                        }
                        const data = await workerRtdbGet([key]);
                        cb(makeSnap(data[key]));
                    } catch (e) {
                        console.warn('[proxy on]', key, e);
                    }
                };
                tick();
                const id = setInterval(tick, 25000);
                api._pollIds = api._pollIds || new Set();
                api._pollIds.add(id);
                return cb;
            },
            off() {
                if (api._pollIds) {
                    for (const id of api._pollIds) clearInterval(id);
                    api._pollIds.clear();
                }
            },
            set(data) { return workerRtdbWrite('set', p, data); },
            update(data) { return workerRtdbWrite('update', p, data); },
            remove() { return workerRtdbWrite('remove', p); }
        };
        return api;
    }

    return { __proxy: true, ref, goOnline() {}, INTERNAL: { forceLongPolling() {} } };
}

function activateProxyDb() {
    return ensureDb();
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(v) { try { const d=new Date(v); return d.toLocaleDateString()+' '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); } catch{return'—';} }
function timeAgo(ts) {
    const d=Date.now()-ts;
    if(d<60000) return 'Just now';
    if(d<3600000) return Math.floor(d/60000)+'m ago';
    if(d<86400000) return Math.floor(d/3600000)+'h ago';
    if(d<604800000) return Math.floor(d/86400000)+'d ago';
    return new Date(ts).toLocaleDateString();
}
function methodInfo(m) {
    m = m||'';
    if(m==='discord') return {cls:'discord',icon:'🎮',label:'Discord'};
    if(m.includes('google')) return {cls:'google',icon:'🔵',label:'Google'};
    if(m==='github') return {cls:'github',icon:'⚫',label:'GitHub'};
    if(m==='email') return {cls:'email',icon:'✉️',label:'Email'};
    return {cls:'unknown',icon:'❓',label:m||'Unknown'};
}
function avatarColor(m) {
    m=m||'';
    if(m==='discord') return '#5865F2';
    if(m.includes('google')) return '#EA4335';
    if(m==='github') return '#e6edf3';
    if(m==='email') return '#FFB300';
    return '#6C63FF';
}
function countryFlag(code) {
    if(!code||code.length!==2) return '';
    return code.toUpperCase().replace(/./g,c=>String.fromCodePoint(c.charCodeAt(0)+127397));
}
function getRoleBadgeHtml(role) {
    const roles = {
        founder: { icon: '👑', label: 'FOUNDER', color: '#F6AD55', bg: 'rgba(246,173,85,0.15)' },
        dev:     { icon: '🛠️', label: 'DEV',     color: '#68D391', bg: 'rgba(104,211,145,0.15)' },
        pro:     { icon: '⭐', label: 'PRO',     color: '#63B3ED', bg: 'rgba(99,179,237,0.15)' },
        free:    { icon: '●',  label: 'FREE',    color: '#718096', bg: 'rgba(113,128,150,0.15)' }
    };
    const r = roles[role?.toLowerCase()] || roles.free;
    return `<span style="
        display:inline-flex;align-items:center;gap:4px;
        padding:2px 8px;border-radius:4px;
        background:${r.bg};color:${r.color};
        font-size:11px;font-weight:700;letter-spacing:0.5px;
        border:1px solid ${r.color}33;">
        ${r.icon} ${r.label}
    </span>`;
}
function roleRank(role) {
    const m = { free: 0, pro: 1, dev: 2, founder: 3 };
    return m[String(role || '').toLowerCase()] ?? 0;
}
/** Normalize stored roles (array / RTDB object / fallback scalar) to 1–2 unique roles. */
function normalizeRolesList(roles, fallbackRole) {
    let list = [];
    if (Array.isArray(roles)) list = roles;
    else if (roles && typeof roles === 'object') list = Object.values(roles);
    else if (typeof roles === 'string' && roles.trim()) list = roles.split(/[,|]/);
    list = [...new Set(list.map(r => String(r || '').trim().toLowerCase()).filter(r => /^(free|pro|dev|founder)$/.test(r)))];
    if (!list.length && fallbackRole) {
        const f = String(fallbackRole).trim().toLowerCase();
        if (/^(free|pro|dev|founder)$/.test(f)) list = [f];
    }
    if (!list.length) list = ['free'];
    if (list.includes('free') && list.length > 1) list = list.filter(r => r !== 'free');
    list.sort((a, b) => roleRank(b) - roleRank(a));
    return list.slice(0, 2);
}
function primaryRoleOf(roles, fallbackRole) {
    return normalizeRolesList(roles, fallbackRole)[0] || 'free';
}
function getRolesBadgeHtml(roles, fallbackRole) {
    return normalizeRolesList(roles, fallbackRole).map(getRoleBadgeHtml).join(' ');
}
function showToast(msg, type='') {
    const t=document.getElementById('toast');
    t.textContent=msg; t.className='toast'+(type?' '+type:'');
    t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'),2400);
}
function copyCurrentUserField(field, label) {
    const u = _currentUser || {};
    copyVal(u[field], label);
}
function copyVal(val, label) {
    if(!val) return;
    navigator.clipboard.writeText(val).then(()=>showToast('✅ '+label+' copied!','success'));
}

function toggleEye() {
    const i=document.getElementById('gateInput'), ic=document.getElementById('gateEyeIcon');
    i.type=i.type==='password'?'text':'password';
    ic.className='fas fa-eye'+(i.type==='text'?'-slash':'');
}
function formatRetryAfter(retryAfter) {
    const seconds = Math.max(0, Number(retryAfter) || 0);
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
async function adminWorkerPost(path, body, idToken) {
    const headers = { 'Content-Type': 'application/json' };
    if (idToken) headers.Authorization = 'Bearer ' + idToken;
    const res = await fetch(WORKER_URL + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body || {})
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    return { ok: res.ok, status: res.status, data };
}
function showGateError(html) {
    const errorEl = document.getElementById('gateError');
    errorEl.innerHTML = html;
    errorEl.classList.add('show');
    setTimeout(() => errorEl.classList.remove('show'), 3500);
}
async function checkPassword() {
    const val = document.getElementById('gateInput').value;
    if (!val) return;

    const btn = document.getElementById('gateBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';

    try {
        const { ok, status, data } = await adminWorkerPost('/admin/verify', { password: val });
        if (status === 429) {
            showGateError(`<i class="fas fa-lock"></i> Too many attempts — locked for ${formatRetryAfter(data.retryAfter)}`);
            showToast(`⏳ Too many attempts. Try again in ${formatRetryAfter(data.retryAfter)}.`, 'danger');
        } else if (ok && data.needTotp) {
            _pendingGatePassword = val;
            showTotpVerificationStep('password');
        } else if (ok && data.customToken) {
            await completeCustomTokenLogin(data.customToken);
        } else {
            const attempts = Number(data.attempts) || 0;
            const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attempts);
            if (data.retryAfter > 0) {
                showGateError(`<i class="fas fa-lock"></i> Too many attempts — locked for ${formatRetryAfter(data.retryAfter)}`);
            } else {
                showGateError(attemptsLeft > 0
                    ? `<i class="fas fa-times-circle"></i> Wrong password (${attemptsLeft} attempts left)`
                    : `<i class="fas fa-lock"></i> Account locked`);
            }
            document.getElementById('gateInput').value = '';
        }
    } catch(e) {
        console.error('checkPassword error:', e);
        showToast('⚠️ Authentication error. Try again.', 'danger');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-unlock-alt"></i> Enter';
}
document.getElementById('gateInput').addEventListener('keydown',e=>{ if(e.key==='Enter') checkPassword(); });

async function completeCustomTokenLogin(customToken) {
    sessionStorage.setItem('bp_admin', '1');
    await firebase.auth().signOut().catch(()=>{});
    await firebase.auth().signInWithCustomToken(customToken);
    document.getElementById('gate').classList.add('hidden');
    document.getElementById('app').classList.add('show');
    initApp();
}
function showTotpVerificationStep(mode) {
    const gateContent = document.querySelector('.gate-card') || document.getElementById('gate');
    const existing = document.getElementById('totpStep');
    if (existing) existing.remove();
    const step = document.createElement('div');
    step.id = 'totpStep';
    step.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg);border-radius:inherit;z-index:10;';
    step.innerHTML = `
        <div style="text-align:center;padding:32px;">
            <div style="font-size:1.1rem;font-weight:600;margin-bottom:4px;">Two-Factor Authentication</div>
            <div style="color:var(--muted);font-size:0.85rem;margin-bottom:24px;">Enter the 6-digit code from your authenticator app</div>
            <input id="totpInput" type="text" maxlength="6" placeholder="000000" autocomplete="one-time-code"
                   style="width:140px;text-align:center;font-size:1.5rem;letter-spacing:6px;padding:10px;border-radius:10px;border:1px solid var(--glass-border);background:var(--glass-bg);color:var(--text);font-family:monospace;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;"/>
            <button id="totpVerifyBtn"
                    style="padding:10px 28px;background:var(--accent);color:white;border:none;border-radius:10px;cursor:pointer;font-family:'Poppins',sans-serif;font-size:0.9rem;font-weight:600;margin-bottom:12px;"><i class="fas fa-shield-alt"></i> Verify</button>
            <br>
            <button id="totpBackBtn"
                    style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:0.8rem;font-family:'Poppins',sans-serif;">← Back</button>
            <div id="totpError" style="color:#F44336;font-size:0.82rem;margin-top:8px;display:none;">Invalid code. Please try again.</div>
        </div>`;
    gateContent.style.position = 'relative';
    gateContent.appendChild(step);
    document.getElementById('totpInput').focus();
    document.getElementById('totpVerifyBtn').onclick = async () => {
        const code = document.getElementById('totpInput').value;
        if (code.length !== 6) return;
        const btn = document.getElementById('totpVerifyBtn');
        btn.disabled = true;
        try {
            if (mode === 'password') {
                const { ok, data } = await adminWorkerPost('/admin/verify', {
                    password: _pendingGatePassword,
                    totpCode: code
                });
                if (ok && data.customToken) {
                    gateContent.removeChild(step);
                    _pendingGatePassword = '';
                    await completeCustomTokenLogin(data.customToken);
                    return;
                }
            } else if (mode === 'google') {
                const user = firebase.auth().currentUser;
                if (!user) throw new Error('Not signed in');
                const idToken = await user.getIdToken(true);
                const { ok, data } = await adminWorkerPost('/admin/session-unlock', { totpCode: code }, idToken);
                if (ok && data?.ok) {
                    gateContent.removeChild(step);
                    sessionStorage.setItem('bp_admin', '1');
                    document.getElementById('gate').classList.add('hidden');
                    document.getElementById('app').classList.add('show');
                    initApp();
                    return;
                }
                document.getElementById('totpError').style.display = 'block';
                document.getElementById('totpError').textContent = (data && data.error === 'invalid_totp')
                    ? 'Invalid code. Please try again.'
                    : ('Unlock failed: ' + ((data && data.error) || 'unknown'));
                document.getElementById('totpInput').value = '';
                document.getElementById('totpInput').focus();
                btn.disabled = false;
                return;
            }
            document.getElementById('totpError').style.display = 'block';
            document.getElementById('totpInput').value = '';
            document.getElementById('totpInput').focus();
        } catch (e) {
            console.error(e);
            showToast('⚠️ Verification failed', 'danger');
        }
        btn.disabled = false;
    };
    document.getElementById('totpInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('totpVerifyBtn').click(); });
    document.getElementById('totpBackBtn').onclick = async () => {
        gateContent.removeChild(step);
        _pendingGatePassword = '';
        if (mode === 'google') await firebase.auth().signOut().catch(()=>{});
    };
}

// ==================== GOOGLE SIGN-IN ====================
document.getElementById('btnGoogleLogin').addEventListener('click', async function() {
    const btn = this;
    if (!firebase.auth) return showToast('Firebase not available', 'danger');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner" style="border-color:#999;border-top-color:#333;width:16px;height:16px;border-width:2px;"></div> Signing in...';
    try {
        // Prefer popup; fall back to redirect if COOP / popup blockers break window.closed.
        let result = null;
        try {
            result = await firebase.auth().signInWithPopup(provider);
        } catch (popupErr) {
            const code = popupErr && popupErr.code;
            if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' ||
                /cross-origin-opener-policy|window\.closed/i.test(String(popupErr && popupErr.message || ''))) {
                await firebase.auth().signInWithRedirect(provider);
                return; // page will navigate away
            }
            throw popupErr;
        }
        const user = result.user;
        const email = (user.email || '').toLowerCase();
        if (email !== ADMIN_EMAIL.toLowerCase()) {
            showToast('Access denied: ' + user.email + ' is not authorized', 'danger');
            await firebase.auth().signOut();
            return;
        }
        const idToken = await user.getIdToken(true);
        const unlock = await adminWorkerPost('/admin/session-unlock', {}, idToken);
        if (unlock.ok && unlock.data?.ok) {
            sessionStorage.setItem('bp_admin', '1');
            document.getElementById('gate').classList.add('hidden');
            document.getElementById('app').classList.add('show');
            initApp();
        } else if (unlock.data?.needTotp || unlock.data?.error === 'invalid_totp') {
            showTotpVerificationStep('google');
        } else {
            showToast('Admin unlock failed: ' + (unlock.data?.error || unlock.status), 'danger');
            await firebase.auth().signOut();
        }
    } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user')
            showToast('Google login failed: ' + error.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google"> Sign in with Google';
    }
});

// Complete Google redirect sign-in (COOP-safe fallback)
firebase.auth().getRedirectResult().then(async (result) => {
    if (!result || !result.user) return;
    const user = result.user;
    if ((user.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        showToast('Access denied: ' + user.email + ' is not authorized', 'danger');
        await firebase.auth().signOut();
        return;
    }
    const idToken = await user.getIdToken(true);
    const unlock = await adminWorkerPost('/admin/session-unlock', {}, idToken);
    if (unlock.ok && unlock.data?.ok) {
        sessionStorage.setItem('bp_admin', '1');
        document.getElementById('gate').classList.add('hidden');
        document.getElementById('app').classList.add('show');
        initApp();
    } else if (unlock.data?.needTotp || unlock.data?.error === 'invalid_totp') {
        showTotpVerificationStep('google');
    } else {
        showToast('Admin unlock failed: ' + (unlock.data?.error || unlock.status), 'danger');
        await firebase.auth().signOut();
    }
}).catch((e) => {
    if (e && e.code !== 'auth/redirect-cancelled-by-user') {
        console.warn('getRedirectResult', e);
    }
});

function logout() {
    sessionStorage.removeItem('bp_admin');
    _pendingGatePassword = '';
    firebase.auth().signOut();
    document.getElementById('gate').classList.remove('hidden');
    document.getElementById('app').classList.remove('show');
    document.getElementById('gateInput').value='';
    if(usersListener) { db.ref('users').off(); db.ref('discordUsers').off(); }
    if(reportsListener) { db.ref('bugReports').off(); }
    if(errorsListener) { db.ref('errorReports').off(); }
}

async function setupTotp() {
    const user = firebase.auth().currentUser;
    if (!user) return showToast('Not signed in', 'danger');
    const idToken = await user.getIdToken();
    const start = await adminWorkerPost('/admin/totp/enroll/start', {}, idToken);
    if (!start.ok || !start.data.secret) {
        showToast('Could not start 2FA setup', 'danger');
        return;
    }
    const secret = start.data.secret;
    const otpauthUrl = start.data.otpauthUrl;
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(otpauthUrl);
    showTotpSetupModal(qrUrl, secret, idToken);
}
function showTotpSetupModal(qrUrl, secret, idToken) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:\'Poppins\',sans-serif;';
    modal.innerHTML = '<div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:20px;padding:32px;max-width:400px;text-align:center;">' +
        '<div style="font-size:1.5rem;font-weight:700;margin-bottom:8px;">🔐 Setup 2FA</div>' +
        '<div style="color:var(--muted);font-size:0.85rem;margin-bottom:20px;">Scan this QR code with Google Authenticator or Authy</div>' +
        '<img src="' + qrUrl + '" width="200" height="200" style="border-radius:12px;margin-bottom:16px;"/>' +
        '<div style="font-size:0.75rem;color:var(--muted);margin-bottom:8px;">Or enter manually:</div>' +
        '<div style="font-family:monospace;font-size:0.9rem;background:rgba(0,0,0,0.3);padding:8px 12px;border-radius:8px;margin-bottom:20px;letter-spacing:2px;word-break:break-all;">' + secret + '</div>' +
        '<div style="font-size:0.85rem;margin-bottom:12px;">Enter the 6-digit code to confirm setup:</div>' +
        '<input id="totpSetupCode" type="text" maxlength="6" placeholder="000000" style="width:120px;text-align:center;font-size:1.2rem;letter-spacing:4px;padding:8px;border-radius:8px;border:1px solid var(--glass-border);background:var(--glass-bg);color:var(--text);font-family:monospace;"/>' +
        '<br><br>' +
        '<button id="totpSetupConfirm" style="padding:10px 28px;background:var(--accent);color:white;border:none;border-radius:10px;cursor:pointer;font-family:\'Poppins\',sans-serif;font-size:0.9rem;font-weight:600;">Confirm & Enable 2FA</button>' +
        '</div>';
    document.body.appendChild(modal);
    document.getElementById('totpSetupConfirm').onclick = async () => {
        const code = document.getElementById('totpSetupCode').value;
        const confirm = await adminWorkerPost('/admin/totp/enroll/confirm', { secret, totpCode: code }, idToken);
        if (!confirm.ok) {
            showToast('Invalid code. Try again.', 'danger');
            return;
        }
        document.body.removeChild(modal);
        _totpEnabled = true;
        showToast('✅ 2FA enabled successfully!', 'success');
        document.getElementById('totpStatus').textContent = '2FA ✓';
    };
}

function initApp() {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser || (currentUser.uid !== ADMIN_UID && currentUser.email !== ADMIN_EMAIL)) {
        console.error('initApp: wrong user or not authenticated', currentUser?.uid, currentUser?.email);
        const tbody = document.getElementById('usersTableBody');
        if (tbody) tbody.innerHTML = `
            <tr class="state-row"><td colspan="8">
                <div class="state-icon">🔒</div>
                <div style="color:var(--danger);font-weight:600;">
                    Authentication error. Please refresh and log in again.
                </div>
                <button data-act="logout" style="margin-top:12px;padding:8px 20px;
                    background:var(--accent);color:white;border:none;border-radius:8px;
                    cursor:pointer;">↺ Re-login</button>
            </td></tr>`;
        return;
    }

    ensureDb();

    if (_appInited) {
        loadUsers();
        return;
    }
    _appInited = true;
    setDbBannerMode('proxy');

    db.ref('admin/totp_enabled').once('value').then(snap => {
        _totpEnabled = snap.val() === true;
        const el = document.getElementById('totpStatus');
        if (el) el.textContent = _totpEnabled ? '2FA ✓' : '2FA';
    }).catch(() => {});

    loadUsers();

    db.ref('bugReports').on('value', snap => {
        const data = snap.val() || {};
        const newCount = Object.values(data).filter(r => r.status === 'new').length;
        const badge = document.getElementById('reportsBadge');
        if (badge) {
            badge.textContent = newCount || '';
            badge.classList.toggle('show', newCount > 0);
        }
    });
    errorsListener = db.ref('errorReports').on('value', snap => {
        const data = snap.val() || {};
        const newCount = Object.values(data).filter(r => r.status === 'new').length;
        const badge = document.getElementById('errorsBadge');
        if (badge) {
            badge.textContent = newCount || '';
            badge.classList.toggle('show', newCount > 0);
        }
    });
    db.ref('lobby_chat/reports').on('value', snap => {
        const data = snap.val() || {};
        const newCount = Object.values(data).filter(r => (r.status || 'new') === 'new').length;
        const badge = document.getElementById('chatModBadge');
        if (badge) {
            badge.textContent = newCount || '';
            badge.classList.toggle('show', newCount > 0);
        }
    });
}

function waitForDbConnected(ms = 20000) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error('Database not initialized'));
        let done = false;
        const ref = db.ref('.info/connected');
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            ref.off('value', onVal);
            reject(new Error('TIMEOUT: Firebase did not connect in ' + Math.round(ms / 1000) + ' seconds'));
        }, ms);
        function onVal(snap) {
            if (snap.val() === true && !done) {
                done = true;
                clearTimeout(timer);
                ref.off('value', onVal);
                resolve(true);
            }
        }
        ref.on('value', onVal);
    });
}

function setDbBannerMode(mode) {
    // mode: 'hidden' | 'offline' | 'proxy'
    const dbBanner = document.getElementById('dbBanner');
    const rtDot = document.getElementById('realtime-dot');
    if (!dbBanner) return;
    if (mode === 'hidden') {
        dbBanner.classList.remove('show');
        if (rtDot) { rtDot.style.background = 'var(--success)'; rtDot.title = 'DB Connected'; }
        return;
    }
    // Proxy is the normal/intended path for admin — informational, not an error.
    dbBanner.classList.add('show');
    dbBanner.innerHTML = '<i class="fas fa-shield-alt"></i> Secure Worker proxy active — admin never connects to firebaseio.com from your browser.';
    dbBanner.style.background = '#E8F4FD';
    dbBanner.style.color = '#0C5460';
    dbBanner.style.borderBottomColor = '#BEE5EB';
    if (rtDot) { rtDot.style.background = '#63B3ED'; rtDot.title = 'Proxy mode'; }
}

function parseUserMap(d) {
    if (!d || typeof d !== 'object') return [];
    return Object.entries(d).map(([id, u]) => ({
        id, name: u.name || 'Unknown', email: u.email || '—',
        loginMethod: u.loginMethod || 'unknown',
        loginTime: u.loginTime || null, lastActive: u.lastActive || null,
        photoURL: u.photoURL || null, platform: u.platform || 'website',
        country: u.country || null, countryCode: u.countryCode || null,
        city: u.city || null, ip: u.ip || null,
        blocked: u.blocked === true, forceLogout: u.forceLogout || null,
        role: primaryRoleOf(u.roles, u.role || 'free'),
        roles: normalizeRolesList(u.roles, u.role || 'free'),
        roleAssignedAt: u.role_assigned_at || null, roleAssignedBy: u.role_assigned_by || null,
        proExpiresAtMs: Number(u.proExpiresAtMs) || 0,
        appVersion: u.appVersion || u.app_version || null,
        proDeviceId: u.proDeviceId || null,
        proDeviceBoundAt: u.proDeviceBoundAt || null,
        proDeviceChangeAllowed: u.proDeviceChangeAllowed === true
    }));
}

function applyUsersData(usersObj, discordObj, sourceLabel) {
    const merged = [...parseUserMap(usersObj), ...parseUserMap(discordObj)];
    const seen = new Set();
    allUsers = merged.filter(u => { if (seen.has(u.id)) return false; seen.add(u.id); return true; });
    allUsers.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
    updateUserStats(); userPage = 1; renderUsers();
    if (typeof renderProUsers === 'function') renderProUsers();
    const el = document.getElementById('lastUpdated');
    if (el) el.textContent = 'Last updated: ' + new Date().toLocaleTimeString() + (sourceLabel ? ' (' + sourceLabel + ')' : '');
}

function loadUsers() {
    const btn = document.getElementById('refreshBtn');
    if (btn) btn.classList.add('spinning');
    ensureDb();

    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr class="state-row"><td colspan="8"><div class="state-icon" style="font-size:1.5rem;">⏳</div><div>Loading users…</div></td></tr>';
    const mc = document.getElementById('mobileCards');
    if (mc) mc.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);"><div style="font-size:2rem;margin-bottom:8px;">⏳</div><div>Loading…</div></div>';

    const authUser = firebase.auth().currentUser;
    const prep = authUser
        ? authUser.getIdToken(true).catch(() => null)
        : Promise.resolve(null);

    prep.then(() => workerRtdbGet(['users', 'discordUsers'])).then((data) => {
        setDbBannerMode('proxy');
        applyUsersData(data.users, data.discordUsers, 'proxy');
    }).catch((err) => {
        console.error(err);
        const msg = String((err && err.message) || err);
        const isPermDenied = msg.includes('permission_denied') || msg.includes('Admin only') || msg.includes('PERMISSION_DENIED');
        showToast(isPermDenied
            ? '🔒 Access denied. Re-login as the admin account.'
            : '⏳ Could not load users via Worker. Check internet, then Retry.', 'danger');
        tbody.innerHTML = '<tr class="state-row"><td colspan="8">'
            + '<div class="state-icon">⚠️</div>'
            + '<div style="color:#F44336;font-weight:600;">' + (isPermDenied ? 'Access Denied' : 'Connection failed') + '</div>'
            + '<div style="font-size:0.8rem;margin-top:6px;color:var(--muted);">' + esc(msg) + '</div>'
            + '<button data-act="loadUsers" style="margin-top:12px;padding:8px 20px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-family:\'Poppins\',sans-serif;font-size:0.82rem;">↺ Retry</button>'
            + '</td></tr>';
        if (mc) mc.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">'
            + '<div style="font-size:2rem;margin-bottom:8px;">⚠️</div>'
            + '<button data-act="loadUsers" style="margin-top:12px;padding:8px 20px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;">↺ Retry</button>'
            + '</div>';
    }).finally(() => { if (btn) btn.classList.remove('spinning'); });
}

function updateUserStats() {
    const now=Date.now();
    document.getElementById('statTotal').textContent=allUsers.length;
    document.getElementById('statDiscord').textContent=allUsers.filter(u=>u.loginMethod==='discord').length;
    document.getElementById('statGoogle').textContent=allUsers.filter(u=>u.loginMethod.includes('google')).length;
    document.getElementById('statGithub').textContent=allUsers.filter(u=>u.loginMethod.includes('github')).length;
    document.getElementById('statEmail').textContent=allUsers.filter(u=>u.loginMethod==='email').length;
    document.getElementById('statActive').textContent=allUsers.filter(u=>u.lastActive&&(now-u.lastActive)<86400000).length;
}

function setFilter(f, btn) {
    activeFilter=f; userPage=1;
    document.querySelectorAll('#usersSection .filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); renderUsers();
}

function getFilteredUsers() {
    const q=document.getElementById('searchInput').value.toLowerCase();
    return allUsers.filter(u=>{
        const roleList = normalizeRolesList(u.roles, u.role || 'free');
        const mf=activeFilter==='all'
            ||(activeFilter==='google'&&u.loginMethod.includes('google'))
            ||(activeFilter==='discord'&&u.loginMethod==='discord')
            ||(activeFilter==='github'&&u.loginMethod.includes('github'))
            ||(activeFilter==='email'&&u.loginMethod==='email')
            ||(activeFilter==='role:free'&&roleList.includes('free'))
            ||(activeFilter==='role:pro'&&roleList.includes('pro'))
            ||(activeFilter==='role:dev'&&roleList.includes('dev'))
            ||(activeFilter==='role:founder'&&roleList.includes('founder'));
        const ms=!q||u.name.toLowerCase().includes(q)||u.email.toLowerCase().includes(q)||u.id.toLowerCase().includes(q)||(u.country||'').toLowerCase().includes(q)||(u.city||'').toLowerCase().includes(q)||(u.ip||'').toLowerCase().includes(q);
        return mf&&ms;
    });
}

function proDaysLeft(u) {
    const exp = Number(u.proExpiresAtMs)||0;
    if (!exp) return null;
    return Math.ceil((exp - Date.now()) / 86400000);
}

function renderProUsers() {
    const tbody = document.getElementById('proTableBody');
    if (!tbody) return;
    const q = (document.getElementById('proSearchInput')?.value || '').toLowerCase();
    const now = Date.now();
    let list = allUsers.filter(u => normalizeRolesList(u.roles, u.role).includes('pro') || (u.role||'').toLowerCase() === 'pro');
    if (q) {
        list = list.filter(u =>
            (u.name||'').toLowerCase().includes(q) ||
            (u.email||'').toLowerCase().includes(q) ||
            (u.id||'').toLowerCase().includes(q)
        );
    }
    list.sort((a,b) => (Number(a.proExpiresAtMs)||0) - (Number(b.proExpiresAtMs)||0));

    const active = list.filter(u => {
        const exp = Number(u.proExpiresAtMs)||0;
        return !exp || exp > now;
    }).length;
    const expiring = list.filter(u => {
        const d = proDaysLeft(u);
        return d != null && d >= 0 && d <= 7;
    }).length;
    const noExp = list.filter(u => !Number(u.proExpiresAtMs)).length;
    const elA = document.getElementById('proStatActive');
    const elE = document.getElementById('proStatExpiring');
    const elN = document.getElementById('proStatNoExpiry');
    if (elA) elA.textContent = active;
    if (elE) elE.textContent = expiring;
    if (elN) elN.textContent = noExp;
    const badge = document.getElementById('proBadge');
    if (badge) badge.textContent = list.length || '';
    const countLabel = document.getElementById('proCountLabel');
    if (countLabel) countLabel.textContent = `(${list.length})`;

    if (!list.length) {
        tbody.innerHTML = `<tr class="state-row"><td colspan="7"><div class="state-icon">⭐</div><div>No Pro members found.</div></td></tr>`;
    } else {
        tbody.innerHTML = list.map(u => {
            const days = proDaysLeft(u);
            let daysHtml = '—';
            if (days != null) {
                const color = days < 0 ? '#F44336' : days <= 7 ? '#FF9800' : '#4CAF50';
                daysHtml = `<span style="color:${color};font-weight:700;">${days < 0 ? 'Expired' : days + 'd'}</span>`;
            }
            const activated = u.roleAssignedAt ? fmtDate(u.roleAssignedAt) : '—';
            const expires = u.proExpiresAtMs ? fmtDate(u.proExpiresAtMs) : '—';
            const source = u.roleAssignedBy || '—';
            return `<tr style="cursor:pointer;" data-act="openUserModal" data-a1="${esc(u.id)}">
                <td><div class="user-name">${esc(u.name)}</div><div class="user-id">${u.id.substring(0,18)}…</div></td>
                <td style="color:var(--muted);font-size:0.82rem;">${esc(u.email)}</td>
                <td class="time-cell">${activated}</td>
                <td class="time-cell">${expires}</td>
                <td>${daysHtml}</td>
                <td style="font-size:0.78rem;color:var(--muted);">${esc(source)}</td>
                <td><button class="icon-btn" data-act="openUserModal" data-a1="${esc(u.id)}" data-stop="1"><i class="fas fa-eye"></i></button></td>
            </tr>`;
        }).join('');
    }
    const lu = document.getElementById('proLastUpdated');
    if (lu) lu.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

async function loadBannedWords() {
    if (!db) return;
    try {
        const snap = await db.ref('lobby_chat/banned_words').once('value');
        const data = snap.val() || {};
        let words = [];
        if (Array.isArray(data.words)) words = data.words;
        else if (data.words && typeof data.words === 'object') {
            words = Object.values(data.words).filter(w => typeof w === 'string');
        } else if (data.list && typeof data.list === 'object') {
            words = Object.keys(data.list);
        }
        const ta = document.getElementById('cmBannedWordsInput');
        if (ta) ta.value = words.join('\n');
        const st = document.getElementById('cmBannedWordsStatus');
        if (st) st.textContent = data.updatedAt
            ? (`${words.length} words · updated ${new Date(data.updatedAt).toLocaleString()}`)
            : (`${words.length} words`);
    } catch (e) {
        console.error(e);
        showToast('Failed to load banned words', 'danger');
    }
}

async function saveBannedWords() {
    if (!db) return;
    const ta = document.getElementById('cmBannedWordsInput');
    const words = String(ta?.value || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i)
        .slice(0, 500);
    try {
        await db.ref('lobby_chat/banned_words').set({
            words,
            updatedAt: Date.now(),
            updatedBy: firebase.auth().currentUser?.uid || 'admin'
        });
        const st = document.getElementById('cmBannedWordsStatus');
        if (st) st.textContent = `${words.length} words · saved ${new Date().toLocaleString()}`;
        showToast('Banned words saved ✓', 'success');
    } catch (e) {
        console.error(e);
        showToast('Failed to save banned words: ' + (e.message || e), 'danger');
    }
}


function renderUsers() {
    const filtered=getFilteredUsers();
    document.getElementById('userCountLabel').textContent=`(${filtered.length})`;
    const total=Math.ceil(filtered.length/PAGE_SIZE);
    if(userPage>total) userPage=Math.max(1,total);
    const start=(userPage-1)*PAGE_SIZE, slice=filtered.slice(start,start+PAGE_SIZE);

    const tbody=document.getElementById('usersTableBody');
    if(!filtered.length) {
        tbody.innerHTML=`<tr class="state-row"><td colspan="9"><div class="state-icon">🔍</div><div>No users found.</div></td></tr>`;
        document.getElementById('usersPagination').style.display='none';
    } else {
        tbody.innerHTML=slice.map((u,i)=>{
            const m=methodInfo(u.loginMethod), ac=avatarColor(u.loginMethod);
            const flag=u.countryCode?countryFlag(u.countryCode):'';
            const isOnline=u.lastActive&&(Date.now()-u.lastActive)<300000;
            const init=u.name.charAt(0).toUpperCase();
            const blockedHtml=u.blocked?`<span class="blocked-badge" style="font-size:0.62rem;padding:1px 6px;margin-left:4px;"><i class="fas fa-ban"></i> Blocked</span>`:'';
            return `<tr style="animation-delay:${i*0.025}s;cursor:pointer;${u.blocked?'opacity:0.7;':''}" data-act="openUserModal" data-a1="${esc(u.id)}">
                <td><div class="user-cell">
                    <div class="user-avatar" style="background:${ac}20;color:${ac};">
                        ${u.photoURL?`<img src="${esc(u.photoURL)}" onerror="this.style.display='none';this.parentElement.textContent='${init}'">`:''}${!u.photoURL?init:''}
                    </div>
                    <div><div class="user-name">${esc(u.name)}${blockedHtml}</div><div class="user-id">${u.id.substring(0,18)}…</div></div>
                </div></td>
                <td style="color:var(--muted);font-size:0.82rem;">${esc(u.email)}</td>
                <td><span class="method-badge ${m.cls}">${m.icon} ${m.label}</span></td>
                <td>${getRolesBadgeHtml(u.roles, u.role || 'free')}</td>
                <td style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:var(--accent);">${esc(u.appVersion||'—')}</td>
                <td><div class="country-cell">${flag?`<span class="country-flag">${flag}</span>`:''}<span>${esc(u.country||'—')}</span></div></td>
                <td class="time-cell">${fmtDate(u.loginTime)}</td>
                <td class="time-cell">${isOnline?'<span class="active-dot"></span>':''}<span>${u.lastActive?timeAgo(u.lastActive):'—'}</span></td>
                <td><button class="action-btn view" data-act="openUserModal" data-a1="${esc(u.id)}" data-stop="1"><i class="fas fa-eye"></i> Details</button></td>
            </tr>`;
        }).join('');
        renderPagination('usersPagination', userPage, total, p=>{userPage=p;renderUsers();});
    }

    const cards=document.getElementById('usersCards');
    if(!filtered.length) {
        cards.innerHTML=`<div style="text-align:center;padding:48px 20px;color:var(--muted);"><div style="font-size:2rem;margin-bottom:8px;opacity:0.35;">🔍</div>No users found.</div>`;
        document.getElementById('usersPaginationMobile').style.display='none';
    } else {
        cards.innerHTML=slice.map((u,i)=>{
            const m=methodInfo(u.loginMethod), ac=avatarColor(u.loginMethod);
            const flag=u.countryCode?countryFlag(u.countryCode):'';
            const isOnline=u.lastActive&&(Date.now()-u.lastActive)<300000;
            const init=u.name.charAt(0).toUpperCase();
            return `<div class="user-card" style="animation-delay:${i*0.03}s${u.blocked?';opacity:0.75;border-color:rgba(244,67,54,0.2);':''}" data-act="openUserModal" data-a1="${esc(u.id)}">
                <div class="user-card-header">
                    <div class="user-avatar" style="width:44px;height:44px;background:${ac}20;color:${ac};font-size:1.05rem;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--border);flex-shrink:0;">
                        ${u.photoURL?`<img src="${esc(u.photoURL)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.textContent='${init}'">`:''}${!u.photoURL?init:''}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:0.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(u.name)} ${u.blocked?'🚫':''}</div>
                        <div style="font-size:0.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(u.email)}</div>
                    </div>
                    <span class="method-badge ${m.cls}" style="flex-shrink:0;">${m.icon} ${m.label}</span>
                </div>
                <div class="user-card-body">
                    <div class="user-card-field"><span class="uf-label">Country</span><span class="uf-value">${flag?flag+' ':''} ${esc(u.country||'—')}</span></div>
                    <div class="user-card-field"><span class="uf-label">City</span><span class="uf-value">${esc(u.city||'—')}</span></div>
                    <div class="user-card-field"><span class="uf-label">IP Address</span><span class="uf-value" style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--accent2);">${esc(u.ip||'—')}</span></div>
                    <div class="user-card-field"><span class="uf-label">App Version</span><span class="uf-value" style="font-family:'JetBrains Mono',monospace;">${esc(u.appVersion||'—')}</span></div>
                    <div class="user-card-field"><span class="uf-label">Last Active</span><span class="uf-value">${isOnline?'🟢 ':''} ${u.lastActive?timeAgo(u.lastActive):'—'}</span></div>
                </div>
                <div class="user-card-footer"><button class="action-btn view" data-act="openUserModal" data-a1="${esc(u.id)}" data-stop="1"><i class="fas fa-eye"></i> Details</button></div>
            </div>`;
        }).join('');
        renderPagination('usersPaginationMobile', userPage, total, p=>{userPage=p;renderUsers();});
    }
}

function exportUsers() {
    const filtered=getFilteredUsers();
    if(!filtered.length) { showToast('No users to export','danger'); return; }
    const headers=['ID','Name','Email','Login Method','Country','City','IP Address','Platform','Login Time','Last Active','Blocked'];
    const rows=filtered.map(u=>[u.id,u.name,u.email,u.loginMethod,u.country||'',u.city||'',u.ip||'',u.platform,fmtDate(u.loginTime),u.lastActive?new Date(u.lastActive).toLocaleString():'',u.blocked?'Yes':'No'].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(','));
    const csv=[headers.join(','),...rows].join('\n');
    const a=document.createElement('a');
    a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
    a.download='bari_plux_users_'+new Date().toISOString().split('T')[0]+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('✅ CSV exported ('+filtered.length+' users)','success');
}

function openUserModal(id) {
    const u=allUsers.find(x=>x.id===id);
    if(!u) return;
    _currentUser=u;
    const m=methodInfo(u.loginMethod), ac=avatarColor(u.loginMethod);
    const av=document.getElementById('umAvatar');
    av.style.background=ac+'20'; av.style.color=ac;
    if(u.photoURL) av.innerHTML=`<img src="${esc(u.photoURL)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.textContent='${u.name.charAt(0).toUpperCase()}'">`; 
    else av.textContent=u.name.charAt(0).toUpperCase();
    document.getElementById('umName').textContent=u.name;
    document.getElementById('umBlockedBadge').style.display=u.blocked?'':'none';
    document.getElementById('umMethodBadge').innerHTML=`<span class="method-badge ${m.cls}">${m.icon} ${m.label}</span>`;
    const flag=u.countryCode?countryFlag(u.countryCode):'';
    document.getElementById('umCountryBadge').textContent=flag?(flag+' '+(u.country||'')):'';
    document.getElementById('umId').textContent=u.id;
    document.getElementById('umEmail').textContent=u.email;
    document.getElementById('umMethod').textContent=m.label;
    document.getElementById('umPlatform').textContent=u.platform||'website';
    document.getElementById('umCountry').textContent=u.country?(flag+' '+u.country):'—';
    document.getElementById('umCity').textContent=u.city||'—';
    // ✅ نمایش IP
    document.getElementById('umIpText').textContent=u.ip||'—';
    document.getElementById('umLoginTime').textContent=fmtDate(u.loginTime);
    document.getElementById('umLastActive').textContent=u.lastActive?fmtDate(u.lastActive):'—';
    document.getElementById('umAppVersion').textContent=u.appVersion||'—';
    document.getElementById('umPlatformDetail').textContent=u.platform||'—';
    if(u.photoURL) { document.getElementById('umPhotoSection').style.display=''; document.getElementById('umPhotoFull').src=u.photoURL; document.getElementById('umPhotoLink').href=u.photoURL; }
    else document.getElementById('umPhotoSection').style.display='none';
    // Populate role section
    const roleList = normalizeRolesList(u.roles, u.role || 'free');
    document.getElementById('modalCurrentRole').innerHTML = getRolesBadgeHtml(roleList);
    document.getElementById('modalRoleSelect').value = roleList[0] || 'free';
    const sel2 = document.getElementById('modalRoleSelect2');
    if (sel2) sel2.value = roleList[1] || '';
    let assignedInfo = u.roleAssignedAt
        ? `Assigned ${new Date(u.roleAssignedAt).toLocaleDateString()}`
        : 'Default role';
    if (roleList.includes('pro')) {
        const days = proDaysLeft(u);
        if (u.proExpiresAtMs) {
            assignedInfo += ` · expires ${new Date(u.proExpiresAtMs).toLocaleDateString()}`;
            if (days != null) assignedInfo += ` (${days < 0 ? 'expired' : days + 'd left'})`;
        } else {
            assignedInfo += ' · no expiry set';
        }
        if (u.roleAssignedBy) assignedInfo += ` · via ${u.roleAssignedBy}`;
    }
    document.getElementById('roleAssignedInfo').textContent = assignedInfo;
    renderDangerBtns(u);
    document.getElementById('userModal').classList.add('show');
    document.body.style.overflow='hidden';
}

function renderDangerBtns(u) {
    const div = document.getElementById('dangerBtns');
    let html = '';
    html += `<button class="danger-btn force-logout" data-act="composeMailboxTo" data-a1="${esc(u.id)}" data-a2="${esc(u.name)}"><i class="fas fa-envelope"></i> Send Mailbox</button>`;
    if(u.blocked) html += `<button class="danger-btn unblock" data-act="askConfirm" data-a1="unblock" data-a2="${esc(u.id)}" data-a3="${esc(u.name)}"><i class="fas fa-unlock"></i> Unblock</button>`;
    else html += `<button class="danger-btn block" data-act="askConfirm" data-a1="block" data-a2="${esc(u.id)}" data-a3="${esc(u.name)}"><i class="fas fa-ban"></i> Block</button>`;
    html += `<button class="danger-btn force-logout" data-act="askConfirm" data-a1="forceLogout" data-a2="${esc(u.id)}" data-a3="${esc(u.name)}"><i class="fas fa-sign-out-alt"></i> Force Logout</button>`;
    if (normalizeRolesList(u.roles, u.role).includes('pro')) {
        if (u.proDeviceChangeAllowed) {
            html += `<button class="danger-btn force-logout" disabled title="Already granted"><i class="fas fa-desktop"></i> PC change pending</button>`;
        } else {
            html += `<button class="danger-btn force-logout" data-act="askConfirm" data-a1="allowProPcChange" data-a2="${esc(u.id)}" data-a3="${esc(u.name)}"><i class="fas fa-desktop"></i> Allow 1 PC change</button>`;
        }
    }
    html += `<button class="danger-btn delete-user" data-act="askConfirm" data-a1="wipeCloud" data-a2="${esc(u.id)}" data-a3="${esc(u.name)}"><i class="fas fa-cloud"></i> Wipe Cloud Data</button>`;
    html += `<button class="danger-btn delete-user" data-act="askConfirm" data-a1="deleteUser" data-a2="${esc(u.id)}" data-a3="${esc(u.name)}"><i class="fas fa-trash-alt"></i> Delete User</button>`;
    div.innerHTML = html;
}

function closeUserModal() { document.getElementById('userModal').classList.remove('show'); document.body.style.overflow=''; }

const confirmConfigs = {
    block: { icon: '🚫', iconColor: 'rgba(255,152,0,0.12)', title: 'Block User', desc: 'This user will be marked as blocked. Their sessions will be invalidated and they will not be able to use the app.', submitClass: 'warn', submitText: '<i class="fas fa-ban"></i> Block User' },
    unblock: { icon: '✅', iconColor: 'rgba(76,175,80,0.12)', title: 'Unblock User', desc: 'This user will be unblocked and can use the app again.', submitClass: 'accent', submitText: '<i class="fas fa-unlock"></i> Unblock' },
    forceLogout: { icon: '🔄', iconColor: 'rgba(108,99,255,0.12)', title: 'Force Logout', desc: 'The user will be logged out of all active sessions immediately. They can log back in afterward.', submitClass: 'accent', submitText: '<i class="fas fa-sign-out-alt"></i> Force Logout' },
    allowProPcChange: { icon: '💻', iconColor: 'rgba(0,191,166,0.12)', title: 'Allow 1 PC change', desc: 'Grants a one-time exception so this Pro account can bind to a different PC on next login. Default is locked forever unless you grant this.', submitClass: 'accent', submitText: '<i class="fas fa-desktop"></i> Allow once' },
    deleteUser: { icon: '🗑️', iconColor: 'rgba(244,67,54,0.12)', title: 'Delete User', desc: 'This will permanently delete the user profile and sessions from the database. This action CANNOT be undone.', submitClass: '', submitText: '<i class="fas fa-trash-alt"></i> Delete Permanently' },
    wipeCloud: { icon: '☁️', iconColor: 'rgba(244,67,54,0.12)', title: 'Delete Cloud App Data', desc: 'Deletes all cloud backup / database files for this user (keymapping, bookmarks, Active.sav, history). Local PC files are not removed.', submitClass: '', submitText: '<i class="fas fa-cloud"></i> Wipe Cloud Files' }
};

function askConfirm(action, userId, userName) {
    const cfg = confirmConfigs[action];
    if(!cfg) return;
    _confirmAction = { action, userId, userName };
    document.getElementById('confirmIcon').textContent = cfg.icon;
    document.getElementById('confirmIcon').style.background = cfg.iconColor;
    document.getElementById('confirmTitle').textContent = cfg.title;
    document.getElementById('confirmDesc').textContent = cfg.desc;
    document.getElementById('confirmTarget').textContent = userName + ' — ' + userId.substring(0,20)+'…';
    const btn = document.getElementById('confirmSubmit');
    btn.className = 'confirm-submit ' + (cfg.submitClass||'');
    btn.innerHTML = cfg.submitText;
    btn.disabled = false;
    document.getElementById('confirmPass').value = '';
    document.getElementById('confirmTotp').value = '';
    document.getElementById('confirmTotpWrap').style.display = _totpEnabled ? 'block' : 'none';
    document.getElementById('confirmErr').classList.remove('show');
    document.getElementById('confirmModal').classList.add('show');
    setTimeout(()=>document.getElementById('confirmPass').focus(), 100);
}

function closeConfirm() { document.getElementById('confirmModal').classList.remove('show'); _confirmAction = null; }

function toggleConfirmEye() {
    const i=document.getElementById('confirmPass'), ic=document.getElementById('confirmEyeIcon');
    i.type=i.type==='password'?'text':'password';
    ic.className='fas fa-eye'+(i.type==='text'?'-slash':'');
}

async function submitConfirm() {
    const pass = document.getElementById('confirmPass').value;
    if(!pass) return;
    const totpCode = document.getElementById('confirmTotp').value || '';
    if (_totpEnabled && totpCode.length !== 6) {
        document.getElementById('confirmErr').innerHTML = '<i class="fas fa-times-circle"></i> Authenticator code required';
        document.getElementById('confirmErr').classList.add('show');
        return;
    }
    const btn = document.getElementById('confirmSubmit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    const { ok } = await adminWorkerPost('/admin/reauth', { password: pass, totpCode });
    if(!ok) {
        document.getElementById('confirmErr').innerHTML = '<i class="fas fa-times-circle"></i> Incorrect password' + (_totpEnabled ? ' or code' : '');
        document.getElementById('confirmErr').classList.add('show');
        document.getElementById('confirmPass').value = '';
        document.getElementById('confirmTotp').value = '';
        btn.disabled = false;
        btn.innerHTML = confirmConfigs[_confirmAction?.action]?.submitText || 'Confirm';
        return;
    }
    document.getElementById('confirmErr').classList.remove('show');
    const {action, userId} = _confirmAction;
    closeConfirm();
    try {
        if(action === 'wipeCloud') {
            await wipeUserCloudData(userId);
            return;
        }

        const userRef = await getCorrectRef(userId);
        if(!userRef) { showToast('⚠️ User ref not found','danger'); return; }

        if(action === 'block') {
            await userRef.update({ blocked: true, blockedAt: Date.now() });
            await db.ref('sessions/' + userId).remove().catch(()=>{});
            updateLocalUser(userId, {blocked: true});
            showToast('🚫 User blocked successfully', 'danger');
        }
        else if(action === 'unblock') {
            await userRef.update({ blocked: false, blockedAt: null });
            updateLocalUser(userId, {blocked: false});
            showToast('✅ User unblocked', 'success');
        }
        else if(action === 'forceLogout') {
            await userRef.update({ forceLogout: Date.now(), forceLogoutAt: Date.now() });
            await db.ref('sessions/' + userId).remove().catch(()=>{});
            updateLocalUser(userId, {forceLogout: Date.now()});
            showToast('🔄 Force logout applied', 'success');
        }
        else if(action === 'allowProPcChange') {
            await userRef.update({ proDeviceChangeAllowed: true, proDeviceChangeGrantedAt: Date.now() });
            updateLocalUser(userId, {proDeviceChangeAllowed: true});
            showToast('💻 One PC change allowed for this Pro account', 'success');
        }
        else if(action === 'deleteUser') {
            await Promise.all([
                db.ref('users/' + userId).remove().catch(()=>{}),
                db.ref('discordUsers/' + userId).remove().catch(()=>{}),
                db.ref('sessions/' + userId).remove().catch(()=>{})
            ]);
            // Best-effort wipe of cloud backup files too
            try { await wipeUserCloudData(userId, { silent: true }); } catch(_) {}
            allUsers = allUsers.filter(u=>u.id !== userId);
            updateUserStats();
            renderUsers();
            closeUserModal();
            showToast('🗑️ User deleted permanently', 'danger');
            return;
        }

        if(_currentUser?.id === userId) {
            const updated = allUsers.find(u=>u.id===userId);
            if(updated) {
                document.getElementById('umBlockedBadge').style.display = updated.blocked ? '' : 'none';
                renderDangerBtns(updated);
                renderUsers();
            }
        } else {
            renderUsers();
        }
    } catch(e) {
        console.error(e);
        showToast('⚠️ Action failed: '+(e.message||e.code||e), 'danger');
    }
}

async function wipeUserCloudData(userId, opts = {}) {
    const user = firebase.auth().currentUser;
    if(!user) { showToast('Not authenticated', 'danger'); return; }
    const token = await user.getIdToken(true);
    const url = `https://discord-auth-worker.bariattaye2.workers.dev/backup/admin-wipe?uid=${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
    });
    const body = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(body.error || ('HTTP '+res.status));
    if(!opts.silent) showToast(`☁️ Wiped ${body.deleted||0} cloud file(s)`, 'success');
    return body;
}

async function getCorrectRef(userId) {
    const usSnap = await db.ref(`users/${userId}`).once('value');
    if(usSnap.exists()) return db.ref(`users/${userId}`);
    const dsSnap = await db.ref(`discordUsers/${userId}`).once('value');
    if(dsSnap.exists()) return db.ref(`discordUsers/${userId}`);
    return null;
}

function updateLocalUser(userId, changes) {
    const u = allUsers.find(x=>x.id===userId);
    if(u) Object.assign(u, changes);
    if(_currentUser?.id===userId) Object.assign(_currentUser, changes);
}

async function assignRole() {
    const userId = _currentUser?.id;
    if (!userId) return;
    const role1 = document.getElementById('modalRoleSelect').value;
    const role2 = (document.getElementById('modalRoleSelect2')?.value || '').trim();
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) return showToast('Not authenticated', 'danger');

    let roles = normalizeRolesList([role1, role2].filter(Boolean));
    if (role1 === 'free' && role2) {
        return showToast('FREE cannot be combined with another role', 'danger');
    }
    if (role2 && role1 === role2) {
        return showToast('Pick two different roles, or leave Role 2 empty', 'danger');
    }

    const primary = primaryRoleOf(roles);
    let days = null;
    if (roles.includes('pro')) {
        const daysRaw = prompt('Pro duration in days (used if Pro is included; default 60):', '60');
        if (daysRaw === null) return;
        days = Math.min(Math.max(parseInt(daysRaw, 10) || 60, 1), 3650);
    }

    const label = roles.map(r => r.toUpperCase()).join(' + ');
    if (!confirm(`Assign roles [${label}] to this user?\n(Only admin can do this.)`)) return;

    try {
        const token = await currentUser.getIdToken(true);
        const body = { uid: userId, roles, email: _currentUser.email || null };
        if (days != null) body.days = days;
        const { ok, data, status } = await adminWorkerPost('/admin/set-roles', body, token);
        if (!ok) throw new Error(data?.error || ('HTTP ' + status));

        const exp = data?.proExpiresAtMs || (roles.includes('pro') ? (_currentUser.proExpiresAtMs || 0) : 0);
        document.getElementById('modalCurrentRole').innerHTML = getRolesBadgeHtml(roles);
        document.getElementById('roleAssignedInfo').textContent =
            `Assigned ${new Date().toLocaleDateString()}` + (exp ? ` · Pro until ${new Date(exp).toLocaleString()}` : '');

        updateLocalUser(userId, {
            role: primary,
            roles,
            roleAssignedAt: new Date().toISOString(),
            roleAssignedBy: 'admin',
            proExpiresAtMs: roles.includes('pro') ? (exp || _currentUser.proExpiresAtMs || 0) : 0
        });
        renderUsers();
        renderProUsers();
        showToast(`Roles updated: ${label} ✓`, 'success');
    } catch (err) {
        showToast('Failed to assign roles: ' + (err.message || err), 'danger');
    }
}

function loadReports() {
    const btn=document.getElementById('refreshReportsBtn');
    if(btn) btn.classList.add('spinning');
    db.ref('bugReports').once('value').then(snap=>{
        const data=snap.val()||{};
        allReports=Object.entries(data).map(([key,r])=>({
            firebaseKey:key, id:r.id||key, description:r.description||'',
            email:r.email||'', pcName:r.pcName||'—', os:r.os||'—',
            status:r.status||'new', date:r.date||'—', timestamp:r.timestamp||0,
            programInfo:r.programInfo||{}, systemSpecs:r.systemSpecs||{},
            images:r.images||[], userAccount:r.userAccount||null, isLoggedIn:r.isLoggedIn===true
        })).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
        updateReportStats(); reportPage=1; renderReports();
        document.getElementById('reportsLastUpdated').textContent='Last updated: '+new Date().toLocaleTimeString();
    }).catch(e=>{ console.error(e); showToast('⚠️ Failed to load reports','danger'); })
    .finally(()=>{ if(btn) btn.classList.remove('spinning'); });
}

function loadErrors() {
    const btn=document.getElementById('refreshErrorsBtn');
    if(btn) btn.classList.add('spinning');
    if(!db) { if(btn) btn.classList.remove('spinning'); return; }
    db.ref('errorReports').once('value').then(snap=>{
        const data=snap.val()||{};
        allErrors=Object.entries(data).map(([key,r])=>({
            firebaseKey:key,
            id:r.id||key,
            kind:r.kind||'crash',
            exceptionType:r.exceptionType||'—',
            message:r.message||'',
            stackTrace:r.stackTrace||'',
            fingerprint:r.fingerprint||'',
            activePage:r.activePage||'—',
            appVersion:r.appVersion||'—',
            os:r.os||'—',
            systemType:r.systemType||'',
            status:r.status||'new',
            date:r.date||'—',
            timestamp:r.timestamp||0,
            email:r.email||'',
            isLoggedIn:r.isLoggedIn===true,
            userAccount:r.userAccount||null,
            environment:r.environment||''
        })).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
        updateErrorStats(); errorPage=1; renderErrors();
        const lu=document.getElementById('errorsLastUpdated');
        if(lu) lu.textContent='Last updated: '+new Date().toLocaleTimeString();
    }).catch(e=>{ console.error(e); showToast('⚠️ Failed to load app errors','danger'); })
    .finally(()=>{ if(btn) btn.classList.remove('spinning'); });
}

function updateErrorStats() {
    const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
    set('eStatTotal', allErrors.length);
    set('eStatNew', allErrors.filter(r=>r.status==='new').length);
    set('eStatReviewed', allErrors.filter(r=>r.status==='reviewed').length);
    set('eStatResolved', allErrors.filter(r=>r.status==='resolved').length);
    const newCount=allErrors.filter(r=>r.status==='new').length;
    const badge=document.getElementById('errorsBadge');
    if(badge){ badge.textContent=newCount||''; badge.classList.toggle('show',newCount>0); }
}

function setErrorFilter(s, btn) {
    activeErrorFilter=s; errorPage=1;
    document.querySelectorAll('#errorsSection .filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); renderErrors();
}

function getFilteredErrors() {
    const q=(document.getElementById('errorSearchInput')?.value||'').toLowerCase();
    return allErrors.filter(r=>{
        const mf=activeErrorFilter==='all'||r.status===activeErrorFilter;
        const ua=r.userAccount||{};
        const ms=!q
            ||(r.exceptionType||'').toLowerCase().includes(q)
            ||(r.message||'').toLowerCase().includes(q)
            ||(r.activePage||'').toLowerCase().includes(q)
            ||(r.kind||'').toLowerCase().includes(q)
            ||(r.appVersion||'').toLowerCase().includes(q)
            ||(ua.name||'').toLowerCase().includes(q)
            ||(r.email||'').toLowerCase().includes(q)
            ||(r.fingerprint||'').toLowerCase().includes(q);
        return mf&&ms;
    });
}

function renderErrors() {
    const filtered=getFilteredErrors();
    const countLabel=document.getElementById('errorCountLabel');
    if(countLabel) countLabel.textContent=`(${filtered.length})`;
    const total=Math.ceil(filtered.length/PAGE_SIZE);
    if(errorPage>total) errorPage=Math.max(1,total);
    const start=(errorPage-1)*PAGE_SIZE, slice=filtered.slice(start,start+PAGE_SIZE);
    const statusIcons={new:'🆕',reviewed:'👁️',resolved:'✅',ignored:'🚫'};

    const tbody=document.getElementById('errorsTableBody');
    if(!tbody) return;
    if(!filtered.length) {
        tbody.innerHTML=`<tr class="state-row"><td colspan="9"><div class="state-icon">⚡</div><div>No app errors found.</div></td></tr>`;
        document.getElementById('errorsPagination').style.display='none';
    } else {
        tbody.innerHTML=slice.map((r,i)=>{
            const ua=r.userAccount||{};
            const acc=r.isLoggedIn&&ua.name?`<div style="font-size:0.82rem;font-weight:600;">${esc(ua.name)}</div><div style="font-size:0.68rem;color:var(--muted);font-family:'JetBrains Mono',monospace;">${(ua.id||'').substring(0,12)}…</div>`:`<span style="color:var(--muted);font-size:0.76rem;">Guest</span>`;
            const msg=(r.message||'').substring(0,60)+((r.message||'').length>60?'…':'');
            let acts=`<button class="action-btn view" data-act="openErrorModal" data-a1="${r.firebaseKey}">📋</button> `;
            if(r.status==='new') acts+=`<button class="action-btn review" data-act="updateErrorStatus" data-a1="${r.firebaseKey}" data-a2="reviewed">👁️</button> <button class="action-btn resolve" data-act="updateErrorStatus" data-a1="${r.firebaseKey}" data-a2="resolved">✅</button> `;
            else if(r.status==='reviewed') acts+=`<button class="action-btn resolve" data-act="updateErrorStatus" data-a1="${r.firebaseKey}" data-a2="resolved">✅</button> `;
            acts+=`<button class="action-btn" data-act="updateErrorStatus" data-a1="${r.firebaseKey}" data-a2="ignored" title="Ignore">🚫</button> `;
            acts+=`<button class="action-btn del" data-act="deleteError" data-a1="${r.firebaseKey}">🗑️</button>`;
            return `<tr style="animation-delay:${i*0.025}s">
                <td style="font-size:0.75rem;"><code>${esc(r.kind)}</code></td>
                <td style="font-family:'JetBrains Mono',monospace;font-size:0.72rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.exceptionType)}">${esc(r.exceptionType)}</td>
                <td><div class="report-desc" title="${esc(r.message)}">${esc(msg)}</div></td>
                <td style="font-size:0.78rem;color:var(--muted);">${esc(r.activePage)}</td>
                <td style="font-size:0.8rem;">${esc(r.appVersion)}</td>
                <td>${acc}</td>
                <td class="time-cell"><span>${esc(r.date)}</span></td>
                <td><span class="report-status ${r.status}">${statusIcons[r.status]||''} ${r.status}</span></td>
                <td style="white-space:nowrap;">${acts}</td>
            </tr>`;
        }).join('');
        renderPagination('errorsPagination', errorPage, total, p=>{errorPage=p;renderErrors();});
    }

    const cards=document.getElementById('errorsCards');
    if(cards){
        if(!filtered.length) {
            cards.innerHTML=`<div style="text-align:center;padding:48px 20px;color:var(--muted);"><div style="font-size:2rem;margin-bottom:8px;opacity:0.35;">⚡</div>No app errors found.</div>`;
            const pm=document.getElementById('errorsPaginationMobile'); if(pm) pm.style.display='none';
        } else {
            cards.innerHTML=slice.map((r,i)=>{
                const ua=r.userAccount||{};
                return `<div class="report-card" style="animation-delay:${i*0.03}s">
                    <div class="report-card-header">
                        <div><div style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--muted);margin-bottom:4px;">${esc(r.kind)} · ${esc(r.appVersion)}</div><span class="report-status ${r.status}">${statusIcons[r.status]||''} ${r.status}</span></div>
                        <div style="text-align:right;font-size:0.78rem;color:var(--muted);">${esc(r.date)}</div>
                    </div>
                    <div style="font-weight:600;margin-bottom:6px;">${esc(r.exceptionType)}</div>
                    <div class="report-card-desc">${esc(r.message||'No message.')}</div>
                    <div class="report-card-meta">
                        <div class="report-card-meta-item"><span class="rm-label">Page</span><span class="rm-value">${esc(r.activePage)}</span></div>
                        <div class="report-card-meta-item"><span class="rm-label">Account</span><span class="rm-value">${r.isLoggedIn&&ua.name?esc(ua.name):'Guest'}</span></div>
                        <div class="report-card-meta-item"><span class="rm-label">OS</span><span class="rm-value">${esc(r.os)}</span></div>
                        <div class="report-card-meta-item"><span class="rm-label">Fingerprint</span><span class="rm-value" style="font-family:monospace;font-size:0.7rem;">${esc(r.fingerprint||'—')}</span></div>
                    </div>
                    <div class="report-card-actions">
                        <button class="action-btn view" data-act="openErrorModal" data-a1="${r.firebaseKey}">📋 Details</button>
                        <button class="action-btn del" data-act="deleteError" data-a1="${r.firebaseKey}">🗑️</button>
                    </div>
                </div>`;
            }).join('');
            renderPagination('errorsPaginationMobile', errorPage, total, p=>{errorPage=p;renderErrors();});
        }
    }
}

function openErrorModal(key) {
    const r=allErrors.find(x=>x.firebaseKey===key);
    if(!r) return;
    const ua=r.userAccount||{};
    document.getElementById('errorModalBody').innerHTML =
        `<div style="display:grid;gap:10px;font-size:0.88rem;">
            <div><b>Kind</b>: <code>${esc(r.kind)}</code> · <b>Status</b>: ${esc(r.status)}</div>
            <div><b>Exception</b>: <code>${esc(r.exceptionType)}</code></div>
            <div><b>Message</b><pre style="white-space:pre-wrap;background:rgba(0,0,0,.25);padding:10px;border-radius:8px;margin:6px 0 0;">${esc(r.message)}</pre></div>
            <div><b>Page</b>: ${esc(r.activePage)} · <b>Version</b>: ${esc(r.appVersion)} · <b>Env</b>: ${esc(r.environment||'—')}</div>
            <div><b>OS</b>: ${esc(r.os)} ${esc(r.systemType||'')}</div>
            <div><b>Account</b>: ${r.isLoggedIn?(esc(ua.name||'')+' · '+esc(ua.email||'')+' · '+esc(ua.id||'')):'Guest / not signed in'}</div>
            <div><b>Fingerprint</b>: <code>${esc(r.fingerprint||'—')}</code></div>
            <div><b>Time</b>: ${esc(r.date||fmtTs(r.timestamp))}</div>
            <div><b>Stack</b><pre style="white-space:pre-wrap;max-height:280px;overflow:auto;background:rgba(0,0,0,.35);padding:10px;border-radius:8px;font-size:0.72rem;margin:6px 0 0;">${esc(r.stackTrace||'(none)')}</pre></div>
        </div>`;
    document.getElementById('errorModalActions').innerHTML =
        `<button class="action-btn review" data-act="updateErrorStatusAndClose" data-a1="${r.firebaseKey}" data-a2="reviewed">Mark reviewed</button>
         <button class="action-btn resolve" data-act="updateErrorStatusAndClose" data-a1="${r.firebaseKey}" data-a2="resolved">Resolve</button>
         <button class="action-btn" data-act="updateErrorStatusAndClose" data-a1="${r.firebaseKey}" data-a2="ignored">Ignore</button>
         <button class="action-btn del" data-act="deleteErrorAndClose" data-a1="${r.firebaseKey}">Delete</button>`;
    document.getElementById('errorModal').classList.add('show');
}

function closeErrorModal() {
    document.getElementById('errorModal')?.classList.remove('show');
}

async function updateErrorStatusAndClose(key, status) {
    await updateErrorStatus(key, status);
    closeErrorModal();
}

async function deleteErrorAndClose(key) {
    await deleteError(key);
    closeErrorModal();
}

async function updateErrorStatus(key, status) {
    try {
        await db.ref(`errorReports/${key}/status`).set(status);
        const r=allErrors.find(x=>x.firebaseKey===key);
        if(r) r.status=status;
        updateErrorStats(); renderErrors();
        showToast('Status → '+status, 'success');
    } catch(e) {
        showToast('Failed to update status: '+e.message, 'danger');
    }
}

async function deleteError(key) {
    if(!confirm('Delete this app error report?')) return;
    try {
        await db.ref(`errorReports/${key}`).remove();
        allErrors=allErrors.filter(x=>x.firebaseKey!==key);
        updateErrorStats(); renderErrors();
        showToast('Deleted', 'success');
    } catch(e) {
        showToast('Delete failed: '+e.message, 'danger');
    }
}

function updateReportStats() {
    document.getElementById('rStatTotal').textContent=allReports.length;
    document.getElementById('rStatNew').textContent=allReports.filter(r=>r.status==='new').length;
    document.getElementById('rStatReviewed').textContent=allReports.filter(r=>r.status==='reviewed').length;
    document.getElementById('rStatResolved').textContent=allReports.filter(r=>r.status==='resolved').length;
    const newCount=allReports.filter(r=>r.status==='new').length;
    const badge=document.getElementById('reportsBadge');
    badge.textContent=newCount||''; badge.classList.toggle('show',newCount>0);
}

function setReportFilter(s, btn) {
    activeReportFilter=s; reportPage=1;
    document.querySelectorAll('#reportsSection .filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); renderReports();
}

function getFilteredReports() {
    const q=document.getElementById('reportSearchInput').value.toLowerCase();
    return allReports.filter(r=>{
        const mf=activeReportFilter==='all'||r.status===activeReportFilter;
        const ua=r.userAccount||{};
        const ms=!q||(r.description||'').toLowerCase().includes(q)||(r.email||'').toLowerCase().includes(q)||(r.pcName||'').toLowerCase().includes(q)||(r.id||'').toLowerCase().includes(q)||(ua.name||'').toLowerCase().includes(q);
        return mf&&ms;
    });
}

function renderReports() {
    const filtered=getFilteredReports();
    document.getElementById('reportCountLabel').textContent=`(${filtered.length})`;
    const total=Math.ceil(filtered.length/PAGE_SIZE);
    if(reportPage>total) reportPage=Math.max(1,total);
    const start=(reportPage-1)*PAGE_SIZE, slice=filtered.slice(start,start+PAGE_SIZE);
    const statusIcons={new:'🆕',reviewed:'👁️',resolved:'✅'};

    const tbody=document.getElementById('reportsTableBody');
    if(!filtered.length) {
        tbody.innerHTML=`<tr class="state-row"><td colspan="8"><div class="state-icon">🔍</div><div>No reports found.</div></td></tr>`;
        document.getElementById('reportsPagination').style.display='none';
    } else {
        tbody.innerHTML=slice.map((r,i)=>{
            const ua=r.userAccount||{};
            const acc=r.isLoggedIn&&ua.name?`<div style="font-size:0.82rem;font-weight:600;">${esc(ua.name)}</div><div style="font-size:0.68rem;color:var(--muted);font-family:'JetBrains Mono',monospace;">${(ua.id||'').substring(0,16)}…</div>`:`<span style="color:var(--muted);font-size:0.76rem;">Guest</span>`;
            const desc=(r.description||'').substring(0,70)+(r.description.length>70?'…':'');
            let acts=`<button class="action-btn view" data-act="openReportModal" data-a1="${r.firebaseKey}">📋 Details</button> `;
            if(r.status==='new') acts+=`<button class="action-btn review" data-act="updateStatus" data-a1="${r.firebaseKey}" data-a2="reviewed">👁️</button> <button class="action-btn resolve" data-act="updateStatus" data-a1="${r.firebaseKey}" data-a2="resolved">✅</button> `;
            else if(r.status==='reviewed') acts+=`<button class="action-btn resolve" data-act="updateStatus" data-a1="${r.firebaseKey}" data-a2="resolved">✅</button> `;
            acts+=`<button class="action-btn del" data-act="deleteReport" data-a1="${r.firebaseKey}">🗑️</button>`;
            return `<tr style="animation-delay:${i*0.025}s">
                <td style="font-family:'JetBrains Mono',monospace;font-size:0.72rem;color:var(--muted);">${esc(r.id)}</td>
                <td><div class="report-desc" title="${esc(r.description)}">${esc(desc)}</div></td>
                <td>${acc}</td>
                <td style="color:var(--muted);font-size:0.8rem;">${esc(r.email)||'—'}</td>
                <td style="font-size:0.82rem;">${esc(r.pcName)}</td>
                <td class="time-cell"><span>${r.date}</span></td>
                <td><span class="report-status ${r.status}">${statusIcons[r.status]||''} ${r.status.charAt(0).toUpperCase()+r.status.slice(1)}</span></td>
                <td style="white-space:nowrap;">${acts}</td>
            </tr>`;
        }).join('');
        renderPagination('reportsPagination', reportPage, total, p=>{reportPage=p;renderReports();});
    }

    const cards=document.getElementById('reportsCards');
    if(!filtered.length) {
        cards.innerHTML=`<div style="text-align:center;padding:48px 20px;color:var(--muted);"><div style="font-size:2rem;margin-bottom:8px;opacity:0.35;">🔍</div>No reports found.</div>`;
        document.getElementById('reportsPaginationMobile').style.display='none';
    } else {
        cards.innerHTML=slice.map((r,i)=>{
            const ua=r.userAccount||{};
            let acts=`<button class="action-btn view" data-act="openReportModal" data-a1="${r.firebaseKey}">📋 Details</button>`;
            if(r.status==='new') acts+=` <button class="action-btn review" data-act="updateStatus" data-a1="${r.firebaseKey}" data-a2="reviewed">👁️ Review</button> <button class="action-btn resolve" data-act="updateStatus" data-a1="${r.firebaseKey}" data-a2="resolved">✅ Resolve</button>`;
            else if(r.status==='reviewed') acts+=` <button class="action-btn resolve" data-act="updateStatus" data-a1="${r.firebaseKey}" data-a2="resolved">✅ Resolve</button>`;
            acts+=` <button class="action-btn del" data-act="deleteReport" data-a1="${r.firebaseKey}">🗑️ Delete</button>`;
            return `<div class="report-card" style="animation-delay:${i*0.03}s">
                <div class="report-card-header">
                    <div><div style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--muted);margin-bottom:4px;">${esc(r.id)}</div><span class="report-status ${r.status}">${statusIcons[r.status]||''} ${r.status.charAt(0).toUpperCase()+r.status.slice(1)}</span></div>
                    <div style="text-align:right;font-size:0.78rem;color:var(--muted);">${r.date}</div>
                </div>
                <div class="report-card-desc">${esc(r.description||'No description.')}</div>
                <div class="report-card-meta">
                    <div class="report-card-meta-item"><span class="rm-label">Account</span><span class="rm-value">${r.isLoggedIn&&ua.name?esc(ua.name):'Guest'}</span></div>
                    <div class="report-card-meta-item"><span class="rm-label">PC</span><span class="rm-value">${esc(r.pcName)}</span></div>
                    <div class="report-card-meta-item"><span class="rm-label">Contact</span><span class="rm-value">${esc(r.email||'—')}</span></div>
                    <div class="report-card-meta-item"><span class="rm-label">OS</span><span class="rm-value">${esc(r.os)}</span></div>
                </div>
                <div class="report-card-actions">${acts}</div>
            </div>`;
        }).join('');
        renderPagination('reportsPaginationMobile', reportPage, total, p=>{reportPage=p;renderReports();});
    }
}

function renderPagination(elId, currentPage, totalPages, onChange) {
    const el=document.getElementById(elId);
    if(totalPages<=1) { el.style.display='none'; return; }
    el.style.display='flex';
    const listLen = elId.includes('error') ? getFilteredErrors().length
        : elId.includes('report') ? getFilteredReports().length
        : getFilteredUsers().length;
    const start=(currentPage-1)*PAGE_SIZE+1, end=Math.min(currentPage*PAGE_SIZE, listLen);
    const total=listLen;
    let pages='';
    for(let p=1;p<=totalPages;p++) {
        if(p===1||p===totalPages||Math.abs(p-currentPage)<=1) pages+=`<button type="button" class="page-btn${p===currentPage?' active':''}" data-page="${p}">${p}</button>`;
        else if(Math.abs(p-currentPage)===2) pages+=`<span style="color:var(--muted);align-self:center;font-size:0.8rem;">…</span>`;
    }
    el.innerHTML=`<span class="pagination-info">${start}–${end} of ${total}</span>
        <div class="pagination-btns">
            <button type="button" class="page-btn" data-page="${currentPage-1}" ${currentPage<=1?'disabled':''}><i class="fas fa-chevron-left"></i></button>
            ${pages}
            <button type="button" class="page-btn" data-page="${currentPage+1}" ${currentPage>=totalPages?'disabled':''}><i class="fas fa-chevron-right"></i></button>
        </div>`;
    el.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            const p = Number(btn.getAttribute('data-page'));
            if (!Number.isFinite(p)) return;
            onChange(p);
        });
    });
}

async function updateStatus(key, status) {
    if(!db||!key) return;
    try {
        await db.ref(`bugReports/${key}/status`).set(status);
        const r=allReports.find(x=>x.firebaseKey===key);
        if(r) r.status=status;
        updateReportStats(); renderReports();
        showToast('✅ Status updated to: '+status,'success');
    } catch(e){ showToast('⚠️ Failed to update status','danger'); }
}

async function deleteReport(key) {
    if(!confirm('Delete this bug report? This cannot be undone.')) return;
    try {
        await db.ref(`bugReports/${key}`).remove();
        allReports=allReports.filter(r=>r.firebaseKey!==key);
        updateReportStats(); renderReports();
        showToast('🗑️ Report deleted','success');
        if(document.getElementById('reportModal').classList.contains('show')) closeReportModal();
    } catch(e){ showToast('⚠️ Failed to delete report','danger'); }
}

function openReportModal(key) {
    const r=allReports.find(x=>x.firebaseKey===key);
    if(!r) return;
    const sl={new:'🆕 New',reviewed:'👁️ Reviewed',resolved:'✅ Resolved'};
    document.getElementById('rmId').textContent=r.id||'—';
    document.getElementById('rmDate').textContent=r.date||'—';
    document.getElementById('rmStatus').innerHTML=`<span class="report-status ${r.status}">${sl[r.status]||r.status}</span>`;
    document.getElementById('rmDesc').textContent=r.description||'No description.';
    const pi=r.programInfo||{};
    ['AppName','AppVersion','Company','Developer','Website'].forEach(k=>document.getElementById('rm'+k).textContent=pi[k.charAt(0).toLowerCase()+k.slice(1)]||'—');
    document.getElementById('rmInstallPath').textContent=pi.installPath||'—';
    const ss=r.systemSpecs||{};
    document.getElementById('rmPcName').textContent=r.pcName||'—';
    ['PcModel','Cpu','Gpu','Ram','Storage','SystemType','Resolution','RefreshRate'].forEach(k=>document.getElementById('rm'+k).textContent=ss[k.charAt(0).toLowerCase()+k.slice(1)]||'—');
    document.getElementById('rmOs').textContent=r.os||'—';

    const ua=r.userAccount||{}, signedIn=r.isLoggedIn&&ua.id&&!ua.note;
    document.getElementById('rmGuest').style.display=signedIn?'none':'';
    document.getElementById('rmAccount').style.display=signedIn?'':'none';
    if(signedIn) {
        const mk=(ua.loginMethod||'').toLowerCase(), m=methodInfo(mk);
        const av=document.getElementById('rmAccountAvatar');
        av.textContent=(ua.name||'?').charAt(0).toUpperCase();
        av.style.background=avatarColor(mk);
        document.getElementById('rmAccountName').textContent=ua.name||'—';
        const badge=document.getElementById('rmAccountBadge');
        badge.textContent=`${m.icon} ${m.label}`; badge.className=`method-badge ${m.cls}`;
        document.getElementById('rmAccountId').textContent=ua.id||'—';
        document.getElementById('rmAccountEmail').textContent=ua.email||'—';
        document.getElementById('rmAccountLoginTime').textContent=ua.loginTime?fmtDate(ua.loginTime):'—';
    }
    document.getElementById('rmEmail').textContent=r.email||'—';
    document.getElementById('rmAccountPc').textContent=r.pcName||'—';

    currentPreviewImages=r.images||[];
    const imgs=r.images||[];
    const imgSec=document.getElementById('rmImagesSection'), imgCont=document.getElementById('rmImagesContainer');
    imgCont.innerHTML='';
    if(imgs.length>0) {
        imgSec.style.display='';
        document.getElementById('rmImagesCount').textContent=imgs.length+' image'+(imgs.length!==1?'s':'');
        imgs.forEach((b,idx)=>{
            const src=b.startsWith('data:')?b:`data:image/png;base64,${b}`;
            const t=document.createElement('div'); t.className='img-thumb';
            t.innerHTML=`<img src="${src}" loading="lazy"><div class="thumb-overlay" data-act="openImgPreview" data-a1="${idx}"><i class="fas fa-search-plus"></i></div>`;
            imgCont.appendChild(t);
        });
    } else imgSec.style.display='none';

    const actDiv=document.getElementById('rmActions');
    let acts='';
    if(r.status==='new') acts=`<button class="action-btn review" data-act="updateStatus" data-a1="${r.firebaseKey}" data-a2="reviewed">👁️ Mark Reviewed</button><button class="action-btn resolve" data-act="updateStatus" data-a1="${r.firebaseKey}" data-a2="resolved">✅ Mark Resolved</button>`;
    else if(r.status==='reviewed') acts=`<button class="action-btn resolve" data-act="updateStatus" data-a1="${r.firebaseKey}" data-a2="resolved">✅ Mark Resolved</button>`;
    acts+=`<button class="action-btn del" data-act="deleteReport" data-a1="${r.firebaseKey}">🗑️ Delete Report</button>`;
    const signedInReply=r.isLoggedIn&&r.userAccount&&r.userAccount.id&&!r.userAccount.note;
    acts+=`<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);width:100%;">
      <div style="font-size:0.78rem;color:var(--muted);margin-bottom:8px;"><i class="fas fa-reply"></i> Reply to Mailbox</div>
      <div class="mb-templates" style="margin-bottom:8px;">
        <button type="button" class="mb-chip" ${signedInReply?'':'disabled'} data-act="applyReportReplyTemplate" data-a1="looking">Looking into it</button>
        <button type="button" class="mb-chip" ${signedInReply?'':'disabled'} data-act="applyReportReplyTemplate" data-a1="fixed">Fixed</button>
        <button type="button" class="mb-chip" ${signedInReply?'':'disabled'} data-act="applyReportReplyTemplate" data-a1="needmore">Need more info</button>
      </div>
      <textarea id="rmReplyBody" rows="4" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:8px;font-family:Poppins,sans-serif;" placeholder="${signedInReply?'Write a personal reply…':'Reporter was not signed in — mailbox reply unavailable'}" ${signedInReply?'':'disabled'}></textarea>
      <button class="action-btn view" style="margin-top:8px;" ${signedInReply?'':'disabled'} data-act="replyReportMailbox" data-a1="${r.firebaseKey}"><i class="fas fa-paper-plane"></i> Send Reply</button>
      ${r.adminReply&&r.adminReply.body?`<div style="margin-top:10px;padding:10px;border-radius:10px;background:rgba(0,191,166,0.08);border:1px solid rgba(0,191,166,0.2);font-size:0.8rem;color:var(--muted);"><strong style="color:var(--accent2);">Last reply</strong><div style="margin-top:4px;">${esc(r.adminReply.body).slice(0,280)}</div></div>`:''}
    </div>`;
    actDiv.innerHTML=acts;

    document.getElementById('reportModal').classList.add('show');
    document.body.style.overflow='hidden';
}
function closeReportModal() { document.getElementById('reportModal').classList.remove('show'); document.body.style.overflow=''; }

let currentPreviewImages=[], currentPreviewIndex=0;
function openImgPreview(idx) {
    currentPreviewIndex=idx;
    if(!currentPreviewImages.length) return;
    updatePreview();
    document.getElementById('imgPreviewOverlay').classList.add('show');
    document.body.style.overflow='hidden';
}
function updatePreview() {
    const raw=currentPreviewImages[currentPreviewIndex];
    if(!raw) return;
    const src=raw.startsWith('data:')?raw:`data:image/png;base64,${raw}`;
    document.getElementById('imgPreviewFull').src=src;
    document.getElementById('imgPreviewCounter').textContent=(currentPreviewIndex+1)+' / '+currentPreviewImages.length;
    document.getElementById('previewPrevBtn').disabled=currentPreviewIndex===0;
    document.getElementById('previewNextBtn').disabled=currentPreviewIndex===currentPreviewImages.length-1;
    document.getElementById('previewPrevBtn').style.display=currentPreviewImages.length>1?'':'none';
    document.getElementById('previewNextBtn').style.display=currentPreviewImages.length>1?'':'none';
}
function prevImage() { if(currentPreviewIndex>0){currentPreviewIndex--;updatePreview();} }
function nextImage() { if(currentPreviewIndex<currentPreviewImages.length-1){currentPreviewIndex++;updatePreview();} }
function closeImgPreview() { document.getElementById('imgPreviewOverlay').classList.remove('show'); document.body.style.overflow=''; }
function downloadPreview() {
    const img=document.getElementById('imgPreviewFull');
    const a=document.createElement('a'); a.href=img.src; a.download=`screenshot-${currentPreviewIndex+1}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ==================== FEATURE FLAGS ====================
let _editingFFKey = null;

/** Shell page keys — must match desktop IShellNavigation / ShowShellPage keys. */
const PAGE_FLAG_CATALOG = [
    { key: 'home', title: 'Home', icon: 'fa-home' },
    { key: 'fps', title: 'FPS', icon: 'fa-tachometer-alt' },
    { key: 'ipad', title: 'Custom View (iPad)', icon: 'fa-tablet-alt' },
    { key: 'tools', title: 'Tools', icon: 'fa-toolbox' },
    { key: 'optimization', title: 'Optimization', icon: 'fa-rocket' },
    { key: 'dns', title: 'DNS / Network', icon: 'fa-network-wired' },
    { key: 'filemanager', title: 'File Manager', icon: 'fa-folder-open' },
    { key: 'contact', title: 'Contact', icon: 'fa-envelope' },
    { key: 'chat', title: 'Chat', icon: 'fa-comments' },
    { key: 'report', title: 'Bug Report', icon: 'fa-bug' },
    { key: 'settings', title: 'Settings', icon: 'fa-cog' },
    { key: 'adbdiagnostic', title: 'ADB Diagnostic', icon: 'fa-stethoscope' },
    { key: 'keymap', title: 'MuMu Keymap', icon: 'fa-keyboard' },
];
const PAGE_FLAG_KEYS = new Set(PAGE_FLAG_CATALOG.map(p => p.key));

/**
 * In-page capability catalogs (card-level first). Keys must match app FeatureGate.IsAllowed later.
 * Start with Tools; other pages fill in as we wire them.
 */
const PAGE_FEATURE_CATALOG = {
    home: [
        { key: 'home_language', title: 'Language Selector', icon: 'fa-globe', desc: 'Language picker in the Home hero' },
        { key: 'home_time', title: 'Time Card', icon: 'fa-clock', desc: 'Live clock and day-progress atmosphere card' },
        { key: 'home_system_status', title: 'System Status', icon: 'fa-heartbeat', desc: 'CPU / RAM / network / uptime metrics' },
        { key: 'home_overview', title: 'Overview', icon: 'fa-info-circle', desc: 'About Bari Plux + core feature tiles' },
        { key: 'home_activity_log', title: 'Activity Log', icon: 'fa-list', desc: 'Recent activity list with clear / export' },
    ],
    tools: [
        { key: 'tools_game_files', title: 'Game Files', icon: 'fa-file-archive', desc: 'Backup / restore PUBG .pak files' },
        { key: 'tools_configuration', title: 'Configuration', icon: 'fa-sliders-h', desc: 'Active.sav + keymap helpers' },
        { key: 'tools_custom_obb', title: 'Custom OBB', icon: 'fa-cube', desc: 'Install custom OBB packages' },
        { key: 'tools_installation', title: 'Installation', icon: 'fa-download', desc: 'Install APK / manage apps' },
        { key: 'tools_system_tools', title: 'System Tools', icon: 'fa-desktop', desc: 'Kill ADB + desktop shortcuts' },
        { key: 'tools_defender_exclusion', title: 'Defender Exclusion', icon: 'fa-shield-alt', desc: 'Windows Defender path exclusions' },
        { key: 'tools_redmagic_registry', title: 'RedMagic Registry', icon: 'fa-magic', desc: '90 FPS unlock registry tweaks' },
        { key: 'tools_gameloop_control', title: 'GameLoop Control', icon: 'fa-gamepad', desc: 'Open / close GameLoop + Chinese files' },
        { key: 'tools_uninstall_emulator', title: 'Uninstall Emulator', icon: 'fa-trash-alt', desc: 'Uninstall GameLoop / MuMu leftovers' },
        { key: 'tools_mouse_customization', title: 'Mouse Customization', icon: 'fa-mouse-pointer', desc: 'Swap GameLoop cursor assets' },
        { key: 'tools_temp_mover', title: 'Temp Mover', icon: 'fa-hdd', desc: 'Move GameLoop temp folder to another drive' },
        { key: 'tools_downloads', title: 'Downloads', icon: 'fa-external-link-alt', desc: 'Open PUBG / GameLoop download pages' },
    ],
    optimization: [
        { key: 'optimization_match_prep', title: 'Match Prep', icon: 'fa-flag-checkered', desc: 'Pre-match pipeline (ADB + shaders)' },
        { key: 'optimization_smart_settings', title: 'AI Smart GameLoop Settings', icon: 'fa-magic', desc: 'Auto-tune GameLoop Perf / Quality' },
        { key: 'optimization_one_tap', title: 'One-Tap Optimize', icon: 'fa-bolt', desc: 'Safe Windows / GameLoop tune pack' },
        { key: 'optimization_game_boost', title: 'Game Boost', icon: 'fa-rocket', desc: 'Windows Game Mode style boost' },
        { key: 'optimization_system_optimize', title: 'System Optimize', icon: 'fa-tachometer-alt', desc: 'Quick system optimize / scan' },
        { key: 'optimization_adb_boost', title: 'ADB Boost', icon: 'fa-mobile-alt', desc: 'Emulator ADB boost packs' },
        { key: 'optimization_deep_clean', title: 'Deep Cleaner', icon: 'fa-broom', desc: 'Scan / clean GameLoop junk' },
        { key: 'optimization_temp_files', title: 'Temp Files', icon: 'fa-file', desc: 'Open / clean Windows TEMP' },
        { key: 'optimization_user_temp', title: 'User Temp', icon: 'fa-folder', desc: 'Open / clean user temp folder' },
        { key: 'optimization_prefetch', title: 'Prefetch', icon: 'fa-database', desc: 'Open / clean Windows Prefetch' },
        { key: 'optimization_junk_ram', title: 'Junk & RAM Cleaner', icon: 'fa-memory', desc: 'Junk cleanup + RAM cleaner' },
        { key: 'optimization_clean_all', title: 'Clean All', icon: 'fa-trash', desc: 'Combined cleanup pass' },
        { key: 'optimization_shader_cache', title: 'PUBG Shader Cache', icon: 'fa-cube', desc: 'Open / clean PUBG shader cache' },
        { key: 'optimization_driver_cleanup', title: 'Driver Cleanup', icon: 'fa-hdd', desc: 'Remove old / unused drivers' },
        { key: 'optimization_optimize_drivers', title: 'Optimize Drivers', icon: 'fa-cogs', desc: 'Scan / update drivers' },
        { key: 'optimization_gpu_high_perf', title: 'GPU High Performance', icon: 'fa-tv', desc: 'Force high-perf GPU preference' },
        { key: 'optimization_mmcss', title: 'MMCSS Games Profile', icon: 'fa-sliders-h', desc: 'Apply / restore MMCSS Games profile' },
        { key: 'optimization_responsiveness', title: 'System Responsiveness', icon: 'fa-heartbeat', desc: 'Apply / restore responsiveness tweak' },
        { key: 'optimization_game_dvr', title: 'Game DVR / Game Bar', icon: 'fa-video', desc: 'Apply / restore Game DVR disable' },
        { key: 'optimization_virtual_memory', title: 'Virtual Memory', icon: 'fa-server', desc: 'Increase / revert pagefile' },
        { key: 'optimization_system_services', title: 'System Services', icon: 'fa-wrench', desc: 'Optimize / restore Windows services' },
        { key: 'optimization_network', title: 'Network Optimization', icon: 'fa-network-wired', desc: 'Optimize / restore network tweaks' },
        { key: 'optimization_delivery_opt', title: 'Delivery Optimization', icon: 'fa-cloud-download-alt', desc: 'Delivery Optimization P2P settings' },
        { key: 'optimization_background_services', title: 'Background Services', icon: 'fa-layer-group', desc: 'Optimize / restore background services' },
        { key: 'optimization_gameloop_priority', title: 'GameLoop Priority', icon: 'fa-sort-amount-up', desc: 'High / normal GameLoop process priority' },
        { key: 'optimization_gameloop_exclusion', title: 'GameLoop Exclusion', icon: 'fa-shield-alt', desc: 'Defender exclusion for GameLoop' },
    ],
    dns: [
        { key: 'dns_speed_test', title: 'DNS Speed Test', icon: 'fa-tachometer-alt', desc: 'Test / apply DNS, auto-test, reset to DHCP' },
        { key: 'dns_popular_servers', title: 'Popular DNS Servers', icon: 'fa-globe', desc: 'Quick-pick Google, Cloudflare, Quad9, and more' },
        { key: 'dns_custom', title: 'Custom DNS', icon: 'fa-edit', desc: 'Manual IPv4 / IPv6 DNS apply and reset' },
    ],
    filemanager: [
        { key: 'filemanager_device_ops', title: 'Device Transfer Ops', icon: 'fa-exchange-alt', desc: 'Push / Pull / Install APK toolbar' },
        { key: 'filemanager_folder_ops', title: 'Folder Create Ops', icon: 'fa-folder-plus', desc: 'New file / New folder toolbar' },
        { key: 'filemanager_view_filter', title: 'View & Filter', icon: 'fa-th-list', desc: 'Display mode and file filter dropdowns' },
        { key: 'filemanager_pc_places', title: 'PC Places', icon: 'fa-desktop', desc: 'This PC and Windows folder shortcuts' },
        { key: 'filemanager_android_places', title: 'Android Places', icon: 'fa-mobile-alt', desc: 'SdCard, data, OBB, system shortcuts' },
        { key: 'filemanager_bookmarks', title: 'Bookmarks', icon: 'fa-star', desc: 'Saved bookmark list' },
        { key: 'filemanager_transfer_history', title: 'Transfer History', icon: 'fa-history', desc: 'Sidebar transfer history entry' },
        { key: 'filemanager_storage', title: 'Storage Meter', icon: 'fa-hdd', desc: 'Bottom sidebar free-space card' },
        { key: 'filemanager_properties', title: 'Properties Panel', icon: 'fa-info-circle', desc: 'Right-side file properties inspector' },
    ],
    settings: [
        { key: 'settings_account', title: 'Account / Login', icon: 'fa-user', desc: 'Sign-in card and account details' },
        { key: 'cloud_backup', title: 'Cloud Backup', icon: 'fa-cloud', desc: 'Backup / restore settings to the cloud' },
        { key: 'settings_theme', title: 'Appearance / Theme', icon: 'fa-palette', desc: 'Theme swatch picker' },
        { key: 'settings_emulator_profile', title: 'Emulator Profile', icon: 'fa-mobile-alt', desc: 'GameLoop / MuMu profile and paths' },
        { key: 'settings_ui_scale', title: 'UI Scale', icon: 'fa-text-height', desc: 'Window zoom / UI scale controls' },
        { key: 'settings_program_info', title: 'Program Information', icon: 'fa-info-circle', desc: 'App name, version, and build info' },
        { key: 'settings_system_specs', title: 'System Specifications', icon: 'fa-microchip', desc: 'CPU / RAM / display specs panel' },
        { key: 'settings_report_bug', title: 'Report Bug', icon: 'fa-bug', desc: 'Shortcut to the report page' },
        { key: 'settings_whats_new', title: "What's New", icon: 'fa-star', desc: 'Changelog / release notes card' },
    ],
    fps: [
        { key: 'fps_pubg_version', title: 'PUBG Mobile Version', icon: 'fa-mobile-alt', desc: 'PUBG / BGMI package version selector on the FPS page' },
        { key: 'fps_domain_scope', title: 'Domain Scope', icon: 'fa-layer-group', desc: 'All / Combat / Lobby / Hub / Home scope tabs' },
        { key: 'fps_graphics_quality', title: 'Graphics Quality', icon: 'fa-image', desc: 'Smooth through Ultra HD quality presets' },
        { key: 'fps_comparison', title: 'Quality Comparison', icon: 'fa-columns', desc: 'Side-by-side graphics comparison preview' },
        { key: 'fps_frame_rate', title: 'Frame Rate', icon: 'fa-tachometer-alt', desc: '90 / 120 FPS presets' },
        { key: 'fps_lobby_graphics', title: 'Lobby Graphics', icon: 'fa-door-open', desc: 'Lobby graphics enhancement on/off' },
        { key: 'fps_style', title: 'Visual Style', icon: 'fa-palette', desc: 'Classic / Colorful / Realistic / Soft / Movie styles' },
        { key: 'fps_adb_diagnostic', title: 'ADB Diagnostic Shortcut', icon: 'fa-stethoscope', desc: 'Quick link to ADB diagnostic page' },
        { key: 'fps_apply_preset', title: 'Apply Preset Bar', icon: 'fa-check-circle', desc: 'Bottom selected-preset summary and Apply button' },
    ],
    ipad: [
        { key: 'ipad_monitor_display', title: 'Monitor Display', icon: 'fa-desktop', desc: 'Open Windows custom resolutions window' },
        { key: 'ipad_keymapping_backup', title: 'Keymapping Backup', icon: 'fa-save', desc: 'Backup / restore / fix TVM_100 keymapping' },
        { key: 'ipad_ratio_4_3', title: '4:3 Presets', icon: 'fa-tablet-alt', desc: 'Classic iPad 4:3 resolution presets' },
        { key: 'ipad_ratio_5_4', title: '5:4 Presets', icon: 'fa-tablet-alt', desc: '5:4 resolution presets' },
        { key: 'ipad_ratio_32_27', title: '32:27 Presets', icon: 'fa-tablet-alt', desc: '32:27 resolution presets' },
        { key: 'ipad_ratio_96_95', title: '96:95 Presets', icon: 'fa-tablet-alt', desc: 'Near-square 96:95 resolution presets' },
        { key: 'ipad_custom_resolution', title: 'Custom Resolution', icon: 'fa-edit', desc: 'Manual width × height apply' },
        { key: 'ipad_info', title: 'How It Works / Notes', icon: 'fa-info-circle', desc: 'Bottom info tip cards' },
    ],
    contact: [
        { key: 'contact_support', title: 'Direct Support', icon: 'fa-headset', desc: 'Website / Telegram / Discord / Email tiles' },
        { key: 'contact_socials', title: 'Social Media', icon: 'fa-share-alt', desc: 'YouTube / Instagram / TikTok / Kick tiles' },
        { key: 'contact_report_bug', title: 'Report Bug Shortcut', icon: 'fa-bug', desc: 'Navigate to the report page from Contact' },
    ],
    chat: [
        { key: 'chat_rooms', title: 'Rooms', icon: 'fa-door-open', desc: 'General / Help / Offtopic room chips' },
        { key: 'chat_search', title: 'Search', icon: 'fa-search', desc: 'Message search box in the header' },
        { key: 'chat_pin', title: 'Pinned Message', icon: 'fa-thumbtack', desc: 'Pin banner and admin pin controls' },
        { key: 'chat_messages', title: 'Message List', icon: 'fa-comments', desc: 'Lobby message feed panel' },
        { key: 'chat_composer', title: 'Composer', icon: 'fa-paper-plane', desc: 'Message input and send button' },
        { key: 'chat_formatting', title: 'Text Formatting', icon: 'fa-bold', desc: 'Bold / italic / underline / strike toolbar' },
        { key: 'chat_emoji', title: 'Emoji Picker', icon: 'fa-smile', desc: 'Emoji picker button in the composer' },
        { key: 'chat_images', title: 'Image Attachments', icon: 'fa-image', desc: 'Attach and send images' },
        { key: 'chat_reactions', title: 'Reactions', icon: 'fa-heart', desc: 'Message reaction toggles' },
        { key: 'chat_report', title: 'Report Message', icon: 'fa-flag', desc: 'Report a message to moderators' },
    ],
    report: [
        { key: 'report_form', title: 'Bug Description Form', icon: 'fa-align-left', desc: 'Main bug description text area' },
        { key: 'report_formatting', title: 'Text Formatting', icon: 'fa-bold', desc: 'Bold / italic / underline / strike toolbar' },
        { key: 'report_email', title: 'Contact Email', icon: 'fa-envelope', desc: 'Optional contact email field' },
        { key: 'report_screenshots', title: 'Screenshots', icon: 'fa-image', desc: 'Attach up to 3 screenshots' },
        { key: 'report_submit', title: 'Submit Report', icon: 'fa-paper-plane', desc: 'Submit bug report button card' },
        { key: 'report_tips', title: 'Reporting Tips', icon: 'fa-lightbulb', desc: 'What to include tips section' },
    ],
    adbdiagnostic: [
        { key: 'adb_run', title: 'Run Diagnostic', icon: 'fa-play', desc: 'Start / retry ADB diagnostic button' },
        { key: 'adb_progress', title: 'Progress Card', icon: 'fa-spinner', desc: 'Live diagnostic progress bar' },
        { key: 'adb_summary', title: 'Summary Result', icon: 'fa-clipboard-check', desc: 'Final status, recommendation, and retry' },
        { key: 'adb_copy_report', title: 'Copy Report', icon: 'fa-copy', desc: 'Copy human-readable diagnostic report' },
        { key: 'adb_steps', title: 'Diagnostic Steps', icon: 'fa-list-ol', desc: 'Per-step diagnostic log list' },
    ],
    keymap: [
        { key: 'keymap_selection', title: 'Keymap Selection', icon: 'fa-keyboard', desc: 'Browse and apply MuMu keymaps from the database' },
        { key: 'keymap_backup', title: 'Backup / Restore', icon: 'fa-save', desc: 'Backup, restore, delete MuMu keymap config; open config folder' },
        { key: 'keymap_autobackup', title: 'Auto Backup', icon: 'fa-clock', desc: '30-minute auto-backup timer with toggle, status badge, and delete config' },
        { key: 'keymap_info', title: 'Info / Notes', icon: 'fa-info-circle', desc: 'How it works, about keymaps, and important notes tip cards' },
    ],
};

let _ffFlagsCache = {};
let _ffOpenPageKey = null;

function isPageFlagKey(key) {
    return PAGE_FLAG_KEYS.has(key);
}

function getCatalogedFeatureKeys() {
    const keys = new Set();
    Object.values(PAGE_FEATURE_CATALOG).forEach(list => list.forEach(f => keys.add(f.key)));
    return keys;
}

function getPageFeatures(pageKey) {
    return PAGE_FEATURE_CATALOG[pageKey] || [];
}

function getPageMeta(pageKey) {
    return PAGE_FLAG_CATALOG.find(p => p.key === pageKey) || { key: pageKey, title: pageKey, icon: 'fa-flag' };
}

function roleSelectHtml(selected, act, key) {
    const roles = [
        ['free', '● Free'],
        ['pro', '⭐ Pro'],
        ['dev', '🛠️ Dev'],
        ['founder', '👑 Founder'],
    ];
    const opts = roles.map(([v, label]) =>
        `<option value="${v}"${(selected || 'free') === v ? ' selected' : ''}>${label}</option>`
    ).join('');
    return `<select data-act="${act}" data-a1="${esc(key)}" data-pass-value="1">${opts}</select>`;
}

/** The full set of emulators a flag can be scoped to - kept in one place so the admin-panel
 * selector, badge, and RTDB writer all agree on the same tag list. */
const EMULATOR_TAGS = [
    ['gameloop', 'GameLoop'],
    ['mumu', 'MuMu'],
    ['ldplayer14', 'LDPlayer 14'],
    ['ldplayer9', 'LDPlayer 9'],
    ['bluestacks', 'BlueStacks'],
    ['tac', 'TAC'],
];
const EMULATOR_TAG_SET = new Set(EMULATOR_TAGS.map(([v]) => v));

/** Accepts the current schema (an array/object of tags) or the original single-string schema
 * ("all"/"gameloop"/"mumu") for backward compat with flags saved before the multi-select chip UI
 * shipped. Always returns a sorted array of known tags; empty = no restriction ("all"). */
function normalizeEmulatorScopes(value) {
    let raw;
    if (Array.isArray(value)) raw = value;
    else if (value && typeof value === 'object') raw = Object.values(value);
    else if (typeof value === 'string' && value && value !== 'all') raw = [value];
    else raw = [];
    const tags = raw
        .map(v => String(v || '').trim().toLowerCase())
        .filter(v => EMULATOR_TAG_SET.has(v));
    return [...new Set(tags)].sort();
}

function readPageFlagState(flag) {
    if (!flag) return { missing: true, enabled: true, visible: true, role: 'free', emulator: [] };
    const visible = typeof flag.visible === 'boolean' ? flag.visible : true;
    return {
        missing: false,
        enabled: flag.enabled === true,
        visible,
        role: flag.min_role || 'free',
        emulator: normalizeEmulatorScopes(flag.emulator)
    };
}

function defaultPageFlagPayload(extra = {}) {
    const now = Date.now();
    const payload = {
        enabled: true,
        visible: true,
        min_role: 'free',
        created_at: now,
        updated_at: now,
        ...extra
    };
    // "all" (no restriction) is represented by omitting the key entirely - RTDB doesn't store an
    // empty array anyway, and the BPT/admin parsers already treat "missing" as "all".
    if (Array.isArray(payload.emulator) && payload.emulator.length === 0) delete payload.emulator;
    return payload;
}

function toggleEmulatorTag(list, tag) {
    return list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag].sort();
}

function emulatorChipsHtml(selected, act, key) {
    const list = normalizeEmulatorScopes(selected);
    const onStyle = 'border-color:rgba(33,150,243,0.4);color:#2196F3;background:rgba(33,150,243,0.12);';
    const offStyle = 'border-color:rgba(255,255,255,0.12);color:var(--muted);';
    const allChip = `<button type="button" class="action-btn" style="${list.length === 0 ? onStyle : offStyle}" data-act="${act}" data-a1="${esc(key)}" data-a2="__all__">All</button>`;
    const tagChips = EMULATOR_TAGS.map(([tag, label]) =>
        `<button type="button" class="action-btn" style="${list.includes(tag) ? onStyle : offStyle}" data-act="${act}" data-a1="${esc(key)}" data-a2="${tag}">${esc(label)}</button>`
    ).join('');
    return `<div style="display:flex;flex-wrap:wrap;gap:6px;">${allChip}${tagChips}</div>`;
}

function emulatorBadgeLabel(emulator) {
    const list = normalizeEmulatorScopes(emulator);
    if (!list.length) return 'ALL';
    return list.map(t => t.toUpperCase()).join('+');
}

function renderFlagControlCard({ key, title, icon, desc, s, kind }) {
    const emu = normalizeEmulatorScopes(s.emulator);
    const badges = s.missing
        ? `<span class="ff-page-badge off">NOT SEEDED</span>`
        : `<div class="ff-page-badges">
            <span class="ff-page-badge ${s.visible ? 'on' : 'off'}">${s.visible ? 'SHOWN' : 'HIDDEN'}</span>
            <span class="ff-page-badge ${s.enabled ? 'on' : 'off'}">${s.enabled ? 'ON' : 'OFF'}</span>
            <span class="ff-page-badge ${emu.length === 0 ? 'on' : 'off'}">${emulatorBadgeLabel(emu)}</span>
           </div>`;
    const visLabel = s.visible ? '<i class="fas fa-eye-slash"></i> Hide' : '<i class="fas fa-eye"></i> Show';
    const visStyle = s.visible
        ? 'border-color:rgba(255,152,0,0.35);color:#FF9800;'
        : 'border-color:rgba(76,175,80,0.3);color:#4CAF50;';
    const enLabel = s.enabled ? '<i class="fas fa-toggle-off"></i> Disable' : '<i class="fas fa-toggle-on"></i> Enable';
    const enStyle = s.enabled
        ? 'border-color:rgba(244,67,54,0.3);color:#F44336;'
        : 'border-color:rgba(76,175,80,0.3);color:#4CAF50;';
    const cardOff = !s.missing && (!s.visible || !s.enabled);
    const roleAct = kind === 'page' ? 'updatePageFlagRole' : 'updateFeatureFlagRole';
    const emuAct = kind === 'page' ? 'updatePageFlagEmulator' : 'updateFeatureFlagEmulator';
    const visAct = kind === 'page' ? 'togglePageFlagVisible' : 'toggleFeatureFlagVisible';
    const enAct = kind === 'page' ? 'togglePageFlagEnabled' : 'toggleFeatureFlagEnabled';
    const visNext = s.visible ? 'false' : 'true';
    const enNext = s.enabled ? 'false' : 'true';
    const descHtml = desc ? `<div style="font-size:0.75rem;color:var(--muted);line-height:1.4;margin-top:2px;">${esc(desc)}</div>` : '';
    return `<div class="ff-page-card${s.missing ? ' missing' : ''}${cardOff ? ' off' : ''}">
        <div class="ff-page-head">
            <div>
                <div class="ff-page-title"><i class="fas ${icon}"></i> ${esc(title)}</div>
                <div class="ff-page-key">${esc(key)}</div>
                ${descHtml}
            </div>
            ${badges}
        </div>
        <div class="ff-page-controls">
            <label>
                <span class="lbl">Minimum role</span>
                ${roleSelectHtml(s.role, roleAct, key)}
            </label>
            <label>
                <span class="lbl">Emulator(s)</span>
                ${emulatorChipsHtml(emu, emuAct, key)}
            </label>
            <div class="ff-page-toggles">
                <button class="action-btn" style="${visStyle}" data-act="${visAct}" data-a1="${esc(key)}" data-a2="${visNext}" title="Show or hide in the app UI">${visLabel}</button>
                <button class="action-btn" style="${enStyle}" data-act="${enAct}" data-a1="${esc(key)}" data-a2="${enNext}" title="Allow or block using this capability">${enLabel}</button>
            </div>
        </div>
    </div>`;
}

function renderPageFlagsGrid(data) {
    const grid = document.getElementById('ffPagesGrid');
    if (!grid) return;
    grid.innerHTML = PAGE_FLAG_CATALOG.map(p => {
        const s = readPageFlagState(data[p.key]);
        const featCount = getPageFeatures(p.key).length;
        const featLabel = featCount
            ? `${featCount} feature${featCount === 1 ? '' : 's'}`
            : 'No features yet';
        const badges = s.missing
            ? `<span class="ff-page-badge off">NOT SEEDED</span>`
            : `<div class="ff-page-badges">
                <span class="ff-page-badge ${s.visible ? 'on' : 'off'}">${s.visible ? 'SHOWN' : 'HIDDEN'}</span>
                <span class="ff-page-badge ${s.enabled ? 'on' : 'off'}">${s.enabled ? 'ON' : 'OFF'}</span>
               </div>`;
        const cardOff = !s.missing && (!s.visible || !s.enabled);
        return `<div class="ff-page-card${s.missing ? ' missing' : ''}${cardOff ? ' off' : ''}">
            <div class="ff-page-head">
                <div>
                    <div class="ff-page-title"><i class="fas ${p.icon}"></i> ${esc(p.title)}</div>
                    <div class="ff-page-key">${esc(p.key)}</div>
                    <div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">${featLabel}</div>
                </div>
                ${badges}
            </div>
            <button type="button" class="action-btn ff-open-page" data-act="openPageFlagDetail" data-a1="${esc(p.key)}">
                <i class="fas fa-folder-open"></i> Open page
            </button>
        </div>`;
    }).join('');
}

function openPageFlagDetail(pageKey) {
    if (!isPageFlagKey(pageKey)) return;
    _ffOpenPageKey = pageKey;
    const meta = getPageMeta(pageKey);
    document.getElementById('ffPagesGrid').style.display = 'none';
    document.getElementById('ffPagesSectionTitle').style.display = 'none';
    document.getElementById('ffOrphanFeaturesBlock').style.display = 'none';
    const detail = document.getElementById('ffPageDetail');
    detail.classList.add('show');
    document.getElementById('ffDetailPageTitle').innerHTML =
        `<i class="fas ${meta.icon}" style="color:var(--accent);margin-right:6px;"></i>${esc(meta.title)} <span class="ff-page-key" style="display:inline;margin-left:6px;">${esc(pageKey)}</span>`;
    renderPageDetailContent(_ffFlagsCache);
    // Auto-seed catalog features for this page so toggles work immediately.
    seedPageFeatures(pageKey, { silentIfNone: true }).then(seeded => {
        if (seeded) loadFeatureFlags();
    });
}

function closePageFlagDetail() {
    _ffOpenPageKey = null;
    document.getElementById('ffPageDetail').classList.remove('show');
    document.getElementById('ffPagesGrid').style.display = '';
    document.getElementById('ffPagesSectionTitle').style.display = '';
    document.getElementById('ffOrphanFeaturesBlock').style.display = '';
}

function renderPageDetailContent(data) {
    if (!_ffOpenPageKey) return;
    const pageKey = _ffOpenPageKey;
    const meta = getPageMeta(pageKey);
    const pageState = readPageFlagState(data[pageKey]);
    document.getElementById('ffDetailPagePanel').innerHTML = renderFlagControlCard({
        key: pageKey,
        title: meta.title + ' (page)',
        icon: meta.icon,
        desc: 'Shell page gate — menu visibility and whether the page can open',
        s: pageState,
        kind: 'page'
    });

    const features = getPageFeatures(pageKey);
    const grid = document.getElementById('ffDetailFeaturesGrid');
    const hint = document.getElementById('ffDetailFeaturesHint');
    if (hint) hint.textContent = features.length
        ? `${features.length} catalogued capabilities — add more in code as we wire the app`
        : 'No catalogued features for this page yet';

    if (!features.length) {
        grid.innerHTML = `<div class="ff-features-empty" style="grid-column:1/-1;">
            <div style="font-size:1.6rem;margin-bottom:8px;opacity:0.4;">🧩</div>
            No features catalogued for <strong>${esc(meta.title)}</strong> yet.<br>
            <span style="font-size:0.8rem;">We’ll add them page by page as we wire the app.</span>
        </div>`;
        return;
    }

    grid.innerHTML = features.map(f => renderFlagControlCard({
        key: f.key,
        title: f.title,
        icon: f.icon || 'fa-puzzle-piece',
        desc: f.desc || '',
        s: readPageFlagState(data[f.key]),
        kind: 'feature'
    })).join('');
}

// BPT (3.x) gets its own Feature Flags catalog, independent from the legacy WPF (2.x) app - same
// split already established for update-config/maintenance/access above. This catalog (page
// visibility/enable + ~108 in-page capability flags) had zero consumers on either app line before
// BPT's RemoteFeatureFlagService was built to read feature_flags_3x specifically, so "2x" here just
// keeps writing the original unversioned node in case it's ever wired up for the old app too.
let _featureFlagsLine = '3x';
function featureFlagsRoot(line) {
    return line === '2x' ? 'feature_flags' : 'feature_flags_3x';
}
function onFeatureFlagsLineChange() {
    _featureFlagsLine = document.querySelector('input[name="featureFlagsLine"]:checked')?.value === '2x' ? '2x' : '3x';
    loadFeatureFlags();
}

async function seedPageFeatures(pageKey, { silentIfNone = false } = {}) {
    const features = getPageFeatures(pageKey);
    if (!features.length) {
        if (!silentIfNone) showToast('ℹ️ No feature catalog for this page yet', 'success');
        return 0;
    }
    const snap = await db.ref(featureFlagsRoot(_featureFlagsLine)).once('value');
    const data = snap.val() || {};
    const ops = [];
    for (const f of features) {
        if (data[f.key]) continue;
        ops.push(db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${f.key}`).set(defaultPageFlagPayload({ page: pageKey })));
    }
    if (!ops.length) {
        if (!silentIfNone) showToast('✅ All features already seeded', 'success');
        return 0;
    }
    await Promise.all(ops);
    if (!silentIfNone) showToast(`✅ Seeded ${ops.length} feature(s) for ${pageKey}`, 'success');
    return ops.length;
}

async function seedPageFeaturesForCurrent() {
    if (!_ffOpenPageKey) return;
    try {
        const n = await seedPageFeatures(_ffOpenPageKey);
        if (n > 0) loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Seed failed: ' + e.message, 'danger');
    }
}

async function ensureFeatureFlagExists(key, pageKey) {
    const snap = await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).once('value');
    if (snap.exists()) return snap.val() || {};
    const payload = defaultPageFlagPayload(pageKey ? { page: pageKey } : {});
    await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).set(payload);
    return payload;
}

async function updateFeatureFlagRole(key, role) {
    try {
        await ensureFeatureFlagExists(key, _ffOpenPageKey);
        await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).update({ min_role: role, updated_at: Date.now() });
        showToast(`✅ ${key} → min role ${role}`, 'success');
        loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Failed to update role: ' + e.message, 'danger');
    }
}

async function toggleFeatureFlagVisible(key, newVal) {
    try {
        await ensureFeatureFlagExists(key, _ffOpenPageKey);
        await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).update({ visible: !!newVal, updated_at: Date.now() });
        showToast(newVal ? `👁 ${key} shown` : `🙈 ${key} hidden`, 'success');
        loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Failed to update visibility: ' + e.message, 'danger');
    }
}

async function toggleFeatureFlagEnabled(key, newVal) {
    try {
        await ensureFeatureFlagExists(key, _ffOpenPageKey);
        await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).update({ enabled: !!newVal, updated_at: Date.now() });
        showToast(newVal ? `✅ ${key} enabled` : `⛔ ${key} disabled`, 'success');
        loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Failed to toggle: ' + e.message, 'danger');
    }
}

async function seedMissingPageFlags() {
    if (!db) return;
    try {
        const snap = await db.ref(featureFlagsRoot(_featureFlagsLine)).once('value');
        const data = snap.val() || {};
        const ops = [];
        for (const p of PAGE_FLAG_CATALOG) {
            if (data[p.key]) continue;
            ops.push(db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${p.key}`).set(defaultPageFlagPayload()));
        }
        if (!ops.length) {
            showToast('✅ All app pages already seeded', 'success');
            return;
        }
        await Promise.all(ops);
        showToast(`✅ Seeded ${ops.length} page flag(s) (shown + enabled + free)`, 'success');
        loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Seed failed: ' + e.message, 'danger');
    }
}

async function updatePageFlagRole(key, role) {
    if (!isPageFlagKey(key)) return;
    try {
        const snap = await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).once('value');
        if (!snap.exists()) {
            await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).set(defaultPageFlagPayload({ min_role: role }));
        } else {
            await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).update({ min_role: role, updated_at: Date.now() });
        }
        showToast(`✅ ${key} → min role ${role}`, 'success');
        loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Failed to update role: ' + e.message, 'danger');
    }
}

/** Writes the resolved emulator array back to RTDB, or clears the key entirely for "all" -
 * RTDB doesn't store an empty array, and "missing" is already how every parser reads "all". */
async function writeFlagEmulatorScope(key, list) {
    const ref = db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`);
    if (list.length === 0) {
        await ref.update({ emulator: null, updated_at: Date.now() });
    } else {
        await ref.update({ emulator: list, updated_at: Date.now() });
    }
}

async function updatePageFlagEmulator(key, tag) {
    if (!isPageFlagKey(key)) return;
    try {
        const existing = await ensurePageFlagExists(key);
        const current = normalizeEmulatorScopes(existing.emulator);
        const next = tag === '__all__' ? [] : toggleEmulatorTag(current, tag);
        await writeFlagEmulatorScope(key, next);
        showToast(`✅ ${key} → emulator ${next.length ? next.join('+') : 'all'}`, 'success');
        loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Failed to update emulator: ' + e.message, 'danger');
    }
}

async function updateFeatureFlagEmulator(key, tag) {
    if (isPageFlagKey(key)) return;
    try {
        const snap = await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).once('value');
        const existing = snap.exists() ? (snap.val() || {}) : null;
        const current = normalizeEmulatorScopes(existing && existing.emulator);
        const next = tag === '__all__' ? [] : toggleEmulatorTag(current, tag);
        if (!existing) {
            await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).set(defaultPageFlagPayload({ emulator: next }));
        } else {
            await writeFlagEmulatorScope(key, next);
        }
        showToast(`✅ ${key} → emulator ${next.length ? next.join('+') : 'all'}`, 'success');
        loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Failed to update emulator: ' + e.message, 'danger');
    }
}

async function ensurePageFlagExists(key) {
    const snap = await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).once('value');
    if (snap.exists()) return snap.val() || {};
    const payload = defaultPageFlagPayload();
    await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).set(payload);
    return payload;
}

async function togglePageFlagVisible(key, newVal) {
    if (!isPageFlagKey(key)) return;
    try {
        await ensurePageFlagExists(key);
        await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).update({ visible: !!newVal, updated_at: Date.now() });
        showToast(newVal ? `👁 ${key} shown in menu` : `🙈 ${key} hidden from menu`, 'success');
        loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Failed to update visibility: ' + e.message, 'danger');
    }
}

async function togglePageFlagEnabled(key, newVal) {
    if (!isPageFlagKey(key)) return;
    try {
        await ensurePageFlagExists(key);
        await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).update({ enabled: !!newVal, updated_at: Date.now() });
        showToast(newVal ? `✅ ${key} enabled` : `⛔ ${key} disabled`, 'success');
        loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Failed to toggle: ' + e.message, 'danger');
    }
}

/** @deprecated use togglePageFlagEnabled */
async function togglePageFlag(key, newVal) {
    return togglePageFlagEnabled(key, newVal);
}

function loadFeatureFlags() {
    const tbody = document.getElementById('featureFlagsTableBody');
    const pagesGrid = document.getElementById('ffPagesGrid');
    tbody.innerHTML = '<tr class="state-row"><td colspan="5"><div class="state-icon">⏳</div><div>Loading feature flags...</div></td></tr>';
    if (pagesGrid && !_ffOpenPageKey) pagesGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--muted);">Loading pages…</div>';
    db.ref(featureFlagsRoot(_featureFlagsLine)).once('value').then(async snap => {
        let data = snap.val() || {};
        // Auto-seed any missing shell pages (shown + enabled + free).
        const missing = PAGE_FLAG_CATALOG.filter(p => !data[p.key]);
        if (missing.length) {
            await Promise.all(missing.map(p => db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${p.key}`).set(defaultPageFlagPayload())));
            const again = await db.ref(featureFlagsRoot(_featureFlagsLine)).once('value');
            data = again.val() || {};
        }
        // Backfill visible=true on older page flags that only had enabled.
        const backfill = [];
        for (const p of PAGE_FLAG_CATALOG) {
            const f = data[p.key];
            if (f && typeof f.visible !== 'boolean') {
                backfill.push(db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${p.key}/visible`).set(true));
                f.visible = true;
            }
        }
        if (backfill.length) await Promise.all(backfill);

        _ffFlagsCache = data;
        const entries = Object.entries(data).map(([key, val]) => ({ key, ...(val || {}) }));
        document.getElementById('ffStatTotal').textContent = entries.length;
        document.getElementById('ffStatEnabled').textContent = entries.filter(e => e.enabled === true).length;
        document.getElementById('ffStatDisabled').textContent = entries.filter(e => e.enabled !== true).length;

        renderPageFlagsGrid(data);
        if (_ffOpenPageKey) renderPageDetailContent(data);

        const cataloged = getCatalogedFeatureKeys();
        const featureEntries = entries.filter(e => !isPageFlagKey(e.key) && !cataloged.has(e.key));
        featureEntries.sort((a, b) => a.key.localeCompare(b.key));

        if (!featureEntries.length) {
            tbody.innerHTML = '<tr class="state-row"><td colspan="5"><div class="state-icon">🧩</div><div>No orphan capability flags. Open a page above to manage its features.</div></td></tr>';
            document.getElementById('featureFlagsCards').innerHTML = '';
        } else {
            tbody.innerHTML = featureEntries.map((e, i) => {
                const enabled = e.enabled === true;
                const toggleBtn = enabled
                    ? `<button class="action-btn" data-act="toggleEnabled" data-a1="${esc(e.key)}" data-a2="false" style="border-color:rgba(76,175,80,0.3);color:#4CAF50;"><i class="fas fa-toggle-on"></i> Enabled</button>`
                    : `<button class="action-btn" data-act="toggleEnabled" data-a1="${esc(e.key)}" data-a2="true" style="border-color:rgba(244,67,54,0.3);color:#F44336;"><i class="fas fa-toggle-off"></i> Disabled</button>`;
                return `<tr style="animation-delay:${i*0.025}s">
                    <td style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;font-weight:600;">${esc(e.key)}</td>
                    <td>${getRoleBadgeHtml(e.min_role || 'free')}</td>
                    <td>${toggleBtn}</td>
                    <td class="time-cell">${e.created_at ? fmtDate(e.created_at) : '—'}</td>
                    <td style="white-space:nowrap;">
                        <button class="action-btn view" data-act="showFeatureFlagForm" data-a1="${esc(e.key)}"><i class="fas fa-edit"></i></button>
                        <button class="action-btn del" data-act="deleteFeatureFlag" data-a1="${esc(e.key)}"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            }).join('');

            document.getElementById('featureFlagsCards').innerHTML = featureEntries.map((e, i) => {
                const enabled = e.enabled === true;
                return `<div class="user-card" style="animation-delay:${i*0.03}s">
                    <div class="user-card-header">
                        <div style="font-weight:700;font-family:'JetBrains Mono',monospace;font-size:0.85rem;">${esc(e.key)}</div>
                        <span style="font-size:0.72rem;padding:2px 8px;border-radius:4px;background:${enabled?'rgba(76,175,80,0.15)':'rgba(244,67,54,0.15)'};color:${enabled?'#4CAF50':'#F44336'};font-weight:700;">${enabled?'ON':'OFF'}</span>
                    </div>
                    <div class="user-card-body">
                        <div class="user-card-field"><span class="uf-label">Min Role</span><span class="uf-value">${esc(e.min_role || 'free')}</span></div>
                        <div class="user-card-field"><span class="uf-label">Created</span><span class="uf-value">${e.created_at ? fmtDate(e.created_at) : '—'}</span></div>
                    </div>
                    <div class="user-card-footer" style="gap:6px;">
                        <button class="action-btn view" data-act="showFeatureFlagForm" data-a1="${esc(e.key)}"><i class="fas fa-edit"></i> Edit</button>
                        <button class="action-btn" data-act="toggleEnabled" data-a1="${esc(e.key)}" data-a2="${(!enabled).toString()}" style="${enabled?'border-color:rgba(244,67,54,0.3);color:#F44336;':'border-color:rgba(76,175,80,0.3);color:#4CAF50;'}">${enabled?'<i class="fas fa-toggle-off"></i> Disable':'<i class="fas fa-toggle-on"></i> Enable'}</button>
                        <button class="action-btn del" data-act="deleteFeatureFlag" data-a1="${esc(e.key)}"><i class="fas fa-trash"></i> Delete</button>
                    </div>
                </div>`;
            }).join('');
        }
        document.getElementById('featureFlagsLastUpdated').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
    }).catch(e => {
        console.error(e);
        tbody.innerHTML = '<tr class="state-row"><td colspan="5"><div class="state-icon">⚠️</div><div>Failed to load feature flags.</div></td></tr>';
        showToast('⚠️ Failed to load feature flags', 'danger');
    });
}

function validateFeatureKey(key) {
    return /^[a-z0-9_]+$/.test(key);
}

function showFeatureFlagForm(key) {
    if (key && isPageFlagKey(key)) {
        showToast('⚠️ Page flags are edited via Open page', 'danger');
        return;
    }
    if (key && getCatalogedFeatureKeys().has(key)) {
        showToast('⚠️ That feature is managed inside its page — open the page above', 'danger');
        return;
    }
    const form = document.getElementById('featureFlagForm');
    const title = document.getElementById('ffFormTitle');
    const keyInput = document.getElementById('ffKeyInput');
    const roleSelect = document.getElementById('ffRoleSelect');
    const enabledInput = document.getElementById('ffEnabledInput');
    const keyError = document.getElementById('ffKeyError');

    keyError.style.display = 'none';
    if (key) {
        _editingFFKey = key;
        db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).once('value').then(snap => {
            const data = snap.val() || {};
            keyInput.value = key;
            keyInput.disabled = true;
            roleSelect.value = data.min_role || 'free';
            enabledInput.checked = data.enabled === true;
            title.textContent = 'Edit Feature Flag';
            form.style.display = 'block';
            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }).catch(e => showToast('⚠️ Failed to load flag data', 'danger'));
    } else {
        _editingFFKey = null;
        keyInput.value = '';
        keyInput.disabled = false;
        roleSelect.value = 'free';
        enabledInput.checked = true;
        title.textContent = 'Add Feature Flag';
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        keyInput.focus();
    }
}

function cancelFeatureFlagForm() {
    document.getElementById('featureFlagForm').style.display = 'none';
    document.getElementById('ffKeyError').style.display = 'none';
    _editingFFKey = null;
}

async function saveFeatureFlag() {
    const keyInput = document.getElementById('ffKeyInput');
    const roleSelect = document.getElementById('ffRoleSelect');
    const enabledInput = document.getElementById('ffEnabledInput');
    const keyError = document.getElementById('ffKeyError');
    const key = keyInput.value.trim();
    const isEdit = _editingFFKey !== null;

    if (!isEdit) {
        if (!key) { showToast('⚠️ Feature key is required', 'danger'); keyInput.focus(); return; }
        if (!validateFeatureKey(key)) {
            keyError.style.display = 'block';
            showToast('⚠️ Invalid key: only lowercase letters, numbers, underscores', 'danger');
            return;
        }
        if (isPageFlagKey(key)) {
            keyError.style.display = 'block';
            showToast('⚠️ That key is an app page — use Open page', 'danger');
            return;
        }
        if (getCatalogedFeatureKeys().has(key)) {
            keyError.style.display = 'block';
            showToast('⚠️ That key is a catalogued page feature — open its page', 'danger');
            return;
        }
    }
    keyError.style.display = 'none';

    const data = {
        min_role: roleSelect.value,
        enabled: enabledInput.checked,
        updated_at: Date.now()
    };
    if (!isEdit) data.created_at = Date.now();

    const saveKey = isEdit ? _editingFFKey : key;

    try {
        await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${saveKey}`).update(data);
        showToast(isEdit ? '✅ Flag updated' : '✅ Flag created', 'success');
        cancelFeatureFlagForm();
        loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Failed to save: ' + e.message, 'danger');
    }
}

async function deleteFeatureFlag(key) {
    if (isPageFlagKey(key)) {
        showToast('⚠️ Page flags cannot be deleted — disable them instead', 'danger');
        return;
    }
    if (getCatalogedFeatureKeys().has(key)) {
        showToast('⚠️ Catalogued features cannot be deleted — Hide/Disable them inside the page', 'danger');
        return;
    }
    if (!confirm(`Delete feature flag "${key}"? This cannot be undone.`)) return;
    try {
        await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).remove();
        showToast('🗑️ Flag deleted', 'success');
        if (_editingFFKey === key) cancelFeatureFlagForm();
        loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Failed to delete: ' + e.message, 'danger');
    }
}

async function toggleEnabled(key, newVal) {
    try {
        await db.ref(`${featureFlagsRoot(_featureFlagsLine)}/${key}`).update({ enabled: !!newVal, updated_at: Date.now() });
        showToast(newVal ? '✅ Flag enabled' : '⛔ Flag disabled', 'success');
        loadFeatureFlags();
    } catch (e) {
        showToast('⚠️ Failed to toggle: ' + e.message, 'danger');
    }
}

// Two independent product lines, each with its own Firebase config node so publishing a 3.x
// (WinUI3) release never shows up as an "update available" prompt for 2.x (WPF) users and
// vice versa — they used to share a single app_config/update node, which meant the 3.0.0
// launch would have pointed every still-supported 2.3.0 WPF user at the wrong installer.
const DEFAULT_UPDATE_DOWNLOAD_URL_3X = 'https://dl.bariplux.com/BariPluxToolSetup.exe';
const DEFAULT_UPDATE_DOWNLOAD_URL_2X = 'https://dl.bariplux.com/BariPluxToolProSetup.exe';
const LEGACY_VERSION_TXT_URL = 'https://download.bariplux.com/version.txt';
let _legacyVersionTxt = null;

function updateConfigPath(line) {
    return line === '3x' ? 'app_config/update_3x' : 'app_config/update_2x';
}
function defaultDownloadUrl(line) {
    return line === '3x' ? DEFAULT_UPDATE_DOWNLOAD_URL_3X : DEFAULT_UPDATE_DOWNLOAD_URL_2X;
}

function refreshUpdatePreview(line) {
    const version = (document.getElementById(`updVersionInput_${line}`)?.value || '').trim() || '—';
    const mandatory = document.getElementById(`updMandatoryInput_${line}`)?.checked;
    const checks = document.getElementById(`updCheckEnabledInput_${line}`)?.checked;
    const box = document.getElementById(`updPreviewBox_${line}`);
    if (!box) return;
    if (!checks) {
        box.textContent = 'checks disabled (clients will not be prompted)';
        box.style.color = 'var(--warning)';
        return;
    }
    box.textContent = mandatory ? `${version}|mandatory` : version;
    box.style.color = 'var(--accent2)';
}

async function fetchLegacyVersionTxt() {
    try {
        const authUser = firebase.auth().currentUser;
        if (!authUser) throw new Error('Not signed in');
        const idToken = await authUser.getIdToken(true);
        const { ok, data } = await adminWorkerPost('/admin/legacy-version', {}, idToken);
        if (!ok || !data?.ok) throw new Error((data && data.error) || 'legacy-version failed');
        _legacyVersionTxt = String(data.text || '').trim() || null;
    } catch (e) {
        _legacyVersionTxt = null;
        console.warn('legacy version.txt via worker failed', e);
    }
    const el = document.getElementById('updStatLegacy');
    if (el) el.textContent = _legacyVersionTxt || 'n/a';
    return _legacyVersionTxt;
}

function fillUpdateForm(line, cfg) {
    const legacyFallback = line === '2x' && _legacyVersionTxt ? _legacyVersionTxt.split('|')[0].trim() : null;
    const version = (cfg && cfg.version) || legacyFallback || (line === '3x' ? '3.0.0' : '2.3.0');
    const mandatory = !!(cfg && cfg.mandatory) || (line === '2x' && !!_legacyVersionTxt && /\|mandatory/i.test(_legacyVersionTxt));
    const checkEnabled = cfg && typeof cfg.check_enabled === 'boolean' ? cfg.check_enabled : true;
    const downloadUrl = (cfg && cfg.download_url) || defaultDownloadUrl(line);
    const changelog = (cfg && cfg.changelog) || '';

    document.getElementById(`updVersionInput_${line}`).value = version;
    document.getElementById(`updMandatoryInput_${line}`).checked = mandatory;
    document.getElementById(`updCheckEnabledInput_${line}`).checked = checkEnabled;
    document.getElementById(`updDownloadUrlInput_${line}`).value = downloadUrl;
    document.getElementById(`updChangelogInput_${line}`).value = changelog;

    if (line === '3x') {
        document.getElementById('updStatVersion').textContent = version;
        document.getElementById('updStatChecks').textContent = checkEnabled ? 'ON' : 'OFF';
        document.getElementById('updStatMandatory').textContent = mandatory ? 'YES' : 'NO';
    }
    refreshUpdatePreview(line);
}

async function loadUpdateConfig() {
    if (!db) return;
    await fetchLegacyVersionTxt();
    for (const line of ['3x', '2x']) {
        try {
            const snap = await db.ref(updateConfigPath(line)).once('value');
            const cfg = snap.val();
            fillUpdateForm(line, cfg || null);
            const lu = document.getElementById(`updatesLastUpdated_${line}`);
            if (lu) {
                const ts = cfg && cfg.updated_at ? new Date(cfg.updated_at).toLocaleString() : 'never published';
                lu.textContent = 'Firebase config last updated: ' + ts;
            }
        } catch (e) {
            fillUpdateForm(line, null);
            showToast(`⚠️ Failed to load ${line} update config: ` + e.message, 'danger');
        }
    }
}

async function saveUpdateConfig(line) {
    if (!db) return;
    line = line === '2x' ? '2x' : '3x';
    const version = (document.getElementById(`updVersionInput_${line}`).value || '').trim();
    if (!/^[0-9]+(\.[0-9]+){1,3}$/.test(version)) {
        showToast(`⚠️ Version must look like ${line === '3x' ? '3.0.0' : '2.3.0'}`, 'danger');
        return;
    }
    const downloadUrl = (document.getElementById(`updDownloadUrlInput_${line}`).value || '').trim() || defaultDownloadUrl(line);
    if (downloadUrl.length > 500) {
        showToast('⚠️ Download URL is too long', 'danger');
        return;
    }
    const changelog = (document.getElementById(`updChangelogInput_${line}`).value || '').trim();
    if (changelog.length > 4000) {
        showToast('⚠️ Changelog is too long', 'danger');
        return;
    }

    const payload = {
        version,
        mandatory: !!document.getElementById(`updMandatoryInput_${line}`).checked,
        check_enabled: !!document.getElementById(`updCheckEnabledInput_${line}`).checked,
        download_url: downloadUrl,
        changelog,
        updated_at: Date.now()
    };

    try {
        await db.ref(updateConfigPath(line)).set(payload);
        showToast(`✅ ${line === '3x' ? '3.x (WinUI3)' : '2.x (WPF)'} update config published: ${version}${payload.mandatory ? ' (mandatory)' : ''}`, 'success');
        loadUpdateConfig();
    } catch (e) {
        showToast('⚠️ Failed to save: ' + e.message, 'danger');
    }
}

async function seedUpdateConfigFromLegacy() {
    await fetchLegacyVersionTxt();
    if (!_legacyVersionTxt) {
        showToast('⚠️ Could not read version.txt', 'danger');
        return;
    }
    const parts = _legacyVersionTxt.split('|');
    fillUpdateForm('2x', {
        version: parts[0].trim(),
        mandatory: parts.length > 1 && parts[1].trim().toLowerCase() === 'mandatory',
        check_enabled: true,
        download_url: DEFAULT_UPDATE_DOWNLOAD_URL_2X,
        changelog: ''
    });
    showToast('Seeded 2.x form from version.txt — click Save & Publish (2.x) to write Firebase', 'success');
}

document.addEventListener('DOMContentLoaded', () => {
    for (const line of ['3x', '2x']) {
        ['updVersionInput', 'updMandatoryInput', 'updCheckEnabledInput'].forEach(base => {
            const el = document.getElementById(`${base}_${line}`);
            if (!el) return;
            el.addEventListener('input', () => refreshUpdatePreview(line));
            el.addEventListener('change', () => refreshUpdatePreview(line));
        });
    }
});

const DEFAULT_PAUSE_TITLE = 'Temporarily Unavailable';
const DEFAULT_PAUSE_MESSAGE = 'Bari Plux Tool is temporarily paused. Please try again later.';

function refreshPausePreview() {
    const enabled = !!document.getElementById('pauseEnabledInput')?.checked;
    const title = (document.getElementById('pauseTitleInput')?.value || '').trim() || DEFAULT_PAUSE_TITLE;
    const message = (document.getElementById('pauseMessageInput')?.value || '').trim() || DEFAULT_PAUSE_MESSAGE;
    const titleEl = document.getElementById('pausePreviewTitle');
    const msgEl = document.getElementById('pausePreviewMessage');
    const badge = document.getElementById('pausePreviewBadge');
    const titleCount = document.getElementById('pauseTitleCount');
    const msgCount = document.getElementById('pauseMessageCount');
    const rawTitle = document.getElementById('pauseTitleInput')?.value || '';
    const rawMsg = document.getElementById('pauseMessageInput')?.value || '';
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (badge) {
        badge.textContent = enabled ? 'Paused by administrator' : 'App is running normally';
        badge.style.background = enabled ? 'rgba(255,159,10,0.18)' : 'rgba(76,175,80,0.12)';
        badge.style.color = enabled ? '#FF9F0A' : '#4CAF50';
    }
    if (titleCount) titleCount.textContent = rawTitle.length + '/120';
    if (msgCount) msgCount.textContent = rawMsg.length + '/2000';
    const st = document.getElementById('pauseStatStatus');
    if (st) {
        st.textContent = enabled ? 'PAUSED' : 'LIVE';
        st.style.color = enabled ? '#FF9F0A' : '#4CAF50';
    }
    const live = document.getElementById('pauseStatLive');
    if (live) live.textContent = 'ON';
}

// BPT (3.x) gets its own maintenance switch, independent from the legacy WPF (2.x) app - same
// split already established for update-config (see updateConfigPath above). 2.x keeps writing the
// original shared node since BPTV2 is already shipped and won't read a new path unless it's
// updated again.
let _pauseLine = '3x';
function pauseConfigPath(line) {
    return line === '2x' ? 'app_config/maintenance' : 'app_config/maintenance_3x';
}
function onPauseLineChange() {
    _pauseLine = document.querySelector('input[name="pauseLine"]:checked')?.value === '2x' ? '2x' : '3x';
    loadPauseConfig();
}

function fillPauseForm(cfg) {
    const enabled = !!(cfg && cfg.enabled);
    const title = (cfg && cfg.title) || DEFAULT_PAUSE_TITLE;
    const message = (cfg && cfg.message) || DEFAULT_PAUSE_MESSAGE;
    document.getElementById('pauseEnabledInput').checked = enabled;
    document.getElementById('pauseTitleInput').value = title;
    document.getElementById('pauseMessageInput').value = message;
    const updStat = document.getElementById('pauseStatUpdated');
    if (updStat) {
        updStat.textContent = cfg && cfg.updated_at
            ? new Date(cfg.updated_at).toLocaleString()
            : 'never';
    }
    refreshPausePreview();
}

async function loadPauseConfig() {
    if (!db) return;
    try {
        const snap = await db.ref(pauseConfigPath(_pauseLine)).once('value');
        const cfg = snap.val();
        fillPauseForm(cfg || null);
        const lu = document.getElementById('pauseLastUpdated');
        if (lu) {
            const ts = cfg && cfg.updated_at ? new Date(cfg.updated_at).toLocaleString() : 'never published';
            lu.textContent = 'Firebase maintenance last updated: ' + ts;
        }
    } catch (e) {
        fillPauseForm(null);
        showToast('⚠️ Failed to load pause config: ' + e.message, 'danger');
    }
}

async function savePauseConfig() {
    if (!db) return;
    const enabled = !!document.getElementById('pauseEnabledInput').checked;
    const title = (document.getElementById('pauseTitleInput').value || '').trim();
    const message = (document.getElementById('pauseMessageInput').value || '').trim();
    if (!title || title.length > 120) {
        showToast('⚠️ Title is required (max 120 chars)', 'danger');
        return;
    }
    if (!message || message.length > 2000) {
        showToast('⚠️ Message is required (max 2000 chars)', 'danger');
        return;
    }

    const payload = {
        enabled,
        title,
        message,
        updated_at: Date.now()
    };

    try {
        await db.ref(pauseConfigPath(_pauseLine)).set(payload);
        showToast(enabled
            ? '⏸ App paused — clients will show the gate shortly'
            : '▶️ Pause cleared — clients can use the app again', 'success');
        loadPauseConfig();
    } catch (e) {
        showToast('⚠️ Failed to save: ' + e.message, 'danger');
    }
}

async function resumeAppNow() {
    if (!db) return;
    const title = (document.getElementById('pauseTitleInput').value || '').trim() || DEFAULT_PAUSE_TITLE;
    const message = (document.getElementById('pauseMessageInput').value || '').trim() || DEFAULT_PAUSE_MESSAGE;
    document.getElementById('pauseEnabledInput').checked = false;
    refreshPausePreview();
    try {
        await db.ref(pauseConfigPath(_pauseLine)).set({
            enabled: false,
            title,
            message,
            updated_at: Date.now()
        });
        showToast('▶️ App resumed', 'success');
        loadPauseConfig();
    } catch (e) {
        showToast('⚠️ Failed to resume: ' + e.message, 'danger');
    }
}


function onAccessModeChange() {
    const mode = document.querySelector('input[name="accessMode"]:checked')?.value || 'everyone';
    const allow = document.getElementById('accessAllowlistPanel');
    const role = document.getElementById('accessRolePanel');
    if (allow) allow.style.display = mode === 'allowlist' ? '' : 'none';
    if (role) role.style.display = mode === 'role' ? '' : 'none';
}

/** Firebase RTDB keys cannot contain '.' — encode/decode email map keys. */
function encodeAccessEmailKey(email) {
    return String(email || '').trim().toLowerCase().replace(/\./g, ',');
}
function decodeAccessEmailKey(key) {
    return String(key || '').replace(/,/g, '.');
}

function linesToMap(textVal, { encodeEmails = false } = {}) {
    const map = {};
    String(textVal || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(v => {
        const key = encodeEmails ? encodeAccessEmailKey(v) : v;
        if (key) map[key] = true;
    });
    return map;
}

function mapToLines(obj, { decodeEmails = false } = {}) {
    if (!obj || typeof obj !== 'object') return '';
    return Object.keys(obj)
        .filter(k => obj[k])
        .map(k => decodeEmails ? decodeAccessEmailKey(k) : k)
        .join('\n');
}

// BPT (3.x) gets its own access-policy switch, independent from the legacy WPF (2.x) app - same
// split already established for update-config/maintenance above. 2.x keeps writing the original
// shared node since BPTV2 is already shipped and won't read a new path unless it's updated again.
let _accessLine = '3x';
function accessConfigPath(line) {
    return line === '2x' ? 'app_config/access' : 'app_config/access_3x';
}
function onAccessLineChange() {
    _accessLine = document.querySelector('input[name="accessLine"]:checked')?.value === '2x' ? '2x' : '3x';
    loadAccessConfig();
}

async function loadAccessConfig() {
    if (!db) return;
    const status = document.getElementById('accessStatus');
    if (status) status.textContent = 'Loading…';
    try {
        const snap = await db.ref(accessConfigPath(_accessLine)).once('value');
        const data = snap.val() || { mode: 'everyone', min_role: 'free', emails: {}, uids: {} };
        const mode = data.mode || 'everyone';
        document.querySelectorAll('input[name="accessMode"]').forEach(r => { r.checked = r.value === mode; });
        const minRole = document.getElementById('accessMinRole');
        if (minRole) minRole.value = data.min_role || 'free';
        const emails = document.getElementById('accessEmails');
        const uids = document.getElementById('accessUids');
        if (emails) emails.value = mapToLines(data.emails, { decodeEmails: true });
        if (uids) uids.value = mapToLines(data.uids);
        onAccessModeChange();
        if (status) status.textContent = data.updated_at ? ('Saved ' + new Date(data.updated_at).toLocaleString()) : 'Ready';
    } catch (e) {
        console.error(e);
        if (status) status.textContent = 'Failed to load';
        showToast('Failed to load access config', 'danger');
    }
}

async function saveAccessConfig() {
    if (!db) return;
    const mode = document.querySelector('input[name="accessMode"]:checked')?.value || 'everyone';
    const payload = {
        mode,
        min_role: document.getElementById('accessMinRole')?.value || 'free',
        emails: mode === 'allowlist' ? linesToMap(document.getElementById('accessEmails')?.value, { encodeEmails: true }) : {},
        uids: mode === 'allowlist' ? linesToMap(document.getElementById('accessUids')?.value) : {},
        updated_at: Date.now()
    };
    try {
        await db.ref(accessConfigPath(_accessLine)).set(payload);
        const status = document.getElementById('accessStatus');
        if (status) status.textContent = 'Saved ' + new Date().toLocaleString();
        showToast('Access policy saved', 'success');
    } catch (e) {
        console.error(e);
        showToast('Failed to save access policy: ' + (e && e.message ? e.message : e), 'danger');
    }
}

function switchTab(tab, btn) {
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('usersSection').style.display=tab==='users'?'':'none';
    const proSec=document.getElementById('proSection');
    if(proSec) proSec.style.display=tab==='pro'?'':'none';
    document.getElementById('reportsSection').style.display=tab==='reports'?'':'none';
    const errSec=document.getElementById('errorsSection');
    if(errSec) errSec.style.display=tab==='errors'?'':'none';
    document.getElementById('chatModSection').style.display=tab==='chatMod'?'':'none';
    document.getElementById('featureFlagsSection').style.display=tab==='featureFlags'?'':'none';
    const upd=document.getElementById('updatesSection');
    if(upd) upd.style.display=tab==='updates'?'':'none';
    const pause=document.getElementById('pauseSection');
    if(pause) pause.style.display=tab==='pause'?'':'none';
    const access=document.getElementById('accessSection');
    if(access) access.style.display=tab==='access'?'':'none';
    const website=document.getElementById('websiteSection');
    if(website) website.style.display=tab==='website'?'':'none';
    const ann=document.getElementById('announcementsSection');
    const mb=document.getElementById('mailboxSection');
    if(ann) ann.style.display=tab==='announcements'?'':'none';
    if(mb) mb.style.display=tab==='mailbox'?'':'none';
    if(tab==='pro') {
        if(!allUsers.length) loadUsers();
        else renderProUsers();
    }
    if(tab==='reports') loadReports();
    if(tab==='errors') loadErrors();
    if(tab==='chatMod') loadChatMod();
    if(tab==='featureFlags') loadFeatureFlags();
    else if (typeof closePageFlagDetail === 'function') closePageFlagDetail();
    if(tab==='updates') loadUpdateConfig();
    if(tab==='pause') loadPauseConfig();
    if(tab==='access') loadAccessConfig();
    if(tab==='website') loadWebsiteConfig();
    if(tab==='announcements') loadAnnouncementsAdmin();
    if(tab==='mailbox'){ if(typeof allUsers!=='undefined' && (!allUsers||!allUsers.length) && typeof loadUsers==='function'){/* optional */} renderMailboxOutbox(); }
}

async function loadWebsiteConfig() {
    if (!db) return;
    try {
        const snap = await db.ref('website/banner').once('value');
        const data = snap.val() || {};
        const text = document.getElementById('websiteBannerInput');
        const link = document.getElementById('websiteBannerLink');
        if (text) text.value = data.text || '';
        if (link) link.value = data.href || '';
        const lu = document.getElementById('websiteLastUpdated');
        if (lu) lu.textContent = data.updated_at ? ('Updated ' + new Date(data.updated_at).toLocaleString()) : '';
    } catch (e) {
        console.error(e);
        showToast('Failed to load website banner', 'danger');
    }
}

async function saveWebsiteConfig() {
    if (!db) return;
    const text = (document.getElementById('websiteBannerInput')?.value || '').trim();
    const href = (document.getElementById('websiteBannerLink')?.value || '').trim();
    try {
        await db.ref('website/banner').set({
            text,
            href,
            enabled: !!text,
            updated_at: Date.now()
        });
        showToast('Website banner saved', 'success');
        loadWebsiteConfig();
    } catch (e) {
        console.error(e);
        showToast('Failed to save banner', 'danger');
    }
}

async function clearWebsiteBanner() {
    if (!db) return;
    try {
        await db.ref('website/banner').set({ text: '', href: '', enabled: false, updated_at: Date.now() });
        const text = document.getElementById('websiteBannerInput');
        const link = document.getElementById('websiteBannerLink');
        if (text) text.value = '';
        if (link) link.value = '';
        showToast('Banner cleared', 'success');
    } catch (e) {
        showToast('Failed to clear banner', 'danger');
    }
}

function fmtTs(ts) {
    if (!ts) return '—';
    const n = typeof ts === 'number' ? ts : Number(ts);
    if (!n || Number.isNaN(n)) return '—';
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return d.toLocaleString();
}

// Pin + message moderation - the admin panel's Chat Mod tab previously had no way to pin/unpin
// or delete a message without being logged into the chat client itself, even though BPT's own
// staff menu (SetPinAsync/ClearPinAsync/DeleteAsync) already reads/writes exactly these paths.
let cmPinRoom = 'general';

function onCmPinRoomChange() {
    cmPinRoom = document.getElementById('cmPinRoomSelect')?.value || 'general';
    loadChatModPin();
    loadChatModMessages();
}

async function loadChatModPin() {
    if (!db) return;
    const status = document.getElementById('cmPinStatus');
    const input = document.getElementById('cmPinTextInput');
    if (status) status.textContent = 'Loading…';
    try {
        const snap = await db.ref('lobby_chat/pins/' + cmPinRoom).once('value');
        const data = snap.val();
        if (data && data.text) {
            if (input) input.value = data.text;
            if (status) status.textContent = `Pinned by ${data.name || 'staff'} · ${data.ts ? new Date(data.ts).toLocaleString() : ''}`;
        } else {
            if (input) input.value = '';
            if (status) status.textContent = 'No pin set for this room';
        }
    } catch (e) {
        if (status) status.textContent = 'Failed to load pin';
    }
}

async function setChatPin() {
    if (!db) return;
    const text = (document.getElementById('cmPinTextInput')?.value || '').trim();
    if (!text) { showToast('Write pin text first', 'danger'); return; }
    try {
        await db.ref('lobby_chat/pins/' + cmPinRoom).set({
            text: text.slice(0, 400),
            name: (firebase.auth().currentUser && (firebase.auth().currentUser.displayName || firebase.auth().currentUser.email)) || 'Admin',
            byUid: (firebase.auth().currentUser && firebase.auth().currentUser.uid) || 'admin',
            ts: Date.now()
        });
        showToast('📌 Pin set for ' + cmPinRoom, 'success');
        loadChatModPin();
    } catch (e) {
        showToast('⚠️ Failed to set pin: ' + e.message, 'danger');
    }
}

async function clearChatPin() {
    if (!db) return;
    if (!confirm('Clear the pinned message for this room?')) return;
    try {
        await db.ref('lobby_chat/pins/' + cmPinRoom).remove();
        showToast('Pin cleared', 'success');
        loadChatModPin();
    } catch (e) {
        showToast('⚠️ Failed to clear pin: ' + e.message, 'danger');
    }
}

async function loadChatModMessages() {
    if (!db) return;
    const tbody = document.getElementById('cmMessagesTableBody');
    if (tbody) tbody.innerHTML = '<tr class="state-row"><td colspan="4"><div class="state-icon">⏳</div><div>Loading…</div></td></tr>';
    try {
        const snap = await db.ref('lobby_chat/messages').orderByChild('ts').limitToLast(80).once('value');
        const data = snap.val() || {};
        const list = Object.entries(data)
            .map(([id, m]) => ({ id, uid: m.uid || '', name: m.name || '?', text: m.text || '', room: m.room || 'general', ts: m.ts || 0 }))
            .filter(m => m.room === cmPinRoom)
            .sort((a, b) => (b.ts || 0) - (a.ts || 0))
            .slice(0, 40);
        const label = document.getElementById('cmMessagesCountLabel');
        if (label) label.textContent = `(${list.length})`;
        renderChatModMessages(list);
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr class="state-row"><td colspan="4"><div class="state-icon">⚠️</div><div>${esc(e.message)}</div></td></tr>`;
    }
}

function renderChatModMessages(list) {
    const tbody = document.getElementById('cmMessagesTableBody');
    if (!tbody) return;
    if (!list.length) {
        tbody.innerHTML = '<tr class="state-row"><td colspan="4"><div class="state-icon">💬</div><div>No recent messages in this room</div></td></tr>';
        return;
    }
    tbody.innerHTML = list.map(m => `
        <tr>
            <td class="time-cell">${fmtTs(m.ts)}</td>
            <td><div class="user-name">${esc(m.name)}</div><div class="user-id">${esc(m.uid)}</div></td>
            <td><div class="report-desc" title="${escAttr(m.text)}">${esc(m.text)}</div></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn" data-act="pinChatMessage" data-a1="${escAttr(m.id)}">Pin</button>
                    <button class="action-btn danger" data-act="deleteChatMessage" data-a1="${escAttr(m.id)}">Delete</button>
                </div>
            </td>
        </tr>`).join('');
}

async function pinChatMessage(messageId) {
    if (!db) return;
    try {
        const snap = await db.ref('lobby_chat/messages/' + messageId).once('value');
        const m = snap.val();
        if (!m) { showToast('Message not found (may already be deleted)', 'danger'); return; }
        const room = m.room || cmPinRoom;
        await db.ref('lobby_chat/pins/' + room).set({
            text: String(m.text || '').slice(0, 400),
            name: m.name || 'User',
            byUid: (firebase.auth().currentUser && firebase.auth().currentUser.uid) || 'admin',
            ts: Date.now()
        });
        showToast('📌 Message pinned in ' + room, 'success');
        if (room === cmPinRoom) loadChatModPin();
    } catch (e) {
        showToast('⚠️ Failed to pin: ' + e.message, 'danger');
    }
}

async function deleteChatMessage(messageId) {
    if (!db) return;
    if (!confirm('Delete this message? This cannot be undone.')) return;
    try {
        await db.ref('lobby_chat/messages/' + messageId).remove();
        showToast('🗑️ Message deleted', 'danger');
        loadChatModMessages();
    } catch (e) {
        showToast('⚠️ Failed to delete: ' + e.message, 'danger');
    }
}

async function loadChatMod() {
    if (!db) return;
    const usersBody = document.getElementById('cmUsersTableBody');
    const reportsBody = document.getElementById('cmReportsTableBody');
    usersBody.innerHTML = '<tr class="state-row"><td colspan="7"><div class="state-icon">⏳</div><div>Loading moderation…</div></td></tr>';
    reportsBody.innerHTML = '<tr class="state-row"><td colspan="8"><div class="state-icon">⏳</div><div>Loading reports…</div></td></tr>';
    loadBannedWords();
    loadChatModPin();
    loadChatModMessages();
    try {
        const [modSnap, repSnap, banSnap] = await Promise.all([
            db.ref('lobby_chat/user_moderation').once('value'),
            db.ref('lobby_chat/reports').once('value'),
            db.ref('lobby_chat/bans').once('value')
        ]);
        const bans = banSnap.val() || {};
        const modData = modSnap.val() || {};
        allChatModUsers = Object.entries(modData).map(([uid, m]) => {
            const viol = m.violations && typeof m.violations === 'object' ? Object.values(m.violations) : [];
            return {
                uid,
                name: m.displayName || uid.slice(0, 10),
                strikes: typeof m.strikesRemaining === 'number' ? m.strikesRemaining : 5,
                morality: typeof m.moralityScore === 'number' ? m.moralityScore : 100,
                rulesAccepted: m.rulesAccepted === true,
                lastRule: m.lastViolationRule || '—',
                violCount: viol.length,
                banned: bans[uid] === true,
                violations: viol
            };
        }).sort((a,b) => (a.strikes - b.strikes) || (a.morality - b.morality) || b.violCount - a.violCount);

        const repData = repSnap.val() || {};
        allChatReports = Object.entries(repData).map(([id, r]) => ({
            id,
            reporterUid: r.reporterUid || '—',
            targetUid: r.targetUid || '—',
            targetName: r.targetName || '—',
            msgId: r.msgId || '—',
            reason: r.reason || '—',
            room: r.room || '—',
            textPreview: r.textPreview || '',
            status: r.status || 'new',
            ts: r.ts || 0
        })).sort((a,b) => (b.ts||0) - (a.ts||0));

        document.getElementById('cmStatUsers').textContent = allChatModUsers.length;
        document.getElementById('cmStatViolators').textContent = allChatModUsers.filter(u => u.violCount > 0).length;
        document.getElementById('cmStatLowMorality').textContent = allChatModUsers.filter(u => u.morality <= 50).length;
        document.getElementById('cmStatReports').textContent = allChatReports.length;
        document.getElementById('cmLastUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString();
        renderChatModUsers();
        renderChatReports();
    } catch (e) {
        usersBody.innerHTML = `<tr class="state-row"><td colspan="7"><div class="state-icon">⚠️</div><div>${e.message}</div></td></tr>`;
        reportsBody.innerHTML = `<tr class="state-row"><td colspan="8"><div class="state-icon">⚠️</div><div>${e.message}</div></td></tr>`;
        showToast('⚠️ Chat mod load failed: ' + e.message, 'danger');
    }
}

function setCmUserFilter(f, btn) {
    cmUserFilter = f;
    btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderChatModUsers();
}

function setCmReportFilter(f, btn) {
    cmReportFilter = f;
    btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderChatReports();
}

function renderChatModUsers() {
    const q = (document.getElementById('cmUserSearch').value || '').toLowerCase().trim();
    let list = allChatModUsers.slice();
    if (cmUserFilter === 'violators') list = list.filter(u => u.violCount > 0);
    if (cmUserFilter === 'low') list = list.filter(u => u.morality <= 50);
    if (cmUserFilter === 'zero') list = list.filter(u => u.strikes <= 0 || u.banned);
    if (q) list = list.filter(u => (u.name||'').toLowerCase().includes(q) || (u.uid||'').toLowerCase().includes(q));
    document.getElementById('cmUserCountLabel').textContent = `(${list.length})`;
    const tbody = document.getElementById('cmUsersTableBody');
    if (!list.length) {
        tbody.innerHTML = '<tr class="state-row"><td colspan="7"><div class="state-icon">✨</div><div>No users match</div></td></tr>';
        return;
    }
    tbody.innerHTML = list.map(u => `
        <tr>
            <td>
                <div class="user-name">${esc(u.name)}${u.banned ? ' <span class="report-status new">banned</span>' : ''}</div>
                <div class="user-id">${esc(u.uid)}</div>
            </td>
            <td><strong style="color:${u.strikes<=1?'#F44336':u.strikes<=3?'#FF9800':'#4CAF50'}">${u.strikes}/5</strong></td>
            <td><strong style="color:${u.morality<=30?'#F44336':u.morality<=60?'#FF9800':'#4CAF50'}">${u.morality}</strong></td>
            <td>${u.violCount}</td>
            <td>${esc(u.lastRule)}</td>
            <td>${u.rulesAccepted ? '✅' : '—'}</td>
            <td>
                <div class="action-btns">
                    <button class="action-btn" data-act="showChatViolations" data-a1="${escAttr(u.uid)}">History</button>
                    <button class="action-btn danger" data-act="chatBanUser" data-a1="${escAttr(u.uid)}" data-a2="true">Ban</button>
                    <button class="action-btn" data-act="chatBanUser" data-a1="${escAttr(u.uid)}" data-a2="false">Unban</button>
                    <button class="action-btn" data-act="chatResetScore" data-a1="${escAttr(u.uid)}">Reset 5</button>
                </div>
            </td>
        </tr>`).join('');
}

function renderChatReports() {
    const q = (document.getElementById('cmReportSearch').value || '').toLowerCase().trim();
    let list = allChatReports.slice();
    if (cmReportFilter !== 'all') list = list.filter(r => r.status === cmReportFilter);
    if (q) list = list.filter(r =>
        (r.targetName||'').toLowerCase().includes(q) ||
        (r.targetUid||'').toLowerCase().includes(q) ||
        (r.reason||'').toLowerCase().includes(q) ||
        (r.textPreview||'').toLowerCase().includes(q) ||
        (r.reporterUid||'').toLowerCase().includes(q));
    document.getElementById('cmReportCountLabel').textContent = `(${list.length})`;
    const tbody = document.getElementById('cmReportsTableBody');
    if (!list.length) {
        tbody.innerHTML = '<tr class="state-row"><td colspan="8"><div class="state-icon">✨</div><div>No reports</div></td></tr>';
        return;
    }
    tbody.innerHTML = list.map(r => `
        <tr>
            <td class="time-cell">${fmtTs(r.ts)}</td>
            <td>
                <div class="user-name">${esc(r.targetName)}</div>
                <div class="user-id">${esc(r.targetUid)}</div>
            </td>
            <td><div class="report-desc" title="${escAttr(r.textPreview)}">${esc(r.textPreview || r.msgId)}</div></td>
            <td>${esc(r.reason)}</td>
            <td class="user-id">${esc(r.reporterUid)}</td>
            <td>${esc(r.room)}</td>
            <td><span class="report-status ${escAttr(r.status)}">${esc(r.status)}</span></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn" data-act="setChatReportStatus" data-a1="${escAttr(r.id)}" data-a2="reviewed">Review</button>
                    <button class="action-btn" data-act="setChatReportStatus" data-a1="${escAttr(r.id)}" data-a2="resolved">Resolve</button>
                    ${r.targetUid && r.targetUid !== '—' ? `<button class="action-btn danger" data-act="chatBanUser" data-a1="${escAttr(r.targetUid)}" data-a2="true">Ban</button>` : ''}
                    <button class="action-btn danger" data-act="deleteChatReport" data-a1="${escAttr(r.id)}">Del</button>
                </div>
            </td>
        </tr>`).join('');
}

function escAttr(s) { return esc(s).replace(/`/g, ''); }

function showChatViolations(uid) {
    const u = allChatModUsers.find(x => x.uid === uid);
    if (!u) return;
    const lines = (u.violations || []).map(v =>
        `• ${v.rule || '?'} (−${v.strikeDelta||0} / −${v.moralityDelta||0}) by ${v.byName||v.byUid||'?'} — ${v.reason||''}`
    );
    alert(`${u.name}\nChances ${u.strikes}/5 · Morality ${u.morality}\n\n${lines.length ? lines.join('\n') : 'No violations yet.'}`);
}

async function chatBanUser(uid, ban) {
    if (!db || !uid) return;
    try {
        const ref = db.ref('lobby_chat/bans/' + uid);
        if (ban) await ref.set(true); else await ref.remove();
        showToast(ban ? '🚫 Chat ban applied' : '✅ Chat unban applied', ban ? 'danger' : 'success');
        loadChatMod();
    } catch (e) {
        showToast('⚠️ Ban failed: ' + e.message, 'danger');
    }
}

async function chatResetScore(uid) {
    if (!db || !uid) return;
    if (!confirm('Reset chances to 5 and morality to 100 for this user?')) return;
    try {
        await db.ref('lobby_chat/user_moderation/' + uid).update({
            strikesRemaining: 5,
            moralityScore: 100
        });
        await db.ref('lobby_chat/bans/' + uid).remove();
        showToast('✅ Score reset', 'success');
        loadChatMod();
    } catch (e) {
        showToast('⚠️ Reset failed: ' + e.message, 'danger');
    }
}

async function setChatReportStatus(id, status) {
    if (!db || !id) return;
    try {
        await db.ref('lobby_chat/reports/' + id).update({ status });
        showToast('✅ Status → ' + status, 'success');
        loadChatMod();
    } catch (e) {
        showToast('⚠️ Update failed: ' + e.message, 'danger');
    }
}

async function deleteChatReport(id) {
    if (!db || !id) return;
    if (!confirm('Delete this chat report?')) return;
    try {
        await db.ref('lobby_chat/reports/' + id).remove();
        showToast('🗑️ Report deleted', 'danger');
        loadChatMod();
    } catch (e) {
        showToast('⚠️ Delete failed: ' + e.message, 'danger');
    }
}

document.addEventListener('keydown', e=>{
    const preview=document.getElementById('imgPreviewOverlay');
    const confirm=document.getElementById('confirmModal');
    if(e.key==='Escape') {
        if(preview.classList.contains('show')){closeImgPreview();return;}
        if(confirm.classList.contains('show')){closeConfirm();return;}
        if(document.getElementById('reportModal').classList.contains('show')){closeReportModal();return;}
        if(document.getElementById('userModal').classList.contains('show')){closeUserModal();return;}
    }
    if(confirm.classList.contains('show') && e.key==='Enter') { submitConfirm(); return; }
    if(document.getElementById('featureFlagForm').style.display==='block' && e.key==='Enter' && e.target.id==='ffKeyInput') { saveFeatureFlag(); return; }
    if(preview.classList.contains('show')) {
        if(e.key==='ArrowLeft') prevImage();
        if(e.key==='ArrowRight') nextImage();
    }
});

firebase.auth().onAuthStateChanged(user => {
    setTimeout(() => {
        const isAdmin = user?.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || user?.email === ADMIN_EMAIL;
        if (user && isAdmin && sessionStorage.getItem('bp_admin') === '1') {
            document.getElementById('gate').classList.add('hidden');
            document.getElementById('app').classList.add('show');
            initApp();
        } else if (!user || !isAdmin) {
            sessionStorage.removeItem('bp_admin');
        }
    }, 100);
});


/* ===== Announcements + Mailbox (admin) ===== */
let allAnnouncementsAdmin = [];
let annFilter = 'all';
const MB_OUTBOX_KEY = 'bari_admin_mailbox_outbox_v1';

function annStatusPill(status, published) {
    if (!published) return '<span class="ann-status draft">Draft</span>';
    const s = (status || 'info').toLowerCase();
    const label = s.charAt(0).toUpperCase() + s.slice(1);
    return `<span class="ann-status ${esc(s)}">${esc(label)}</span>`;
}

function updateAnnStats() {
    const total = allAnnouncementsAdmin.length;
    const live = allAnnouncementsAdmin.filter(a => a.published).length;
    const draft = total - live;
    const breaking = allAnnouncementsAdmin.filter(a => a.published && a.status === 'breaking').length;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
    set('annStatTotal', total);
    set('annStatLive', live);
    set('annStatDraft', draft);
    set('annStatBreaking', breaking);
}

function setAnnFilter(f, btn) {
    annFilter = f;
    document.querySelectorAll('#annFilters .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderAnnouncementsAdmin();
}

function filteredAnnouncements() {
    return allAnnouncementsAdmin.filter(a => {
        if (annFilter === 'live') return a.published;
        if (annFilter === 'draft') return !a.published;
        if (annFilter === 'breaking') return a.status === 'breaking';
        if (annFilter === 'update') return a.status === 'update';
        return true;
    });
}

function renderAnnouncementsAdmin() {
    const wrap = document.getElementById('annCards');
    if (!wrap) return;
    const list = filteredAnnouncements();
    document.getElementById('annCountLabel').textContent = '(' + list.length + (annFilter !== 'all' ? ' filtered' : '') + ')';
    updateAnnStats();
    if (!allAnnouncementsAdmin.length) {
        wrap.innerHTML = '<div class="state-row" style="grid-column:1/-1;text-align:center;padding:48px;color:var(--muted);"><div class="state-icon">📣</div><div>No announcements yet — create the first one.</div></div>';
        return;
    }
    if (!list.length) {
        wrap.innerHTML = '<div class="state-row" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted);"><div>No matches for this filter.</div></div>';
        return;
    }
    wrap.innerHTML = list.map(a => `
        <div class="ann-card status-${esc(a.status||'info')} ${a.published?'':'unpublished'}">
            <div class="ann-card-top">
                ${annStatusPill(a.status, a.published)}
                <span class="ann-card-date">${esc(a.date || fmtTs(a.timestamp))}</span>
            </div>
            <div class="ann-card-title">${esc(a.title)}</div>
            <div class="ann-card-desc">${esc(a.description)}</div>
            <div class="ann-card-meta">
                <span style="font-size:0.72rem;color:var(--muted);">${a.published ? 'Live in app' : 'Hidden draft'}</span>
                <div class="ann-card-actions">
                    <button class="action-btn view" data-act="toggleAnnPublish" data-a1="${a.key}" data-a2="${a.published? 'false':'true'}">${a.published?'Unpublish':'Publish'}</button>
                    <button class="action-btn view" data-act="openAnnEditor" data-a1="${a.key}">Edit</button>
                    <button class="action-btn del" data-act="deleteAnnouncement" data-a1="${a.key}">Delete</button>
                </div>
            </div>
        </div>`).join('');
}

// BPT (3.x) gets its own announcements node, independent from the legacy WPF (2.x) app - same
// split already established for update-config/maintenance/access above. 2.x keeps reading the
// original shared node since BPTV2 is already shipped and won't read a new path unless updated.
let _announcementsLine = '3x';
function announcementsPath(line) {
    return line === '2x' ? 'announcements' : 'announcements_3x';
}
function onAnnouncementsLineChange() {
    _announcementsLine = document.querySelector('input[name="announcementsLine"]:checked')?.value === '2x' ? '2x' : '3x';
    loadAnnouncementsAdmin();
}

async function loadAnnouncementsAdmin() {
    if (!db) return;
    const wrap = document.getElementById('annCards');
    if (wrap) wrap.innerHTML = '<div class="state-row" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted);"><div class="state-icon">⏳</div><div>Loading…</div></div>';
    try {
        const snap = await db.ref(announcementsPath(_announcementsLine)).once('value');
        const data = snap.val() || {};
        allAnnouncementsAdmin = Object.entries(data).map(([key, a]) => ({
            key,
            title: a.title || '',
            description: a.description || '',
            status: a.status || 'new',
            published: a.published !== false,
            date: a.date || '',
            timestamp: a.timestamp || 0
        })).sort((a,b) => (b.timestamp||0)-(a.timestamp||0));
        renderAnnouncementsAdmin();
    } catch (e) {
        if (wrap) wrap.innerHTML = `<div class="state-row" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--danger);"><div class="state-icon">⚠️</div><div>${esc(e.message)}</div></div>`;
    }
}

function refreshAnnPreview() {
    const title = document.getElementById('annTitle')?.value?.trim() || 'Title';
    const desc = document.getElementById('annDesc')?.value?.trim() || 'Description';
    const status = document.getElementById('annStatus')?.value || 'new';
    const published = document.getElementById('annPublished')?.checked;
    const card = document.getElementById('annPreviewCard');
    const st = document.getElementById('annPreviewStatus');
    if (!card) return;
    card.className = 'ann-card status-' + status + (published ? '' : ' unpublished');
    if (st) {
        st.className = 'ann-status ' + (published ? status : 'draft');
        st.textContent = published ? (status.charAt(0).toUpperCase()+status.slice(1)) : 'Draft';
    }
    const t = document.getElementById('annPreviewTitle'); if (t) t.textContent = title;
    const d = document.getElementById('annPreviewDesc'); if (d) d.textContent = desc;
    const dt = document.getElementById('annPreviewDate'); if (dt) dt.textContent = new Date().toISOString().slice(0,10);
}

function openAnnEditor(key) {
    const a = key ? allAnnouncementsAdmin.find(x => x.key === key) : null;
    document.getElementById('annEditKey').value = key || '';
    document.getElementById('annModalTitle').textContent = a ? 'Edit Announcement' : 'New Announcement';
    document.getElementById('annTitle').value = a ? a.title : '';
    document.getElementById('annDesc').value = a ? a.description : '';
    document.getElementById('annStatus').value = a ? a.status : 'new';
    document.getElementById('annPublished').checked = a ? !!a.published : true;
    refreshAnnPreview();
    document.getElementById('annModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}
function closeAnnEditor() {
    document.getElementById('annModal').classList.remove('show');
    document.body.style.overflow = '';
}

async function saveAnnouncement() {
    if (!db) return;
    const title = document.getElementById('annTitle').value.trim();
    const description = document.getElementById('annDesc').value.trim();
    const status = document.getElementById('annStatus').value;
    const published = document.getElementById('annPublished').checked;
    if (!title || !description) { showToast('Title and description required', 'danger'); return; }
    const key = document.getElementById('annEditKey').value || db.ref(announcementsPath(_announcementsLine)).push().key;
    const existing = allAnnouncementsAdmin.find(x => x.key === key);
    const now = Date.now();
    const date = new Date().toISOString().slice(0, 10);
    const payload = {
        id: key,
        title,
        description,
        status,
        published,
        date: existing?.date || date,
        timestamp: existing?.timestamp || Math.floor(now / 1000),
        updatedAt: now
    };
    try {
        await db.ref(announcementsPath(_announcementsLine) + '/' + key).set(payload);
        showToast('Announcement saved', 'success');
        closeAnnEditor();
        loadAnnouncementsAdmin();
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function toggleAnnPublish(key, next) {
    if (!db) return;
    try {
        await db.ref(announcementsPath(_announcementsLine) + '/' + key + '/published').set(next === true || next === 'true');
        await db.ref(announcementsPath(_announcementsLine) + '/' + key + '/updatedAt').set(Date.now());
        showToast(next === true || next === 'true' ? 'Published' : 'Unpublished', 'success');
        loadAnnouncementsAdmin();
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function deleteAnnouncement(key) {
    if (!confirm('Delete this announcement?')) return;
    try {
        await db.ref(announcementsPath(_announcementsLine) + '/' + key).remove();
        showToast('Deleted', 'success');
        loadAnnouncementsAdmin();
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

function composeMailboxTo(uid, name) {
    const mbBtn=[...document.querySelectorAll('.tab-btn')].find(b=>b.textContent.includes('Mailbox'));
    if(mbBtn) switchTab('mailbox', mbBtn);
    document.getElementById('mbToUid').value = uid || '';
    document.getElementById('mbUserSearch').value = name || uid || '';
    document.getElementById('mbTitle').value = name ? ('Message for ' + name) : '';
    document.getElementById('mbType').value = 'admin';
    document.getElementById('mbBody').focus();
}

function onMbUserSearch() {
    const q = (document.getElementById('mbUserSearch').value || '').trim().toLowerCase();
    const box = document.getElementById('mbUserSuggest');
    if (!box) return;
    if (!q || q.length < 2) { box.classList.remove('show'); box.innerHTML=''; return; }
    const hits = (allUsers || []).filter(u => {
        const name = (u.name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const id = (u.id || '').toLowerCase();
        return name.includes(q) || email.includes(q) || id.includes(q);
    }).slice(0, 8);
    if (!hits.length) {
        box.innerHTML = '<div class="mb-user-item"><strong>No users found</strong><span>Paste a UID manually below</span></div>';
        box.classList.add('show');
        return;
    }
    box.innerHTML = hits.map(u => `
        <div class="mb-user-item" data-act="pickMbUser" data-a1="${esc(u.id)}" data-a2="${esc(u.name||'')}" data-a3="${esc(u.email||'')}">
            <strong>${esc(u.name || 'User')}</strong>
            <span>${esc(u.email || '')} · ${esc(u.id)}</span>
        </div>`).join('');
    box.classList.add('show');
}

function pickMbUser(uid, name, email) {
    document.getElementById('mbToUid').value = uid;
    document.getElementById('mbUserSearch').value = name || email || uid;
    document.getElementById('mbUserSuggest').classList.remove('show');
    if (!document.getElementById('mbTitle').value.trim() && name)
        document.getElementById('mbTitle').value = 'Message for ' + name;
}

function applyMbTemplate(kind) {
    const map = {
        welcome: { title: 'Welcome to Bari Plux', body: 'Thanks for joining Bari Plux Tool.\nIf you need help, reply from Contact or send a bug report — we read every message.' },
        fix: { title: 'Your issue was fixed', body: 'We fixed the issue you reported.\nPlease update/restart the app and try again. If anything is still wrong, reply here or open a new report.' },
        info: { title: 'Important update', body: 'A new update is available for Bari Plux Tool.\nOpen the app to sync announcements and get the latest improvements.' },
        thanks: { title: 'Thanks for your report', body: 'Thanks for the detailed report — it helps a lot.\nWe are looking into it and will update you here when there is news.' }
    };
    const t = map[kind]; if (!t) return;
    document.getElementById('mbTitle').value = t.title;
    document.getElementById('mbBody').value = t.body;
}

function loadMbOutbox() {
    try { return JSON.parse(localStorage.getItem(MB_OUTBOX_KEY) || '[]'); } catch { return []; }
}
function saveMbOutbox(list) {
    localStorage.setItem(MB_OUTBOX_KEY, JSON.stringify(list.slice(0, 40)));
}
function pushMbOutbox(entry) {
    const list = loadMbOutbox();
    list.unshift(entry);
    saveMbOutbox(list);
    renderMailboxOutbox();
}
function renderMailboxOutbox() {
    const list = loadMbOutbox();
    const el = document.getElementById('mbOutboxList');
    const cnt = document.getElementById('mbOutboxCount');
    if (cnt) cnt.textContent = list.length ? `(${list.length})` : '';
    if (!el) return;
    if (!list.length) {
        el.innerHTML = '<div style="color:var(--muted);font-size:0.82rem;padding:12px 0;">No messages sent from this browser yet.</div>';
        return;
    }
    el.innerHTML = list.map(m => `
        <div class="mb-outbox-item">
            <div class="ttl">${esc(m.title)}</div>
            <div class="meta">${esc(m.type||'admin')} → ${esc(m.name||m.uid)} · ${esc(fmtTs(m.at))}</div>
            <div class="body">${esc((m.body||'').slice(0,220))}${(m.body||'').length>220?'…':''}</div>
        </div>`).join('');
}

// BPT (3.x) gets its own mailbox node, independent from the legacy WPF (2.x) app - same split
// already established above for announcements/update-config/maintenance/access. 2.x keeps
// reading the original shared node since BPTV2 is already shipped and won't read a new path
// unless updated again.
let _mailboxLine = '3x';
function mailboxPath(uid, line) {
    return (line === '2x' ? 'mailbox' : 'mailbox_3x') + '/' + uid;
}
function onMailboxLineChange() {
    _mailboxLine = document.querySelector('input[name="mailboxLine"]:checked')?.value === '2x' ? '2x' : '3x';
}

async function sendMailboxMessage(uid, title, body, type, relatedReportKey, relatedReportId, line) {
    if (!db) throw new Error('No database');
    if (!uid || !title || !body) throw new Error('uid, title, body required');
    const msgRef = db.ref(mailboxPath(uid, line || _mailboxLine)).push();
    const payload = {
        id: msgRef.key,
        type: type || 'admin',
        title,
        body,
        createdAt: Date.now(),
        read: false,
        from: 'Bari Plux Support'
    };
    if (relatedReportKey) payload.relatedReportKey = relatedReportKey;
    if (relatedReportId) payload.relatedReportId = relatedReportId;
    await msgRef.set(payload);
    return msgRef.key;
}

async function sendMailboxFromTab() {
    try {
        const uid = document.getElementById('mbToUid').value.trim();
        const title = document.getElementById('mbTitle').value.trim();
        const body = document.getElementById('mbBody').value.trim();
        const type = document.getElementById('mbType').value || 'admin';
        await sendMailboxMessage(uid, title, body, type);
        const name = (document.getElementById('mbUserSearch').value || '').trim();
        pushMbOutbox({ uid, name, title, body, type, at: Date.now() });
        showToast('Mailbox message sent', 'success');
        document.getElementById('mbBody').value = '';
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function replyReportMailbox(reportKey) {
    const r = allReports.find(x => x.firebaseKey === reportKey);
    if (!r) return;
    const uid = r.userAccount && r.userAccount.id;
    const body = (document.getElementById('rmReplyBody')?.value || '').trim();
    if (!uid) { showToast('Reporter has no account id', 'danger'); return; }
    if (!body) { showToast('Write a reply first', 'danger'); return; }
    // The Bug Reports tab has no line selector of its own (reports come from either app) - infer
    // BPT vs legacy WPF from the reporter's own app version so the reply lands in the mailbox the
    // reporter's app actually reads, instead of always defaulting to one line.
    const reportLine = (r.programInfo && String(r.programInfo.appVersion || '').startsWith('v2.')) ? '2x' : '3x';
    try {
        const msgId = await sendMailboxMessage(
            uid,
            'Reply to your report ' + (r.id || ''),
            body,
            'report_reply',
            reportKey,
            r.id || '',
            reportLine
        );
        await db.ref('bugReports/' + reportKey + '/adminReply').set({
            body,
            at: Date.now(),
            byEmail: (firebase.auth().currentUser && firebase.auth().currentUser.email) || 'admin',
            mailboxMsgId: msgId
        });
        await db.ref('bugReports/' + reportKey + '/repliedAt').set(Date.now());
        if (r.status === 'new') await updateStatus(reportKey, 'reviewed');
        pushMbOutbox({
            uid,
            name: (r.userAccount && (r.userAccount.name || r.userAccount.email)) || uid,
            title: 'Reply to your report ' + (r.id || ''),
            body,
            type: 'report_reply',
            at: Date.now()
        });
        showToast('Reply sent to Mailbox', 'success');
        closeReportModal();
        loadReports();
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

function applyReportReplyTemplate(kind) {
    const ta = document.getElementById('rmReplyBody');
    if (!ta || ta.disabled) return;
    const map = {
        looking: 'Thanks for the report — we are looking into this and will update you here.',
        fixed: 'This should now be fixed. Please restart the app and try again. Reply if it still happens.',
        needmore: 'Thanks! Could you share a bit more detail (steps, screenshots, and when it started) so we can reproduce it?'
    };
    if (map[kind]) ta.value = map[kind];
}


/* ===== CSP-safe action delegation (replaces inline onclick=/onchange=) ===== */
(function bindAdminActions() {
  function collectArgs(el) {
    var args = [];
    for (var i = 1; i <= 6; i++) {
      var key = "data-a" + i;
      if (!el.hasAttribute(key)) break;
      var v = el.getAttribute(key);
      if (v === "true") v = true;
      else if (v === "false") v = false;
      else if (/^\d+$/.test(v)) v = Number(v);
      args.push(v);
    }
    if (el.getAttribute("data-pass-el") === "1") args.push(el);
    if (el.getAttribute("data-pass-value") === "1") args.push(el.value);
    return args;
  }
  function run(el) {
    var act = el.getAttribute("data-act");
    // Ignore junk/injected attributes (e.g. CF/extensions producing data-act="if")
    if (!act || !/^[A-Za-z_$][\w$]*$/.test(act)) return;
    var fn = window[act];
    if (typeof fn !== "function") return;
    fn.apply(null, collectArgs(el));
  }
  document.addEventListener("click", function (e) {
    if (e.target.classList && e.target.classList.contains("modal-overlay") && e.target.classList.contains("show")) {
      var closeMap = {
        userModal: typeof closeUserModal === "function" ? closeUserModal : null,
        reportModal: typeof closeReportModal === "function" ? closeReportModal : null,
        errorModal: typeof closeErrorModal === "function" ? closeErrorModal : null,
        annModal: typeof closeAnnEditor === "function" ? closeAnnEditor : null,
        confirmModal: typeof closeConfirm === "function" ? closeConfirm : null
      };
      if (closeMap[e.target.id]) closeMap[e.target.id]();
      return;
    }
    var el = e.target.closest("[data-act]");
    if (!el) return;
    if (el.tagName === "SELECT" || el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
    if (el.hasAttribute("data-stop")) e.stopPropagation();
    run(el);
  });
  document.addEventListener("input", function (e) {
    var el = e.target.closest("input[data-act], textarea[data-act]");
    if (!el) return;
    if (el.type === "checkbox" || el.type === "radio") return;
    run(el);
  });
  document.addEventListener("change", function (e) {
    var el = e.target.closest("select[data-act], input[data-act]");
    if (!el) return;
    run(el);
  });
})();

