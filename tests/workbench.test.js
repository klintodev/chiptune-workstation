import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createStoryRegistry, defineStory } from "../src/workbench/story-registry.js";

const root = new URL("../", import.meta.url);

function story(overrides = {}) {
  return defineStory({
    id: "example",
    title: "Example",
    group: "Test",
    description: "A test story.",
    source: "src/example.js",
    scenarios: [{ id: "default", title: "Default" }],
    mount: () => () => {},
    ...overrides,
  });
}

test("story registry resolves unknown selections to stable defaults", () => {
  const first = story();
  const second = story({
    id: "second",
    title: "Second",
    scenarios: [
      { id: "calm", title: "Calm" },
      { id: "busy", title: "Busy" },
    ],
  });
  const registry = createStoryRegistry([first, second]);

  assert.deepEqual(registry.resolve("second", "busy"), {
    story: second,
    scenario: second.scenarios[1],
  });
  assert.deepEqual(registry.resolve("missing", "missing"), {
    story: first,
    scenario: first.scenarios[0],
  });
});

test("story registry rejects duplicate ids", () => {
  assert.throws(() => createStoryRegistry([story(), story()]), /Duplicate story id/);
});

test("workbench is a production build entry with URL-addressable stories", async () => {
  const [build, html, app] = await Promise.all([
    readFile(new URL("scripts/build.mjs", root), "utf8"),
    readFile(new URL("workbench.html", root), "utf8"),
    readFile(new URL("src/workbench.js", root), "utf8"),
  ]);

  assert.match(build, /workbench:\s*"src\/workbench\.js"/);
  assert.match(build, /filename:\s*"workbench\.html"/);
  assert.match(html, /id="story-canvas"/);
  assert.match(html, /id="scenario-select"/);
  assert.match(app, /location\.hash/);
  assert.match(app, /disposeStory/);
});
