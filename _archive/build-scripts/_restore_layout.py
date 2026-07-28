# -*- coding: utf-8 -*-
"""Restore layout CSS from pre-rebuild backup; keep current content index."""
from pathlib import Path
import re

ROOT = Path(r"C:\Github\Bari-Plux-Website")
backup = ROOT / "_archive" / "legacy-index" / "index.before-signal-rebuild.html"
# also try from-scratch backup
if not backup.exists():
    backup = ROOT / "_archive" / "legacy-index" / "index.before-from-scratch.html"

html = backup.read_text(encoding="utf-8")
m = re.search(r"<style[^>]*>([\s\S]*?)</style>", html, re.I)
assert m, "no style in backup"
css = m.group(1)
# strip animated bg particles that we'll replace
(ROOT / "assets" / "css" / "layout.css").write_text(
    "/* Structural layout from legacy homepage — visual identity overridden by liquid.css */\n" + css,
    encoding="utf-8",
)
print("layout.css bytes", len(css))

# current index checks
cur = (ROOT / "index.html").read_text(encoding="utf-8")
print("current has quiz", "optimization-quiz" in cur)
print("current has widgets", "widgets.css" in cur)
print("current has signal", "signal.css" in cur)
