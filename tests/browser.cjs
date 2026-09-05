'use strict';

/*
 * Small, no-build browser contract suite for Explore the Floor.
 *
 * The app is intentionally served over localhost instead of file:// so the
 * same test can exercise dynamic imports, request interception, and both
 * renderer paths.  Run the normal suite with:
 *
 *   node tests/browser.cjs
 *
 * `--webgl` permits the Three.js CDN request and changes the renderer test to
 * an explicit WebGL readiness/context-loss check.  It must never silently
 * accept the canvas fallback as a WebGL pass.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WEBGL_MODE = process.argv.includes('--webgl');
const HEADED = process.argv.includes('--headed');
const DEFAULT_VIEWPORT = {width: 1280, height: 720};
const SHORT_LANDSCAPE = {width: 667, height: 375};
const DEMO_SETTLE_MS = 7000;
const DEFAULT_TIMEOUT = 6000;
const RENDERER_TIMEOUT = WEBGL_MODE ? 15000 : 6000;
const CHROME_DEFAULT = '/usr/bin/google-chrome';
const THREE_CDN_PREFIX = '/npm/three@0.180.0/build/';
const THREE_LOCAL_FILES = new Set(['three.module.js', 'three.core.js']);

let testSequence = 0;
let serverHandle;
let browserContext;
let profileDir;
let baseUrl;
let playwright;
let threeModuleRoot;

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    'playwright',
    '/home/andrzey/.cache/ms-playwright-go/1.50.1/package'
  ].filter(Boolean);
  let lastError;
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Nie znaleziono Playwright (${lastError?.message || 'brak modułu'})`);
}

function resolveThreeModuleRoot() {
  const configured = process.env.THREE_MODULE_PATH;
  if (!configured) return null;
  const candidate = path.resolve(configured);
  try {
    const stat = fs.statSync(candidate);
    if (stat.isFile()) return path.dirname(candidate);
    if (stat.isDirectory()) {
      if (fs.existsSync(path.join(candidate, 'three.module.js'))) return candidate;
      if (fs.existsSync(path.join(candidate, 'build', 'three.module.js'))) return path.join(candidate, 'build');
    }
  } catch {
    // The caller gets a deterministic WebGL failure if the configured path is invalid.
  }
  return null;
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8'
  }[ext] || 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, {'content-type': 'text/plain; charset=utf-8'});
        response.end('Method not allowed');
        return;
      }
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      } catch {
        response.writeHead(400, {'content-type': 'text/plain; charset=utf-8'});
        response.end('Bad request');
        return;
      }
      if (pathname === '/') pathname = '/index.html';
      const target = path.resolve(ROOT, `.${pathname}`);
      if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`)) {
        response.writeHead(403, {'content-type': 'text/plain; charset=utf-8'});
        response.end('Forbidden');
        return;
      }
      fs.stat(target, (error, stat) => {
        if (error || !stat.isFile()) {
          response.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
          response.end('Not found');
          return;
        }
        response.writeHead(200, {
          'content-type': mimeType(target),
          'cache-control': 'no-store',
          'content-length': stat.size
        });
        if (request.method === 'HEAD') {
          response.end();
          return;
        }
        fs.createReadStream(target).pipe(response);
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      serverHandle = server;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

function closeServer() {
  return new Promise(resolve => {
    if (!serverHandle) return resolve();
    serverHandle.close(() => resolve());
    serverHandle = undefined;
  });
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitFor(page, description, predicate, timeout = DEFAULT_TIMEOUT, args) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await page.evaluate(predicate, args);
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(40);
  }
  const suffix = lastError ? `; ostatni błąd: ${lastError.message}` : '';
  throw new Error(`Timeout: ${description}${suffix}`);
}

async function isShown(page, selector) {
  return page.locator(selector).count().then(async count => {
    if (!count) return false;
    return page.locator(selector).first().evaluate(element => element.classList.contains('show'));
  }).catch(() => false);
}

async function visibleDialog(page) {
  return page.evaluate(() => {
    const selectors = [
      ['#overlay', 'product'],
      ['#pickerOv', 'picker'],
      ['#helpOv', 'help'],
      ['#doneOv', 'done']
    ];
    return selectors.find(([selector]) => document.querySelector(selector)?.classList.contains('show'))?.[1] || null;
  });
}

async function closeProduct(page) {
  if (await isShown(page, '#overlay')) {
    await page.locator('#mClose').click();
    await waitFor(page, 'panel produktu zamyka się', () => !document.querySelector('#overlay')?.classList.contains('show'), 2500);
  }
}

async function chooseScene(page, sceneId) {
  const current = await page.evaluate(() => window.App?.snapshot?.().sceneId || null);
  const pickerOpen = await isShown(page, '#pickerOv');
  if (current !== sceneId || pickerOpen) {
    if (!pickerOpen) await page.locator('#btnSwitch').click();
    const card = page.locator(`#cards .card[data-scene="${sceneId}"]`);
    await card.waitFor({state: 'visible', timeout: 2500});
    await card.click();
  }
  await waitFor(page, `lokalizacja ${sceneId}`, id => window.App?.snapshot?.().sceneId === id, 3500, sceneId);
  await waitFor(page, `picker zamknięty po wyborze ${sceneId}`, () => !document.querySelector('#pickerOv')?.classList.contains('show'), 2500);
}

async function installClock(page) {
  if (!page.clock || typeof page.clock.install !== 'function') return false;
  try {
    await page.clock.install({time: new Date('2026-09-05T08:00:00Z')});
    return true;
  } catch {
    return false;
  }
}

async function advance(page, milliseconds, clockInstalled) {
  if (clockInstalled && page.clock) {
    if (typeof page.clock.runFor === 'function') {
      await page.clock.runFor(milliseconds);
      return;
    }
    if (typeof page.clock.fastForward === 'function') {
      const totalSeconds = Math.ceil(milliseconds / 1000);
      await page.clock.fastForward(`00:${String(totalSeconds).padStart(2, '0')}`);
      return;
    }
  }
  await delay(milliseconds);
}

async function localSceneData(page) {
  return page.evaluate(() => {
    const state = App.getWorldState();
    return {
      sceneId: state.sceneId,
      objects: state.SC.objects.map(({id, product, type, x, y, w, h, label}) => ({id, product, type, x, y, w, h, label})),
      walls: state.SC.walls.map(({x, y, w, h}) => ({x, y, w, h})),
      blocks: state.SC.blocks.filter(block => block.kind !== 'plant').map(({x, y, w, h}) => ({x, y, w, h}))
    };
  });
}

function freeSpot(scene, x, y) {
  if (![x, y].every(Number.isFinite) || x < 34 || x > 1046 || y < 34 || y > 626) return false;
  const rects = [...scene.walls, ...scene.blocks, ...scene.objects.map(object => ({
    x: object.x - object.w / 2,
    y: object.y - object.h / 2,
    w: object.w,
    h: object.h
  }))];
  return !rects.some(object => {
    const cx = Math.max(object.x, Math.min(x, object.x + object.w));
    const cy = Math.max(object.y, Math.min(y, object.y + object.h));
    return Math.hypot(x - cx, y - cy) < 16;
  });
}

function approachCandidates(object) {
  return [
    {name: 'above', x: object.x, y: object.y - object.h / 2 - 50},
    {name: 'below', x: object.x, y: object.y + object.h / 2 + 34},
    {name: 'left', x: object.x - object.w / 2 - 34, y: object.y},
    {name: 'right', x: object.x + object.w / 2 + 34, y: object.y}
  ];
}

async function openObjectFromApproach(page, objectId, approach, expectedProduct) {
  const result = await page.evaluate(({objectId, approach}) => {
    const state = App.getWorldState();
    const object = state.SC.objects.find(candidate => candidate.id === objectId);
    if (!object) return {ok: false, reason: 'missing-object'};
    // selectObject updates the app's internal proximity reference.  We then
    // put the player back at the injected approach, forcing navigateTo to
    // execute its real path/pending-object flow rather than opening directly.
    const other = state.SC.objects.find(candidate => candidate.id !== objectId);
    if (other) App.selectObject(other);
    state.player.x = approach.x;
    state.player.y = approach.y;
    state.player.target = null;
    state.player.path = [];
    return {ok: App.navigateTo(object.x, object.y, object.id), player: {x: state.player.x, y: state.player.y}};
  }, {objectId, approach});
  assert.equal(result.ok, true, `navigateTo od ${approach.name} do ${objectId}`);
  await waitFor(page, `${objectId} otwiera modal po podejściu ${approach.name}`, () => window.App?.snapshot?.().dialog === 'product', 2500);
  const title = await page.locator('#mName').textContent();
  assert.ok(title && title.trim(), `${objectId}: modal ma nazwę produktu`);
  const actualProduct = await page.locator('#mProductLink').getAttribute('data-product');
  assert.equal(actualProduct, expectedProduct, `${objectId}: modal otwiera właściwy produkt`);
}

async function openObject(page, objectId) {
  const result = await page.evaluate(objectId => App.selectObject(objectId, {open: true}), objectId);
  assert.equal(result, true, `selectObject otwiera ${objectId}`);
  await waitFor(page, `${objectId} modal`, () => window.App?.snapshot?.().dialog === 'product', 2500);
}

async function injectAllCompletedAndOpen(page) {
  await page.evaluate(() => {
    const state = App.getWorldState();
    for (const object of state.SC.objects) {
      state.visited[object.id] = true;
      state.completed[object.id] = true;
      state.demoState[object.id] = 'result';
    }
    App.selectObject(state.SC.objects[0], {open: true});
  });
  await waitFor(page, 'modal z wstrzykniętym stanem ukończenia', () => window.App?.snapshot?.().dialog === 'product', 2500);
}

async function dialogBounds(page, selector) {
  return page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    };
  });
}

function assertFits(bounds, label) {
  assert.ok(bounds.width <= bounds.viewportWidth + 1, `${label}: szerokość ${bounds.width} > ${bounds.viewportWidth}`);
  assert.ok(bounds.height <= bounds.viewportHeight + 1, `${label}: wysokość ${bounds.height} > ${bounds.viewportHeight}`);
  assert.ok(bounds.left >= -1 && bounds.top >= -1, `${label}: dialog wychodzi górą/lewą stroną (${bounds.left}, ${bounds.top})`);
  assert.ok(bounds.right <= bounds.viewportWidth + 1 && bounds.bottom <= bounds.viewportHeight + 1,
    `${label}: dialog wychodzi dołem/prawą stroną (${bounds.right}, ${bounds.bottom})`);
}

async function newPage({viewport = DEFAULT_VIEWPORT, clock = false} = {}) {
  const page = await browserContext.newPage();
  await page.setViewportSize(viewport);
  await page.route('**/*', async route => {
    const requestUrl = route.request().url();
    if (WEBGL_MODE && threeModuleRoot) {
      try {
        const url = new URL(requestUrl);
        if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith(THREE_CDN_PREFIX)) {
          const fileName = path.basename(url.pathname);
          if (!THREE_LOCAL_FILES.has(fileName)) return route.abort();
          const localPath = path.join(threeModuleRoot, fileName);
          if (!localPath.startsWith(`${threeModuleRoot}${path.sep}`) || !fs.existsSync(localPath)) return route.abort();
          return route.fulfill({path: localPath, contentType: 'text/javascript', headers: {'cache-control': 'no-store'}});
        }
      } catch {
        return route.abort();
      }
    }
    if (WEBGL_MODE) return route.continue();
    try {
      const hostname = new URL(requestUrl).hostname;
      if (hostname === '127.0.0.1' || hostname === 'localhost') return route.continue();
    } catch {
      // Non-HTTP requests are not part of this fixture.
    }
    return route.abort();
  });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error));
  const clockInstalled = clock ? await installClock(page) : false;
  await page.goto(`${baseUrl}/index.html?e2e=${Date.now()}-${testSequence++}`, {
    waitUntil: 'domcontentloaded',
    timeout: 10000
  });
  await waitFor(page, 'aplikacja i picker', () => Boolean(window.App?.getWorldState && document.querySelectorAll('#cards .card').length === 3), 6000);
  await waitFor(page, `renderer ${WEBGL_MODE ? 'WebGL' : 'canvas'}`, () => {
    const renderer = document.querySelector('#stage')?.dataset.renderer;
    return renderer && renderer !== 'loading';
  }, RENDERER_TIMEOUT);
  return {page, clockInstalled, pageErrors};
}

