/**
 * Visual repro: rules + video at 1440 and 390, screenshot immediately after open.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_archive', 'proof', 'screenshots');
const PORT = 8768;
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

async function openRules(page) {
  return page.evaluate(() => {
    const ids = ['contact-me-btn', 'contact-telegram', 'telegram-contact', 'telegram-contact-item'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) { el.click(); return id; }
    }
    return null;
  });
}

async function closeRules(page) {
  await page.evaluate(() => {
    const close = document.querySelector('.close-rules');
    if (close) close.click();
    document.querySelectorAll('.rules-modal.active').forEach((m) => m.classList.remove('active'));
    document.body.style.overflow = '';
  });
}

async function openVideo(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.video-card[data-video], .video-card');
    if (!card) return false;
    card.scrollIntoView({ block: 'center' });
    card.click();
    return true;
  });
}

async function closeVideo(page) {
  await page.evaluate(() => {
    const btn = document.getElementById('video-modal-close');
    if (btn) btn.click();
    const modal = document.getElementById('video-modal');
    if (modal) {
      modal.hidden = true;
      const iframe = modal.querySelector('iframe');
      if (iframe) iframe.src = '';
    }
  });
}

async function shot(page, name, w, h) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 400));
  const file = path.join(OUT, `${name}-${w}x${h}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('SAVED', file);
  return file;
}

async function main() {
  const server = http.createServer(serve);
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  for (const vp of [
    { w: 1440, h: 900 },
    { w: 390, h: 844 },
  ]) {
    await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1200));

    const trigger = await openRules(page);
    await new Promise((r) => setTimeout(r, 900));
    console.log('rules trigger', trigger, '@', vp.w);
    await shot(page, 'visual-rules-modal', vp.w, vp.h);
    await closeRules(page);
    await new Promise((r) => setTimeout(r, 400));

    const v = await openVideo(page);
    await new Promise((r) => setTimeout(r, 1200));
    console.log('video clicked', v, '@', vp.w);
    await shot(page, 'visual-video-modal', vp.w, vp.h);
    await closeVideo(page);
  }

  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
