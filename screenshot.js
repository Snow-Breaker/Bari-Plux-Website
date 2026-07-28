/**
 * Overhaul evidence: screenshots + console capture (Puppeteer).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_archive', 'proof', 'screenshots');
const PORT = 8765;

fs.mkdirSync(OUT, { recursive: true });

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

function serveFile(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath.replace(/^\//, '').replace(/\//g, path.sep));
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

async function shot(page, name, w, h) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 1200));
  const file = path.join(OUT, `${name}-${w}x${h}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('SAVED', file);
}

async function main() {
  const server = http.createServer(serveFile);
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  console.log('SERVER http://127.0.0.1:' + PORT);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // --- Console / pageerror check on index ---
  const page = await browser.newPage();
  const consoleLines = [];
  page.on('console', (msg) => {
    consoleLines.push(`[console.${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    consoleLines.push(`[pageerror] ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    consoleLines.push(`[requestfailed] ${req.url()} ${req.failure() && req.failure().errorText}`);
  });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 3000));

  console.log('=== CONSOLE CAPTURE START ===');
  if (consoleLines.length === 0) {
    console.log('no console output');
  } else {
    consoleLines.forEach((l) => console.log(l));
  }
  console.log('=== CONSOLE CAPTURE END ===');

  // Dark mode screenshots (default)
  await shot(page, 'index-dark', 1440, 900);
  await shot(page, 'index-dark', 390, 844);

  // Light mode screenshots
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.body.setAttribute('data-theme', 'light');
  });
  await new Promise((r) => setTimeout(r, 800));
  await shot(page, 'index-light', 1440, 900);
  await shot(page, 'index-light', 390, 844);

  // glass-reference
  const glass = await browser.newPage();
  await glass.goto(`http://127.0.0.1:${PORT}/glass-reference.html`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await shot(glass, 'glass-reference', 1440, 900);
  await shot(glass, 'glass-reference', 390, 844);

  await browser.close();
  server.close();

  console.log('=== SCREENSHOT FILES ===');
  fs.readdirSync(OUT).forEach((f) => console.log(f));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