async function runNavigationSuite() {
  const {page} = await newPage();
  try {
    for (const sceneId of ['airport', 'bank', 'office']) {
      await chooseScene(page, sceneId);
      const scene = await localSceneData(page);
      assert.equal(scene.objects.length, 4, `${sceneId}: cztery obiekty`);
      for (const object of scene.objects) {
        const candidates = approachCandidates(object).filter(candidate => freeSpot(scene, candidate.x, candidate.y));
        assert.ok(candidates.length >= 3, `${sceneId}/${object.id}: co najmniej trzy wolne podejścia`);
        for (const candidate of candidates) {
          await openObjectFromApproach(page, object.id, candidate, object.product);
          const snapshot = await page.evaluate(() => App.snapshot());
          assert.equal(snapshot.nearObjectId, object.id, `${sceneId}/${object.id}: właściwe stanowisko po nawigacji`);
          await closeProduct(page);
        }
      }
    }
  } finally {
    await page.close().catch(() => {});
  }
}

async function runCompletionRaceSuite() {
  const {page} = await newPage();
  try {
    await chooseScene(page, 'airport');
    await injectAllCompletedAndOpen(page);
    await page.locator('#mClose').click();
    await page.locator('#btnHelp').click();
    assert.equal(await isShown(page, '#helpOv'), true, 'pomoc otwiera się natychmiast po zamknięciu modalnego wyniku');
    await delay(500);
    assert.equal(await isShown(page, '#helpOv'), true, 'pomoc pozostaje na wierzchu po zakończeniu wyścigu timerów');
    assert.equal(await isShown(page, '#doneOv'), false, 'karta done nie przykrywa pomocy');
    assert.equal(await visibleDialog(page), 'help', 'dokładnie pomoc jest aktywnym dialogiem');
  } finally {
    await page.close().catch(() => {});
  }
}

