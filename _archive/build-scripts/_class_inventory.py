# -*- coding: utf-8 -*-
from pathlib import Path
import re
from collections import Counter
html = Path(r"C:\Github\Bari-Plux-Website\index.html").read_text(encoding="utf-8")
# extract style
sm = re.search(r"<style[^>]*>([\s\S]*?)</style>", html, re.I)
style = sm.group(1) if sm else ""
Path(r"C:\Github\Bari-Plux-Website\_extract\old_style.css").write_text(style, encoding="utf-8")
print("style len", len(style))
# body only classes
body = html[html.find("<body"):html.find("</body>")]
classes = re.findall(r'class=["\']([^"\']+)["\']', body)
allc = []
for c in classes:
    allc.extend(c.split())
ctr = Counter(allc)
print("top classes:")
for k,v in ctr.most_common(60):
    print(f"  {v:4d} {k}")
# header region - find navbar
for pat in ["navbar", "nav-menu", "header", "login", "hamburger"]:
    i = html.lower().find(pat)
    print(pat, "at", i)
# extract nav block roughly
nm = re.search(r'<nav[\s\S]{200,6000}</nav>', html, re.I)
if nm:
    Path(r"C:\Github\Bari-Plux-Website\_extract\nav.html").write_text(nm.group(0)[:8000], encoding="utf-8")
    print("nav len", len(nm.group(0)))
