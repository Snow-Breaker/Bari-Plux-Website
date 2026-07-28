/**
 * Bari Plux shared site shell — Liquid Glass chrome on every page.
 * Requires: bariplux.css + site.css (+ optional shell / widgets / site-search)
 */
(function () {
  'use strict';

  var LOGO =
    'https://yt3.googleusercontent.com/RPW5Z_kcoEu0ES_VpL4-7ZqI4eI1OQfuVL-DbuCYWmRhXono9hA5NOCSGGMDLzJqNcHUlhOg=s160-c-k-c0x00ffffff-no-rj';

  /* Extensionless paths for clean URLs */
  var NAV = [
    { href: '/', label: 'Home', match: ['', 'index.html', 'index'] },
    { href: '/#downloads', label: 'Downloads' },
    { href: '/#videos', label: 'Videos' },
    { href: '/mapspubg', label: 'Maps', match: ['mapspubg.html', 'mapspubg'] },
    { href: '/weaponorg', label: 'Weapons', match: ['weaponorg.html', 'weaponorg', 'org.html'] },
    { href: '/news', label: 'News', match: ['news.html', 'news'] },
    { href: '/updates', label: 'Updates', match: ['updates.html', 'updates'] },
    { href: '/tool', label: 'Tool', match: ['tool.html', 'tool'] },
    { href: '/optimizationtools', label: 'Tools', match: ['optimizationtools.html', 'optimizationtools'] },
    { href: '/Pro', label: 'Pro', match: ['pro.html', 'pro'] }
  ];

  function pageFile() {
    var path = (location.pathname || '').replace(/\\/g, '/');
    var seg = path.split('/').filter(Boolean).pop() || '';
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

  function readUser() {
    try {
      var raw = localStorage.getItem('bariplux_user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function chromeHtml() {
    var links = NAV.map(function (item) {
      var cls = 'bp-nav__link' + (isActive(item) ? ' is-active' : '');
      return '<a href="' + item.href + '" class="' + cls + '">' + item.label + '</a>';
    }).join('');

    return (
      '<header class="bp-chrome" id="bp-header" data-bp-shell="1">' +
        '<div class="bp-chrome__inner">' +
          '<a href="/" class="bp-logo">' +
            '<img src="' + LOGO + '" alt="" class="bp-logo__img" width="36" height="36">' +
            '<span class="bp-logo__text">Bari Plux</span>' +
          '</a>' +
          '<nav class="bp-nav" aria-label="Primary">' + links + '</nav>' +
          '<div class="bp-chrome__actions">' +
            '<button type="button" id="bp-search-open" class="bp-icon-btn" title="Search (Ctrl+K)" aria-label="Search">' +
              '<i class="fas fa-search" aria-hidden="true"></i>' +
            '</button>' +
            '<button type="button" id="theme-toggle" class="bp-icon-btn" title="Toggle theme" aria-label="Toggle theme">' +
              '<i class="fas fa-moon moon-icon" aria-hidden="true"></i>' +
              '<i class="fas fa-sun sun-icon" aria-hidden="true"></i>' +
            '</button>' +
            '<div class="bp-account user-menu-container">' +
              '<button type="button" id="loginBtnHeader" class="bp-btn bp-btn--glass login-btn-header" title="Login">' +
                '<i class="fas fa-sign-in-alt" aria-hidden="true"></i>' +
                '<span>Login</span>' +
              '</button>' +
              '<div id="userDropdown" class="bp-menu user-dropdown" hidden>' +
                '<div class="bp-menu__head">' +
                  '<div id="userAvatar" class="bp-menu__avatar"></div>' +
                  '<div class="bp-menu__meta">' +
                    '<div id="userName" class="bp-menu__name">Guest</div>' +
                    '<div id="userEmail" class="bp-menu__email">Sign in to continue</div>' +
                    '<div id="userMethodBadge" class="bp-menu__badge" hidden></div>' +
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

  function ensureStyles() {
    if (document.querySelector('link[data-bp-search-css]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'assets/css/site-search.css?v=20260728ai';
    link.setAttribute('data-bp-search-css', '1');
    document.head.appendChild(link);
  }

  function ensureSearchScript() {
    if (window.BPSearch) {
      window.BPSearch.wire();
      return;
    }
    if (document.querySelector('script[data-bp-search-js]')) return;
    var s = document.createElement('script');
    s.src = 'assets/js/site-search.js?v=20260728ai';
    s.defer = true;
    s.setAttribute('data-bp-search-js', '1');
    document.head.appendChild(s);
  }

  function purgeLegacyChrome() {
    var legacy = document.querySelectorAll('body > .header.glass, body > header.header:not(.bp-chrome)');
    for (var i = 0; i < legacy.length; i++) legacy[i].remove();
    var kill = document.querySelectorAll('#particles-js, .bg-animation, .floating-circle, .scroll-progress');
    for (var k = 0; k < kill.length; k++) kill[k].remove();
    var mobileMenus = document.querySelectorAll('.mobile-menu, .mobile-nav, .mobile-menu-overlay');
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

  function resolveUserName(user) {
    if (!user) return 'User';
    return user.name || user.displayName || user.username ||
      (user.email ? String(user.email).split('@')[0] : 'User');
  }

  function resolvePhotoUrl(user) {
    if (!user) return '';
    var photo = user.photoURL || user.photoUrl || user.avatar || '';
    if (!photo) return '';
    photo = String(photo);
    if (/^https?:\/\//i.test(photo)) return photo;
    var discordId = user.discordId || '';
    if (!discordId) {
      try {
        var d = JSON.parse(localStorage.getItem('discord_user') || 'null');
        if (d && d.id) discordId = d.id;
        if ((!photo || photo.indexOf('/') === -1) && d && d.avatar) photo = d.avatar;
      } catch (e) { /* ignore */ }
    }
    if (discordId && photo.indexOf('/') === -1 && photo.length >= 16) {
      return 'https://cdn.discordapp.com/avatars/' + discordId + '/' + photo + '.png?size=128';
    }
    return photo;
  }

  function methodLabel(user) {
    var m = String((user && (user.loginMethod || user.provider)) || '').toLowerCase();
    if (m.indexOf('google') >= 0) return 'Google';
    if (m.indexOf('github') >= 0) return 'GitHub';
    if (m.indexOf('discord') >= 0) return 'Discord';
    if (m.indexOf('email') >= 0 || m.indexOf('password') >= 0) return 'Email';
    return m ? 'Account' : '';
  }

  function updateLoginUi() {
    var user = readUser();
    var btn = document.getElementById('loginBtnHeader');
    var name = document.getElementById('userName');
    var email = document.getElementById('userEmail');
    var avatar = document.getElementById('userAvatar');
    var badge = document.getElementById('userMethodBadge');
    if (!btn) return;
    if (user) {
      var userName = resolveUserName(user);
      var photo = resolvePhotoUrl(user);
      var shortName = userName.length > 14 ? userName.slice(0, 14) + '…' : userName;
      var initial = userName.charAt(0).toUpperCase();
      if (photo) {
        btn.innerHTML =
          '<span class="bp-user-chip">' +
            '<img class="bp-user-chip__avatar" src="' + photo + '" alt="" referrerpolicy="no-referrer">' +
            '<span>' + shortName + '</span>' +
          '</span>';
      } else {
        btn.innerHTML =
          '<span class="bp-user-chip">' +
            '<span class="bp-user-chip__initial">' + initial + '</span>' +
            '<span>' + shortName + '</span>' +
          '</span>';
      }
      if (name) name.textContent = userName;
      if (email) email.textContent = user.email || '';
      if (badge) {
        var label = methodLabel(user);
        if (label) {
          badge.textContent = label;
          badge.hidden = false;
          badge.removeAttribute('hidden');
        } else {
          badge.hidden = true;
          badge.setAttribute('hidden', '');
        }
      }
      if (avatar) {
        avatar.style.backgroundImage = '';
        if (photo) {
          avatar.innerHTML = '<img src="' + photo + '" alt="" referrerpolicy="no-referrer">';
        } else {
          avatar.innerHTML = initial;
        }
      }
    } else {
      btn.innerHTML = '<i class="fas fa-sign-in-alt" aria-hidden="true"></i><span>Login</span>';
      if (name) name.textContent = 'Guest';
      if (email) email.textContent = 'Sign in to continue';
      if (badge) {
        badge.hidden = true;
        badge.setAttribute('hidden', '');
        badge.textContent = '';
      }
      if (avatar) {
        avatar.style.backgroundImage = '';
        avatar.innerHTML = '<i class="fas fa-user" aria-hidden="true"></i>';
      }
    }
  }

  function wireLogin() {
    var dropdown = document.getElementById('userDropdown');
    var login = document.getElementById('loginBtnHeader');
    var go = document.getElementById('goToLoginBtn');
    var logout = document.getElementById('logoutBtn');
    var profile = document.getElementById('viewProfileBtn');

    updateLoginUi();

    if (login && !login.dataset.bpShellLogin) {
      login.dataset.bpShellLogin = '1';
      login.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var user = readUser();
        if (!user) {
          location.href = '/login1';
          return;
        }
        if (!dropdown) return;
        if (dropdown.hasAttribute('hidden')) dropdown.removeAttribute('hidden');
        else dropdown.setAttribute('hidden', '');
      });
    }

    if (go && !go.dataset.bpWired) {
      go.dataset.bpWired = '1';
      go.addEventListener('click', function () {
        location.href = '/login1';
      });
    }

    if (logout && !logout.dataset.bpWired) {
      logout.dataset.bpWired = '1';
      logout.addEventListener('click', function () {
        try { localStorage.removeItem('bariplux_user'); } catch (e) { /* ignore */ }
        if (dropdown) dropdown.setAttribute('hidden', '');
        updateLoginUi();
        location.href = '/';
      });
    }

    if (profile && !profile.dataset.bpWired) {
      profile.dataset.bpWired = '1';
      profile.addEventListener('click', function () {
        location.href = '/login1';
      });
    }

    document.addEventListener('click', function (e) {
      var container = document.querySelector('.bp-account');
      if (dropdown && container && !container.contains(e.target)) {
        dropdown.setAttribute('hidden', '');
      }
    });
  }

  function polishSurfaces() {
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

  function stripHtmlLinks() {
    var anchors = document.querySelectorAll('a[href$=".html"], a[href*=".html#"]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href');
      if (!href || href.indexOf('http') === 0) continue;
      a.setAttribute('href', href.replace(/\.html(?=#|$)/i, ''));
    }
  }

  function boot() {
    document.documentElement.classList.add('bp-shell');
    document.body.classList.add('bp-body');
    ensureStyles();
    ensureAmbientHost();
    purgeLegacyChrome();
    injectChrome();
    wireTheme();
    wireScroll();
    wireLogin();
    polishSurfaces();
    stripHtmlLinks();
    ensureSearchScript();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
