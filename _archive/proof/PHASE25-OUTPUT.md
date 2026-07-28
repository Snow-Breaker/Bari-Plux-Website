# Phase 2.5 — OUTPUT (required deliverables)

## 1. Dead/live CSS table

See `_archive/proof/PHASE25-CSS-AUDIT.md` (updated note: after consolidation, live homepage loads 3 files).

| filename | lines (pre) | status after Phase 2.5 |
|----------|-------------|------------------------|
| bariplux.css | 425→~450 | **LIVE** — tokens + Pro/404 |
| site.css | (new ~2k) | **LIVE** — homepage layout |
| widgets.css | (new ~700) | **LIVE** — chat/search/videos/rules |
| obsidian/liquid-polish/experience | archived | `_archive/legacy-css/pre-site-merge/` |
| bari/home/layout/liquid/signal/widgets(+extra) | archived | `_archive/legacy-css/` |

## 2. Baseline + diff

- Baseline: `_archive/proof/computed-baseline.json` (pre-consolidation 3-file stack)
- Post three-file split: `_archive/proof/computed-current.json` + `computed-diff.json`
- Result after nav fix: **4 styleChanges**, all `--bp-max: "" → "1400px"` (intentional)

## 3. Screenshots

`_archive/proof/screenshots/` refreshed post-consolidation + repro shots:
- index dark/light @ 1440 & 390
- glass-reference @ 1440 & 390
- `repro-rules-modal-1440.png`
- `repro-video-modal-1440.png`

## 4. Final index.html stylesheet links

```
assets/css/bariplux.css?v=20260728f
assets/css/site.css?v=20260728f
assets/css/widgets.css?v=20260728f
```

## 5. ambient.js

**Not archived.** Still required by `404.html`, `Pro.html`, `public/Pro.html` (`[data-bp-ambient]`).
Homepage uses `signal-ambient.js` only. Documented in `SITE-STRUCTURE.md`.

## 6. Rules / video live repro

From `repro-rules-video.js` → `_archive/proof/REPRO-rules-video.txt`:

```
[rules-trigger] contact-me-btn
[rules-state] {"modalExists":true,"modalClass":"rules-modal active","display":"grid","active":true,"visible":true}
[video-clicked] true
[video-state] {"clicked":true,"modalExists":true,"hidden":false,"display":"grid","iframeSrc":"https://www.youtube-nocookie.com/embed/cb3S6lu-QF0?autoplay=1&rel=0&modestbranding=1"}
```

No `pageerror`. No CSP script violations. Residual noise: X-Frame-Options meta warning, YouTube `requestfailed` telemetry (headless), apple-mobile-web-app-capable deprecation.
