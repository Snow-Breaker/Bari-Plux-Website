/**
 * Bari Plux Liquid Field — premium ambient for glass to frost against.
 * Soft luminous plasma orbs + light filaments (compositor-friendly canvas).
 * Synced with Obsidian accent #818CF8 / #A5B4FC.
 */
(function () {
  'use strict';

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function ensureHost() {
    var host =
      document.querySelector('[data-bp-ambient]') ||
      document.querySelector('.lg-ambient') ||
      document.querySelector('.bp-ambient') ||
      document.querySelector('.sf-ambient');

    if (!host) {
      host = document.createElement('div');
      host.className = 'lg-ambient bp-ambient';
      host.setAttribute('data-bp-ambient', '');
      host.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(host, document.body.firstChild);
    }

    host.classList.add('lg-ambient', 'bp-ambient');
    host.innerHTML =
      '<div class="lg-ambient__base"></div>' +
      '<div class="lg-ambient__orb lg-ambient__orb--a"></div>' +
      '<div class="lg-ambient__orb lg-ambient__orb--b"></div>' +
      '<div class="lg-ambient__orb lg-ambient__orb--c"></div>' +
      '<div class="lg-ambient__caustic"></div>' +
      '<div class="lg-ambient__noise"></div>';
    return host;
  }

  function bootCanvas(host) {
    if (reduced()) return;

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, raf = 0, t0 = performance.now();
    var blobs = [];
    var filaments = [];
    var mx = 0.5, my = 0.35;

    function resize() {
      w = Math.max(1, window.innerWidth);
      h = Math.max(1, window.innerHeight);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      var n = w < 720 ? 5 : 8;
      blobs = [];
      for (var i = 0; i < n; i++) {
        blobs.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: (w < 720 ? 120 : 160) + Math.random() * 220,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.18,
          phase: Math.random() * Math.PI * 2,
          tone: i % 3 === 0 ? [129, 140, 248] : i % 3 === 1 ? [165, 180, 252] : [99, 102, 241],
          a: 0.07 + Math.random() * 0.06
        });
      }
      filaments = [];
      var fCount = w < 720 ? 4 : 7;
      for (var j = 0; j < fCount; j++) {
        filaments.push({
          y: (0.15 + Math.random() * 0.7) * h,
          amp: 18 + Math.random() * 40,
          len: 0.25 + Math.random() * 0.45,
          speed: 0.12 + Math.random() * 0.2,
          phase: Math.random() * Math.PI * 2,
          alpha: 0.04 + Math.random() * 0.05
        });
      }
    }

    function frame(now) {
      var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      var px = (mx - 0.5) * 40;
      var py = (my - 0.5) * 30;

      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        b.x += b.vx + Math.sin(t * 0.35 + b.phase) * 0.15;
        b.y += b.vy + Math.cos(t * 0.28 + b.phase) * 0.12;
        if (b.x < -b.r) b.x = w + b.r;
        if (b.x > w + b.r) b.x = -b.r;
        if (b.y < -b.r) b.y = h + b.r;
        if (b.y > h + b.r) b.y = -b.r;

        var pulse = 1 + Math.sin(t * 0.7 + b.phase) * 0.08;
        var rr = b.r * pulse;
        var gx = b.x + px * (0.3 + i * 0.05);
        var gy = b.y + py * (0.3 + i * 0.05);
        var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rr);
        var c = b.tone;
        g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + b.a + ')');
        g.addColorStop(0.45, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + b.a * 0.35 + ')');
        g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(gx, gy, rr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Light filaments — thin luminous curves
      ctx.globalCompositeOperation = 'screen';
      for (var f = 0; f < filaments.length; f++) {
        var fl = filaments[f];
        var startX = ((t * fl.speed * 60 + fl.phase * 40) % (w * 1.4)) - w * 0.2;
        ctx.beginPath();
        var steps = 48;
        for (var s = 0; s <= steps; s++) {
          var u = s / steps;
          var x = startX + u * w * fl.len;
          var y = fl.y + Math.sin(u * Math.PI * 2 + t * fl.speed + fl.phase) * fl.amp
            + Math.sin(u * 6 + t) * (fl.amp * 0.25);
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(165,180,252,' + fl.alpha + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + fl.alpha * 0.35 + ')';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // Soft vignette (darken edges so glass centers pop)
      ctx.globalCompositeOperation = 'source-over';
      var vig = ctx.createRadialGradient(w * 0.5, h * 0.4, h * 0.2, w * 0.5, h * 0.45, h * 0.95);
      vig.addColorStop(0, 'rgba(3,3,5,0)');
      vig.addColorStop(1, 'rgba(3,3,5,0.55)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });

    window.addEventListener(
      'pointermove',
      function (e) {
        mx = e.clientX / Math.max(w, 1);
        my = e.clientY / Math.max(h, 1);
      },
      { passive: true }
    );

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) cancelAnimationFrame(raf);
      else {
        t0 = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });

    raf = requestAnimationFrame(frame);
  }

  function boot() {
    var host = ensureHost();
    bootCanvas(host);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
