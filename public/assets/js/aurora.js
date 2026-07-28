/**
 * Bari Plux Aurora — vivid Obsidian ambient (desktop AmbientSignalField, amplified)
 * Bright enough that liquid glass has real light to frost. Respects reduced-motion.
 */
(function () {
  'use strict';

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function boot() {
    var host = document.getElementById('bp-aurora');
    if (!host) {
      host = document.createElement('div');
      host.id = 'bp-aurora';
      host.className = 'bp-aurora';
      host.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(host, document.body.firstChild);
    }

    host.innerHTML =
      '<div class="bp-aurora__wash"></div>' +
      '<div class="bp-aurora__grain"></div>';

    if (reduced()) return;

    var canvas = document.createElement('canvas');
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, raf = 0, t0 = performance.now();
    var orbs = [];
    var ribbons = [];
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
      var n = w < 720 ? 6 : 9;
      orbs = [];
      for (var i = 0; i < n; i++) {
        orbs.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: (w < 720 ? 140 : 200) + Math.random() * 280,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.28,
          phase: Math.random() * Math.PI * 2,
          // HIGH alpha — must be visible
          a: 0.18 + Math.random() * 0.14,
          tone: i % 3 === 0
            ? [129, 140, 248]
            : i % 3 === 1
              ? [165, 180, 252]
              : [99, 102, 241]
        });
      }
      ribbons = [];
      var rc = w < 720 ? 5 : 8;
      for (var j = 0; j < rc; j++) {
        ribbons.push({
          y: h * (0.12 + Math.random() * 0.75),
          amp: 28 + Math.random() * 55,
          speed: 0.18 + Math.random() * 0.28,
          phase: Math.random() * Math.PI * 2,
          width: 1.2 + Math.random() * 2.2,
          alpha: 0.12 + Math.random() * 0.14
        });
      }
    }

    function frame(now) {
      var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);

      var px = (mx - 0.5) * 55;
      var py = (my - 0.5) * 40;

      // Additive luminous plasma
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < orbs.length; i++) {
        var o = orbs[i];
        o.x += o.vx + Math.sin(t * 0.4 + o.phase) * 0.25;
        o.y += o.vy + Math.cos(t * 0.33 + o.phase) * 0.2;
        if (o.x < -o.r) o.x = w + o.r;
        if (o.x > w + o.r) o.x = -o.r;
        if (o.y < -o.r) o.y = h + o.r;
        if (o.y > h + o.r) o.y = -o.r;

        var pulse = 1 + Math.sin(t * 0.8 + o.phase) * 0.12;
        var rr = o.r * pulse;
        var gx = o.x + px * (0.25 + i * 0.04);
        var gy = o.y + py * (0.25 + i * 0.04);
        var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rr);
        var c = o.tone;
        g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + o.a + ')');
        g.addColorStop(0.35, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + o.a * 0.45 + ')');
        g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(gx, gy, rr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bright signal ribbons
      ctx.globalCompositeOperation = 'screen';
      for (var r = 0; r < ribbons.length; r++) {
        var rb = ribbons[r];
        var start = ((t * rb.speed * 80 + rb.phase * 50) % (w * 1.5)) - w * 0.25;
        ctx.beginPath();
        var steps = 56;
        for (var s = 0; s <= steps; s++) {
          var u = s / steps;
          var x = start + u * w * 0.55;
          var y =
            rb.y +
            Math.sin(u * Math.PI * 2.2 + t * rb.speed + rb.phase) * rb.amp +
            Math.sin(u * 5 + t * 1.4) * rb.amp * 0.3;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(165,180,252,' + rb.alpha + ')';
        ctx.lineWidth = rb.width;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + rb.alpha * 0.45 + ')';
        ctx.lineWidth = rb.width * 0.35;
        ctx.stroke();
      }

      // Soft center glow (makes glass pop)
      ctx.globalCompositeOperation = 'source-over';
      var core = ctx.createRadialGradient(w * 0.5, h * 0.28, 0, w * 0.5, h * 0.35, h * 0.55);
      core.addColorStop(0, 'rgba(129,140,248,0.16)');
      core.addColorStop(1, 'rgba(129,140,248,0)');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, w, h);

      // Edge vignette (keep depth, don't kill aurora)
      var vig = ctx.createRadialGradient(w * 0.5, h * 0.4, h * 0.25, w * 0.5, h * 0.5, h * 1.05);
      vig.addColorStop(0, 'rgba(3,3,5,0)');
      vig.addColorStop(1, 'rgba(3,3,5,0.42)');
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
