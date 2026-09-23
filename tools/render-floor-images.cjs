'use strict';
/*
 * Renders the picker images (assets/floors/<scene>.jpg) from the live WebGL world,
 * so the cards always show the floors as they are built.  Re-run after changing
 * a floor's layout or 3D models:
 *
 *   CHROME_PATH=/usr/bin/google-chrome node tools/render-floor-images.cjs
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'floors');
const VIEWPORT = {width: 1000, height: 1064};
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2'};

// ─── Helpers ───
function loadPlaywright() {
  for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/home/andrzey/.cache/ms-playwright-go/1.50.1/package'].filter(Boolean)) {
    try { return require(candidate); } catch {}
  }
  throw new Error('Playwright not found (set PLAYWRIGHT_MODULE)');
}
function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ─── Main ───
(async () => {
  const {chromium} = loadPlaywright();
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
  });
  try {
    const page = await browser.newPage({viewport: VIEWPORT, deviceScaleFactor: 1});
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => document.querySelector('#stage')?.dataset.renderer === 'webgl', null, {timeout: 20000});
    await page.addStyleTag({content: '.overlay,.world-labels,.stage-tools,#btnNext,.product-dock,.world-status,.hint,.interact{display:none!important}.stage::after{display:none}'});
    fs.mkdirSync(OUT, {recursive: true});
    for (const id of await page.evaluate(() => Object.keys(SCENES))) {
      await page.evaluate(id => { App.loadScene(id); document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show')); }, id);
      await page.waitForFunction(id => App.world().sceneId === id && App.world().lastRendered, id, {timeout: 10000});
      await page.waitForTimeout(600);
      const file = path.join(OUT, `${id}.jpg`);
      const box = await page.locator('#stage').boundingBox(), inset = 8;   // skip the stage's rounded border
      await page.screenshot({path: file, type: 'jpeg', quality: 82, clip: {x: box.x + inset, y: box.y + inset, width: box.width - 2 * inset, height: box.height - 2 * inset}});
      console.log(`${file} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
