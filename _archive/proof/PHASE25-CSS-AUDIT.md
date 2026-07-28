# Phase 2.5 STEP 1 — CSS live/dead audit (literal)

Date: 2026-07-28  
Repo: `C:\Github\Bari-Plux-Website`

## index.html stylesheet links (live homepage)

```
99: assets/css/obsidian.css?v=20260728d
100: assets/css/liquid-polish.css?v=20260728d
101: assets/css/experience.css?v=20260728d
(+ Font Awesome CDN, Google Fonts)
```

## File table

| filename | line count | loaded by (live HTML only; excludes `_archive/`) | status |
|----------|------------|--------------------------------------------------|--------|
| `obsidian.css` | 1190 | `index.html`, `glass-reference.html` | **LIVE** |
| `liquid-polish.css` | 657 | `index.html`, `glass-reference.html` | **LIVE** |
| `experience.css` | 526 | `index.html`, `glass-reference.html` | **LIVE** |
| `bariplux.css` | 425 | `404.html`, `Pro.html`, `public/Pro.html` | **LIVE (not homepage)** |
| `bari.css` | 946 | (nothing) | **DEAD** |
| `home.css` | 922 | (nothing) | **DEAD** |
| `layout.css` | 5779 | (nothing) | **DEAD** |
| `liquid.css` | 780 | (nothing) | **DEAD** |
| `signal.css` | 1572 | (nothing) | **DEAD** |
| `widgets.css` | 2725 | (nothing) | **DEAD** |
| `widgets-extra.css` | 1008 | (nothing) | **DEAD** |
| `_chat_chunk.css` | 29 | (nothing) | **DEAD** |

**Total dead lines (excl. `_chat_chunk`):** ~13,732  
**Live homepage stack lines:** 1190+657+526 = **2373**

## Other pages

Most product/legacy pages load `css/all-styles.css` (separate legacy bundle) — out of scope for homepage consolidation unless later migrated.

## ambient.js note

`assets/js/ambient.js` is **not** fully orphaned:
- Still loaded by `404.html`, `Pro.html`, `public/Pro.html`
- Homepage uses `signal-ambient.js` only
- Do not delete until Pro/404 are migrated to `signal-ambient.js`
