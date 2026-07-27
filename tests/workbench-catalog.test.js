import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";
import { stories } from "../src/workbench/story-catalog.js";
import { createStoryRegistry } from "../src/workbench/story-registry.js";

test("workbench catalog covers every user-facing feature family", async () => {
  const featureDirectories = (await readdir(new URL("../src/features/", import.meta.url), {
    withFileTypes: true,
  }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const coveredDirectories = [...new Set(stories.map((story) => (
    story.source.split("/")[2]
  )))].sort();

  assert.deepEqual(coveredDirectories, featureDirectories);
  assert.equal(stories.length, featureDirectories.length);
});

test("workbench catalog has unique addressable stories and scenarios", () => {
  const registry = createStoryRegistry(stories);
  assert.equal(new Set(stories.map(({ id }) => id)).size, stories.length);
  for (const story of stories) {
    assert.equal(new Set(story.scenarios.map(({ id }) => id)).size, story.scenarios.length);
    for (const scenario of story.scenarios) {
      assert.deepEqual(registry.resolve(story.id, scenario.id), { story, scenario });
    }
  }
});
