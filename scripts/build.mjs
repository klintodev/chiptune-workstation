import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const dist = path.join(root, "dist");
const outputDirectory = path.join(dist, "assets");
const entries = Object.freeze({
  app: "src/app.js",
  player: "src/player.js",
  "player-styles": "player.css",
  styles: "styles.css",
});
const absoluteEntries = Object.freeze(Object.fromEntries(
  Object.entries(entries).map(([name, entryPoint]) => [name, path.join(root, entryPoint)]),
));

function toWebPath(value) {
  return value.split(path.sep).join("/");
}

function emittedAsset(metafile, entryPoint) {
  const normalizedEntryPoint = path.resolve(root, entryPoint).toLowerCase();
  const match = Object.entries(metafile.outputs).find(([, metadata]) => (
    path.resolve(root, metadata.entryPoint ?? "").toLowerCase() === normalizedEntryPoint
  ));
  if (!match) throw new Error(`Build did not emit ${entryPoint}.`);
  const absoluteOutput = path.resolve(root, match[0]);
  return `./${toWebPath(path.relative(dist, absoluteOutput))}`;
}

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Could not locate ${label} in its HTML entry point.`);
  return source.replace(pattern, replacement);
}

async function writeHtml({ appAsset, cssAsset, filename, sourceFile }) {
  let html = await readFile(path.join(root, sourceFile), "utf8");
  html = replaceRequired(
    html,
    /<link rel="stylesheet" href="\.\/(?:styles|player)\.css[^"\n]*" \/>/,
    `<link rel="stylesheet" href="${cssAsset}" />`,
    "stylesheet",
  );
  html = replaceRequired(
    html,
    /<script type="module" src="\.\/src\/(?:app|player)\.js[^"\n]*"><\/script>/,
    `<script type="module" src="${appAsset}"></script>`,
    "module script",
  );
  await writeFile(path.join(dist, filename), html, "utf8");
}

await rm(dist, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

const result = await build({
  absWorkingDir: root,
  assetNames: "fonts/[name]-[hash]",
  bundle: true,
  entryNames: "[name]-[hash]",
  entryPoints: absoluteEntries,
  format: "esm",
  legalComments: "none",
  logLevel: "info",
  loader: { ".woff2": "file" },
  metafile: true,
  minify: true,
  outdir: outputDirectory,
  platform: "browser",
  sourcemap: false,
  target: ["es2022"],
});

await cp(path.join(root, "assets"), outputDirectory, { recursive: true });
await Promise.all([
  cp(path.join(root, "robots.txt"), path.join(dist, "robots.txt")),
  cp(path.join(root, "sitemap.xml"), path.join(dist, "sitemap.xml")),
]);

await Promise.all([
  writeHtml({
    appAsset: emittedAsset(result.metafile, entries.app),
    cssAsset: emittedAsset(result.metafile, entries.styles),
    filename: "index.html",
    sourceFile: "index.html",
  }),
  writeHtml({
    appAsset: emittedAsset(result.metafile, entries.player),
    cssAsset: emittedAsset(result.metafile, entries["player-styles"]),
    filename: "player.html",
    sourceFile: "player.html",
  }),
]);
