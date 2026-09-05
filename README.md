# Explore the Floor

Repository: [workszop/spacer](https://github.com/workszop/spacer). Live demo: [GitHub Pages](https://workszop.github.io/spacer/).

An explorable, three-location product simulation for Papkin, Kmicic, Gerwazy, and Zagłoba: twelve contextual workstation demos.

The airport has a glazed terminal, aircraft, departures board and boarding gate. The bank has a teller counter, ATM and vault. Local administration has a civic facade, Polish flag, noticeboard and council chamber. [Shared location plans](/home/andrzey/git-claude/oferta/location-layouts.js) keep the rendered environment and collision geometry in sync.

Zagłoba demonstrates source-backed answers, permission restrictions and abstention when sources do not cover a question. Its features follow the [official product description](https://quanticalab.ai/zagloba_website.html); all questions, documents and answers in the demo are illustrative fixtures, not operational, financial or legal guidance.

## Run

Open [the app](/home/andrzey/git-claude/oferta/index.html) directly, or serve this directory:

```sh
python3 -m http.server 8000
```

No build step. [The world renderer](/home/andrzey/git-claude/oferta/game-world.js) provides procedural Three.js environments and shared obstacle-aware navigation. Three.js 0.180.0 and fonts load from CDNs. If 3D cannot load or WebGL is lost, the original canvas renderer remains available and the product demos still work.

## Publishing

Pushes to `master` deploy through the [Pages workflow](/home/andrzey/git-claude/oferta/.github/workflows/pages.yml). Only the HTML entry point, its two sibling JavaScript files and brand assets are published; local specs, tests, and documentation are not included in the website artifact.

Official Quantica Lab white wordmark and Q mark in `assets/brand/` come from the local Quantica `qweb` brand kit, unchanged. The favicon embeds the same Q artwork on Quantica navy. Desktop uses the full wordmark; mobile uses the Q mark. Scene artwork and product copy remain independent of the app's brand tokens.

## Controls

- WASD / arrows: walk relative to the camera.
- Click floor: navigate around obstacles.
- Click a workstation or its marker: walk over and open its demo.
- E: open the nearby workstation.
- N: jump to the next incomplete workstation for presentations.
- Mouse wheel / camera buttons: zoom; right-drag / camera buttons: rotate.
- Escape: close a panel. Product dock: direct presenter access.

Opening a workstation marks it visited. Completion requires its demo result. Progress is retained per location for the current page session. All sending, exporting, correspondence, and compliance outcomes are explicitly simulated.

## Verify

```sh
node /home/andrzey/git-claude/oferta/tests/run.cjs
```

The [deterministic runner](/home/andrzey/git-claude/oferta/tests/run.cjs) checks obstacle detours, path segment clearance, cache invalidation, invalid destinations, interaction distance, camera-relative controls, all twelve workstations, distinct landmark identities, clutter budgets, product links and content-preservation invariants. It requires only Node.js.

The [browser suite](/home/andrzey/git-claude/oferta/tests/browser.cjs) requires Playwright and Chromium, used only for development verification:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright \
CHROME_PATH=/usr/bin/google-chrome \
node /home/andrzey/git-claude/oferta/tests/browser.cjs
```

Omit `CHROME_PATH` to use an available browser. Add `--webgl` to verify real 3D rendering and context-loss recovery; the default suite deliberately blocks external requests to verify the canvas fallback. To avoid CDN dependency in WebGL tests, set `THREE_MODULE_PATH` to the `build` directory of an installed `three@0.180.0` package. The harness starts an isolated local server and temporary browser profile and cleans both up. [CI](/home/andrzey/git-claude/oferta/.github/workflows/test.yml) runs deterministic, canvas-browser and WebGL checks without adding a build step or runtime dependencies to the app.

The help panel's **Diagnostyka demo** runs the same read-only DOM/state probe exposed as `App.probe()` for browser automation. `App.snapshot()` exposes workstation states; `App.world()` exposes renderer mode, camera state, and frame count. A mismatch between product-card `data-*` attributes and application state fails the probe.

`App.state.progress` keeps one progress record per location; completion survives closing or replaying a demo, while running timers are cancelled on close or scene change. Dialogs are mutually exclusive and make the background inert. `App.world()` also exposes draw-call and GPU-resource counts. Unchanged 3D frames are skipped; the canvas fallback is capped at 30 fps and stops repainting unchanged scenes behind dialogs. Navigation caches are invalidated when collision geometry changes.
