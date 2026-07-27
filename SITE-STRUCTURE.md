# Bari Plux Website — structure

**Canonical working copy:** `C:\Github\Bari-Plux-Website`

## Locked files (do not edit / do not move)

These stay at the **repo root** exactly as they are — desktop v2.2 depends on them:

- `login.html`
- `version.txt`
- `Version2BPT`
- `Version21BPT`
- `Timer2BPT`

## Design system (use everywhere)

| Path | Role |
|------|------|
| `assets/css/bariplux.css` | Tokens, liquid glass, type, buttons, nav |
| `assets/js/protect.js` | Copy/devtools deterrents + Ctrl+S empty save |
| `assets/js/ambient.js` | Animated constellation background + reveals |
| `public/assets/*` | Same assets for Firebase hosting (`login.bariplux.com`) |

Palette synced with desktop **Obsidian Black**: `#030305` base, accent `#818CF8`.

## Hosting

- **GitHub Pages / bariplux.com** — root HTML + `assets/`
- **Firebase (`public/`)** — `login1.html`, `Pro.html`, `theadm1n.html` + `public/assets/`

## Archive

Non-product / leftover pages live under `_archive/`:

- `_archive/misc/` — Norge, artikkel, skole, Controls, Services
- `_archive/legacy-pages/` — school calendars, wisdom, test HTML, C# leftovers
- `_archive/legacy-index/` — pre-redesign homepage backup

## Migrated onto `bariplux.css`

`index.html`, `Pro.html`, `updates.html`, `404.html`

## Still to migrate

`news.html`, `optimizationtools.html`, `gameloopdown.html`, `mobile.html`, and other product pages.

Do **not** migrate `login.html`. `login1.html` / `theadm1n.html` only when explicitly approved.
