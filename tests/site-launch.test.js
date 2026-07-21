import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

function pngDimensions(image) {
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

function relativeLuminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrast(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("the workstation exposes launch-ready search and sharing metadata", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /<title>Klinto Studio — Make Chiptunes in Your Browser<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/studio\.klinto\.dev\/"/);
  assert.match(html, /property="og:image" content="https:\/\/studio\.klinto\.dev\/assets\/brand\/social-preview\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /<h1>Klinto Studio<\/h1>/);
  assert.match(html, /aria-label="Master output volume"/);
});

test("the social preview has the recommended 1200 by 630 dimensions", async () => {
  const image = await readFile(new URL("assets/brand/social-preview.png", root));
  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
  assert.deepEqual(pngDimensions(image), { width: 1200, height: 630 });
  for (const [file, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]]) {
    const icon = await readFile(new URL(`assets/brand/${file}`, root));
    assert.deepEqual(pngDimensions(icon), { width: size, height: size });
  }
});

test("light-theme accent and muted text colours meet normal-text contrast", async () => {
  const css = await readFile(new URL("src/features/theme/theme.css", root), "utf8");
  const lightTheme = css.match(/:root\[data-theme="light"\]\s*{([^}]+)}/)[1];
  const token = (name) => lightTheme.match(new RegExp(`--${name}:\\s*(#[\\da-f]{6})`, "i"))[1];
  assert.ok(contrast(token("accent"), token("panel")) >= 4.5);
  assert.ok(contrast(token("muted"), token("panel")) >= 4.5);
});

test("the light theme removes scanlines and the project library omits JSON export", async () => {
  const [baseCss, html] = await Promise.all([
    readFile(new URL("src/styles/base.css", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
  ]);
  assert.match(baseCss, /:root\[data-theme="light"\]\s+body::before\s*{\s*display:\s*none;/);
  assert.doesNotMatch(html, /id="project-export"/);
  assert.match(html, /class="global-transport"[\s\S]*id="playback-mode"[\s\S]*class="global-status"/);
});

test("arrangement lanes and clips inherit their track colour without losing selection", async () => {
  const css = await readFile(new URL("src/features/arranger/arranger.css", root), "utf8");
  assert.match(css, /\.track-name-input\s*{[^}]*color:\s*var\(--track-color\)/);
  assert.match(css, /\.track-volume input\s*{[^}]*accent-color:\s*var\(--track-color\)/);
  assert.match(css, /\.track-lane\s*{[^}]*var\(--track-color\)/);
  assert.match(css, /\.arrangement-clip\s*{[^}]*border:[^;}]*var\(--track-color\)[^}]*color:\s*var\(--track-color\)/);
  assert.match(css, /\.arrangement-clip\.selected\s*{[^}]*var\(--track-color\)[^}]*var\(--accent\)/);
});

test("the add-track action follows the final arrangement lane", async () => {
  const [css, view] = await Promise.all([
    readFile(new URL("src/features/arranger/arranger.css", root), "utf8"),
    readFile(new URL("src/features/arranger/arrangement-view.js", root), "utf8"),
  ]);
  assert.match(view, /labelMeta\.append\(count\)/);
  assert.match(view, /rows\.push\(createAddTrackRow\(\)\)/);
  assert.match(css, /\.arrangement-add-track-cell\s*{[^}]*position:\s*sticky/);
});

test("Firebase Hosting serves security headers and fresh HTML", async () => {
  const config = JSON.parse(await readFile(new URL("firebase.json", root), "utf8"));
  const security = config.hosting.headers.find(({ source }) => source === "**");
  const html = config.hosting.headers.find(({ source }) => source === "**/*.html");
  assert.match(security.headers.find(({ key }) => key === "Content-Security-Policy").value, /frame-ancestors 'none'/);
  assert.equal(security.headers.find(({ key }) => key === "X-Content-Type-Options").value, "nosniff");
  assert.match(html.headers.find(({ key }) => key === "Cache-Control").value, /no-cache/);
});
