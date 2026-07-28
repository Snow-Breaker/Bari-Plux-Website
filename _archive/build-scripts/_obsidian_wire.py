# -*- coding: utf-8 -*-
"""Wire obsidian.css + signal-ambient.js; unify login toggle; clean head."""
from pathlib import Path
import re

ROOT = Path(r"C:\Github\Bari-Plux-Website")
index = ROOT / "index.html"
html = index.read_text(encoding="utf-8")

# Remove old design CSS/JS links
html = re.sub(
    r'\s*<link rel="stylesheet" href="assets/css/(?:widgets|widgets-extra|bari|layout|liquid|signal|bariplux|home)\.css">\s*',
    "\n",
    html,
)
html = re.sub(
    r'\s*<script src="assets/js/(?:aurora|fluid-field|signal-field|ambient|protect|home|signal-ambient)\.js"[^>]*></script>\s*',
    "\n",
    html,
)

FONTS = (
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500"
    "&family=Sora:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap"
)

INJECT = f'''
    <link href="{FONTS}" rel="stylesheet">
    <link rel="stylesheet" href="assets/css/obsidian.css">
    <script src="assets/js/protect.js" defer></script>
    <script src="assets/js/signal-ambient.js" defer></script>
    <script src="assets/js/home.js" defer></script>
'''

if "assets/css/obsidian.css" not in html:
    html = html.replace("</head>", INJECT + "\n</head>", 1)

# Deduplicate consecutive identical font link lines (keep one)
seen_font = False
out_lines = []
for line in html.splitlines(True):
    if "fonts.googleapis.com/css2?family=" in line and "Syne" in line:
        if seen_font and 'rel="stylesheet"' in line:
            continue
        if 'rel="stylesheet"' in line:
            seen_font = True
    out_lines.append(line)
html = "".join(out_lines)

# Ensure ambient host class includes bp-ambient
html = html.replace(
    'id="bp-aurora" class="bp-aurora"',
    'id="bp-aurora" class="bp-aurora bp-ambient"',
)
if 'id="bp-aurora"' not in html:
    html = re.sub(
        r"(<body[^>]*>)",
        r'\1\n    <div id="bp-aurora" class="bp-aurora bp-ambient" aria-hidden="true"></div>\n',
        html,
        count=1,
    )

# --- Unify login toggle: single path via hidden attribute ---
# Replace toggleUserDropdown function
html = re.sub(
    r"function toggleUserDropdown\(\)\s*\{[\s\S]*?\n    \}",
    '''function toggleUserDropdown() {
        const dropdown = document.getElementById('userDropdown');
        if (!dropdown) return;
        if (dropdown.hasAttribute('hidden')) dropdown.removeAttribute('hidden');
        else dropdown.setAttribute('hidden', '');
    }''',
    html,
    count=1,
)

# Remove double-wire addEventListener block for loginBtnWire if present
html = re.sub(
    r"\n\s*const loginBtnWire = document\.getElementById\('loginBtnHeader'\);[\s\S]*?\}[\s\S]*?\n    \}\n",
    "\n",
    html,
    count=1,
)

# Replace document click-outside handler to use bp-account and hidden
html = re.sub(
    r"document\.addEventListener\('click',\s*function\(e\)\s*\{[\s\S]*?userDropdown[\s\S]*?\}\);",
    '''document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('userDropdown');
        const container = document.querySelector('.bp-account');
        if (dropdown && container && !container.contains(e.target)) {
            dropdown.setAttribute('hidden', '');
        }
    });''',
    html,
    count=1,
)

# Unify updateLoginButton + checkLoginStatus paths: ensure onclick only sets toggle once
# Patch checkLoginStatus to only update label, single onclick
CHECK_NEW = '''    function checkLoginStatus() {
        const storedUser = localStorage.getItem('bariplux_user');
        const loginBtn = document.getElementById('loginBtnHeader');
        if (!loginBtn) return;

        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                const label = user.name || (user.email ? String(user.email).split('@')[0] : 'Account');
                loginBtn.classList.add('logged-in');
                loginBtn.innerHTML = '<i class="fas fa-user-circle"></i><span>' + label + '</span>';
                loginBtn.title = 'Account menu';
            } catch (e) {
                localStorage.removeItem('bariplux_user');
            }
        } else {
            loginBtn.classList.remove('logged-in');
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>Login</span>';
            loginBtn.title = 'Login';
        }
    }

    function wireLoginButton() {
        const loginBtn = document.getElementById('loginBtnHeader');
        if (!loginBtn || loginBtn.dataset.bpWired === '1') return;
        loginBtn.dataset.bpWired = '1';
        loginBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleUserDropdown();
        });
    }
'''

# Replace existing checkLoginStatus function body block
html = re.sub(
    r"function checkLoginStatus\(\)\s*\{[\s\S]*?\n    \}\n\n    function logout\(\)",
    CHECK_NEW + "\n    function logout()",
    html,
    count=1,
)

# Soften updateLoginButton: don't assign onclick; call checkLoginStatus + wireLoginButton
# Replace the end of updateLoginButton's onclick assignments by rewriting the whole function start
# Simpler: after updateLoginButton definition, neutralize onclick assignments inside it via string replace
html = html.replace(
    "loginBtn.onclick = function(e) {\n                    e.preventDefault();\n                    e.stopPropagation();\n                    toggleUserDropdown();\n                };",
    "/* onclick removed — wired once via wireLoginButton */",
)
html = html.replace(
    "loginBtn.onclick = function(e) {\n                e.preventDefault();\n                e.stopPropagation();\n                toggleUserDropdown();\n            };",
    "/* onclick removed — wired once via wireLoginButton */",
)
html = html.replace("loginBtn.onclick = null;", "/* keep single listener */")

# Ensure wireLoginButton called on init
if "wireLoginButton()" not in html:
    html = html.replace(
        "checkLoginStatus();",
        "checkLoginStatus();\n        wireLoginButton();",
        1,
    )
    # also after updateLoginButton runs
    html = html.replace(
        "updateLoginButton();\n    setTimeout(updateLoginButton, 500);\n    setTimeout(updateLoginButton, 1000);",
        "updateLoginButton();\n    wireLoginButton();\n    setTimeout(updateLoginButton, 500);\n    setTimeout(updateLoginButton, 1000);",
    )

# Ensure userDropdown has hidden attribute in markup
html = re.sub(
    r'(<div id="userDropdown" class="bp-menu")(?![^>]*\bhidden\b)',
    r'\1 hidden',
    html,
    count=1,
)

# Remove any leftover onclick on login button in HTML
html = re.sub(
    r'(id="loginBtnHeader"[^>]*)\s+onclick="[^"]*"',
    r'\1',
    html,
    count=1,
)

index.write_text(html, encoding="utf-8")

# Sync public
import shutil
for rel in [
    "assets/css/obsidian.css",
    "assets/js/signal-ambient.js",
    "assets/js/home.js",
    "assets/js/protect.js",
]:
    src = ROOT / rel
    dst = ROOT / "public" / rel
    if src.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

# Verify
h = index.read_text(encoding="utf-8")
checks = {
    "obsidian.css": "obsidian.css" in h,
    "signal-ambient": "signal-ambient.js" in h,
    "no widgets": "widgets.css" not in h,
    "no bari.css": "bari.css" not in h,
    "no aurora": "aurora.js" not in h,
    "wireLogin": "wireLoginButton" in h,
    "quiz": "optimization-quiz" in h,
    "bp-chrome": "bp-chrome" in h,
}
print(checks)