async function runDemoCompletionSuite() {
  const {page, clockInstalled} = await newPage({clock: true});
  try {
    const demos = [
      {scene: 'airport', objectId: 'a-papkin', start: 'Uruchom transkrypcję'},
      {scene: 'bank', objectId: 'b-kmicic', start: 'Przetwórz wiadomość'},
      {scene: 'office', objectId: 'o-gerwazy', start: 'Uruchom analizę zgodności'},
      {scene: 'airport', objectId: 'a-zagloba', start: 'Uruchom wyszukiwanie'}
    ];
    for (const demo of demos) {
      await chooseScene(page, demo.scene);
      await openObject(page, demo.objectId);
      const start = page.locator('#mFoot .btn').filter({hasText: demo.start});
      await start.waitFor({state: 'visible', timeout: 2500});
      await start.click();
      await waitFor(page, `${demo.objectId} przechodzi w running`, ({objectId}) => {
        const object = App.snapshot().objects.find(candidate => candidate.id === objectId);
        return object?.demoState === 'running';
      }, 1500, {objectId: demo.objectId});
    await advance(page, DEMO_SETTLE_MS, clockInstalled);
      await waitFor(page, `${demo.objectId} kończy się wynikiem`, ({objectId}) => {
        const object = App.snapshot().objects.find(candidate => candidate.id === objectId);
        return object?.completed === true && object?.demoState === 'result';
      }, 3500, {objectId: demo.objectId});
      await closeProduct(page);
    }
  } finally {
    await page.close().catch(() => {});
  }
}

