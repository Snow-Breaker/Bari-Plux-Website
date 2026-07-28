# -*- coding: utf-8 -*-
from pathlib import Path
import re
html = Path(r"C:\Github\Bari-Plux-Website\index.html").read_text(encoding="utf-8")
print("total", len(html))
print("style tags", html.count("<style"))
print("head bytes", html.find("</head>"))
for s in re.findall(r'<script[^>]+src=["\']([^"\']+)', html)[:40]:
    print("SRC", s)
ids = re.findall(r'\bid=["\']([^"\']+)["\']', html)
print("unique ids", len(set(ids)))
need = ["home","about","videos","downloads","pubg","optimization-quiz","plux-times","contact","loginBtn","rules-modal","navbar","header"]
print("have", [x for x in need if x in ids])
# header snippet
m = re.search(r"<header[\s\S]{0,8000}</header>", html, re.I)
if m:
    Path(r"C:\Github\Bari-Plux-Website\_extract\header.html").write_text(m.group(0), encoding="utf-8")
    print("header bytes", len(m.group(0)))
# link css currently
for s in re.findall(r'<link[^>]+href=["\']([^"\']+)', html)[:30]:
    print("LINK", s)
