# Phase 2.5 CSS audit — CURRENT STATE

**Generated:** 2026-07-28 (Phase 3.5 housekeeping — post site.css consolidation)  
**Distrust if older than this date without regeneration.**

## Literal `index.html` stylesheet links

```
grep -n "stylesheet" index.html
```

```
85:<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
86:<noscript><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"></noscript>
97:    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Sora:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
99:    <link rel="stylesheet" href="assets/css/bariplux.css?v=20260728g">
100:    <link rel="stylesheet" href="assets/css/site.css?v=20260728g">
101:    <link rel="stylesheet" href="assets/css/widgets.css?v=20260728g">
```

## Live / dead table (assets/css only)

| filename | loaded by (live HTML) | status |
|----------|----------------------|--------|
| `bariplux.css` | `index.html`, `glass-reference.html`, `404.html`, `Pro.html`, `public/Pro.html` | **LIVE** — tokens (+ Pro chrome); light mode block (Phase 3.5) |
| `site.css` | `index.html`, `glass-reference.html` | **LIVE** — homepage layout / surfaces |
| `widgets.css` | `index.html`, `glass-reference.html` | **LIVE** — AI chat, search, videos, rules |
| (archived) bari/home/layout/liquid/signal/widgets-extra/_chat_chunk | nothing | `_archive/legacy-css/` |
| (archived) obsidian/liquid-polish/experience | nothing | `_archive/legacy-css/pre-site-merge/` |

## Notes

- Clickjacking: `X-Frame-Options` **meta tag removed** from `index.html` (meta is a no-op). Real protection needs Cloudflare (or other edge) HTTP headers — GH Pages cannot set custom response headers.
- `ambient.js` still used by Pro/404; homepage uses `signal-ambient.js` (migrate later).
