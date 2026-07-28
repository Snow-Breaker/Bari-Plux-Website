/**
 * Homepage polish: spotlight glass + staggered reveals.
 * Uses transform/opacity only for reveals (compositor-friendly).
 */
(function () {
  'use strict';

  function prefersReduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function wireSpotlight() {
    if (prefersReduced()) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    var cards = document.querySelectorAll(
      '.profile-shell, .download-card, .video-card, .blog-card, .compact-info-item, .plux-article, .pubg-card, .quiz-container'
    );

    cards.forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = ((e.clientX - r.left) / Math.max(r.width, 1)) * 100;
        var y = ((e.clientY - r.top) / Math.max(r.height, 1)) * 100;
        card.style.setProperty('--mx', x.toFixed(2) + '%');
        card.style.setProperty('--my', y.toFixed(2) + '%');
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--mx', '50%');
        card.style.setProperty('--my', '0%');
      });
    });
  }

  function wireReveals() {
    var selectors = [
      '.profile-shell',
      '.videos-featured',
      '.section-title',
      '.section-subtitle',
      '.download-card',
      '.video-card',
      '.blog-card',
      '.quiz-container',
      '.compact-info-item',
      '.social-links',
      '.plux-article',
      '.pubg-card',
      '.feedback-card',
      '.faq-item',
      '.hours-card',
      '.event-item',
      '.footer-col'
    ];

    var nodes = [];
    selectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (!el.classList.contains('bp-reveal')) el.classList.add('bp-reveal');
        nodes.push(el);
      });
    });

    if (!nodes.length) return;

    if (prefersReduced() || !('IntersectionObserver' in window)) {
      nodes.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = Number(el.getAttribute('data-delay') || 0);
        window.setTimeout(function () { el.classList.add('is-in'); }, delay);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    nodes.forEach(function (el, i) {
      // Light stagger within groups
      el.setAttribute('data-delay', String(Math.min((i % 4) * 55, 165)));
      io.observe(el);
    });
  }

  function ensureSkipLink() {
    if (document.querySelector('.bp-skip')) return;
    var a = document.createElement('a');
    a.className = 'bp-skip';
    a.href = '#home';
    a.textContent = 'Skip to content';
    document.body.insertBefore(a, document.body.firstChild);
  }

  function boot() {
    ensureSkipLink();
    wireSpotlight();
    wireReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