async function runCancelOnCloseSuite() {
  const {page, clockInstalled} = await newPage({clock: true});
  try {
    await chooseScene(page, 'airport');
    await openObject(page, 'a-papkin');
    await page.locator('#mFoot .btn').filter({hasText: 'Uruchom transkrypcję'}).click();
    await waitFor(page, 'Papkin running przed zamknięciem', () => App.snapshot().objects.find(object => object.id === 'a-papkin')?.demoState === 'running', 1500);
    await page.locator('#mClose').click();
    await waitFor(page, 'anulowanie demo przy zamknięciu', () => {
      const object = App.snapshot().objects.find(candidate => candidate.id === 'a-papkin');
      return object?.completed === false && object?.demoState === 'idle';
    }, 1500);
    await advance(page, DEMO_SETTLE_MS, clockInstalled);
    const after = await page.evaluate(() => App.snapshot().objects.find(object => object.id === 'a-papkin'));
    assert.equal(after.completed, false, 'zamknięte demo nie kończy się w tle');
    assert.equal(after.demoState, 'idle', 'zamknięte demo pozostaje idle');
  } finally {
    await page.close().catch(() => {});
  }
}

async function runCancelOnSwitchSuite() {
  const {page, clockInstalled} = await newPage({clock: true});
  try {
    await chooseScene(page, 'airport');
    await openObject(page, 'a-gerwazy');
    await page.locator('#mFoot .btn').filter({hasText: 'Uruchom analizę zgodności'}).click();
    await waitFor(page, 'Gerwazy running przed zmianą lokalizacji', () => App.snapshot().objects.find(object => object.id === 'a-gerwazy')?.demoState === 'running', 1500);
    await page.locator('#mClose').click();
    await page.locator('#btnSwitch').click();
    await page.locator('#cards .card[data-scene="bank"]').click();
    await waitFor(page, 'bank po zmianie lokalizacji', () => App.snapshot().sceneId === 'bank', 3000);
    await advance(page, DEMO_SETTLE_MS, clockInstalled);
    await chooseScene(page, 'airport');
    const oldScene = await page.evaluate(() => {
      const state = App.getWorldState();
      return state.completed['a-gerwazy'] === true || state.demoState['a-gerwazy'] === 'result';
    });
    assert.equal(oldScene, false, 'demo anulowane przy zmianie lokalizacji nie kończy się po przełączeniu');
  } finally {
    await page.close().catch(() => {});
  }
}

async function runKmicicReadOnlySuite() {
  const {page, clockInstalled} = await newPage({clock: true});
  try {
    await chooseScene(page, 'airport');
    await openObject(page, 'a-kmicic');
    await page.locator('#mFoot .btn').filter({hasText: 'Przetwórz wiadomość'}).click();
    await advance(page, DEMO_SETTLE_MS, clockInstalled);
    await waitFor(page, 'edytowalny draft Kmicica', () => Boolean(document.querySelector('#kmicicReply')), 3000);
    const edit = page.locator('#mFoot .btn').filter({hasText: 'Edytuj odpowiedź'});
    const send = page.locator('#mFoot .btn').filter({hasText: 'Zatwierdź i wyślij'});
    await edit.waitFor({state: 'visible', timeout: 2500});
    await send.waitFor({state: 'visible', timeout: 2500});
    await edit.click();
    await page.locator('#kmicicDraftEditor').fill('Zatwierdzona odpowiedź testowa.');
    await send.click();
    const editorState = await page.evaluate(() => {
      const editor = document.querySelector('#kmicicDraftEditor');
      if (!editor) return null;
      return {disabled: editor.disabled, readOnly: editor.readOnly, contentEditable: editor.contentEditable};
    });
    assert.ok(editorState === null || editorState.disabled || editorState.readOnly || editorState.contentEditable === 'false',
      `edytor po wysłaniu jest tylko do odczytu: ${JSON.stringify(editorState)}`);
  } finally {
    await page.close().catch(() => {});
  }
}

