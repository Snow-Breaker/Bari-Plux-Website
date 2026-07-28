# -*- coding: utf-8 -*-
from pathlib import Path
import re

ROOT = Path(r"C:\Github\Bari-Plux-Website")
index = ROOT / "index.html"
html = index.read_text(encoding="utf-8")

# Remove old design stylesheets / ambient scripts
html = re.sub(
    r'\s*<link rel="stylesheet" href="assets/css/(?:signal|widgets|widgets-extra|bariplux|home)\.css">\s*',
    "\n",
    html,
)
html = re.sub(
    r'\s*<script src="assets/js/(?:signal-field|ambient|protect|home)\.js"[^>]*></script>\s*',
    "\n",
    html,
)

# Ensure fonts: Syne + Sora + IBM Plex Mono (match earlier brand + desktop feel)
FONTS = (
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500"
    "&family=Sora:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap"
)
# Replace Bricolage/Figtree if present
html = re.sub(
    r'https://fonts\.googleapis\.com/css2\?family=[^"\']+',
    FONTS,
    html,
)

INJECT = f'''
    <link rel="stylesheet" href="assets/css/layout.css">
    <link rel="stylesheet" href="assets/css/liquid.css">
    <script src="assets/js/protect.js" defer></script>
    <script src="assets/js/fluid-field.js" defer></script>
    <script src="assets/js/home.js" defer></script>
'''

# Remove previous inject block remnants near </head>
html = re.sub(
    r'\s*<link rel="stylesheet" href="assets/css/layout\.css">\s*',
    "\n",
    html,
)
html = re.sub(
    r'\s*<link rel="stylesheet" href="assets/css/liquid\.css">\s*',
    "\n",
    html,
)

if "assets/css/liquid.css" not in html:
    html = html.replace("</head>", INJECT + "\n</head>", 1)

# Ambient markup — let fluid-field.js rebuild, but give a host
new_ambient = '''    <div class="lg-ambient bp-ambient" data-bp-ambient aria-hidden="true"></div>
'''
html = re.sub(
    r'<div class="(?:sf-ambient |lg-ambient )?bp-ambient"[^>]*>[\s\S]*?</div>\s*',
    new_ambient,
    html,
    count=1,
)
if "data-bp-ambient" not in html:
    html = re.sub(r"(<body[^>]*>)", r"\1\n" + new_ambient, html, count=1)

# Theme color
html = html.replace('content="#030305"', 'content="#030305"')

index.write_text(html, encoding="utf-8")
print("updated", index)
print("liquid", "liquid.css" in html)
print("layout", "layout.css" in html)
print("fluid", "fluid-field.js" in html)
print("no widgets", "widgets.css" not in html)
print("no signal", "signal.css" not in html)
