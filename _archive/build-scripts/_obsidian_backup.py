# -*- coding: utf-8 -*-
from pathlib import Path
import re, shutil

ROOT = Path(r"C:\Github\Bari-Plux-Website")
src = ROOT / "index.html"
bak = ROOT / "_archive" / "legacy-index" / "index.before-obsidian-rebuild.html"
bak.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(src, bak)
html = src.read_text(encoding="utf-8")
sections = re.findall(r'<section[^>]+id=["\']([^"\']+)', html)
ids = set(re.findall(r'\bid=["\']([^"\']+)', html))
crit = [
    "bp-header", "loginBtnHeader", "userDropdown", "optimization-quiz",
    "ai-chat-widget", "chat-toggle", "header-search-input", "theme-toggle",
    "bp-aurora", "video-modal", "quiz-progress", "collapsible-search",
]
print("backup", bak.stat().st_size)
print("sections", sections)
print("crit", {c: c in ids for c in crit})
print("bytes", len(html))
