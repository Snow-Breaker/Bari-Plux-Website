/**
 * Early boot (non-module): theme FOUC fix, mobile redirect, drag deterrent,
 * stylesheet preload activation (no inline onload — CSP script-src without unsafe-inline).
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
    // Desktop app opens /?desktop=1 — Firebase "/" rewrite serves index.html.
    // Send those sessions to the real login page (cleanUrls → /login1).
    var qs = new URLSearchParams(window.location.search);
    if (qs.get('desktop') === '1') {
      var path = window.location.pathname || '/';
      if (path === '/' || path === '/index.html' || path === '/index') {
        window.location.replace('/login1' + window.location.search);
        return;
      }
    }
  } catch (_) { /* ignore */ }

  try {
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) &&
        window.innerWidth <= 768 &&
        window.location.href.indexOf('mobile') === -1) {
      window.location.href = 'mobile';
    }
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
