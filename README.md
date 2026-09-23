# Explore the Floor

Interactive four-location demo. Live: https://workszop.github.io/spacer/

## Run

Open `index.html` directly or serve the directory:

```sh
python3 -m http.server 8000
```

No build step.

## Verify

```sh
node tests/run.cjs
```

Browser suites (Playwright; add `--webgl` for the 3D renderer):

```sh
CHROME_PATH=/usr/bin/google-chrome node tests/browser.cjs
```

## Picker images

The location picker shows renders of each floor from `assets/floors/<scene>.jpg`. Re-render them after changing a floor's layout or 3D models:

```sh
CHROME_PATH=/usr/bin/google-chrome node tools/render-floor-images.cjs
```
