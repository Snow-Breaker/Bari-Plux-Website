/**
 * Bari Plux — client-side deterrents (not real DRM).
 * Ctrl/Cmd+S downloads an empty HTML file (oathnet-style).
 */
(function () {
  'use strict';

  const EMPTY_HTML =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title></title></head><body></body></html>\n';

  function downloadEmpty() {
    try {
      const blob = new Blob([EMPTY_HTML], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'index.html';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } catch (_) { /* ignore */ }
  }

  function isEditable(el) {
    if (!el || el === document.body) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  document.documentElement.classList.add('bp-protect');

  document.addEventListener('contextmenu', function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
  });

  document.addEventListener('dragstart', function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
  });

  document.addEventListener('keydown', function (e) {
    const key = (e.key || '').toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    if (mod && key === 's') {
      e.preventDefault();
      e.stopPropagation();
      downloadEmpty();
      return;
    }

    if (key === 'f12') {
      e.preventDefault();
      return;
    }

    if (mod && (key === 'u' || key === 'p')) {
      e.preventDefault();
      return;
    }

    if (mod && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) {
      e.preventDefault();
    }
  }, true);

  document.addEventListener('copy', function (e) {
    if (isEditable(e.target)) return;
    try {
      e.clipboardData.setData('text/plain', '');
      e.preventDefault();
    } catch (_) { /* ignore */ }
  });
})();
