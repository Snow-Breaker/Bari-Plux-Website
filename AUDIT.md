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

## 6) Locked files (do not edit)

`login.html`, `version.txt`, `Version2BPT`, `Version21BPT`, `Timer2BPT`