async function runPickerFitSuite() {
  const {page} = await newPage({viewport: SHORT_LANDSCAPE});
  try {
    assertFits(await dialogBounds(page, '#pickerOv .picker'), 'picker 667×375');
  } finally {
    await page.close().catch(() => {});
  }
}

async function runHelpFitSuite() {
  const {page} = await newPage({viewport: SHORT_LANDSCAPE});
  try {
    await chooseScene(page, 'airport');
    await page.locator('#btnHelp').click();
    await waitFor(page, 'help widoczny', () => document.querySelector('#helpOv')?.classList.contains('show'), 1500);
    assertFits(await dialogBounds(page, '#helpOv .help'), 'help 667×375');
  } finally {
    await page.close().catch(() => {});
  }
}

async function runDoneFitSuite() {
  const {page} = await newPage({viewport: SHORT_LANDSCAPE});
  try {
    await chooseScene(page, 'airport');
    await injectAllCompletedAndOpen(page);
    await page.locator('#mClose').click();
    await waitFor(page, 'done widoczne', () => document.querySelector('#doneOv')?.classList.contains('show'), 2000);
    assertFits(await dialogBounds(page, '#doneOv .done'), 'done 667×375');
  } finally {
    await page.close().catch(() => {});
  }
}

async function runFocusSuite() {
  const {page} = await newPage();
  try {
    await chooseScene(page, 'airport');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnSwitch', 'scene selection returns focus to a visible control');
    const opener = page.locator('#productList .product-card').first();
    const objectId = await opener.getAttribute('data-object-id');
    assert.ok(objectId, 'dock opener ma object-id');
    await opener.click();
    await waitFor(page, 'modal z docka', () => App.snapshot().dialog === 'product', 1500);
    await page.locator('#mClose').click();
    const focused = await page.evaluate(() => ({
      id: document.activeElement?.dataset?.objectId || null,
      connected: Boolean(document.activeElement?.isConnected),
      tag: document.activeElement?.tagName || null
    }));
    assert.equal(focused.id, objectId, `focus wraca do dock opener ${objectId}`);
    assert.equal(focused.connected, true, 'focus wraca do elementu podłączonego do DOM');
  } finally {
    await page.close().catch(() => {});
  }
}

async function runProbeSuite() {
  const {page} = await newPage();
  try {
    await chooseScene(page, 'airport');
    const result = await page.evaluate(() => {
      const before = App.probe();
      const card = document.querySelector('#productList .product-card');
      card.dataset.completed = 'true';
      const after = App.probe();
      return {before, after};
    });
    assert.equal(result.before.ok, true, `zdrowy DOM przechodzi probe: ${JSON.stringify(result.before.failures || [])}`);
    assert.equal(result.after.ok, false, 'probe wykrywa uszkodzony stan karty docka');
    assert.ok(result.after.failures.some(failure => /object-dom-contract/.test(failure)),
      `probe raportuje kontrakt karty: ${JSON.stringify(result.after.failures)}`);
  } finally {
    await page.close().catch(() => {});
  }
}

async function runCanvasFallbackSuite() {
  const {page} = await newPage();
  try {
    const renderer = await page.evaluate(() => document.querySelector('#stage')?.dataset.renderer);
    assert.equal(renderer, 'canvas', 'tryb bez CDN uruchamia canvas fallback');
    const world = await page.evaluate(() => App.world?.());
    assert.equal(world?.renderer, 'canvas', `App.world raportuje canvas: ${JSON.stringify(world)}`);
    const canvas = await page.locator('#cv').evaluate(element => ({
      width: element.width,
      height: element.height,
      cssWidth: element.getBoundingClientRect().width,
      cssHeight: element.getBoundingClientRect().height,
      hidden: getComputedStyle(element).visibility === 'hidden'
    }));
    assert.ok(canvas.width > 0 && canvas.height > 0 && canvas.cssWidth > 0 && canvas.cssHeight > 0, 'canvas fallback ma rozmiar');
    assert.equal(canvas.hidden, false, 'canvas fallback jest widoczny');

    // Canvas fallback is still animated while the floor is active, but a
    // modal must pause it.  The dataset counter is the DOM-level render
    // contract, so this catches a hidden requestAnimationFrame loop too.
    await chooseScene(page, 'airport');
    await waitFor(page, 'canvas fallback rysuje klatkę', () => Number(document.querySelector('#stage')?.dataset.canvasFrames || 0) > 0, 1500);
    await page.locator('#btnHelp').click();
    await waitFor(page, 'help otwiera się w fallbacku', () => document.querySelector('#helpOv')?.classList.contains('show'), 1500);
    await delay(120);
    const pausedBefore = Number(await page.locator('#stage').getAttribute('data-canvas-frames'));
    await delay(320);
    const pausedAfter = Number(await page.locator('#stage').getAttribute('data-canvas-frames'));
    assert.ok(Number.isFinite(pausedBefore) && pausedBefore > 0, 'canvasFrames ma licznik po pauzie');
    assert.equal(pausedAfter, pausedBefore, 'canvas fallback nie rysuje klatek po otwarciu dialogu');
  } finally {
    await page.close().catch(() => {});
  }
}

