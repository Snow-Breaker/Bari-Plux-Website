# FULL SECURITY AUDIT — Bari Plux Website

**Date:** 2026-07-28  
**Scope:** `C:\Github\Bari-Plux-Website` (+ `discord-auth-worker` from BPTV2 for B5)  
**Mode:** READ ONLY — no fixes applied  
**Honest bottom line:** This is **not** a 10/10. Several real weaknesses remain (client-side TOTP secret, client-side admin password hash, CSP `unsafe-*`, missing CSP on sensitive pages, domain-lock gaps). Firebase RTDB rules and Worker secret handling are comparatively strong.

---

## A1 — CSP (literal headers)

### Command
Inspected `<meta http-equiv="Content-Security-Policy">` in listed HTML files.

### Literal current CSP — `index.html` / `public/index.html`
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self' https:; 
               script-src 'self' https://cdnjs.cloudflare.com https://www.gstatic.com https://cdn.jsdelivr.net 'unsafe-eval'; 
               style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com 'unsafe-inline'; 
               img-src 'self' https: data: blob:; 
               font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; 
               connect-src 'self' https: https://api.groq.com; 
               frame-src 'self' https://www.youtube.com https://youtube.com https://*.youtube.com https://www.youtube-nocookie.com;
               object-src 'none';
               base-uri 'self';">
```

**Flags:** `'unsafe-eval'` in `script-src`; `'unsafe-inline'` in `style-src`.

### Literal current CSP — `login1.html` / `public/login1.html`
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self' https:;
               script-src 'self' https://www.gstatic.com https://cdn.jsdelivr.net https://apis.google.com https://www.googleapis.com https://accounts.google.com https://cdnjs.cloudflare.com 'unsafe-inline' 'unsafe-eval';
               style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com 'unsafe-inline';
               img-src 'self' https: data: blob:;
               font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:;
               connect-src 'self' https: wss:;
               frame-src 'self' https: https://accounts.google.com https://*.firebaseapp.com https://*.google.com https://github.com https://*.github.com;
               object-src 'none';
               base-uri 'self';">
```

**Flags:** `'unsafe-inline'` **and** `'unsafe-eval'` in `script-src`; `'unsafe-inline'` in `style-src`.

### Other requested pages
| Page | CSP present? |
|------|----------------|
| `login.html` | **NO** |
| `theadm1n.html` / `public/theadm1n.html` | **NO** |
| `Pro.html` / `public/Pro.html` | **NO** |

### Verdict
**WEAK** — CSP exists on homepage + login1 only; both still allow `unsafe-eval`; login1 also allows `unsafe-inline` scripts; admin/legacy login have no CSP.

---

## A2 — X-Frame-Options / clickjacking

### Command
`Select-String -Pattern 'X-Frame-Options'` across HTML (excluding `_archive` / `node_modules`).

### Literal output
```
public\login1.html: <meta http-equiv="X-Frame-Options" content="SAMEORIGIN">
login1.html: <meta http-equiv="X-Frame-Options" content="SAMEORIGIN">
mobile.html: <meta http-equiv="X-Frame-Options" content="DENY">
```

`index.html`: **no** `X-Frame-Options` meta (removed as expected).

### Note
`<meta http-equiv="X-Frame-Options">` is **ignored by modern browsers** for framing protection. Real clickjacking defense requires HTTP response header `X-Frame-Options` or CSP `frame-ancestors`.

### Live HTTP (apex)
`curl -sI https://bariplux.com/` → `Server: GitHub.com`, `Strict-Transport-Security: max-age=31556926` — **no** `X-Frame-Options` / `Content-Security-Policy` response headers observed on apex.

### Verdict
**WEAK** — meta XFO on `login1.html` / `mobile.html` is a no-op; apex has no framing header.

---

## A3 — TOTP (`theadm1n.html`)

### Command
Searched `totp|verifyTotp|totp_secret` in `theadm1n.html`.

### Literal verification path
1. After password check, if `admin/totp_enabled === true` → `showTotpVerificationStep(password)`.
2. On Verify click:
```javascript
const snap = await db.ref('admin/totp_secret').once('value');
const secret = snap.val();
if (!secret) { showToast('2FA secret not found', 'danger'); return; }
if (await verifyTotp(secret, code)) {
    gateContent.removeChild(step);
    await completePasswordLogin(password);
}
```
3. `verifyTotp(secret, userCode)` (lines ~1486–1505) runs **entirely in the browser**: Base32-decode secret → HMAC-SHA1 over time steps ±2 → compare 6-digit codes.

