/**
 * Bari Plux Signal Ambient — synced to desktop AmbientSignalField
 * (Theme.ObsidianBlack + Controls/AmbientSignalField).
 *
 * Layers (same order as WPF):
 *   void #030305 → depth wash → aurora → mid orbs + glass streak
 *   → instrument rings/brackets → constellation → scan → vignette
 *
 * Motion: CSS Storyboard-style drifts + one canvas for constellation/scan/radar.
 * Respects prefers-reduced-motion. Never puts transform on body/html.
 */
(function () {
  'use strict';

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isLight() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function bootReveals() {
    var els = document.querySelectorAll('.bp-reveal');
    if (!els.length) return;
    if (reduced() || !('IntersectionObserver' in window)) {
      for (var i = 0; i < els.length; i++) els[i].classList.add('is-in');
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      for (var e = 0; e < entries.length; e++) {
        if (entries[e].isIntersecting) {
          entries[e].target.classList.add('is-in');
          io.unobserve(entries[e].target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    for (var j = 0; j < els.length; j++) io.observe(els[j]);
  }

  function boot() {
    var host = document.getElementById('bp-aurora')
      || document.getElementById('bp-ambient')
      || document.querySelector('[data-bp-ambient]');
    if (!host) {
      host = document.createElement('div');
      host.id = 'bp-aurora';
      host.className = 'bp-aurora bp-ambient';
      host.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(host, document.body.firstChild);
    }
    host.id = host.id || 'bp-aurora';
    host.classList.add('bp-aurora', 'bp-ambient', 'bp-ambient--app');
    host.setAttribute('aria-hidden', 'true');

    host.innerHTML =
      '<div class="bp-ambient__void"></div>' +
      '<div class="bp-ambient__depth"></div>' +
      '<div class="bp-ambient__aurora" aria-hidden="true">' +
        '<span class="bp-ambient__blob bp-ambient__blob--a"></span>' +
        '<span class="bp-ambient__blob bp-ambient__blob--b"></span>' +
        '<span class="bp-ambient__blob bp-ambient__blob--c"></span>' +
      '</div>' +
      '<div class="bp-ambient__orbs" aria-hidden="true">' +
        '<span class="bp-ambient__orb bp-ambient__orb--primary"></span>' +
        '<span class="bp-ambient__orb bp-ambient__orb--secondary"></span>' +
        '<span class="bp-ambient__orb bp-ambient__orb--core"></span>' +
        '<span class="bp-ambient__streak"></span>' +
      '</div>' +
      '<div class="bp-ambient__instrument" aria-hidden="true">' +
        '<span class="bp-ambient__ring bp-ambient__ring--outer"></span>' +
        '<span class="bp-ambient__ring bp-ambient__ring--mid"></span>' +
        '<span class="bp-ambient__ring bp-ambient__ring--inner"></span>' +
      '</div>' +
      '<div class="bp-ambient__vignette"></div>' +
      '<div class="bp-ambient__grain"></div>';

    bootReveals();

    if (reduced()) return;

    var canvas = document.createElement('canvas');
    canvas.className = 'bp-ambient__constellation';
    canvas.setAttribute('aria-hidden', 'true');
    // Insert before vignette so vignette sits on top
    var vignette = host.querySelector('.bp-ambient__vignette');
    host.insertBefore(canvas, vignette);

    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, raf = 0, t0 = performance.now();

    // Exact seed list from AmbientSignalField.xaml.cs
    var seeds = [
      [0.14, 0.20, 3.4], [0.26, 0.48, 2.6], [0.18, 0.74, 3.0],
      [0.40, 0.16, 2.4], [0.46, 0.42, 3.6], [0.38, 0.78, 2.5],
      [0.58, 0.28, 2.8], [0.64, 0.58, 3.2], [0.72, 0.18, 2.6],
      [0.82, 0.40, 3.8], [0.78, 0.70, 2.7], [0.88, 0.82, 2.4],
      [0.52, 0.88, 2.2], [0.10, 0.55, 2.5]
    ];
    // Exact link pairs from desktop
    var links = [
      [0, 1], [1, 2], [0, 3], [3, 4], [4, 5], [1, 4],
      [3, 6], [6, 7], [6, 8], [8, 9], [9, 10], [7, 10],
      [9, 11], [5, 12], [2, 13], [4, 6]
    ];

    if (window.matchMedia && window.matchMedia('(max-width: 719px)').matches) {
      seeds = seeds.slice(0, 8);
      links = [[0, 1], [1, 2], [0, 3], [3, 4], [4, 5], [1, 4], [3, 6], [6, 7]];
    }

    function resize() {
      w = Math.max(1, window.innerWidth);
      h = Math.max(1, window.innerHeight);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame(now) {
      var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);

      // Constellation drift + breath (mirrors ConstellationDrift / ConstellationBreath)
      var dx = Math.sin(t * (Math.PI * 2) / 28) * 16;
      var dy = Math.cos(t * (Math.PI * 2) / 22) * 10;
      var breath = 0.985 + (Math.sin(t * (Math.PI * 2) / 16) * 0.5 + 0.5) * 0.035;
      var cx0 = w * 0.5;
      var cy0 = h * 0.5;

      // Soft fade nodes/links near top-left logo chrome
      function chromeFade(nx, ny) {
        if (nx > 0.28 || ny > 0.16) return 1;
        var fx = nx / 0.28;
        var fy = ny / 0.16;
        return Math.max(0.15, Math.min(fx, fy));
      }
      var light = isLight();
      // Desktop: accent #818CF8 @ ~0.12 links; soft white nodes every 3rd
      var linkBase = light ? 79 : 129;
      var linkG = light ? 70 : 140;
      var linkB = light ? 229 : 248;
      var linkOp = light ? 0.16 : 0.22;

      ctx.save();
      ctx.translate(cx0 + dx, cy0 + dy);
      ctx.scale(breath, breath);
      ctx.translate(-cx0, -cy0);

      // Links
      ctx.lineWidth = 1;
      for (var i = 0; i < links.length; i++) {
        var a = seeds[links[i][0]];
        var b = seeds[links[i][1]];
        var breathL = 0.06 + (0.12 * (0.5 + 0.5 * Math.sin(t * 0.45 + i * 0.4)));
        ctx.beginPath();
        ctx.moveTo(a[0] * w, a[1] * h);
        ctx.lineTo(b[0] * w, b[1] * h);
        var fade = Math.min(chromeFade(a[0], a[1]), chromeFade(b[0], b[1]));
        ctx.strokeStyle = 'rgba(' + linkBase + ',' + linkG + ',' + linkB + ',' + (linkOp * (breathL / 0.12) * fade) + ')';
        ctx.stroke();
      }

      // Nodes — soft white every 3rd, accent otherwise (desktop Fill choice)
      for (var n = 0; n < seeds.length; n++) {
        var s = seeds[n];
        var x = s[0] * w;
        var y = s[1] * h;
        var r = s[2] * (w < 720 ? 0.85 : 1);
        var baseOp = 0.42 + (n % 5) * 0.08;
        var twinkle = baseOp + (0.5 + 0.5 * Math.sin(t * (1 / (3.2 + n * 0.37)) * Math.PI * 2 + n)) * 0.45;
        var fade = chromeFade(s[0], s[1]);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (n % 3 === 0) {
          ctx.fillStyle = light
            ? 'rgba(15,20,40,' + (twinkle * 0.55 * fade) + ')'
            : 'rgba(255,255,255,' + (twinkle * 0.55 * fade) + ')';
        } else {
          ctx.fillStyle = 'rgba(' + linkBase + ',' + linkG + ',' + linkB + ',' + (twinkle * fade) + ')';
        }
        ctx.fill();
      }

      // Radar ping near seed[9] (desktop anchor)
      var pingPhase = (t % 7.5) / 7.5;
      if (pingPhase < 0.42 && seeds.length > 9) {
        var pr = 18 + pingPhase * 130;
        var pa = (1 - pingPhase / 0.42) * 0.28;
        ctx.beginPath();
        ctx.arc(seeds[9][0] * w, seeds[9][1] * h, pr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(' + linkBase + ',' + linkG + ',' + linkB + ',' + pa + ')';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }

      ctx.restore();

      // Soft scan sweep — 22s period like SweepBeam (white/indigo wash, max ~12%)
      var scanPeriod = 22;
      var scanY = ((t % scanPeriod) / scanPeriod) * (h + 120) - 60;
      var sg = ctx.createLinearGradient(0, scanY - 32, 0, scanY + 32);
      if (light) {
        sg.addColorStop(0, 'rgba(79,70,229,0)');
        sg.addColorStop(0.5, 'rgba(79,70,229,0.08)');
        sg.addColorStop(1, 'rgba(79,70,229,0)');
      } else {
        sg.addColorStop(0, 'rgba(255,255,255,0)');
        sg.addColorStop(0.5, 'rgba(165,180,252,0.16)');
        sg.addColorStop(1, 'rgba(255,255,255,0)');
      }
      ctx.fillStyle = sg;
      // Horizontal feather like OpacityMask on desktop
      ctx.save();
      var mask = ctx.createLinearGradient(0, 0, w, 0);
      mask.addColorStop(0, 'rgba(0,0,0,0)');
      mask.addColorStop(0.4, 'rgba(0,0,0,0.55)');
      mask.addColorStop(0.5, 'rgba(0,0,0,1)');
      mask.addColorStop(0.6, 'rgba(0,0,0,0.55)');
      mask.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, scanY - 32, w, 64);
      ctx.restore();

      // Corner brackets (instrument chrome)
      ctx.strokeStyle = light ? 'rgba(79,70,229,0.12)' : 'rgba(129,140,248,0.28)';
      ctx.lineWidth = 1.3;
      var m = 28, len = 22;
      ctx.beginPath();
      ctx.moveTo(m, m + len); ctx.lineTo(m, m); ctx.lineTo(m + len, m);
      ctx.moveTo(w - m, m + len); ctx.lineTo(w - m, m); ctx.lineTo(w - m - len, m);
      ctx.moveTo(m, h - m - len); ctx.lineTo(m, h - m); ctx.lineTo(m + len, h - m);
      ctx.moveTo(w - m, h - m - len); ctx.lineTo(w - m, h - m); ctx.lineTo(w - m - len, h - m);
      ctx.stroke();

      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) cancelAnimationFrame(raf);
      else {
        t0 = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    // Re-tint when theme toggles
    var mo = new MutationObserver(function () { /* next frame reads isLight() */ });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    raf = requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