async function runWebglSuite() {
  const {page} = await newPage();
  try {
    const renderer = await page.evaluate(() => document.querySelector('#stage')?.dataset.renderer);
    assert.equal(renderer, 'webgl', 'tryb --webgl wymaga gotowego renderera WebGL');
    const world = await page.evaluate(() => App.world?.());
    assert.equal(world?.renderer, 'webgl', `App.world raportuje WebGL: ${JSON.stringify(world)}`);
    assert.ok(world?.frames > 0, `WebGL renderuje klatki: ${JSON.stringify(world)}`);
  } finally {
    await page.close().catch(() => {});
  }
}

async function runWebglContextLossSuite() {
  const {page} = await newPage();
  try {
    await chooseScene(page, 'airport');
    const capability = await page.evaluate(() => {
      const canvas = document.querySelector('#stage canvas.world-canvas');
      const gl = canvas?.getContext('webgl2');
      const extension = gl?.getExtension('WEBGL_lose_context');
      return {hasCanvas: Boolean(canvas), hasWebgl2: Boolean(gl), hasExtension: Boolean(extension)};
    });
    assert.equal(capability.hasCanvas, true, 'WebGL canvas istnieje przed utratą kontekstu');
    assert.equal(capability.hasWebgl2, true, 'software renderer udostępnia WebGL2');
    assert.equal(capability.hasExtension, true, 'software renderer udostępnia WEBGL_lose_context');
    await page.evaluate(() => {
      const canvas = document.querySelector('#stage canvas.world-canvas');
      const gl = canvas.getContext('webgl2');
      const extension = gl.getExtension('WEBGL_lose_context');
      extension.loseContext();
    });
    await waitFor(page, 'fallback po utracie kontekstu WebGL', () => document.querySelector('#stage')?.dataset.renderer === 'canvas', 2500);
    const state = await page.evaluate(() => ({
      world: App.world?.(),
      hasWorldCanvas: Boolean(document.querySelector('#stage canvas.world-canvas')),
      canvasHidden: getComputedStyle(document.querySelector('#cv')).visibility === 'hidden'
    }));
    assert.equal(state.world?.renderer, 'canvas', 'utrata kontekstu przełącza App.world na canvas');
    assert.equal(state.hasWorldCanvas, false, 'utrata kontekstu usuwa uszkodzony canvas WebGL');
    assert.equal(state.canvasHidden, false, 'po utracie kontekstu widoczny jest canvas fallback');

    // The loss path must leave the product flow usable, not just change a
    // dataset flag.  Run a short demo after the real GPU context loss.
    await openObject(page, 'a-zagloba');
    await page.locator('#mFoot .btn').filter({hasText: 'Uruchom wyszukiwanie'}).click();
    await waitFor(page, 'Zagłoba kończy demo po utracie WebGL', () => {
      const object = App.snapshot().objects.find(candidate => candidate.id === 'a-zagloba');
      return object?.completed === true && object?.demoState === 'result';
    }, 3500);
    await closeProduct(page);
  } finally {
    await page.close().catch(() => {});
  }
}

async function runWebglFrameStabilitySuite() {
  const {page} = await newPage();
  try {
    await chooseScene(page, 'airport');
    await delay(300);
    const idleBefore = await page.evaluate(() => App.world?.());
    await delay(300);
    const idleAfter = await page.evaluate(() => App.world?.());
    assert.equal(idleAfter.frames, idleBefore.frames, `idle WebGL nie renderuje ponownie bez zmiany (${idleBefore.frames} → ${idleAfter.frames})`);

    await page.locator('#btnHelp').click();
    await waitFor(page, 'help w teście pauzy WebGL', () => document.querySelector('#helpOv')?.classList.contains('show'), 1500);
    await delay(120);
    const pausedBefore = await page.evaluate(() => App.world?.());
    await delay(320);
    const pausedAfter = await page.evaluate(() => App.world?.());
    assert.equal(pausedAfter.frames, pausedBefore.frames, `paused WebGL nie renderuje ponownie (${pausedBefore.frames} → ${pausedAfter.frames})`);
  } finally {
    await page.close().catch(() => {});
  }
}

