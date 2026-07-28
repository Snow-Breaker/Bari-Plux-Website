# Bari Plux Website — structure

**Canonical working copy:** `C:\Github\Bari-Plux-Website`

## Locked files (do not edit / do not move)

These stay at the **repo root** exactly as they are — desktop v2.2 depends on them:

- `login.html`
- `version.txt`
- `Version2BPT`
- `Version21BPT`
- `Timer2BPT`

## Design system (live homepage — July 2026)

| Path | Role |
|------|------|
| `assets/css/obsidian.css` | Primary tokens, layout, Obsidian palette (`--max: 1400px`) |
| `assets/css/liquid-polish.css` | Liquid glass materials + light mode |
| `assets/css/experience.css` | Type, videos/blog/rules polish, scrollbar, motion |
| `assets/js/protect.js` | Copy/devtools deterrents + Ctrl+S unavailable page |
| `assets/js/signal-ambient.js` | Constellation ambient (loaded by index) |
| `assets/js/home.js` | Reveals / spotlight |
| `assets/js/home-page.js` | Homepage interaction logic (extracted Phase 1) |
| `public/assets/*` | Mirrors for Firebase hosting |

**Staging:** `glass-reference.html` — Liquid Glass hierarchy for visual sign-off before migrating legacy pages.

Legacy token file `assets/css/bariplux.css` kept in sync (`--bp-max: 1400px`) for pages that still reference it.

Palette: `#030305` base, accent `#818CF8`.

## Hosting

- **GitHub Pages / bariplux.com** — root HTML + `assets/`
- **Firebase (`public/`)** — `login1.html`, `Pro.html`, `theadm1n.html` + `public/assets/`

## Archive

- `_archive/build-scripts/` — one-off Python helpers (Phase 0)
- `_archive/misc/`, `_archive/legacy-pages/`, `_archive/legacy-index/`

## Migrated onto live Obsidian stack

`index.html`, `glass-reference.html`

## Still to migrate (after glass-reference approval)

`news.html`, `optimizationtools.html`, `gameloopdown.html`, `mobile.html`, and other product pages still on `css/all-styles.css`.

Do **not** migrate `login.html`. `login1.html` / `theadm1n.html` only when explicitly approved.