### Implication
Any principal who can `.read` `admin/` (rules allow the hardcoded admin uid/email) receives the TOTP secret in the client. An XSS or compromised admin session can exfiltrate it. Server never validates TOTP.

### Verdict
**VULNERABLE** (design) — client-side TOTP verification with secret fetched to browser. Needs Lord's decision for server-side migration (Cloud Function / Worker).

---

## A4 — `database.rules.json` / `storage.rules`

### Command
`Get-Content database.rules.json` / `Get-Content storage.rules`  
Snapshots also saved: `_archive/proof/database.rules.json.snapshot`, `_archive/proof/storage.rules.snapshot`.

### Explicit node checks

| Node | .read | .write |
|------|-------|--------|
| `admin` (covers `admin/totp_secret`, `admin/totp_enabled`, etc.) | Only uid `ZHMxN5tZkNgLcxFnp98QUqfvw963` **or** email `mister.attaye@gmail.com` | Same |
| `users/*/role` | `auth != null` | Admin uid/email only |
| `sessions/` | Owner or admin | Owner or admin |
| `pending_tokens//` | `auth != null && auth.uid === $uid` | **`false`** (Worker admin SDK only) |
| `bugReports` | Admin / `dev` / `founder` | Create `status=='new'` by any auth, or admin/dev/founder |
| `app_config` | **`true` (public read)** | Admin only |
| `payhip_*` / `stripe_*` | `false` | `false` |

### Literal `storage.rules` (full)
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /backups/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId;
    }
    match /{allPaths=**} {
      deny read, write;
    }
  }
}

