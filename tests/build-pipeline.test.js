import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("HTML establishes a dark first paint before external styles", async () => {
  for (const filename of ["index.html", "player.html"]) {
    const html = await readFile(new URL(filename, root), "utf8");
    const critical = html.indexOf('id="critical-startup"');
    const stylesheet = html.indexOf('rel="stylesheet"');

    assert.ok(critical > 0, `${filename} needs inline startup styles.`);
    assert.ok(critical < stylesheet, `${filename} must apply startup styles before external CSS.`);
    assert.match(html, /body > \* \{ visibility: hidden;/);
    assert.match(html, /critical-reveal 0s 3s forwards/);
  }

  const [base, player] = await Promise.all([
    readFile(new URL("src/styles/base.css", root), "utf8"),
    readFile(new URL("player.css", root), "utf8"),
  ]);
  assert.match(base, /body > \* \{ visibility: visible; animation: none; \}/);
  assert.match(player, /body > \* \{ visibility: visible; animation: none; \}/);
});

test("production build bundles pages and Firebase serves only generated output", async () => {
  const [configuration, packageFile, styles] = await Promise.all([
    readFile(new URL("firebase.json", root), "utf8").then(JSON.parse),
    readFile(new URL("package.json", root), "utf8").then(JSON.parse),
    readFile(new URL("styles.css", root), "utf8"),
  ]);

  assert.equal(packageFile.scripts.build, "node scripts/build.mjs");
  assert.match(packageFile.scripts.check, /^npm run build/);
  assert.equal(configuration.hosting.public, "dist");
  const immutable = configuration.hosting.headers.find(({ source }) => source === "**/*.@(js|css|woff2)");
  assert.match(immutable.headers[0].value, /immutable/);

  for (const stylesheet of ["account", "audio-export", "publishing"]) {
    assert.match(styles, new RegExp(`${stylesheet}\\.css`));
  }
});

test("the Studio entry point does not mount or style the visualiser", async () => {
  const [app, html, styles] = await Promise.all([
    readFile(new URL("src/app.js", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("styles.css", root), "utf8"),
  ]);

  assert.doesNotMatch(app, /createVisualiserFeature|features\/visualiser/);
  assert.doesNotMatch(html, /visualiser-(?:dock|dialog|open)/);
  assert.doesNotMatch(styles, /features\/visualiser|visualiser\.css/);
});

test("source modules use canonical identities and production assets are fingerprinted once", async () => {
  const sourceFiles = [
    new URL("src/", root),
  ];
  const pending = [...sourceFiles];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) pending.push(url);
      else if (entry.name.endsWith(".js")) {
        assert.doesNotMatch(await readFile(url, "utf8"), /(?:from\s+|import\()["'][^"']+\?v=/);
      }
    }
  }

  const fontFiles = await readdir(new URL("dist/assets/fonts/", root));
  assert.ok(fontFiles.length > 0);
  assert.ok(fontFiles.every((filename) => /-[A-Z0-9]+\.woff2$/i.test(filename)));
  assert.equal(fontFiles.some((filename) => filename === "vt323-latin-400.woff2"), false);
});
