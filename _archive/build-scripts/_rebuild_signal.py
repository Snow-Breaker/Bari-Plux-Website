# -*- coding: utf-8 -*-
"""Rebuild index.html: strip inline CSS, inject Signal Field design system, keep all content/scripts."""
from pathlib import Path
import re

ROOT = Path(r"C:\Github\Bari-Plux-Website")
index = ROOT / "index.html"
html = index.read_text(encoding="utf-8")

# Backup already exists from earlier; refresh
backup = ROOT / "_archive" / "legacy-index" / "index.before-signal-rebuild.html"
backup.parent.mkdir(parents=True, exist_ok=True)
backup.write_text(html, encoding="utf-8")

# Remove the giant <style>...</style> block (first/main one in head)
html2, n = re.subn(r"<style[^>]*>[\s\S]*?</style>\s*", "", html, count=1, flags=re.I)
print("removed style blocks:", n)
html = html2

# Remove old bariplux/home/ambient/home.js links (we'll re-add clean set)
html = re.sub(
    r'\s*<link rel="stylesheet" href="assets/css/(?:bariplux|home)\.css">\s*',
    "\n",
    html,
)
html = re.sub(
    r'\s*<script src="assets/js/(?:protect|ambient|home)\.js"[^>]*></script>\s*',
    "\n",
    html,
)

# Replace Google font links (Syne/Sora) with Bricolage + Figtree + IBM Plex Mono
NEW_FONTS = (
    'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;600;700;800'
    '&family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap'
)
html = re.sub(
    r'https://fonts\.googleapis\.com/css2\?family=[^"\']+',
    NEW_FONTS,
    html,
)

# Inject design system just before </head>
INJECT = f'''
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="{NEW_FONTS}" rel="stylesheet">
    <link rel="stylesheet" href="assets/css/signal.css">
    <link rel="stylesheet" href="assets/css/widgets.css">
    <script src="assets/js/protect.js" defer></script>
    <script src="assets/js/signal-field.js" defer></script>
    <script src="assets/js/home.js" defer></script>
'''

# Avoid duplicate font links flooding - remove duplicate identical font link tags after first
seen_font = False
lines = []
for line in html.splitlines(True):
    if "fonts.googleapis.com/css2?family=" in line and "Bricolage" in line:
        if seen_font:
            continue
        seen_font = True
    lines.append(line)
html = "".join(lines)

if "assets/css/signal.css" not in html:
    html = html.replace("</head>", INJECT + "\n</head>", 1)
else:
    # still ensure widgets + signal-field present
    if "assets/css/widgets.css" not in html:
        html = html.replace(
            'href="assets/css/signal.css">',
            'href="assets/css/signal.css">\n    <link rel="stylesheet" href="assets/css/widgets.css">',
            1,
        )
    if "signal-field.js" not in html:
        html = html.replace(
            'src="assets/js/protect.js" defer></script>',
            'src="assets/js/protect.js" defer></script>\n    <script src="assets/js/signal-field.js" defer></script>',
            1,
        )

# Upgrade ambient host markup
old_ambient = '''    <div class="bp-ambient" data-bp-ambient aria-hidden="true">
        <div class="bp-ambient__sheen"></div>
        <div class="bp-ambient__noise"></div>
    </div>'''

new_ambient = '''    <div class="sf-ambient bp-ambient" data-bp-ambient aria-hidden="true">
        <div class="sf-ambient__ribbons bp-ambient__sheen"></div>
        <div class="sf-ambient__grid"></div>
        <div class="sf-ambient__scan"></div>
        <div class="sf-ambient__noise bp-ambient__noise"></div>
    </div>'''

if old_ambient in html:
    html = html.replace(old_ambient, new_ambient)
elif 'data-bp-ambient' in html:
    html = re.sub(
        r'<div class="bp-ambient"[^>]*>[\s\S]*?</div>\s*',
        new_ambient + "\n",
        html,
        count=1,
    )
else:
    html = html.replace("<body", "<body", 1)
    html = re.sub(
        r"(<body[^>]*>)",
        r"\1\n" + new_ambient,
        html,
        count=1,
    )

# Polish header: add right-slot class for styling without inline style dependency
html = html.replace(
    '<div style="display:flex;align-items:center;gap:12px">',
    '<div class="header-actions">',
    1,
)

# Hero brand-first micro polish: ensure name is dominant (content unchanged)
# no content change needed — CSS handles it

index.write_text(html, encoding="utf-8")
print("wrote", index, "bytes", len(html))
print("has signal.css", "assets/css/signal.css" in html)
print("has widgets", "assets/css/widgets.css" in html)
print("has signal-field", "signal-field.js" in html)
print("style tags left", html.lower().count("<style"))
print("optimization-quiz", 'id="optimization-quiz"' in html)
print("loginBtnHeader", "loginBtnHeader" in html)
