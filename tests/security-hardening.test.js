import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

import {
  MAX_PATTERN_NAME_LENGTH,
  MAX_PROJECT_PATTERNS,
  MAX_PROJECT_TITLE_LENGTH,
  MAX_TRACK_NAME_LENGTH,
  createDefaultProject,
  createProjectState,
} from "../src/state/project-state.js";
import {
  MAX_PUBLICATIONS_PER_ACCOUNT,
  PUBLICATION_SLOTS,
} from "../src/firebase/publication.js";

const root = new URL("../", import.meta.url);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) results.push(...await sourceFiles(path));
    else if (entry.name.endsWith(".js")) results.push(path);
  }
  return results;
}

test("project names and collection counts have shared security bounds", () => {
  assert.equal(MAX_PROJECT_TITLE_LENGTH, 100);
  assert.equal(MAX_PATTERN_NAME_LENGTH, 32);
  assert.equal(MAX_TRACK_NAME_LENGTH, 32);
  assert.equal(MAX_PROJECT_PATTERNS, 64);

  const title = structuredClone(createDefaultProject());
  title.metadata.title = "x".repeat(101);
  assert.throws(() => createProjectState(title), /1 to 100/);

  const pattern = structuredClone(createDefaultProject());
  pattern.patterns[0].name = "x".repeat(33);
  assert.throws(() => createProjectState(pattern), /1 to 32/);

  const track = structuredClone(createDefaultProject());
  track.tracks[0].name = "x".repeat(33);
  assert.throws(() => createProjectState(track), /1 to 32/);
});

test("publication slots expose exactly twenty server-enforceable positions", async () => {
  assert.equal(MAX_PUBLICATIONS_PER_ACCOUNT, 20);
  assert.deepEqual(PUBLICATION_SLOTS, Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(2, "0")));
  const rules = await readFile(new URL("firestore.rules", root), "utf8");
  assert.match(rules, /match \/publicationSlots\/\{slotId\}/);
  assert.match(rules, /slotMatchesAfter/);
  assert.match(rules, /publicationVersion == 2/);
  assert.match(rules, /project\.patterns\.size\(\) <= 64/);
  assert.match(rules, /project\.tracks\.size\(\) <= 8/);
  assert.match(rules, /validText\(project\.metadata\.title, 1, 100\)/);
});

test("delivery actions are immutable and Dependabot covers the supply chain", async () => {
  const workflows = await Promise.all([
    "firebase-hosting-merge.yml",
    "firebase-hosting-pull-request.yml",
    "test.yml",
  ].map((name) => readFile(new URL(`.github/workflows/${name}`, root), "utf8")));
  for (const workflow of workflows) {
    for (const line of workflow.match(/^\s*-?\s*uses:\s*.+$/gm) ?? []) {
      assert.match(line, /@[a-f0-9]{40}(?:\s+#\s+v\d+)?$/);
    }
    assert.doesNotMatch(workflow, /uses:\s*[^\s]+@v\d/);
  }
  const dependabot = await readFile(new URL(".github/dependabot.yml", root), "utf8");
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
});

test("fonts and browser policy no longer depend on Google Fonts", async () => {
  const [index, player, firebase, fonts] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("player.html", root), "utf8"),
    readFile(new URL("firebase.json", root), "utf8"),
    readFile(new URL("src/styles/fonts.css", root), "utf8"),
  ]);
  for (const source of [index, player, firebase]) {
    assert.doesNotMatch(source, /fonts\.(?:googleapis|gstatic)\.com/);
  }
  assert.match(fonts, /silkscreen-latin-400\.woff2/);
  assert.match(fonts, /vt323-latin-400\.woff2/);
  for (const name of ["silkscreen-latin-400.woff2", "silkscreen-latin-700.woff2", "vt323-latin-400.woff2"]) {
    assert.ok((await stat(new URL(`assets/fonts/${name}`, root))).size > 1_000);
  }
  const config = JSON.parse(firebase);
  const csp = config.hosting.headers.find(({ source }) => source === "**")
    .headers.find(({ key }) => key === "Content-Security-Policy").value;
  assert.match(csp, /style-src-elem 'self' 'sha256-/);
  assert.match(csp, /img-src 'self' data: blob: https:\/\/\*\.googleusercontent\.com/);
  assert.doesNotMatch(csp, /img-src[^;]*https:;/);
});

test("dynamic values are not interpolated into innerHTML", async () => {
  const files = await sourceFiles(new URL("src/", root));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /innerHTML\s*=\s*`[^`]*\$\{/s, file.pathname);
  }
});