```

### Literal `database.rules.json` (full)
```
{
  "rules": {
    "admin": {
      ".read": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
      ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'"
    },
    "app_config": {
      ".read": true,
      ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
      "update": {
        ".validate": "!newData.exists() || (newData.hasChild('version') && newData.child('version').isString() && newData.child('version').val().matches(/^[0-9]+(\\.[0-9]+){1,3}$/) && newData.child('version').val().length <= 32 && (!newData.hasChild('mandatory') || newData.child('mandatory').isBoolean()) && (!newData.hasChild('check_enabled') || newData.child('check_enabled').isBoolean()) && (!newData.hasChild('download_url') || (newData.child('download_url').isString() && newData.child('download_url').val().length <= 500)) && (!newData.hasChild('changelog') || (newData.child('changelog').isString() && newData.child('changelog').val().length <= 4000)) && (!newData.hasChild('updated_at') || newData.child('updated_at').isNumber()))"
      },
      "maintenance": {
        ".validate": "!newData.exists() || (newData.hasChild('enabled') && newData.child('enabled').isBoolean() && newData.hasChild('title') && newData.child('title').isString() && newData.child('title').val().length > 0 && newData.child('title').val().length <= 120 && newData.hasChild('message') && newData.child('message').isString() && newData.child('message').val().length > 0 && newData.child('message').val().length <= 2000 && (!newData.hasChild('updated_at') || newData.child('updated_at').isNumber()))"
      },
      "access": {
        ".validate": "!newData.exists() || (newData.hasChild('mode') && newData.child('mode').isString() && newData.child('mode').val().matches(/^(everyone|allowlist|role)$/) && (!newData.hasChild('min_role') || (newData.child('min_role').isString() && newData.child('min_role').val().matches(/^(free|pro|dev|founder)$/))) && (!newData.hasChild('updated_at') || newData.child('updated_at').isNumber()))"
      }
    },
    "payhip_orders": {
      ".read": false,
      ".write": false
    },
    "payhip_licenses": {
      ".read": false,
      ".write": false
    },
    "payhip_subscriptions": {
      ".read": false,
      ".write": false,
      ".indexOn": ["expiresAtMs"]
    },
    "stripe_orders": {
      ".read": false,
      ".write": false
    },
    "stripe_payment_intents": {
      ".read": false,
      ".write": false
    },
    "users": {
      ".read": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
      "$uid": {
        ".read": "auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
        ".write": "auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
        ".validate": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || ((!newData.hasChild('blocked') || ((!data.exists() || !data.hasChild('blocked')) && newData.child('blocked').val() !== true) || newData.child('blocked').val() === data.child('blocked').val()) && (!newData.hasChild('forceLogout') || (!data.hasChild('forceLogout') && !newData.hasChild('forceLogout')) || (data.hasChild('forceLogout') && newData.child('forceLogout').val() === data.child('forceLogout').val())) && (!newData.hasChild('role') || (!data.exists() && !newData.hasChild('role')) || (data.hasChild('role') && newData.child('role').val() === data.child('role').val()) || (!data.hasChild('role') && !newData.hasChild('role'))))",
        "photoURL": {
          ".read": "auth != null"
        },
        "name": {
          ".read": "auth != null"
        },
        "joinedAt": {
          ".read": "auth != null",
          ".validate": "newData.exists() && newData.isNumber() && newData.val() > 946684800000 && newData.val() < 4102444800000 && (!data.exists() || data.val() === newData.val())"
        },
        "role": {
          ".read": "auth != null",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
          ".validate": "newData.isString() && newData.val().matches(/^(free|pro|dev|founder)$/)"
        },
        "proExpiresAtMs": {
          ".read": "auth != null",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
          ".validate": "!newData.exists() || newData.isNumber()"
        },
        "appVersion": {
          ".read": "auth != null",
          ".validate": "!newData.exists() || (newData.isString() && newData.val().length > 0 && newData.val().length <= 32)"
        },
        "proDeviceId": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com')",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || (auth.uid === $uid && (!data.exists() || data.val() === newData.val() || data.parent().child('proDeviceChangeAllowed').val() === true))",
          ".validate": "!newData.exists() || (newData.isString() && newData.val().length >= 16 && newData.val().length <= 128)"
        },
        "proDeviceBoundAt": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com')",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || (auth.uid === $uid && (!data.exists() || data.val() === newData.val() || data.parent().child('proDeviceChangeAllowed').val() === true))",
          ".validate": "!newData.exists() || newData.isNumber()"
        },
        "proDeviceChangeAllowed": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com')",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || (auth.uid === $uid && (!newData.exists() || newData.val() === false))",
          ".validate": "!newData.exists() || newData.isBoolean()"
        },
        "proDeviceChangedAt": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com')",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || auth.uid === $uid",
          ".validate": "!newData.exists() || newData.isNumber()"
        },
        "proDeviceChangeGrantedAt": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com')",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
          ".validate": "!newData.exists() || newData.isNumber()"
        }
      }
    },
    "discordUsers": {
      ".read": "auth != null",
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com')",
        ".validate": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || ((!newData.hasChild('blocked') || ((!data.exists() || !data.hasChild('blocked')) && newData.child('blocked').val() !== true) || newData.child('blocked').val() === data.child('blocked').val()) && (!newData.hasChild('forceLogout') || (!data.hasChild('forceLogout') && !newData.hasChild('forceLogout')) || (data.hasChild('forceLogout') && newData.child('forceLogout').val() === data.child('forceLogout').val())) && (!newData.hasChild('role') || (!data.exists() && !newData.hasChild('role')) || (data.hasChild('role') && newData.child('role').val() === data.child('role').val()) || (!data.hasChild('role') && !newData.hasChild('role'))))",
        "joinedAt": {
          ".read": "auth != null",
          ".validate": "newData.exists() && newData.isNumber() && newData.val() > 946684800000 && newData.val() < 4102444800000 && (!data.exists() || data.val() === newData.val())"
        },
        "role": {
          ".read": "auth != null",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
          ".validate": "newData.isString() && newData.val().matches(/^(free|pro|dev|founder)$/)"
        },
        "proExpiresAtMs": {
          ".read": "auth != null",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
          ".validate": "!newData.exists() || newData.isNumber()"
        },
        "appVersion": {
          ".read": "auth != null",
          ".validate": "!newData.exists() || (newData.isString() && newData.val().length > 0 && newData.val().length <= 32)"
        },
        "proDeviceId": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com')",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || (auth.uid === $uid && (!data.exists() || data.val() === newData.val() || data.parent().child('proDeviceChangeAllowed').val() === true))",
          ".validate": "!newData.exists() || (newData.isString() && newData.val().length >= 16 && newData.val().length <= 128)"
        },
        "proDeviceBoundAt": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com')",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || (auth.uid === $uid && (!data.exists() || data.val() === newData.val() || data.parent().child('proDeviceChangeAllowed').val() === true))",
          ".validate": "!newData.exists() || newData.isNumber()"
        },
        "proDeviceChangeAllowed": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com')",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || (auth.uid === $uid && (!newData.exists() || newData.val() === false))",
          ".validate": "!newData.exists() || newData.isBoolean()"
        },
        "proDeviceChangedAt": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com')",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || auth.uid === $uid",
          ".validate": "!newData.exists() || newData.isNumber()"
        },
        "proDeviceChangeGrantedAt": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com')",
          ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
          ".validate": "!newData.exists() || newData.isNumber()"
        }
      }
    },
    "sessions": {
      "$uid": {
        ".read": "auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
        ".write": "auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
        "$sessionId": {
          ".read": "auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
          ".write": "auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'"
        }
      }
    },
    "pending_tokens": {
      "$uid": {
        "$sessionId": {
          // Owner read only. Writes are Worker admin SDK only (client .write: false).
          ".read": "auth != null && auth.uid === $uid",
          ".write": false
        }
      }
    },
    "bugReports": {
      ".read": "auth != null && (auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder')",
      ".indexOn": [
        "status",
        "timestamp"
      ],
      "$reportId": {
        ".write": "auth != null && ((auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder') || (!data.exists() && newData.hasChild('description') && newData.child('description').isString() && newData.child('description').val().length > 0 && newData.child('description').val().length <= 8000 && newData.hasChild('status') && newData.child('status').val() === 'new' && newData.hasChild('timestamp')))"
      }
    },

    "errorReports": {
      ".read": "auth != null && (auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder')",
      ".indexOn": [
        "status",
        "timestamp",
        "fingerprint",
        "kind"
      ],
      "$reportId": {
        ".write": "auth != null && ((auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder') || (!data.exists() && newData.child('source').val() === 'auto' && newData.child('status').val() === 'new' && newData.hasChild('timestamp') && newData.hasChild('exceptionType') && newData.child('exceptionType').isString() && newData.child('exceptionType').val().length > 0 && newData.child('exceptionType').val().length <= 200 && newData.hasChild('message') && newData.child('message').isString() && newData.child('message').val().length > 0 && newData.child('message').val().length <= 2000 && (!newData.hasChild('stackTrace') || (newData.child('stackTrace').isString() && newData.child('stackTrace').val().length <= 8000))))"
      }
    },

    "announcements": {
      ".read": true,
      ".indexOn": ["timestamp"],
      "$annId": {
        ".write": "auth != null && (auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder')",
        ".validate": "!newData.exists() || (newData.hasChildren(['title', 'description', 'status', 'timestamp', 'published']) && newData.child('title').isString() && newData.child('title').val().length > 0 && newData.child('title').val().length <= 120 && newData.child('description').isString() && newData.child('description').val().length > 0 && newData.child('description').val().length <= 4000 && newData.child('status').isString() && newData.child('status').val().matches(/^(new|breaking|update|info)$/) && newData.child('timestamp').isNumber() && newData.child('published').isBoolean())"
      }
    },
    "mailbox": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder')",
        ".indexOn": ["createdAt", "read"],
        "$msgId": {
          ".write": "auth != null && (auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder')",
          ".validate": "!newData.exists() || (newData.hasChildren(['title', 'body', 'createdAt', 'read', 'type']) && newData.child('title').isString() && newData.child('title').val().length > 0 && newData.child('title').val().length <= 120 && newData.child('body').isString() && newData.child('body').val().length > 0 && newData.child('body').val().length <= 8000 && newData.child('createdAt').isNumber() && newData.child('read').isBoolean() && newData.child('type').isString() && newData.child('type').val().matches(/^(admin|report_reply|system)$/))",
          "read": {
            ".write": "auth != null && auth.uid === $uid",
            ".validate": "newData.isBoolean()"
          }
        }
      }
    },
    "feature_flags": {
      ".read": true,
      ".write": "auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com'",
      "$featureKey": {
        ".validate": "newData.hasChildren(['min_role', 'enabled'])",
        "min_role": {
          ".validate": "newData.isString() && newData.val().matches(/^(free|pro|dev|founder)$/)"
        },
        "enabled": {
          ".validate": "newData.isBoolean()"
        },
        "visible": {
          ".validate": "newData.isBoolean()"
        },
        "emulator": {
          ".validate": "newData.isString() && newData.val().matches(/^(all|gameloop|mumu)$/)"
        },
        "page": {
          ".validate": "newData.isString() && newData.val().matches(/^[a-z0-9_]+$/)"
        }
      }
    },
    "serverTime": {
      ".read": true,
      ".write": false
    },
    "lobby_chat": {
      "bans": {
        ".read": "auth != null",
        ".write": "auth != null && (auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder')",
        "$uid": {
          ".validate": "!newData.exists() || newData.isBoolean()"
        }
      },
      "blocks": {
        "$myUid": {
          ".read": "auth != null && auth.uid === $myUid",
          ".write": "auth != null && auth.uid === $myUid",
          "$targetUid": {
            ".validate": "!newData.exists() || (newData.isBoolean() && newData.val() === true && $targetUid.length > 0 && $targetUid.length <= 128 && $targetUid !== $myUid)"
          }
        }
      },
      "reports": {
        ".read": "auth != null && (auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder')",
        "$reportId": {
          ".write": "auth != null && ((auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder') || (root.child('lobby_chat/bans/' + auth.uid).val() !== true && !data.exists() && newData.child('reporterUid').val() === auth.uid && newData.hasChildren(['reporterUid', 'msgId', 'reason', 'ts']) && newData.child('msgId').isString() && newData.child('msgId').val().length > 0 && newData.child('msgId').val().length <= 64 && newData.child('reason').isString() && newData.child('reason').val().length > 0 && newData.child('reason').val().length <= 200 && (newData.child('ts').isNumber() || (newData.child('ts').hasChildren(['.sv']) && newData.child('ts').child('.sv').val() === 'timestamp')) && (!newData.hasChild('targetUid') || (newData.child('targetUid').isString() && newData.child('targetUid').val().length > 0 && newData.child('targetUid').val().length <= 128)) && (!newData.hasChild('targetName') || (newData.child('targetName').isString() && newData.child('targetName').val().length <= 32)) && (!newData.hasChild('room') || (newData.child('room').isString() && newData.child('room').val().matches(/^(general|help|offtopic)$/))) && (!newData.hasChild('textPreview') || (newData.child('textPreview').isString() && newData.child('textPreview').val().length <= 120)) && (!newData.hasChild('status') || (newData.child('status').isString() && newData.child('status').val().matches(/^(new|reviewed|resolved)$/)))))"
        }
      },
      "user_moderation": {
        ".read": "auth != null && (auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder')",
        "$uid": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder')",
          ".write": "auth != null && ((auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder') || (auth.uid === $uid && newData.child('rulesAccepted').val() === true && newData.child('rulesVersion').isNumber() && newData.child('rulesVersion').val() === 1 && newData.child('strikesRemaining').isNumber() && newData.child('strikesRemaining').val() >= 0 && newData.child('strikesRemaining').val() <= 5 && newData.child('moralityScore').isNumber() && newData.child('moralityScore').val() >= 0 && newData.child('moralityScore').val() <= 100 && newData.child('displayName').isString() && newData.child('displayName').val().length > 0 && newData.child('displayName').val().length <= 32 && ((!data.exists() && newData.child('strikesRemaining').val() === 5 && newData.child('moralityScore').val() === 100 && !newData.hasChild('violations')) || (data.exists() && newData.child('strikesRemaining').val() === data.child('strikesRemaining').val() && newData.child('moralityScore').val() === data.child('moralityScore').val() && ((!data.hasChild('violations') && !newData.hasChild('violations')) || newData.child('violations').val() === data.child('violations').val())))))"
        }
      },
      "typing": {
        "$room": {
          ".read": "auth != null",
          ".validate": "$room.matches(/^(general|help|offtopic)$/)",
          "$uid": {
            ".write": "auth != null && auth.uid === $uid && root.child('lobby_chat/bans/' + auth.uid).val() !== true",
            ".validate": "!newData.exists() || (newData.hasChildren(['name', 'ts']) && newData.child('name').isString() && newData.child('name').val().length > 0 && newData.child('name').val().length <= 32 && newData.child('ts').isNumber())"
          }
        }
      },
      "pins": {
        ".read": "auth != null",
        "$room": {
          ".write": "auth != null && (auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder')",
          ".validate": "!newData.exists() || ($room.matches(/^(general|help|offtopic)$/) && newData.hasChildren(['text', 'name', 'byUid', 'ts']) && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 400 && newData.child('name').isString() && newData.child('name').val().length <= 32 && newData.child('byUid').isString() && newData.child('ts').isNumber())"
        }
      },
      "messages": {
        ".read": "auth != null",
        ".indexOn": [
          "ts",
          "room"
        ],
        "$msgId": {
          ".write": "auth != null && root.child('lobby_chat/bans/' + auth.uid).val() !== true && ((!data.exists() && root.child('lobby_chat/user_moderation/' + auth.uid + '/rulesAccepted').val() === true && root.child('lobby_chat/user_moderation/' + auth.uid + '/strikesRemaining').val() > 0 && newData.child('uid').val() === auth.uid && newData.hasChildren(['uid', 'name', 'text', 'ts', 'role', 'room']) && newData.child('uid').isString() && newData.child('uid').val().length > 0 && newData.child('uid').val().length <= 128 && newData.child('name').isString() && newData.child('name').val().length > 0 && newData.child('name').val().length <= 32 && newData.child('text').isString() && newData.child('text').val().length >= 0 && newData.child('text').val().length <= 400 && (newData.child('text').val().length > 0 || (newData.hasChild('imageKey') && newData.child('imageKey').isString())) && newData.child('role').isString() && ((root.child('users/' + auth.uid + '/role').val() != null && newData.child('role').val() === root.child('users/' + auth.uid + '/role').val()) || (root.child('users/' + auth.uid + '/role').val() == null && root.child('discordUsers/' + auth.uid + '/role').val() != null && newData.child('role').val() === root.child('discordUsers/' + auth.uid + '/role').val()) || (root.child('users/' + auth.uid + '/role').val() == null && root.child('discordUsers/' + auth.uid + '/role').val() == null && newData.child('role').val() === 'free')) && newData.child('room').isString() && newData.child('room').val().matches(/^(general|help|offtopic)$/) && (newData.child('ts').isNumber() || (newData.child('ts').hasChildren(['.sv']) && newData.child('ts').child('.sv').val() === 'timestamp')) && (!newData.hasChild('replyTo') || (newData.child('replyTo').isString() && newData.child('replyTo').val().length > 0 && newData.child('replyTo').val().length <= 64)) && (!newData.hasChild('replyName') || (newData.child('replyName').isString() && newData.child('replyName').val().length > 0 && newData.child('replyName').val().length <= 32)) && (!newData.hasChild('replyText') || (newData.child('replyText').isString() && newData.child('replyText').val().length > 0 && newData.child('replyText').val().length <= 100)) && (!newData.hasChild('imageKey') || (newData.child('imageKey').isString() && newData.child('imageKey').val().length > 3 && newData.child('imageKey').val().length <= 120)) && (!newData.hasChild('photoURL') || (newData.child('photoURL').isString() && newData.child('photoURL').val().length > 8 && newData.child('photoURL').val().length <= 500)) && (!newData.hasChild('mentions') || newData.child('mentions').hasChildren()) && !newData.hasChild('reactions')) || (data.exists() && !newData.exists() && (data.child('uid').val() === auth.uid || auth.uid === 'ZHMxN5tZkNgLcxFnp98QUqfvw963' || auth.token.email === 'mister.attaye@gmail.com' || root.child('users/' + auth.uid + '/role').val() === 'dev' || root.child('users/' + auth.uid + '/role').val() === 'founder')) || (data.exists() && newData.exists() && data.child('uid').val() === auth.uid && newData.child('uid').val() === data.child('uid').val() && newData.child('name').val() === data.child('name').val() && newData.child('role').val() === data.child('role').val() && newData.child('room').val() === data.child('room').val() && newData.child('ts').val() === data.child('ts').val() && newData.child('imageKey').val() === data.child('imageKey').val() && newData.child('replyTo').val() === data.child('replyTo').val() && newData.child('replyName').val() === data.child('replyName').val() && newData.child('replyText').val() === data.child('replyText').val() && newData.child('photoURL').val() === data.child('photoURL').val() && newData.child('reactions').val() === data.child('reactions').val() && newData.child('text').isString() && newData.child('text').val().length >= 0 && newData.child('text').val().length <= 400 && (newData.child('text').val().length > 0 || data.hasChild('imageKey')) && (!newData.hasChild('edited') || newData.child('edited').val() === true) && (!newData.hasChild('editedAt') || newData.child('editedAt').isNumber() || (newData.child('editedAt').hasChildren(['.sv']) && newData.child('editedAt').child('.sv').val() === 'timestamp')) && (!newData.hasChild('mentions') || newData.child('mentions').hasChildren())))",
          "reactions": {
            "$emoji": {
              ".validate": "$emoji.matches(/^(like|joy|fire)$/)",
              "$uid": {
                ".write": "auth != null && auth.uid === $uid && root.child('lobby_chat/bans/' + auth.uid).val() !== true && root.child('lobby_chat/messages/' + $msgId).exists()",
                ".validate": "!newData.exists() || (newData.isBoolean() && newData.val() === true)"
              }
            }
          }
        }
      }
    }
  }
}

