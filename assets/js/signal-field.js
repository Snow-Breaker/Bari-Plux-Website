/**
 * Bari Plux Signal Field — match-HUD ambient
 * Canvas: aurora wisps + frame-graph waveform + soft radar sweep
 * Animates transform/opacity-friendly canvas redraw; respects reduced motion
 */
(function () {
  'use strict';

  function prefersReduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function boot() {
    var host =
      document.querySelector('[data-bp-ambient]') ||
      document.querySelector('.sf-ambient') ||
      document.querySelector('.bp-ambient');
    if (!host) return;

    // Enrich CSS layers if missing
    if (!host.querySelector('.sf-ambient__ribbons') && !host.querySelector('.bp-ambient__sheen')) {
      host.insertAdjacentHTML(
        'afterbegin',
        '<div class="sf-ambient__ribbons" aria-hidden="true"></div>' +
          '<div class="sf-ambient__grid" aria-hidden="true"></div>' +
          '<div class="sf-ambient__scan" aria-hidden="true"></div>' +
          '<div class="sf-ambient__noise" aria-hidden="true"></div>'
      );
    } else {
      if (!host.querySelector('.sf-ambient__grid')) {
        host.insertAdjacentHTML('beforeend', '<div class="sf-ambient__grid" aria-hidden="true"></div>');
      }
      if (!host.querySelector('.sf-ambient__scan')) {
        host.insertAdjacentHTML('beforeend', '<div class="sf-ambient__scan" aria-hidden="true"></div>');
      }
      if (!host.querySelector('.sf-ambient__noise') && !host.querySelector('.bp-ambient__noise')) {
        host.insertAdjacentHTML('beforeend', '<div class="sf-ambient__noise" aria-hidden="true"></div>');
      }
    }

    if (prefersReduced()) return;

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0;
    var h = 0;
    var raf = 0;
    var t0 = performance.now();
    var samples = [];
    var SAMPLE_N = 96;
    var wisps = [];

    function resize() {
      w = Math.max(1, window.innerWidth);
      h = Math.max(1, window.innerHeight);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      samples.length = 0;
      for (var i = 0; i < SAMPLE_N; i++) {
        samples.push(0.35 + Math.random() * 0.35);
      }
      wisps.length = 0;
      var count = w < 720 ? 3 : 5;
      for (var j = 0; j < count; j++) {
        wisps.push({
          x: Math.random() * w,
          y: Math.random() * h * 0.7,
          r: 140 + Math.random() * 220,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.08,
          hue: j % 2 === 0 ? '129,140,248' : '103,232,249',
          a: 0.045 + Math.random() * 0.04
        });
      }
    }

    function frame(now) {
      var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);

      // Soft wisps (radial blurs via gradients)
      for (var i = 0; i < wisps.length; i++) {
        var p = wisps[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -p.r) p.x = w + p.r;
        if (p.x > w + p.r) p.x = -p.r;
        if (p.y < -p.r) p.y = h * 0.8;
        if (p.y > h * 0.85) p.y = -p.r * 0.2;

        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, 'rgba(' + p.hue + ',' + p.a + ')');
        g.addColorStop(1, 'rgba(' + p.hue + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Radar sweep (top-right)
      var cx = w * 0.78;
      var cy = h * 0.22;
      var sweep = (t * 0.35) % (Math.PI * 2);
      var maxR = Math.min(w, h) * 0.28;
      for (var ring = 1; ring <= 3; ring++) {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * (ring / 3), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(129,140,248,' + (0.04 + ring * 0.015) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, sweep - 0.35, sweep, false);
      ctx.closePath();
      var sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      sg.addColorStop(0, 'rgba(129,140,248,0.18)');
      sg.addColorStop(1, 'rgba(129,140,248,0)');
      ctx.fillStyle = sg;
      ctx.fill();

      // Frame-graph waveform along bottom
      // Shift samples occasionally
      if (Math.floor(t * 18) !== Math.floor((t - 1 / 60) * 18)) {
        samples.push(0.25 + Math.random() * 0.55 + Math.sin(t * 2.2) * 0.08);
        if (samples.length > SAMPLE_N) samples.shift();
      }

      var baseY = h * 0.88;
      var graphH = h * 0.09;
      ctx.beginPath();
      for (var s = 0; s < samples.length; s++) {
        var x = (s / (SAMPLE_N - 1)) * w;
        var y = baseY - samples[s] * graphH;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(103,232,249,0.28)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Fill under graph
      ctx.lineTo(w, baseY + 8);
      ctx.lineTo(0, baseY + 8);
      ctx.closePath();
      var fg = ctx.createLinearGradient(0, baseY - graphH, 0, baseY + 8);
      fg.addColorStop(0, 'rgba(129,140,248,0.12)');
      fg.addColorStop(1, 'rgba(129,140,248,0)');
      ctx.fillStyle = fg;
      ctx.fill();

      // Vertical tick marks (HUD)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (var tick = 0; tick < 12; tick++) {
        var tx = ((tick + 0.5) / 12) * w;
        ctx.beginPath();
        ctx.moveTo(tx, baseY + 2);
        ctx.lineTo(tx, baseY + 10);
        ctx.stroke();
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    seed();
    window.addEventListener(
      'resize',
      function () {
        resize();
        seed();
      },
      { passive: true }
    );
    raf = requestAnimationFrame(frame);

    document.addEventListener(
      'visibilitychange',
      function () {
        if (document.hidden) {
          cancelAnimationFrame(raf);
        } else {
          t0 = performance.now();
          raf = requestAnimationFrame(frame);
        }
      },
      false
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
