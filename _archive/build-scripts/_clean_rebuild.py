# -*- coding: utf-8 -*-
"""Strip legacy CSS wars; wire clean bari.css + aurora; fix header markup."""
from pathlib import Path
import re

ROOT = Path(r"C:\Github\Bari-Plux-Website")
index = ROOT / "index.html"
html = index.read_text(encoding="utf-8")

# Backup
bak = ROOT / "_archive" / "legacy-index" / "index.before-clean-bari.html"
bak.parent.mkdir(parents=True, exist_ok=True)
bak.write_text(html, encoding="utf-8")

# Remove ALL old asset CSS/JS design links
html = re.sub(
    r'\s*<link rel="stylesheet" href="assets/css/(?:layout|liquid|signal|widgets|widgets-extra|bariplux|home)\.css">\s*',
    "\n",
    html,
)
html = re.sub(
    r'\s*<script src="assets/js/(?:fluid-field|signal-field|ambient|protect|home)\.js"[^>]*></script>\s*',
    "\n",
    html,
)

FONTS = (
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500"
    "&family=Sora:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap"
)
html = re.sub(r'https://fonts\.googleapis\.com/css2\?family=[^"\']+', FONTS, html)

INJECT = f'''
    <link href="{FONTS}" rel="stylesheet">
    <link rel="stylesheet" href="assets/css/bari.css">
    <script src="assets/js/protect.js" defer></script>
    <script src="assets/js/aurora.js" defer></script>
    <script src="assets/js/home.js" defer></script>
'''

if "assets/css/bari.css" not in html:
    html = html.replace("</head>", INJECT + "\n</head>", 1)

# Clean ambient host
html = re.sub(
    r'<div class="[^"]*ambient[^"]*"[^>]*>[\s\S]*?</div>\s*(?=<!-- Header -->|<header)',
    '<div id="bp-aurora" class="bp-aurora" aria-hidden="true"></div>\n\n',
    html,
    count=1,
)
if 'id="bp-aurora"' not in html:
    html = re.sub(
        r'(<body[^>]*>)',
        r'\1\n    <div id="bp-aurora" class="bp-aurora" aria-hidden="true"></div>\n',
        html,
        count=1,
    )

# Replace header with clean version — dropdown portal-friendly
NEW_HEADER = '''
<header class="bp-chrome" id="bp-header">
  <div class="bp-chrome__inner">
    <a href="#home" class="bp-logo">
      <img src="https://yt3.googleusercontent.com/RPW5Z_kcoEu0ES_VpL4-7ZqI4eI1OQfuVL-DbuCYWmRhXono9hA5NOCSGGMDLzJqNcHUlhOg=s160-c-k-c0x00ffffff-no-rj" alt="" class="bp-logo__img" width="36" height="36">
      <span class="bp-logo__text">Bari Plux</span>
    </a>

    <nav class="bp-nav" aria-label="Primary">
      <a href="#home" class="bp-nav__link is-active">Home</a>
      <a href="#downloads" class="bp-nav__link">Downloads</a>
      <a href="#videos" class="bp-nav__link">Videos</a>
      <a href="#optimization-quiz" class="bp-nav__link">Quiz</a>
      <a href="#pubg" class="bp-nav__link">Content</a>
      <a href="#plux-times" class="bp-nav__link">Plux Times</a>
      <a href="#contact" class="bp-nav__link">Contact</a>
    </nav>

    <div class="bp-chrome__actions">
      <div class="bp-search" id="collapsible-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input type="search" id="header-search-input" class="bp-search__input" placeholder="Search…" autocomplete="off">
      </div>
      <button type="button" id="theme-toggle" class="bp-icon-btn" title="Toggle theme" aria-label="Toggle theme">
        <span class="moon-icon">☾</span><span class="sun-icon">☀</span>
      </button>
      <div class="bp-account">
        <button type="button" id="loginBtnHeader" class="bp-btn bp-btn--glass" title="Login">
          <i class="fas fa-sign-in-alt" aria-hidden="true"></i>
          <span>Login</span>
        </button>
        <div id="userDropdown" class="bp-menu" hidden>
          <div class="bp-menu__head">
            <div id="userAvatar" class="bp-menu__avatar"></div>
            <div>
              <div id="userName" class="bp-menu__name">Guest</div>
              <div id="userEmail" class="bp-menu__email">Sign in to continue</div>
            </div>
          </div>
          <div class="bp-menu__divider"></div>
          <button type="button" id="viewProfileBtn" class="bp-menu__item"><i class="fas fa-user-circle"></i> Account Info</button>
          <button type="button" id="goToLoginBtn" class="bp-menu__item"><i class="fas fa-sign-in-alt"></i> Login Page</button>
          <button type="button" id="logoutBtn" class="bp-menu__item bp-menu__item--danger"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
      </div>
    </div>
  </div>
</header>
<div class="search-results-dropdown" id="search-results-dropdown"></div>
'''