async function runWebglCameraMovementSuite() {
  const {page} = await newPage();
  try {
    await chooseScene(page, 'airport');
    await delay(250);
    const cameraBefore = await page.evaluate(() => App.world?.());
    await page.evaluate(() => App.cameraAction('left'));
    await waitFor(page, 'klatka po unieważnieniu kamery', ({before}) => App.world().frames > before.frames, 1500, {before: cameraBefore});
    const cameraAfter = await page.evaluate(() => App.world?.());
    assert.notEqual(cameraAfter.angle, cameraBefore.angle, 'akcja kamery zmienia kąt widoku');

    const playerBefore = await page.evaluate(() => ({...App.getWorldState().player}));
    const framesBeforeMovement = cameraAfter.frames;
    await page.keyboard.down('ArrowRight');
    await delay(280);
    await page.keyboard.up('ArrowRight');
    await waitFor(page, 'klatka po ruchu gracza', ({frames}) => App.world().frames > frames, 1500, {frames: framesBeforeMovement});
    const playerAfter = await page.evaluate(() => ({...App.getWorldState().player}));
    assert.notEqual(playerAfter.x, playerBefore.x, 'ruch klawiaturą zmienia pozycję gracza');
  } finally {
    await page.close().catch(() => {});
  }
}

async function runWebglSceneRebuildSuite() {
  const {page} = await newPage();
  try {
    const sequence = ['airport', 'bank', 'office', 'airport', 'bank', 'office', 'airport'];
    const samples = [];
    for (const sceneId of sequence) {
      await chooseScene(page, sceneId);
      const world = await waitFor(page, `${sceneId} ma przebudowaną geometrię`, id => {
        const snapshot = App.world?.();
        return snapshot?.sceneId === id && snapshot.geometries > 0 && snapshot.textures > 0 ? snapshot : false;
      }, 2500, sceneId);
      samples.push({sceneId, geometries: world.geometries, textures: world.textures, drawCalls: world.drawCalls});
    }
    for (const sceneId of ['airport', 'bank', 'office']) {
      const forScene = samples.filter(sample => sample.sceneId === sceneId);
      assert.ok(forScene.length >= 2, `${sceneId}: powtarzany pomiar po rebuildzie`);
      const first = forScene[0];
      for (const sample of forScene.slice(1)) {
        assert.equal(sample.geometries, first.geometries, `${sceneId}: liczba geometrii nie rośnie (${first.geometries} → ${sample.geometries})`);
        assert.equal(sample.textures, first.textures, `${sceneId}: liczba tekstur nie rośnie (${first.textures} → ${sample.textures})`);
        assert.equal(sample.drawCalls, first.drawCalls, `${sceneId}: draw calls są stabilne (${first.drawCalls} → ${sample.drawCalls})`);
      }
    }
  } finally {
    await page.close().catch(() => {});
  }
}

