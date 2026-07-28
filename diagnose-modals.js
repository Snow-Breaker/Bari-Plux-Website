const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_archive', 'proof', 'screenshots');
const PORT = 8769;
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

(async () => {
  const server = http.createServer(serve);
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));

  await page.click('#contact-me-btn');
  await new Promise((r) => setTimeout(r, 1000));

  const rulesInfo = await page.evaluate(() => {
    const m = document.querySelector('.rules-modal');
    const c = document.querySelector('.rules-container');
    const cs = getComputedStyle(m);
    const csc = c ? getComputedStyle(c) : null;
    const r = m.getBoundingClientRect();
    const rc = c ? c.getBoundingClientRect() : null;
    return {
      className: m.className,
      display: cs.display,
      opacity: cs.opacity,
      visibility: cs.visibility,
      zIndex: cs.zIndex,
      position: cs.position,
      background: cs.backgroundColor,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      containerRect: rc ? { x: rc.x, y: rc.y, w: rc.width, h: rc.height } : null,
      containerOpacity: csc ? csc.opacity : null,
      containerBg: csc ? csc.backgroundColor : null,
      title: (document.getElementById('rules-title') || {}).textContent || null,
      titleVisible: (() => {
        const t = document.getElementById('rules-title');
        if (!t) return false;
        const b = t.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      })(),
    };
  });
  console.log('RULES_INFO', JSON.stringify(rulesInfo, null, 2));

  const rulesContainer = await page.$('.rules-container');
  if (rulesContainer) {
    await rulesContainer.screenshot({ path: path.join(OUT, 'element-rules-container-1440.png') });
    console.log('SAVED element-rules-container-1440.png');
  }
  await page.screenshot({ path: path.join(OUT, 'visual-rules-modal-1440x900.png'), fullPage: false });

  await page.click('.close-rules');
  await new Promise((r) => setTimeout(r, 400));

  await page.evaluate(() => {
    const card = document.querySelector('.video-card[data-video]');
    card.scrollIntoView({ block: 'center' });
    card.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  const videoInfo = await page.evaluate(() => {
    const m = document.getElementById('video-modal');
    const cs = getComputedStyle(m);
    const r = m.getBoundingClientRect();
    const iframe = m.querySelector('iframe');
    const content = m.querySelector('.modal-content');
    return {
      hidden: m.hidden,
      display: cs.display,
      opacity: cs.opacity,
      visibility: cs.visibility,
      zIndex: cs.zIndex,
      position: cs.position,
      background: cs.backgroundColor,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      iframeSrc: iframe ? iframe.src : null,
      contentRect: content ? (() => {
        const b = content.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      })() : null,
    };
  });
  console.log('VIDEO_INFO', JSON.stringify(videoInfo, null, 2));

  const videoContent = await page.$('#video-modal .modal-content');
  if (videoContent) {
    await videoContent.screenshot({ path: path.join(OUT, 'element-video-modal-1440.png') });
    console.log('SAVED element-video-modal-1440.png');
  }
  await page.screenshot({ path: path.join(OUT, 'visual-video-modal-1440x900.png'), fullPage: false });

  // mobile rules
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  await page.click('#contact-me-btn');
  await new Promise((r) => setTimeout(r, 1000));
  const rc = await page.$('.rules-container');
  if (rc) await rc.screenshot({ path: path.join(OUT, 'element-rules-container-390.png') });
  await page.screenshot({ path: path.join(OUT, 'visual-rules-modal-390x844.png'), fullPage: false });
  await page.click('.close-rules');
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const card = document.querySelector('.video-card[data-video]');
    card.scrollIntoView({ block: 'center' });
    card.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  const vc = await page.$('#video-modal .modal-content');
  if (vc) await vc.screenshot({ path: path.join(OUT, 'element-video-modal-390.png') });
  await page.screenshot({ path: path.join(OUT, 'visual-video-modal-390x844.png'), fullPage: false });

  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