```

### Verdict
**OK** for intended RTDB lockdown of `pending_tokens` writes and role escalation; **WEAK** note: `admin/totp_secret` is readable by the admin client (required by current TOTP design). `app_config` public read is intentional for the app.

---

## B1 — Exposed API keys (Groq / third-party)

### Command
`rg -n -i "groq|api_key|apiKey|GROQ|gsk_" --glob "*.js" --glob "*.html"`

### Literal findings
- Firebase **web** `apiKey: "AIzaSyBH_t3Uue7fbb-DahwjSJGjG2-quCqiLEs"` in `login1.html`, `login.html`, `theadm1n.html`, `UI430.html`, `public/*` — **expected** for Firebase client SDK (not a service account).
- CSP `connect-src` includes `https://api.groq.com` on homepage.
- **No** `gsk_` / `GROQ_API` / Groq bearer key found in `assets/js` or live HTML outside archives.
- No `fetch` to Groq in `assets/js/home-page.js`.

### Verdict
**OK** — no live Groq secret in client. Firebase web API key exposure is normal (protected by RTDB/Storage rules + Auth). Dead Groq allowlist is hygiene only (low).

---

## B2 — Firebase service account / private keys in repo + history

### Command
`rg -l -i "private_key|BEGIN PRIVATE KEY|service_account" .`  
`git log --all --diff-filter=A --name-only | grep -i service.account|\.pem$|\.key$`

### Literal output
- Working tree matches (excluding noise): **none** for service account JSON / PEM in site repo.
- Git history name filter: **empty**.
- Worker uses `JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)` (secret binding) — not hardcoded in source.

### Verdict
**OK**

---

## B3 — Domain-lock script (commit `921d66c`)

### Command
`git show 921d66c --stat`; grep hostname allowlist on sensitive pages.

### Commit still in history
`921d66c SECURITY: add domain-lock script ... to login1.html and login.html`

### Literal check logic (`login1.html` / `public/login1.html` — present)
```javascript
(function(){var h=location.hostname;var ok=h==='bariplux.com'||h==='localhost'||h==='127.0.0.1'||h.endsWith('.bariplux.com')||h.endsWith('.firebaseapp.com')||h.endsWith('.web.app');if(!ok){document.documentElement.innerHTML='';window.stop();location.replace('about:blank')}})();
```

### Wired today?
| Page | Domain-lock present? |
|------|----------------------|
| `login1.html` | **YES** |
| `login.html` | **NO** (headers from `921d66c` no longer present) |
| `theadm1n.html` | **NO** |

### Verdict
**WEAK** — still on login1; missing on legacy `login.html` and admin panel. Client-side domain lock is also bypassable (curl / disable JS).

---

## B4 — Dependency audit (Puppeteer)

### Command
`Get-Content package.json`; `npm audit --production`

### Literal `package.json`
```json
{
  "devDependencies": {
    "puppeteer": "^25.4.0"
  }
}
```

### Literal `npm audit --production`
```
npm warn config production Use `--omit=dev` instead.
found 0 vulnerabilities
```

### Verdict
**OK** — Puppeteer is `devDependencies` only; production audit clean.

---

## B5 — Cloudflare Worker secrets (`discord-auth-worker`)

### Scope path
`C:\Users\Admin\Desktop\Desktop\VS2026\BPTV2\BPTV2\discord-auth-worker\src\index.js`  
(Not vendored inside the website repo.)

### Command
Grep for secret-like literals / `env.` usage.

### Findings
Secrets referenced **only via `env.*`**, e.g.:
- `env.DISCORD_CLIENT_ID` / `env.DISCORD_CLIENT_SECRET`
- `env.FIREBASE_API_KEY` / `env.FIREBASE_PROJECT_ID` / `env.FIREBASE_SERVICE_ACCOUNT`
- `env.PENDING_TOKEN_HMAC_SECRET`
- `env.ALLOWED_ORIGINS`
- `env.CLOUD_BACKUP_BUCKET`

No hardcoded Discord client secret / HMAC / service-account JSON literals in Worker source.

### Verdict
**OK**

---

## B6 — Admin panel hardening re-check

### Rate limit (literal)
```javascript
const MAX_ATTEMPTS = 10;
const delays = [0, 1000, 1000, 5000, 5000, 30000, 30000, 120000, 120000, 600000];
// stored in sessionStorage: bp_admin_attempts / bp_admin_lockout
```
Backoff peaks at **600000 ms (10 min)** after repeated failures. **Client-side only** (cleared by clearing site data).

### 2FA
Still required when `admin/totp_enabled === true` (see A3) — but verified client-side.

### `console.log`
### Command
`rg -n "console.log" theadm1n.html public/theadm1n.html`  
### Output
**zero matches** (only `console.error('TOTP mismatch')` exists).

### Additional weakness (related)
`ADMIN_HASH` (SHA-256 of password) is **hardcoded in the HTML** and checked in-browser — offline cracking / bypass of gate UX is possible; real protection is Firebase Auth + RTDB rules after gate.

### Verdict
**WEAK** — rate limit + 2FA exist but both are client-side; password hash in page source; no CSP on admin page.

---

## B7 — Mixed content / protocol

### Command
`rg -n "http://(?!www\.w3\.org|...)"` on html/js/css excluding archive.

### Literal output
No actionable `http://` resource loads found in live site assets (CDN/fonts/scripts use `https://`).

### Verdict
**OK**

---

## B8 — HSTS

### Command
`curl -sI https://bariplux.com/` and `https://login.bariplux.com/`

### Literal headers observed
```
Strict-Transport-Security: max-age=31556926
```
(on both apex and login host)

- **max-age:** `31556926` ≈ **1 year** (not 1-month)
- **includeSubDomains:** **not present** (OFF) — matches prior decision for `download.bariplux.com`
- **preload:** **not present** (OFF) — matches prior decision

Cloudflare dashboard UI was not accessible from this agent; evidence is the live response header.

### Verdict
**WEAK / Lord's decision** — includeSubDomains/preload match intent; **max-age is ~1y**, not the previously decided 1-month. Confirm whether intentional.

---

## B9 — Input-handling / XSS (quiz, search, chat)

### Command
`rg -n "innerHTML|insertAdjacentHTML|document.write" assets/js/*.js`

### High-signal matches

| Location | User-controlled? | Assessment |
|----------|------------------|------------|
| `home-page.js` `addUserMessage` | Yes (chat input) | Escapes `& < >` before `innerHTML` → **OK** |
| `home-page.js` `formatMessage` / `addAIMessage` | AI text | HTML-escapes then markdown; **`[text](url)` href not scheme-validated** → `javascript:` possible in AI output → **WEAK** |
| `home-page.js` `applyHighlights` | Search term | `escapeRegExp` + replace on `textContent` → **OK** for XSS from query |
| `home-page.js` `avatarMarkup` | `localStorage` `photoURL` / name | `src=""` and `onerror=... ''` **not attribute-escaped** → **WEAK** (stored/self XSS if `bariplux_user` tampered) |
| `site-shell.js` avatar `innerHTML` | photo URL | Same pattern → **WEAK** |
| Ambient / chrome templates | Static | **OK** |

Quiz recommendations: generated from numeric answers (not free text) into `innerHTML` — low risk.

### Verdict
**WEAK** — user chat text is escaped; photo URL / markdown link href remain residual XSS vectors.

---

## B10 — `protect.js` honest scope

### Literal file header
```javascript
/**
 * Bari Plux — client-side deterrents (not real DRM).
 * Ctrl/Cmd+S downloads an empty placeholder HTML (content unavailable).
 */