async function runBrandingSuite() {
  for (const width of [1280, 390, 320]) {
    const {page} = await newPage({viewport: {width, height: 844}});
    try {
      await chooseScene(page, 'airport');
      assert.equal(await page.locator('header[data-brand="quantica-lab"]').count(), 1);
      const logo = page.locator('.brand-logo img');
      await logo.evaluate(img => img.decode());
      const source = await logo.evaluate(img => img.currentSrc);
      assert.ok(source.endsWith(width <= 768 ? '/quantica-q-mark-white.png' : '/quantica-logo-white.png'));
      assert.equal(await logo.getAttribute('alt'), 'Quantica Lab');
      assert.equal(await page.locator('.brand-logo').getAttribute('href'), 'https://quanticalab.ai');
      assert.equal(await page.locator('header').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(10, 31, 44)');
      const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
      assert.ok((await page.request.get(new URL(favicon, page.url()).href)).ok());
      for (const selector of ['.brand-logo', '.brand h1', '#btnSwitch', '#btnHelp']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= width, `${width}: ${selector} fits`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (process.env.BRAND_SCREENSHOTS) await page.screenshot({path: path.join(process.env.BRAND_SCREENSHOTS, `quantica-${width}.png`)});
    } finally {
      await page.close().catch(() => {});
    }
  }
}

async function runAircraftSuite() {
  const {page} = await newPage();
  try {
    await chooseScene(page, 'airport');
    const model = await page.evaluate(() => App.world().aircraft);
    assert.ok(model, 'airport exposes aircraft geometry contract');
    for (const part of ['fuselage', 'cockpit', 'wing-left', 'wing-right', 'winglet-left', 'winglet-right', 'engine-left', 'engine-right', 'tail', 'gear-nose', 'gear-left', 'gear-right']) {
      assert.ok(model.parts.includes(part), `aircraft has ${part}`);
    }
    assert.ok(model.meshes <= 65, 'aircraft draw-call budget');
    assert.ok(model.finite, 'all aircraft vertices are finite');
    assert.ok(model.bounds.maxZ < 0, 'aircraft stays outside the walkable terminal');
    assert.ok(model.bounds.minY >= -.01, 'landing gear stays above apron');
    if (process.env.AIRCRAFT_SCREENSHOT) await page.screenshot({path: process.env.AIRCRAFT_SCREENSHOT});
  } finally { await page.close().catch(() => {}); }
}

const TESTS = [
  ['Quantica branding loads official responsive assets and fits the header', runBrandingSuite],
  ['navigation opens all 12 objects from vertical and side approaches', runNavigationSuite],
  ['completion close plus help does not race into done dialog', runCompletionRaceSuite],
  ['all demos complete with result state', runDemoCompletionSuite],
  ['closing a running demo cancels its timers', runCancelOnCloseSuite],
  ['switching location cancels a running demo', runCancelOnSwitchSuite],
  ['Kmicic editor is read-only after send', runKmicicReadOnlySuite],
  ['picker fits short landscape viewport', runPickerFitSuite],
  ['help fits short landscape viewport', runHelpFitSuite],
  ['done card fits short landscape viewport', runDoneFitSuite],
  ['focus returns to the dock opener', runFocusSuite],
  ['App.probe catches corrupted dock card state', runProbeSuite],
  [WEBGL_MODE ? 'WebGL renderer is ready without canvas fallback' : 'canvas fallback is explicit when external requests are blocked',
    WEBGL_MODE ? runWebglSuite : runCanvasFallbackSuite]
];

if (WEBGL_MODE) {
  TESTS.push(['aircraft geometry has complete jet silhouette and stays outside terminal', runAircraftSuite]);
  TESTS.push(['WebGL idle and paused frame counts stay stable', runWebglFrameStabilitySuite]);
  TESTS.push(['WebGL camera invalidation and movement produce frames', runWebglCameraMovementSuite]);
  TESTS.push(['WebGL scene rebuild geometry and textures do not accumulate', runWebglSceneRebuildSuite]);
  TESTS.push(['WebGL context loss enters canvas fallback and preserves demo flow', runWebglContextLossSuite]);
}

async function main() {
  playwright = loadPlaywright();
  threeModuleRoot = resolveThreeModuleRoot();
  if (WEBGL_MODE && process.env.THREE_MODULE_PATH && !threeModuleRoot) {
    throw new Error(`THREE_MODULE_PATH nie wskazuje katalogu z three.module.js: ${process.env.THREE_MODULE_PATH}`);
  }
  await startServer();
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oferta-browser-'));
  const executablePath = process.env.CHROME_PATH || CHROME_DEFAULT;
  const launchOptions = {
    headless: !HEADED,
    executablePath: fs.existsSync(executablePath) ? executablePath : undefined,
    timeout: 15000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking']
  };
  if (WEBGL_MODE) launchOptions.args.push('--use-gl=swiftshader', '--enable-unsafe-swiftshader');

  try {
    browserContext = await playwright.chromium.launchPersistentContext(profileDir, {
      ...launchOptions,
      viewport: DEFAULT_VIEWPORT,
      serviceWorkers: 'block'
    });
  } catch (error) {
    console.error(`HARNESS ERROR: nie można uruchomić Chromium (${error.message})`);
    process.exitCode = 2;
    return;
  }

  const results = [];
  const selectedTests = process.env.TEST_FILTER ? TESTS.filter(([name]) => name.includes(process.env.TEST_FILTER)) : TESTS;
  if (!selectedTests.length) throw new Error('TEST_FILTER did not match any tests');
  for (const [name, run] of selectedTests) {
    const startedAt = Date.now();
    try {
      await run();
      const elapsed = Date.now() - startedAt;
      results.push({name, ok: true, elapsed});
      console.log(`PASS ${name} (${elapsed} ms)`);
    } catch (error) {
      const elapsed = Date.now() - startedAt;
      results.push({name, ok: false, elapsed, error});
      console.error(`FAIL ${name} (${elapsed} ms)`);
      console.error(`  ${error.stack || error.message}`);
    }
  }
  const passed = results.filter(result => result.ok).length;
  const failed = results.length - passed;
  const localThreeNote = threeModuleRoot ? `; three=${threeModuleRoot}` : '';
  console.log(`\nSUMMARY ${passed}/${results.length} passed; ${failed} failed; mode=${WEBGL_MODE ? 'webgl' : 'canvas'}${localThreeNote}`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(`HARNESS ERROR: ${error.stack || error.message}`);
  process.exitCode = 2;
}).finally(async () => {
  await browserContext?.close().catch(() => {});
  if (profileDir) fs.rmSync(profileDir, {recursive: true, force: true});
  await closeServer();
});
