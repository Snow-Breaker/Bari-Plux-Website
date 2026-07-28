# -*- coding: utf-8 -*-
"""Extract critical sections from legacy index for rebuild."""
import re
from pathlib import Path

src = Path(r"C:\Github\Bari-Plux-Website\index.html")
out = Path(r"C:\Github\Bari-Plux-Website\_extract")
out.mkdir(exist_ok=True)
html = src.read_text(encoding="utf-8")

# Backup
Path(r"C:\Github\Bari-Plux-Website\_archive\legacy-index\index.before-from-scratch.html").write_text(html, encoding="utf-8")

def extract_section(hid):
    # match <section id="hid" ...> ... </section> non-greedy with nesting limited
    pat = rf'(<section[^>]*\bid=["\']{hid}["\'][^>]*>)([\s\S]*?)(</section>)'
    m = re.search(pat, html, re.I)
    if not m:
        print("MISSING", hid)
        return None
    block = m.group(0)
    (out / f"{hid}.html").write_text(block, encoding="utf-8")
    print(hid, "bytes", len(block))
    return block

for hid in ["home", "about", "videos", "downloads", "pubg", "optimization-quiz", "plux-times", "contact"]:
    extract_section(hid)

# footer
fm = re.search(r'(<footer[\s\S]*?</footer>)', html, re.I)
if fm:
    (out / "footer.html").write_text(fm.group(1), encoding="utf-8")
    print("footer", len(fm.group(1)))

# scripts after quiz - grab from initQuiz to end of first big script? 
# Save all inline scripts for reference
scripts = re.findall(r'<script(?![^>]*src=)[^>]*>([\s\S]*?)</script>', html)
(out / "inline_scripts_count.txt").write_text(str(len(scripts)), encoding="utf-8")
# Keep the largest scripts
scripts_sorted = sorted(scripts, key=len, reverse=True)
for i, s in enumerate(scripts_sorted[:5]):
    (out / f"script_{i}.js").write_text(s, encoding="utf-8")
    print("script", i, len(s))

print("done")
