# Temporary compat — REVERT before shipping the next public update

These changes keep **already-installed older desktop builds** able to log in while 2.3.0 is prepared.
They must be removed (or tightened again) before the next release that forces everyone onto Worker-only claim + `login1` + `app=2.3.0`.

## Revert checklist

### 1. Firebase RTDB `pending_tokens` rules
**Files:** `Bari-Plux-Website/database.rules.json`, `BPTV2/database.rules.json`

**Temporary now:**
- `.read`: `auth != null` (any authenticated user, including anonymous desktop claim)
- parent `.write`: `false`
- `claimed` child `.write`: one-way `false → true` for `auth != null`

**Restore for release:**
```json
"pending_tokens": {
  "$uid": {
    "$sessionId": {
      ".read": "auth != null && auth.uid === $uid",
      ".write": false
    }
  }
}
```
Deploy with `firebase deploy --only database`.

### 2. Classic `login.html` mint `allowedIp`
**File:** `Bari-Plux-Website/login.html` (`createPendingToken`)

**Temporary now:** `allowedIp: null` (old apps fail when browser IP ≠ desktop egress)

**Restore for release:** pass real client IP again (`allowedIp: clientIp`) once only 2.3.0+ is supported.

### 3. `login1` gate `legacy=1`
**Files:** `login.html` / `login1.html` / `public/login1.html` allow list

**Temporary now:** `allowLogin1` also when `legacy=1`

**Restore for release:** only `app=2.3.0` (or newer) may use `login1`.

### 4. Discord desktop redirect from classic login
**File:** `Bari-Plux-Website/login.html`

**Temporary now:** desktop Discord → `login1.html?desktop=1&legacy=1`

**Restore for release:** remove once classic `login.html` is retired or Discord uses Worker+customToken on classic page.

## Keep for release (not temporary)

- Worker `/pending-token` mint (client RTDB write stays forbidden)
- Desktop `LoginUrl` with `app=2.3.0` on 2.3.0 builds
- `SharedHttpClient` browser-like `User-Agent` (needed so Cloudflare BIC does not 1010 `/claim-token`)
- Worker-only claim path in `AuthSessionService` for 2.3.0+
- **`InitializeLoginSystem` must apply `baripluxtool://` / pending login BEFORE session-expiry early return** (bug: expired disk session skipped protocol login and left the gate up)

## Why this note exists

2026-07-22: older installs could open `baripluxtool://` but stayed on the login gate because:
1. RTDB rules blocked anonymous claim reads/writes
2. New builds calling Worker `/claim-token` without a User-Agent hit Cloudflare **1010**
3. Cold start with an expired/force-cleared session returned early in `InitializeLoginSystem` and never consumed the protocol token
