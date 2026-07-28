/**
 * Phase 3.5 — light-mode visual evidence
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_archive', 'proof', 'screenshots');
const PORT = 8772;
fs.mkdirSync(OUT, { recursive: true });

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

function serve(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath.replace(/^\//, '').replace(/\//g, path.sep));
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end('nf'); return;
  }
  res.writeHead(200, {
    'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

async function shot(page, name, w, h) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 500));
  const file = path.join(OUT, `${name}-${w}x${h}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('SAVED', file);
}

(async () => {
  const server = http.createServer(serve);
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  for (const vp of [
    { w: 1440, h: 900 },
    { w: 390, h: 844 },
  ]) {
    await page.setViewport({ width: vp.w, height: vp.h });
    await page.goto(`http://127.0.0.1:${PORT}/index.html?v=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    });
    await new Promise((r) => setTimeout(r, 800));

    // Hero
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'light-hero', vp.w, vp.h);

    // Contrast sample
    if (vp.w === 1440) {
      const contrast = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const lead = document.querySelector('.hero-lead');
        const leadCs = lead ? getComputedStyle(lead) : null;
        const root = getComputedStyle(document.documentElement);
        return {
          bodyBg: body.backgroundColor,
          bodyColor: body.color,
          leadColor: leadCs ? leadCs.color : null,
          void: root.getPropertyValue('--void').trim(),
          text: root.getPropertyValue('--text').trim(),
          text2: root.getPropertyValue('--text-2').trim(),
          text3: root.getPropertyValue('--text-3').trim(),
          accent: root.getPropertyValue('--accent').trim(),
        };
      });
      console.log('CONTRAST_TOKENS', JSON.stringify(contrast, null, 2));
      fs.writeFileSync(
        path.join(ROOT, '_archive', 'proof', 'PHASE35-LIGHT-CONTRAST.json'),
        JSON.stringify(contrast, null, 2)
      );
    }

    // Downloads
    await page.evaluate(() => {
      const el = document.getElementById('downloads') || document.querySelector('.download-grid');
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await new Promise((r) => setTimeout(r, 400));
    await shot(page, 'light-downloads', vp.w, vp.h);

    // Rules modal
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('#contact-me-btn');
    await new Promise((r) => setTimeout(r, 700));
    await shot(page, 'light-rules-modal', vp.w, vp.h);
    await page.click('.close-rules');
    await new Promise((r) => setTimeout(r, 300));

    // Video modal
    await page.evaluate(() => {
      const card = document.querySelector('.video-card[data-video]');
      if (card) {
        card.scrollIntoView({ block: 'center' });
        card.click();
      }
    });
    await new Promise((r) => setTimeout(r, 1000));
    await shot(page, 'light-video-modal', vp.w, vp.h);
    await page.evaluate(() => {
      const btn = document.getElementById('video-modal-close');
      if (btn) btn.click();
    });
  }

  await browser.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
