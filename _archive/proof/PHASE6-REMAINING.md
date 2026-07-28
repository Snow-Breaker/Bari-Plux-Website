# Phase 6 proof

## manifest.json
- Created at repo root `/manifest.json` (GitHub Pages) and `public/manifest.json` (Firebase).
- `theme_color` / `background_color`: `#030305`
- Brand accent (icons/UI): `#818CF8` (documented; not a standard manifest key)

## Light mode
- Early theme apply in `assets/js/boot.js` (before paint) + `theme-color` meta sync.
- Ambient host uses `var(--void)` (was hardcoded `#030305`).
- Extended light text/surface rules in `liquid-polish.css`.
- Toggle retained (plan default).

## Protect consolidate
- Single path on homepage: one `<script src="assets/js/protect.js" defer>` (no inline protect in head).

## Particles
- Homepage: `initParticles` absent from `home-page.js` (Phase 2).
- `#particles-js` forced `display:none` in `obsidian.css`.
