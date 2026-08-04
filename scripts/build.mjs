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
  "rollback-app": "src/rollback-app.js",
  "player-styles": "player.css",
  styles: "styles.css",
  workbench: "src/workbench.js",
  "workbench-styles": "workbench.css",
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

function assertCanonicalModuleIdentities(metafile) {
  const identities = new Map();
  for (const input of Object.keys(metafile.inputs)) {
    if (!input.endsWith(".js")) continue;
    if (input.includes("?")) {
      throw new Error(`Build input must use a canonical module specifier: ${input}`);
    }
    const identity = path.resolve(root, input).toLowerCase();
    const previous = identities.get(identity);
    if (previous && previous !== input) {
      throw new Error(`Build resolved one module through multiple identities: ${previous}, ${input}`);
    }
    identities.set(identity, input);
  }
}

async function writeHtml({ appAsset, cssAsset, filename, sourceFile }) {
  let html = await readFile(path.join(root, sourceFile), "utf8");
  html = replaceRequired(
    html,
    /<link rel="stylesheet" href="\.\/(?:styles|player|workbench)\.css[^"\n]*" \/>/,
    `<link rel="stylesheet" href="${cssAsset}" />`,
    "stylesheet",
  );
  html = replaceRequired(
    html,
    /<script type="module" src="\.\/src\/(?:app|player|workbench)\.js[^"\n]*"><\/script>/,
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
  chunkNames: "chunks/[name]-[hash]",
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
  splitting: true,
  target: ["es2022"],
});

assertCanonicalModuleIdentities(result.metafile);

const staticAssets = path.join(root, "assets");
await cp(staticAssets, outputDirectory, {
  filter(source) {
    const relative = path.relative(staticAssets, source);
    return relative !== "fonts" && !relative.startsWith(`fonts${path.sep}`);
  },
  recursive: true,
});
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
    appAsset: emittedAsset(result.metafile, entries["rollback-app"]),
    cssAsset: emittedAsset(result.metafile, entries.styles),
    filename: "studio-v1-rollback.html",
    sourceFile: "index.html",
  }),
  writeHtml({
    appAsset: emittedAsset(result.metafile, entries.player),
    cssAsset: emittedAsset(result.metafile, entries["player-styles"]),
    filename: "player.html",
    sourceFile: "player.html",
  }),
  writeHtml({
    appAsset: emittedAsset(result.metafile, entries.workbench),
    cssAsset: emittedAsset(result.metafile, entries["workbench-styles"]),
    filename: "workbench.html",
    sourceFile: "workbench.html",
  }),
]);
