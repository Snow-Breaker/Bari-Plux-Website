/**
 * Bari Plux Signal Ambient — mirrors desktop AmbientSignalField
 * Quiet indigo aurora + sparse constellation + soft scan + vignette.
 * Motion: transform/opacity friendly; respects prefers-reduced-motion.
 */
(function () {
  'use strict';

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function boot() {
    var host = document.getElementById('bp-aurora') || document.getElementById('bp-ambient');
    if (!host) {
      host = document.createElement('div');
      host.id = 'bp-aurora';
      host.className = 'bp-aurora bp-ambient';
      host.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(host, document.body.firstChild);
    }
    host.classList.add('bp-aurora', 'bp-ambient');

    host.innerHTML =
      '<div class="bp-ambient__wash"></div>' +
      '<div class="bp-ambient__orb bp-ambient__orb--a"></div>' +
      '<div class="bp-ambient__orb bp-ambient__orb--b"></div>' +
      '<div class="bp-ambient__orb bp-ambient__orb--c"></div>' +
      '<div class="bp-ambient__vignette"></div>' +
      '<div class="bp-ambient__grain"></div>';

    if (reduced()) return;

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, raf = 0, t0 = performance.now();

    // Curated constellation seeds (mirror desktop AmbientSignalField)
    var seeds = [
      [0.14, 0.20, 3.4], [0.26, 0.48, 2.6], [0.18, 0.74, 3.0],
      [0.40, 0.16, 2.4], [0.46, 0.42, 3.6], [0.38, 0.78, 2.5],
      [0.58, 0.28, 2.8], [0.64, 0.58, 3.2], [0.72, 0.18, 2.6],
      [0.82, 0.40, 3.8], [0.78, 0.70, 2.7], [0.88, 0.82, 2.4],
      [0.52, 0.88, 2.2], [0.10, 0.55, 2.5]
    ];
    var links = [
      [0, 1], [1, 2], [0, 4], [3, 4], [4, 5], [4, 6],
      [6, 7], [6, 8], [7, 9], [9, 10], [10, 11], [5, 12], [1, 13]
    ];

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

      // Whole constellation drifts as one unit (desktop behavior)
      var dx = Math.sin(t * 0.07) * 10;
      var dy = Math.cos(t * 0.055) * 8;

      // Links
      ctx.lineWidth = 1;
      for (var i = 0; i < links.length; i++) {
        var a = seeds[links[i][0]];
        var b = seeds[links[i][1]];
        var ax = a[0] * w + dx;
        var ay = a[1] * h + dy;
        var bx = b[0] * w + dx;
        var by = b[1] * h + dy;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = 'rgba(129,140,248,0.11)';
        ctx.stroke();
      }

      // Nodes
      for (var n = 0; n < seeds.length; n++) {
        var s = seeds[n];
        var x = s[0] * w + dx;
        var y = s[1] * h + dy;
        var r = s[2] * (w < 720 ? 0.85 : 1);
        var pulse = 0.55 + Math.sin(t * 0.9 + n) * 0.15;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (n % 3 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,' + (0.18 * pulse) + ')';
        } else {
          ctx.fillStyle = 'rgba(129,140,248,' + (0.35 * pulse) + ')';
        }
        ctx.fill();
      }

      // Soft scan sweep (max ~12% opacity like desktop)
      var scanY = ((t * 28) % (h + 120)) - 60;
      var sg = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40);
      sg.addColorStop(0, 'rgba(129,140,248,0)');
      sg.addColorStop(0.5, 'rgba(129,140,248,0.10)');
      sg.addColorStop(1, 'rgba(129,140,248,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, scanY - 40, w, 80);

      // Occasional radar ping (~every 7s)
      var pingPhase = (t % 7) / 7;
      if (pingPhase < 0.45) {
        var pr = 20 + pingPhase * 140;
        var pa = (1 - pingPhase / 0.45) * 0.14;
        var cx = w * 0.72 + dx * 0.3;
        var cy = h * 0.28 + dy * 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, pr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(129,140,248,' + pa + ')';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Thin instrument corner brackets (very faint)
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      var m = 28;
      var len = 18;
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
    raf = requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
