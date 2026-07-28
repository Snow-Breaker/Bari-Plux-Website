# Phase 3.5 — Light mode rebuild

**Date:** 2026-07-28

## Inventory (before rebuild)

| File | Light selectors found |
|------|----------------------|
| `bariplux.css` | none (tokens were dark-only) |
| `site.css` | duplicate `[data-theme=light]` token block + full `html[data-theme=light]` section (ambient, chat, nav, cards, scrollbar, search highlight) |
| `widgets.css` | `.rules-container.liquid`, `.rule-card` |

## After rebuild

- **All** light-mode color/opacity rules live in one block at the end of `bariplux.css`.
- `site.css` / `widgets.css`: zero `data-theme="light"` rules (verified by grep).
- Non-token exceptions kept in bariplux (explained): ambient wash gradients, theme-toggle icon swap, name-gradient, chat hardcoded fills, rules modal fills, scrollbar thumbs, search highlight — these need more than token swaps.

## Contrast pairs (body text)

| Role | Foreground | Background | Approx ratio |
|------|------------|------------|--------------|
| Body text | `#12131A` | `#F4F6FB` (`--void`) | ~16:1 AAA |
| Secondary / lead | `#3F4558` | `#F4F6FB` | ~8.2:1 AA+ |
| Muted | `#5C6478` | `#F4F6FB` | ~5.6:1 AA |
| Accent on light | `#4F46E5` | `#F4F6FB` | ~6.5:1 AA |

Measured live (Puppeteer): `bodyBg rgb(244,246,251)`, `bodyColor rgb(18,19,26)`, `leadColor rgb(63,69,88)`.

## Housekeeping

- Regenerated `PHASE25-CSS-AUDIT.md` with current 3-file links.
- Removed no-op `<meta http-equiv="X-Frame-Options">` from `index.html`. Real clickjacking protection needs Cloudflare (or similar) HTTP headers — GitHub Pages cannot set them.
