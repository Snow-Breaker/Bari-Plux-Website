/**
 * Discord-style site search overlay — shared by index + site-shell pages.
 */
(function () {
  'use strict';

  var CATALOG = [
    { title: 'Home', type: 'Page', href: '/', keys: 'home bari plux about profile' },
    { title: 'Bari Plux Tool', type: 'Page', href: '/tool', keys: 'tool desktop app download fps gameloop' },
    { title: 'Tool Terms & Disclaimer', type: 'Page', href: '/tool-terms', keys: 'terms disclaimer legal tool license' },
    { title: 'Pro', type: 'Page', href: '/Pro', keys: 'pro unlock stripe payment' },
    { title: 'Downloads', type: 'Section', href: '/#downloads', keys: 'download gameloop pubg windows' },
    { title: 'Optimization Tools', type: 'Page', href: '/optimizationtools', keys: 'graphics pack fps keymapping park control' },
    { title: 'PUBG Mobile Download', type: 'Page', href: '/pubgdown', keys: 'pubg apk download' },
    { title: 'GameLoop Download', type: 'Page', href: '/gameloopdown', keys: 'gameloop emulator download' },
    { title: 'Windows X-Lite', type: 'Page', href: '/windowsxlitedown', keys: 'windows xlite optimize' },
    { title: 'Maps', type: 'Page', href: '/mapspubg', keys: 'maps erangel miramar' },
    { title: 'Weapons', type: 'Page', href: '/weaponorg', keys: 'weapon tier list' },
    { title: 'News', type: 'Page', href: '/news', keys: 'news update' },
    { title: 'Updates', type: 'Page', href: '/updates', keys: 'updates patch notes' },
    { title: 'Plux Gaming Times', type: 'Page', href: '/Plux Gaming Times', keys: 'plux times gameloop news' },
    { title: 'Legal Information', type: 'Page', href: '/Legal Information', keys: 'privacy terms cookie disclaimer' },
    { title: 'Videos', type: 'Section', href: '/#videos', keys: 'youtube video guide' },
    { title: 'Blog', type: 'Section', href: '/#blog', keys: 'blog posts article' },
    { title: 'Support / Live', type: 'Section', href: '/#live', keys: 'support hours telegram events' },
    { title: 'Contact', type: 'Section', href: '/#contact', keys: 'contact email telegram' },
    { title: 'Login', type: 'Page', href: 'https://login.bariplux.com/', keys: 'login sign in account' }
  ];

  function ensureModal() {
    if (document.getElementById('bp-search-modal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'bp-search-modal';
    wrap.className = 'bp-search-modal';
    wrap.setAttribute('hidden', '');
    wrap.innerHTML =
      '<div class="bp-search-modal__backdrop" data-close="1"></div>' +
      '<div class="bp-search-modal__panel glass" role="dialog" aria-modal="true" aria-label="Search Bari Plux">' +
        '<div class="bp-search-modal__bar">' +
          '<i class="fas fa-search" aria-hidden="true"></i>' +
          '<input type="search" id="bp-search-modal-input" class="bp-search-modal__input" placeholder="Search pages, tools, guides…" autocomplete="off" />' +
          '<kbd class="bp-search-modal__esc">Esc</kbd>' +
        '</div>' +
        '<div class="bp-search-modal__hint">Jump to a page or section</div>' +
        '<div class="bp-search-modal__results" id="bp-search-modal-results" role="listbox"></div>' +
      '</div>';
    document.body.appendChild(wrap);
  }

  function openModal() {
    ensureModal();
    var modal = document.getElementById('bp-search-modal');
    var input = document.getElementById('bp-search-modal-input');
    modal.removeAttribute('hidden');
    document.body.classList.add('bp-search-open');
    render('');
    setTimeout(function () { if (input) input.focus(); }, 30);
  }

  function closeModal() {
    var modal = document.getElementById('bp-search-modal');
    if (!modal) return;
    modal.setAttribute('hidden', '');
    document.body.classList.remove('bp-search-open');
    var input = document.getElementById('bp-search-modal-input');
    if (input) input.value = '';
  }

  function score(item, q) {
    if (!q) return 1;
    var hay = (item.title + ' ' + item.keys + ' ' + item.type).toLowerCase();
    if (hay.indexOf(q) === -1) return 0;
    if (item.title.toLowerCase().indexOf(q) === 0) return 3;
    if (item.title.toLowerCase().indexOf(q) !== -1) return 2;
    return 1;
  }

  function navigate(href) {
    closeModal();
    if (!href) return;
    if (href.charAt(0) === '/' || href.indexOf('http') === 0) {
      location.href = href;
      return;
    }
    location.href = href;
  }

  function render(q) {
    var box = document.getElementById('bp-search-modal-results');
    if (!box) return;
    q = (q || '').trim().toLowerCase();
    var hits = CATALOG.map(function (item) {
      return { item: item, s: score(item, q) };
    }).filter(function (x) { return q.length < 1 ? true : x.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 10);

    if (!hits.length) {
      box.innerHTML =
        '<div class="bp-search-modal__empty">' +
          '<p>No matches for “' + q.replace(/[<>]/g, '') + '”.</p>' +
          '<a class="bp-btn bp-btn--glass" href="/404">That page may not exist</a>' +
        '</div>';
      return;
    }

    box.innerHTML = hits.map(function (h) {
      var it = h.item;
      return (
        '<button type="button" class="bp-search-modal__row" data-href="' + it.href + '" role="option">' +
          '<span class="bp-search-modal__row-title">' + it.title + '</span>' +
          '<span class="bp-search-modal__row-type">' + it.type + '</span>' +
        '</button>'
      );
    }).join('');
  }

  function wire() {
    ensureModal();
    var openers = document.querySelectorAll('#bp-search-open, [data-bp-search-open]');
    for (var i = 0; i < openers.length; i++) {
      if (openers[i].dataset.bpSearchWired) continue;
      openers[i].dataset.bpSearchWired = '1';
      openers[i].addEventListener('click', function (e) {
        e.preventDefault();
        openModal();
      });
    }

    var modal = document.getElementById('bp-search-modal');
    var input = document.getElementById('bp-search-modal-input');
    var results = document.getElementById('bp-search-modal-results');

    if (modal && !modal.dataset.bpWired) {
      modal.dataset.bpWired = '1';
      modal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-close')) closeModal();
      });
    }
    if (input && !input.dataset.bpWired) {
      input.dataset.bpWired = '1';
      input.addEventListener('input', function () { render(input.value); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeModal();
        if (e.key === 'Enter') {
          var first = results && results.querySelector('[data-href]');
          if (first) navigate(first.getAttribute('data-href'));
        }
      });
    }
    if (results && !results.dataset.bpWired) {
      results.dataset.bpWired = '1';
      results.addEventListener('click', function (e) {
        var row = e.target.closest('[data-href]');
        if (row) navigate(row.getAttribute('data-href'));
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
      var mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key || '').toLowerCase() === 'k') {
        e.preventDefault();
        openModal();
      }
    });
  }

  window.BPSearch = { open: openModal, close: closeModal, wire: wire };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
