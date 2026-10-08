# Bari Plux Website — audit (2026-07-28)

Canonical repo: `C:\Github\Bari-Plux-Website`

## 1) Layout / sizing (why it felt “vertical & squeezed”)

| Issue | Cause | Status |
|-------|--------|--------|
| Content too narrow | `--bp-max: 1120px` forced a phone-like column on desktop | **Fixed → 1400px** |
| Cards stacked vertically | Grids forced to 2 cols, then at ≤960px to **1 col** | **Fixed → 4/3/2/1 by breakpoint** |
| Header stuck left | `position: sticky` + `left: 50%` + `translateX(-50%)` is unreliable; also `.header { position: relative }` fought sticky | **Fixed → `margin: auto`, no translate** |
| Search “broken” | `.search-container { display: none }` hid it | **Restored** |

## 2) Security (repo-wide)

**Deterrents only (not real security)**
- `protect.js` / inline `contextmenu` / Ctrl+S empty file — easy to bypass (DevTools, disable JS, view-source).
- Do not treat this as protection of business logic or secrets.

**High priority**
1. **`theadm1n.html`**: admin email hardcoded (`mister.attaye@gmail.com`); TOTP verified **in the browser**; console logs leak TOTP debug; if RTDB `admin/totp_secret` is readable by any signed-in admin client, TOTP can be extracted.
2. **Firebase web API key** in client HTML — normal for Firebase, but **security = RTDB/Storage rules**, not hiding the key.
3. **CSP** on `index.html` allows `'unsafe-inline'` + `'unsafe-eval'` — weakens XSS defenses.
4. **`login.html` / `login1.html`**: keep locked for app 2.2, but audit authDomain / token claim paths separately (Worker + RTDB).

**Medium**
5. No `manifest.json` but pages link to `/manifest.json` → 404 (PWA noise, not critical).
6. Public Firebase endpoints + open read rules on any node = data exposure risk — verify `database.rules.json` for `admin/*`, `app_config`, user trees.
7. Archive folder may contain old copies of admin/login — don’t deploy `_archive` to hosting.

**Low / expected**
8. Font Awesome / Google Fonts / Firebase CDNs — third-party supply chain; keep HTTPS only.

## 3) What does not work correctly

| Item | Problem |
|------|---------|
| Particles background | CDN removed / init disabled; dead code still in `index.html` |
| Theme toggle | Hidden in CSS (`display: none`) — light mode path half-dead |
| `manifest.json` | Linked, file missing |
| Old `css/all-styles.css` link | Removed; layout now depends on inline + `home.css` (fragile) |
| Dual protect scripts | Inline in `<head>` **and** `protect.js` — redundant |
| Chat / quiz / search | Mostly still wired, but styling conflicts with new glass layer; search was accidentally hidden |

## 4) Section structure (recommended order)

Keep content, tighten IA:

1. **Hero** — brand + CTA (Downloads / Contact / Tool)
2. **Downloads** — horizontal card row (4-up desktop)
3. **About** — shorter intro; move long highlights below fold
4. **Videos / Content**
5. **Optimization quiz** (optional tool — don’t put above downloads)
6. **Plux Times / Blog**
7. **Contact + social**
8. **Footer**

Avoid stuffing Pro/app marketing into the hero as the only story — this is still a creator site.

## 5) Background next steps (not yet fully redesigned)

Current: constellation canvas + radial washes. To make it “خیلی خفن” without jank:
- Prefer **CSS-only** mesh + soft vignette on mobile (no canvas)
- Desktop: keep canvas but lower node count (already reduced)
- One slow specular sweep; no scroll-linked animation
- Respect `prefers-reduced-motion`

## 6) Security findings resolved (2026-10, follow-up audit)

Items **1** and **6** from section 2 are now closed. Verified by reading the deployed system, not by
reading the rules file alone — the rules were probed with unauthenticated reads against the live
database to confirm the deployed copy matches this repo's copy.

