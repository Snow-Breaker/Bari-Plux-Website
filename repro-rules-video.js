/**
 * Phase 2.5 — live repro: community rules modal + video open.
 * Captures console + screenshots at interaction moments.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_archive', 'proof', 'screenshots');
const PORT = 8767;
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
  res.writeHead(200, { 'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

async function main() {
  const server = http.createServer(serve);
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${(r.failure() || {}).errorText || ''}`));

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));

  // --- Rules modal ---
  logs.push('--- ACTION: open rules modal ---');
  const rulesOpened = await page.evaluate(() => {
    const ids = ['contact-me-btn', 'contact-telegram', 'telegram-contact', 'telegram-contact-item'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) { el.click(); return id; }
    }
    return null;
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT, 'repro-rules-modal-1440.png'), fullPage: false });
  const rulesState = await page.evaluate(() => {
    const modal = document.querySelector('.rules-modal');
    return {
      modalExists: !!modal,
      modalClass: modal ? modal.className : null,
      display: modal ? getComputedStyle(modal).display : null,
      active: modal ? modal.classList.contains('active') : false,
      visible: modal ? (modal.classList.contains('active') && getComputedStyle(modal).display !== 'none') : false,
    };
  });
  logs.push('[rules-trigger] ' + rulesOpened);
  logs.push('[rules-state] ' + JSON.stringify(rulesState));

  // close rules if open
  await page.evaluate(() => {
    const close = document.querySelector('.rules-modal .modal-close, .rules-close, #rules-close, .rules-modal [aria-label*="Close"]');
    if (close) close.click();
    document.querySelectorAll('.rules-modal.active, .rules-modal.show').forEach((m) => {
      m.classList.remove('active', 'show');
    });
  });
  await new Promise((r) => setTimeout(r, 400));

  // --- Video card ---
  logs.push('--- ACTION: open video ---');
  const videoClicked = await page.evaluate(() => {
    const card = document.querySelector('.video-card[data-video], .video-card');
    if (!card) return false;
    card.scrollIntoView({ block: 'center' });
    card.click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT, 'repro-video-modal-1440.png'), fullPage: false });
  const videoState = await page.evaluate(() => {
    const modal = document.getElementById('video-modal');
    const iframe = modal && modal.querySelector('iframe');
    return {
      clicked: true,
      modalExists: !!modal,
      hidden: modal ? modal.hasAttribute('hidden') : null,
      display: modal ? getComputedStyle(modal).display : null,
      iframeSrc: iframe ? iframe.src : null,
    };
  });
  logs.push('[video-clicked] ' + videoClicked);
  logs.push('[video-state] ' + JSON.stringify(videoState));

  const report = logs.join('\n');
  fs.writeFileSync(path.join(ROOT, '_archive', 'proof', 'REPRO-rules-video.txt'), report);
  console.log(report);

  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
