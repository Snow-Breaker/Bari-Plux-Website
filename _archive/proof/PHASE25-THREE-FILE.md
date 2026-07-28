# Phase 2.5 three-file split

## index.html stylesheets
- assets/css/bariplux.css (tokens + Pro page chrome; Space Grotesk; live --void/--accent aliases)
- assets/css/site.css (layout/surfaces; merged live stack minus widgets)
- assets/css/widgets.css (AI chat, search dropdown, videos, community rules)

## computed-diff vs pre-consolidation baseline
- styleChanges: 4 — all are `--bp-max` empty → `1400px` (intentional; bariplux now loaded)
- Mobile `bp-nav-link.width` regression from bariplux `.bp-nav` rules: fixed by removing unused nav chrome from bariplux