**1. `admin/totp_secret` — RESOLVED, and stronger than expected.** It has its own
`.read: false, .write: false`, and a deeper rule overrides its parent's admin grant, so the TOTP
secret is unreadable **even by the signed-in admin** (probe returns `Permission denied`). It is read
and written only through the Worker's Admin SDK (`adminAuth.js`), which bypasses rules entirely, and
the Worker's browser proxy explicitly refuses the path twice over — `isSafeAdminRtdbPath()` rejects
`admin/totp_secret` and `admin/gate_rate`, and the client-side TOTP check is backed by the
server-side `adminAuth.js` gate. The "TOTP verified in the browser" weakness below still stands as a
defence-in-depth gap, but the secret itself can no longer be exfiltrated from a client.

**6. Open read rules — RESOLVED.** Unauthenticated probes:

| Node | Result |
|---|---|
| `admin`, `admin/totp_secret`, `admin/gate_rate` | Permission denied |
| `users`, `users/{any}`, `discordUsers` | Permission denied |
| `sessions`, `pending_tokens` | Permission denied |
| `payhip_orders`, `payhip_licenses`, `payhip_subscriptions`, `trials` | Permission denied |
| `stripe_orders`, `stripe_payment_intents` | Permission denied |
| `devices_3x`, `device_accounts_3x` | Permission denied |
| `lobby_chat`, `lobby_chat/messages`, `bugReports`, `errorReports`, `mailbox_3x` | Permission denied |
| `app_config`, `feature_flags_3x`, `announcements_3x`, `serverTime` | readable — required by the app |

No self-escalation path: every write of `role`, `roles`, `proExpiresAtMs`, `trialUsedAt` or a
`feature_flags` `min_role` is admin-only. `/feature/entitlement` derives its `uid` from the
*verified* Firebase ID token, never from the request body, so the signed entitlement JWT cannot be
minted for another account.

**Fixed in this pass 🔧**

- **`users/{uid}/trialUsedAt` was self-writable.** It had no explicit rule, so it fell through to
  the `$other` wildcard (`auth.uid === $uid`) while `proTrial.js` reads it as its first
  "already used a trial" check. Not exploitable for *gaining* a trial — `trials/devices/{machineHash}`
  and `trials/ips/{ipHash}/{uid}` are `"write": false` and survive the deletion — but it was a
  security control that looked authoritative and was user-controlled, one layer from billing. Now
  explicitly admin-only in both `users` and `discordUsers`. Safe to tighten: only the Worker's Admin
  SDK writes it, and Admin SDK bypasses rules.
- **Inconsistent id validation at rule-bypass boundaries.** Three handlers each carried their own
  `!uid.includes('/') && !uid.includes('..')` denylist, while `/claim-token` — which uses Admin SDK /
  `access_token` and therefore bypasses database rules — had **no** shape check at all. All four now
  call one shared allowlist, `isSafeRtdbKey()` in `discord-auth-worker/src/security.js`
  (`[A-Za-z0-9_-]{1,128}`, which covers Firebase uids, `discord_<digits>` and `crypto.randomUUID()`).
  Covered by two new tests in `test/security.test.mjs`.
- **`firebase.json` declared `"functions": { "source": "functions" }` but no `functions/` directory
  exists** — the backend moved to the Worker and the block was never removed, so a full
  `firebase deploy` would fail on it. Block removed.

**Investigated and confirmed NOT a vulnerability:** interpolating account ids into Firebase REST
paths cannot traverse. Firebase's REST layer rejects `..`, `$`, `[`, `]`, `%2F`, `%5C`, control
characters and `%00` in a path outright (`Invalid path: Invalid token in path`) — verified live. Even
if it did resolve, `sessions/{$uid}` and `users/{$uid}` bind `$uid` to `auth.uid`, so a foreign node
is denied. Client-side validation was added anyway as defence in depth, not as a fix for an open hole.
See `docs/Security.md` in the BPT repo for the full write-up.

**Deployed 2026-10-04, and verified in production rather than assumed.**

| What | How | Result |
|---|---|---|
| `database.rules.json` → RTDB | `firebase-admin` `setRules()` | 44,357 → 45,273 bytes |
| Worker | `wrangler deploy` | version `b11864e6-9ee6-420f-8508-fc99d189c4d0` (previous: `0471706b-…`) |