# Replace old header block through search-results dropdown
html = re.sub(
    r'<!-- Header -->\s*<header class="header[\s\S]*?</header>\s*'
    r'(?:<!-- Search Results Dropdown[^>]*>\s*)?'
    r'<div class="search-results-dropdown"[^>]*>.*?</div>\s*',
    NEW_HEADER + "\n",
    html,
    count=1,
)

# Fix toggleUserDropdown to use hidden attribute instead of class active
# Replace the function bodies carefully
old_toggle = '''    function toggleUserDropdown() {
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            dropdown.classList.toggle('active');
        }
    }
    
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('userDropdown');
        const container = document.querySelector('.user-menu-container');
        
        if (dropdown && container && !container.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });'''

new_toggle = '''    function toggleUserDropdown() {
        const dropdown = document.getElementById('userDropdown');
        if (!dropdown) return;
        if (dropdown.hasAttribute('hidden')) dropdown.removeAttribute('hidden');
        else dropdown.setAttribute('hidden', '');
    }

    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('userDropdown');
        const container = document.querySelector('.bp-account') || document.querySelector('.user-menu-container');
        if (dropdown && container && !container.contains(e.target)) {
            dropdown.setAttribute('hidden', '');
        }
    });

    const loginBtnWire = document.getElementById('loginBtnHeader');
    if (loginBtnWire && !loginBtnWire.getAttribute('data-wired')) {
        loginBtnWire.setAttribute('data-wired', '1');
        loginBtnWire.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleUserDropdown();
        });
    }'''

if old_toggle in html:
    html = html.replace(old_toggle, new_toggle)
else:
    # softer replace
    html = re.sub(
        r'function toggleUserDropdown\(\)\s*\{[\s\S]*?\n    \}',
        '''function toggleUserDropdown() {
        const dropdown = document.getElementById('userDropdown');
        if (!dropdown) return;
        if (dropdown.hasAttribute('hidden')) dropdown.removeAttribute('hidden');
        else dropdown.setAttribute('hidden', '');
    }''',
        html,
        count=1,
    )
    html = html.replace("dropdown.classList.remove('active');", "dropdown.setAttribute('hidden', '');")
    html = html.replace("dropdown.classList.toggle('active');", "")
    html = html.replace(".user-menu-container", ".bp-account")

# Also remove classList.remove('active') on dropdown elsewhere
html = html.replace("if (dropdown) dropdown.classList.remove('active');", "if (dropdown) dropdown.setAttribute('hidden', '');")

# Alias old header classes for any leftover JS
# Add body class
html = html.replace('<body class="bp-body">', '<body class="bp-body bp-app">', 1)

index.write_text(html, encoding="utf-8")
print("header replaced", "bp-chrome" in html)
print("bari.css", "bari.css" in html)
print("aurora", "aurora.js" in html)
print("layout gone", "layout.css" not in html)
print("userDropdown", 'id="userDropdown"' in html)
print("quiz", "optimization-quiz" in html)
