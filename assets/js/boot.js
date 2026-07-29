/**
 * Early boot (non-module): theme FOUC fix, drag deterrent,
 * stylesheet preload activation (no inline onload — CSP script-src without unsafe-inline).
 * NOTE: Do NOT redirect phones to mobile.html — the main site is responsive with bp-drawer.
 */
(function () {
  'use strict';

  try {
    var stored = localStorage.getItem('theme');
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (systemDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'light' ? '#eef0f6' : '#030305');
    }
  } catch (_) { /* ignore */ }

  try {
    // Desktop app opens login.bariplux.com/?desktop=1 — root already serves the login page.
    // (Older builds redirected / → /login1; that must not run anymore or it loops.)
  } catch (_) { /* ignore */ }

  document.ondragstart = function () { return false; };

  function activatePreloads() {
    document.querySelectorAll('link[rel="preload"][as="style"]').forEach(function (link) {
      if (link.dataset.bpActivated) return;
      link.dataset.bpActivated = '1';
      link.addEventListener('load', function () {
        link.rel = 'stylesheet';
      });
      // If already cached/complete
      if (link.sheet) link.rel = 'stylesheet';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activatePreloads);
  } else {
    activatePreloads();
  }
})();
