/**
 * Bari Plux ambient field — constellation + soft radar (desktop AmbientSignalField vibe).
 * Uses transform/opacity only; respects prefers-reduced-motion.
 */
(function (global) {
  'use strict';

  function prefersReduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function createAmbient(host) {
    if (!host || prefersReduced()) return { destroy: function () {} };

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return { destroy: function () {} };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0, t0 = performance.now();
    const nodes = [];
    const NODE_COUNT = 28;

    function resize() {
      const rect = host.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      nodes.length = 0;
      for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 1.1 + Math.random() * 1.8,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    function frame(now) {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);

      // Soft radar ring
      const cx = w * 0.72;
      const cy = h * 0.28;
      const pulse = (Math.sin(t * 0.7) + 1) * 0.5;
      const rr = 40 + pulse * 90;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(129,140,248,' + (0.08 + pulse * 0.08) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -20) n.x = w + 20;
        if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        if (n.y > h + 20) n.y = -20;
      }

      // Links
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 140) continue;
          const alpha = (1 - dist / 140) * 0.22;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = 'rgba(165,180,252,' + alpha + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      for (const n of nodes) {
        const glow = 0.45 + Math.sin(t * 1.4 + n.phase) * 0.25;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(165,180,252,' + glow + ')';
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    }

    function onResize() {
      resize();
      if (nodes.length === 0) seed();
    }

    resize();
    seed();
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', onResize);

    return {
      destroy: function () {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        canvas.remove();
      }
    };
  }

  function bootReveals() {
    const els = document.querySelectorAll('.bp-reveal');
    if (!els.length) return;
    if (prefersReduced() || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  function boot() {
    const host = document.querySelector('[data-bp-ambient]');
    if (host) createAmbient(host);
    bootReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.BariPluxUI = { createAmbient: createAmbient };
})(typeof window !== 'undefined' ? window : globalThis);
