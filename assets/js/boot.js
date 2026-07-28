/**
 * Early boot (non-module): mobile redirect + drag deterrent.
 * Loaded without defer so redirect can run ASAP.
 */
(function () {
  'use strict';
  try {
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) &&
        window.innerWidth <= 768 &&
        window.location.href.indexOf('mobile') === -1) {
      window.location.href = 'mobile';
    }
  } catch (_) { /* ignore */ }

  document.ondragstart = function () { return false; };
})();
