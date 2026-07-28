# -*- coding: utf-8 -*-
from pathlib import Path
import shutil

ROOT = Path(r"C:\Github\Bari-Plux-Website")
for rel in ["assets/css/obsidian.css", "assets/js/signal-ambient.js"]:
    shutil.copy2(ROOT / rel, ROOT / "public" / rel)

h = (ROOT / "index.html").read_text(encoding="utf-8")
assert "wireLoginButton();" in h
assert "obsidian.css" in h and "signal-ambient.js" in h
assert "widgets.css" not in h and "bari.css" not in h and "aurora.js" not in h
for s in ["home", "about", "videos", "downloads", "pubg", "optimization-quiz", "plux-times", "blog", "feedback", "contact"]:
    assert f'id="{s}"' in h, s
assert 'id="loginBtnHeader"' in h and 'id="userDropdown"' in h
assert "function toggleUserDropdown" in h
print("verify ok")
