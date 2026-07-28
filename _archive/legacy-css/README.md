# Legacy CSS archived (Phase 2.5)

Confirmed dead — no live HTML outside `_archive/` linked these files.

Archived (not deleted):
- bari.css
- home.css
- layout.css
- liquid.css
- signal.css
- widgets.css
- widgets-extra.css
- _chat_chunk.css

Live homepage stack left in place until merged into `site.css`:
- obsidian.css
- liquid-polish.css
- experience.css

Still live for Pro/404:
- bariplux.css

## site.css merge (2026-07-28)

`index.html` / `glass-reference.html` now load a single `assets/css/site.css` (concat of obsidian + liquid-polish + experience in prior load order).

Computed-style regression: `styleChanges: 0` (see `_archive/proof/computed-diff.json`). Pre-merge sources archived under `pre-site-merge/`.