Before writing the rules, the deployed copy was diffed against this repo **node by node**: 24
top-level nodes on both sides, with exactly two differences — the two new `trialUsedAt` nodes. So
the deploy could not silently delete anything. Worth noting because a *first* attempt to read the
rules over plain REST returned a 301 that Node followed to the Firebase Console, yielding 943 KB of
console HTML that looked alarming; `firebase-admin` was needed to read them at all, and RTDB rules
are JSONC, so both copies had to be comment-stripped before they would parse.

Behaviour was then verified as a real signed-in user (custom token → Firebase ID token, with the
JWT's `user_id` claim decoded and asserted equal to the `$uid` in the paths — otherwise every
"denied" result would be meaningless, since a uid mismatch denies everything):

- `PUT`/`DELETE users/$uid/trialUsedAt` → **denied** (the new rule, working)
- `PUT users/$uid/role` / `proExpiresAtMs` / `roles` → still denied (no regression)
- `PUT users/$uid/{name,platform,joinedAt}` and `PUT sessions/$uid/$sid` → still allowed (the app
  is not broken)
- own record read → allowed; another account's `proDeviceId`, `role_assigned_by`, `lifetime`,
  whole record, and `sessions/<other>` → denied; anonymous reads of `users`, `admin/totp_secret`
  and `pending_tokens` → denied
- the synthetic account and all its data were deleted afterwards

### Customer-list exposure — what is public, and why that is the floor

`proExpiresAtMs`, `roles` and `appVersion` had `".read": "auth != null"` in both `users` and
`discordUsers`, so **any signed-in user could read every Pro customer's expiry date** — and from it
the price tier they bought and how long they had been subscribed. Closed to owner-or-admin, same as
`lifetime`, `proDeviceId` and `trialUsedAt`. Verified: cross-account reads now denied, own record
still fully readable, own writes unaffected.

The floor is `role`, and it cannot move while the chat badge exists. The badge works by the client
reading another account's role directly — `LobbyChatService.cs:1744` fetches
`users/{uid}/role.json` with the viewer's own token — so any rule that hides `role` blanks every
badge in the chat. And "who is Pro" is only half the list anyway: `lobby_chat/messages` is
world-readable to any signed-in user and carries a `name` on every message, so an attacker could
always pair a name with a role. **The badge is itself the customer list**; that is the feature, not
a rules defect.

What is now genuinely unreachable by a non-owner: how much they paid, when the period lapses,
lifetime status, device binding, who granted the role, and trial usage. So the commercial
surroundings are private while the one fact the UI advertises stays public — the correct trade,
but worth stating plainly rather than claiming the list is hidden.

If the badge ever stops being worth this, closing `role` is one line — but the chat would lose its
Pro/Dev/Founder labels at the same moment. The alternative is moving the badge behind the Worker
(serving a sanitised `badgeTier` per uid instead of the raw role), which hides the list without
touching the UI; that is a real feature change, not a rules tweak, so it was not done here.

The Worker probes against the live endpoint: a traversal `uid` and a traversal `sessionId` both
return `400 {"error":"Malformed uid or sessionId"}`, a missing-field body still returns the older
`Missing required fields` message, and a **legitimately shaped** uid with a wrong secret passes
validation and proceeds to the real check (`404 Token not found`) — i.e. the allowlist rejects no
id shape the app actually sends.

### Chat badge moved behind the Worker, `role` closed (2026-10-05)

The paragraph above left `role` public and called moving the badge "a real feature change, not a
rules tweak". That was accurate about effort, wrong about the mechanism — the blocker was never the
UI, it was that the badge was reading the wrong field entirely:

- the chat badge never read `users/{uid}/role`. It read a `role` field the **Worker stamped into
  every stored message** (`chatMessages.js`, validated on the send path), and
  `lobby_chat/messages/.read` is `"auth != null"` with `uid` + `name` + `role` on each message. So
  the paid-tier list was already fully public to *every* signed-in user, by two independent routes.
- a `badgeTier` indirection on the message would have been theatre: it still had to come from
  somewhere, and the only readable source was the role the viewer was not entitled to.

What shipped instead:

