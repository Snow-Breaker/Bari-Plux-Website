/**
 * Phase 2.5 Step 2 — computed-style baseline for regression diffs.
 * Usage: node computed-baseline.js
 * Output: _archive/proof/computed-baseline.json
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_archive', 'proof', 'computed-baseline.json');
const PORT = 8766;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function serve(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath.replace(/^\//, '').replace(/\//g, path.sep));
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end('nf'); return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const PROPS = [
  'backgroundColor', 'color', 'fontFamily', 'fontSize', 'fontWeight',
  'borderTopColor', 'borderTopWidth', 'borderTopStyle',
  'borderRadius', 'boxShadow', 'opacity', 'display',
  'paddingTop', 'paddingRight', 'marginTop', 'maxWidth', 'width',
  'backdropFilter', 'webkitBackdropFilter', 'position', 'zIndex',
];

const SELECTORS = [
  { key: 'html', sel: 'html' },
  { key: 'body', sel: 'body' },
  { key: 'bp-chrome', sel: '.bp-chrome__inner' },
  { key: 'bp-nav-link', sel: '.bp-nav__link' },
  { key: 'hero-title', sel: '.hero-title' },
  { key: 'hero-lead', sel: '.hero-lead' },
  { key: 'profile-shell', sel: '.profile-shell' },
  { key: 'download-card', sel: '.download-card' },
  { key: 'video-card', sel: '.video-card' },
  { key: 'footer', sel: 'footer, .footer, .site-footer, .bp-footer' },
  { key: 'footer-link', sel: '.footer-link' },
  { key: 'theme-toggle', sel: '#theme-toggle' },
  { key: 'bp-btn', sel: '.bp-btn' },
];

async function capture(page, theme, viewport) {
  await page.setViewport(viewport);
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    document.body.setAttribute('data-theme', t);
  }, theme);
  await new Promise((r) => setTimeout(r, 600));

  return page.evaluate((selectors, props) => {
    const out = {};
    for (const { key, sel } of selectors) {
      const el = document.querySelector(sel);
      if (!el) {
        out[key] = { __missing: true, selector: sel };
        continue;
      }
      const cs = getComputedStyle(el);
      const row = { selector: sel };
      for (const p of props) {
        try { row[p] = cs[p]; } catch (_) { row[p] = null; }
      }
      // CSS variables from html
      out[key] = row;
    }
    const root = getComputedStyle(document.documentElement);
    out.__tokens = {
      '--void': root.getPropertyValue('--void').trim(),
      '--text': root.getPropertyValue('--text').trim(),
      '--accent': root.getPropertyValue('--accent').trim(),
      '--max': root.getPropertyValue('--max').trim(),
      '--bp-max': root.getPropertyValue('--bp-max').trim(),
      '--lg-fill': root.getPropertyValue('--lg-fill').trim(),
      '--font-d': root.getPropertyValue('--font-d').trim(),
      '--font-b': root.getPropertyValue('--font-b').trim(),
    };
    return out;
  }, SELECTORS, PROPS);
}

async function main() {
  const server = http.createServer(serve);
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 1500));

  const result = {
    capturedAt: new Date().toISOString(),
    url: `http://127.0.0.1:${PORT}/index.html`,
    stylesheets: await page.evaluate(() =>
      [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map((l) => l.href)
        .filter((h) => h.includes('/assets/css/') || h.includes('obsidian') || h.includes('liquid') || h.includes('experience') || h.includes('bariplux') || h.includes('site') || h.includes('widgets'))
    ),
    snapshots: {},
  };

  for (const theme of ['dark', 'light']) {
    for (const vp of [
      { name: '1440x900', width: 1440, height: 900 },
      { name: '390x844', width: 390, height: 844 },
    ]) {
      const key = `${theme}@${vp.name}`;
      result.snapshots[key] = await capture(page, theme, vp);
      console.log('captured', key);
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log('WROTE', OUT);

  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
