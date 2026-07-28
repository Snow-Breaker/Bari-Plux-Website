/**
 * Bari Plux shared site shell — injects the new template chrome on every page.
 * Requires: bariplux.css + site.css (+ optional shell.css / widgets.css)
 *           signal-ambient.js for #bp-aurora
 *
 * - Replaces legacy .header.glass with .bp-chrome
 * - Removes particles / floating bg chrome
 * - Theme toggle + sticky scrolled state
 * - Keeps #loginBtnHeader / #userDropdown IDs for existing auth scripts
 */
(function () {
  'use strict';

  var LOGO =
    'https://yt3.googleusercontent.com/RPW5Z_kcoEu0ES_VpL4-7ZqI4eI1OQfuVL-DbuCYWmRhXono9hA5NOCSGGMDLzJqNcHUlhOg=s160-c-k-c0x00ffffff-no-rj';

  var NAV = [
    { href: 'index.html', label: 'Home', match: ['', 'index.html', 'index'] },
    { href: 'index.html#downloads', label: 'Downloads' },
    { href: 'index.html#videos', label: 'Videos' },
    { href: 'mapspubg.html', label: 'Maps', match: ['mapspubg.html'] },
    { href: 'weaponorg.html', label: 'Weapons', match: ['weaponorg.html', 'org.html'] },
    { href: 'news.html', label: 'News', match: ['news.html'] },
    { href: 'updates.html', label: 'Updates', match: ['updates.html'] },
    { href: 'tool.html', label: 'Tool', match: ['tool.html', 'tool'] },
    { href: 'optimizationtools.html', label: 'Tools', match: ['optimizationtools.html'] },
    { href: 'Pro.html', label: 'Pro', match: ['pro.html'] }
  ];

  function pageFile() {
    var path = (location.pathname || '').replace(/\\/g, '/');
    var seg = path.split('/').pop() || 'index.html';
    return decodeURIComponent(seg).toLowerCase();
  }

  function isActive(item) {
    var file = pageFile();
    if (!item.match) return false;
    for (var i = 0; i < item.match.length; i++) {
      if (item.match[i] === file) return true;
      if (item.match[i] === '' && (file === '' || file === 'index.html' || file === 'index')) return true;
    }
    return false;
  }

  function chromeHtml() {
    var links = NAV.map(function (item) {
      var cls = 'bp-nav__link' + (isActive(item) ? ' is-active' : '');
      return '<a href="' + item.href + '" class="' + cls + '">' + item.label + '</a>';
    }).join('');

    return (
      '<header class="bp-chrome" id="bp-header" data-bp-shell="1">' +
        '<div class="bp-chrome__inner">' +
          '<a href="index.html" class="bp-logo">' +
            '<img src="' + LOGO + '" alt="" class="bp-logo__img" width="36" height="36">' +
            '<span class="bp-logo__text">Bari Plux</span>' +
          '</a>' +
          '<nav class="bp-nav" aria-label="Primary">' + links + '</nav>' +
          '<div class="bp-chrome__actions">' +
            '<button type="button" id="theme-toggle" class="bp-icon-btn" title="Toggle theme" aria-label="Toggle theme">' +
              '<span class="moon-icon">☾</span><span class="sun-icon">☀</span>' +
            '</button>' +
            '<div class="bp-account user-menu-container">' +
              '<button type="button" id="loginBtnHeader" class="bp-btn bp-btn--glass login-btn-header" title="Login">' +
                '<i class="fas fa-sign-in-alt" aria-hidden="true"></i>' +
                '<span>Login</span>' +
              '</button>' +
              '<div id="userDropdown" class="bp-menu user-dropdown" hidden>' +
                '<div class="bp-menu__head">' +
                  '<div id="userAvatar" class="bp-menu__avatar"></div>' +
                  '<div>' +
                    '<div id="userName" class="bp-menu__name">Guest</div>' +
                    '<div id="userEmail" class="bp-menu__email">Sign in to continue</div>' +
                  '</div>' +
                '</div>' +
                '<div class="bp-menu__divider"></div>' +
                '<button type="button" id="viewProfileBtn" class="bp-menu__item dropdown-btn"><i class="fas fa-user-circle"></i> Account Info</button>' +
                '<button type="button" id="goToLoginBtn" class="bp-menu__item dropdown-btn"><i class="fas fa-sign-in-alt"></i> Login Page</button>' +
                '<button type="button" id="logoutBtn" class="bp-menu__item bp-menu__item--danger dropdown-btn logout-btn"><i class="fas fa-sign-out-alt"></i> Logout</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</header>'
    );
  }

  function purgeLegacyChrome() {
    var kill = document.querySelectorAll(
      '#particles-js, .bg-animation, .floating-circle, .scroll-progress, .mobile-menu-overlay'
    );
    for (var i = 0; i < kill.length; i++) kill[i].remove();

    var oldHeaders = document.querySelectorAll('header.header, .header.glass');
    for (var h = 0; h < oldHeaders.length; h++) {
      if (!oldHeaders[h].classList.contains('bp-chrome')) oldHeaders[h].remove();
    }

    // Duplicate mobile menus that mirrored old header
    var mobileMenus = document.querySelectorAll('.mobile-menu, .mobile-nav');
    for (var m = 0; m < mobileMenus.length; m++) mobileMenus[m].remove();
  }

  function ensureAmbientHost() {
    if (document.getElementById('bp-aurora') || document.querySelector('.bp-ambient')) return;
    var host = document.createElement('div');
    host.id = 'bp-aurora';
    host.className = 'bp-aurora bp-ambient';
    host.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(host, document.body.firstChild);
  }

  function injectChrome() {
    if (document.getElementById('bp-header') && document.querySelector('.bp-chrome')) return;

    var wrap = document.createElement('div');
    wrap.innerHTML = chromeHtml();
    var header = wrap.firstChild;

    var aurora = document.getElementById('bp-aurora') || document.querySelector('.bp-ambient');
    if (aurora && aurora.parentNode) {
      aurora.parentNode.insertBefore(header, aurora.nextSibling);
    } else {
      document.body.insertBefore(header, document.body.firstChild);
    }
  }

  function wireTheme() {
    var btn = document.getElementById('theme-toggle');
    if (!btn || btn.dataset.bpWired) return;
    btn.dataset.bpWired = '1';

    function apply(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      document.body.setAttribute('data-theme', theme);
      try { localStorage.setItem('theme', theme); } catch (e) { /* ignore */ }
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme === 'light' ? '#eef0f6' : '#07070c');
    }

    var stored = null;
    try { stored = localStorage.getItem('theme'); } catch (e) { /* ignore */ }
    apply(stored || document.documentElement.getAttribute('data-theme') || 'dark');

    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') || 'dark';
      apply(cur === 'light' ? 'dark' : 'light');
    });
  }

  function wireScroll() {
    var chrome = document.getElementById('bp-header');
    if (!chrome) return;
    var onScroll = function () {
      chrome.classList.toggle('scrolled', window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function wireLoginFallback() {
    var go = document.getElementById('goToLoginBtn');
    if (go && !go.dataset.bpWired) {
      go.dataset.bpWired = '1';
      go.addEventListener('click', function () {
        location.href = 'login1.html';
      });
    }
    var login = document.getElementById('loginBtnHeader');
    if (login && !login.dataset.bpShellLogin) {
      login.dataset.bpShellLogin = '1';
      // If page has no auth handler, open login after short delay check
      login.addEventListener('click', function () {
        window.setTimeout(function () {
          if (document.getElementById('userDropdown') &&
              document.getElementById('userDropdown').hidden !== false) {
            /* leave to page scripts */
          }
        }, 0);
      });
    }
  }

  function polishSurfaces() {
    // Soft-tag common legacy cards so glass tokens apply via shell.css
    var sels = [
      '.download-card', '.video-card', '.pubg-card', '.blog-card',
      '.card', '.info-card', '.tool-card', '.event-card', '.weapon-card',
      '.section-title', '.content-card', '.news-card', '.update-card'
    ];
    for (var i = 0; i < sels.length; i++) {
      var nodes = document.querySelectorAll(sels[i]);
      for (var n = 0; n < nodes.length; n++) {
        if (!nodes[n].classList.contains('glass')) nodes[n].classList.add('glass');
      }
    }
  }

  function boot() {
    document.documentElement.classList.add('bp-shell');
    document.body.classList.add('bp-body');
    ensureAmbientHost();
    purgeLegacyChrome();
    injectChrome();
    wireTheme();
    wireScroll();
    wireLoginFallback();
    polishSurfaces();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