1. `role` is **removed from the stored message payload** entirely. There is no tier in the database
   to leak, and no client can reconstruct one.
2. New endpoint `POST /chat/badges` (`uids: string[]`, ≤ 100) returns `{}` unless the **viewer** is
   already Pro / Dev / Founder / Staff, resolved with the Admin SDK — so it is unaffected by these
   rules, and an unentitled viewer gets an empty map rather than a denied request. Entitled viewers
   get a per-uid map; a uid with no paid role is **omitted rather than reported as `free`**, so
   absence is the fail-closed answer everywhere. Tier strings are allowlisted on both ends.
3. `users/$uid/role/.read` and `discordUsers/$uid/role/.read` → owner-or-admin.
4. The "never block staff" check moved **server-side** into
   `lobby_chat/blocks/$myUid/$targetUid/.validate` (`root.child(...).val() !== 'dev'/'founder'/'staff'`),
   replacing a client-side cross-account role read. This also closes a pre-existing hole: the old
   allowlist of unblockable roles had no `staff` in it, so the button was never hidden for staff.
   `!==` rather than `.matches()` on purpose — `.val()` is `null` for an account with no role field
   and `.matches()` on `null` errors the rule out, which would have banned blocking ordinary users.

RTDB rules cannot gate this themselves: a Firebase ID token carries no entitlement claim (the
Worker mints no custom claims), and entitlement is a separate signed JWT. The gate has to live in
the Worker.

Live verification after deploy (Worker `ca8ac678`, then rules):

- `/chat/badges` with no/garbage bearer → `401`. Free viewer → `{"ok":true,"badges":{}}`, and the Pro
  uid appears **nowhere in the response body**. Pro viewer → `{"<uid>":"pro"}`, with the free uid and
  an unknown uid both omitted. `101` uids → `400 invalid_uids`, exactly `100` → `200`.
- `GET users/<other>/role` and `discordUsers/<other>/role` → `401 Permission denied`; own record,
  own `proExpiresAtMs`/`appVersion`, and another account's `name`/`photoURL`/`joinedAt` still `200`.
- Block: free → allowed (written), no-role-field → allowed (the `!==` trap avoided), `dev`/`founder`/
  `staff` and the admin uid → `401`, self → `401`, unblock (DELETE) → allowed. **Pro is not staff**
  (`IsStaffRole` is `founder|dev|staff`), so blocking a paying customer stays legitimate.
- A `.validate` denial returns **401**, which is what the client's `"forbidden"` return expects.

Deploy order matters and is not reversible in one step: Worker first, then rules. Rules-first would
have blanked every badge for everyone while the old Worker was still live. The client keeps sending
`role` in the send body for wire compatibility with a lagging Worker deploy, which now ignores it.

**What is still public, stated plainly:** `lobby_chat/messages` remains world-readable to any
signed-in user and carries `uid` + `name`, so an entitled viewer can still build a list of chat
participants. That is the badge's inherent purpose, and it is now the *only* remaining way to learn
that someone is Pro. What a free or unrelated account can no longer reach at all: `role`,
`proExpiresAtMs`, `roles`, `appVersion`, `trialUsedAt`, `lifetime`, `proDeviceId`, `role_assigned_by`.
`lobby_chat/messages` held 0 messages at deploy time, so there was no stored `role` to backfill.

## 7) Locked files (do not edit)

`login.html`, `version.txt`, `Version2BPT`, `Version21BPT`, `Timer2BPT`

## Admin panel duplication — how it stays in sync (2026-10-08)

The admin panel is served from two hosts: **GitHub Pages reads the repo root**
(`theadm1n.html`, `assets/js/theadm1n.js`) and **Firebase Hosting reads `public/`**.
`public/` is the **single source of truth** — it is what we edit and what
`firebase deploy` ships.

Two guards keep the copies byte-identical:
1. `.githooks/pre-commit` mirrors `public/` → root automatically on commit.
   Enable once per clone: `git config core.hooksPath .githooks`
2. `.github/workflows/admin-panel-sync-check.yml` fails the push if they ever
   differ (backstop for anyone who committed without the hook enabled).

Rule of thumb: **edit only `public/…`**; never hand-edit the root copies.