```

### Behavior
Blocks context menu / F12 / Ctrl+U / Ctrl+S (empty download) / some DevTools shortcuts. Does **not** stop `curl`, View-Source without the guard, disabled JS, or detached DevTools.

### Codebase overstatement?
`protect.js` itself states it is **not real DRM**. No conflicting claim found in this audit pass that markets it as cryptographic protection.

### Verdict
**OK** (honest scope) — useful only as casual deterrent.

---

## Summary table

| Item | Verdict | Severity | Decision owner |
|------|---------|----------|----------------|
| A1 CSP `unsafe-*` / missing on admin+login | WEAK | Med | Agent-fixable (tighten CSP) + Lord if breaking OAuth |
| A2 XFO meta no-op / no frame-ancestors | WEAK | Med | Lord (Cloudflare / GH Pages headers) |
| A3 TOTP client-side secret | VULNERABLE | High | **Lord** (server-side TOTP) |
| A4 RTDB/Storage rules | OK (with TOTP-read note) | — | — |
| B1 Groq key in client | OK | — | — |
| B2 Service account in repo/history | OK | — | — |
| B3 Domain-lock incomplete | WEAK | Low–Med | Agent-fixable (wire login.html + theadm1n) |
| B4 npm audit / puppeteer | OK | — | — |
| B5 Worker secrets | OK | — | — |
| B6 Admin rate limit / console.log | WEAK | Med | Lord (server gate) / Agent (CSP on admin) |
| B7 Mixed content | OK | — | — |
| B8 HSTS max-age ~1y vs 1-month | WEAK | Low | **Lord** (Cloudflare HSTS) |
| B9 DOM XSS residuals | WEAK | Med | Agent-fixable (escape attrs / URL allowlist) |
| B10 protect.js scope | OK | — | — |

### Is this a 10/10 on security?
**No.** Evidence above shows remaining High (client TOTP) and multiple Med weaknesses. Strong areas: RTDB `pending_tokens` write denial, Worker env secrets, no Groq secret in client, no service-account leak in git, production npm audit clean.

---

*End of audit. No code was changed except writing this report + rule snapshots under `_archive/proof/`.*