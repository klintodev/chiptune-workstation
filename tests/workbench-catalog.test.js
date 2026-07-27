import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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

test("arranger story contains its absolute production stage", async () => {
  const storyStyles = await readFile(
    new URL("../src/workbench/workbench-stories.css", import.meta.url),
    "utf8",
  );

  assert.match(storyStyles, /\.story-arranger \.arrangement-stage\s*\{[^}]*position:\s*relative;[^}]*inset:\s*auto;/);
});

test("workspace tabs story uses the production tab-bar structure", async () => {
  const workspaceStory = await readFile(
    new URL("../src/workbench/stories/workspace-tabs.story.js", import.meta.url),
    "utf8",
  );

  assert.match(workspaceStory, /class="editor-tabbar"/);
  assert.match(workspaceStory, /class="dock-actions"/);
  assert.match(workspaceStory, /class="story-arrangement-source"/);
  assert.match(workspaceStory, /class="arrangement-clip story-source-clip"/);
  assert.doesNotMatch(workspaceStory, /class="arrangement-stage"/);
  assert.doesNotMatch(workspaceStory, /editor-dock-header/);
});

test("dialog and visual stories use scoped workbench presentation", async () => {
  const [audioStory, storyStyles] = await Promise.all([
    readFile(
      new URL("../src/workbench/stories/audio-status.story.js", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/workbench/workbench-stories.css", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(audioStory, /displayStoryDialog\(root, root\.querySelector\("#audio-setup"\)\)/);
  assert.match(storyStyles, /\.story-frame \.audio-setup\[open\][^{]*\{[^}]*backdrop-filter:\s*none;/);
  assert.match(storyStyles, /\.story-help-term\s*\{/);
  assert.match(storyStyles, /\.story-visualiser-workspace \.visualiser-dock\s*\{/);
  assert.match(storyStyles, /\.story-viewport:is\(\[data-viewport="tablet"\], \[data-viewport="mobile"\]\) \.story-workspace-shell \.editor-tabbar\s*\{/);
  assert.match(storyStyles, /\.story-viewport\[data-viewport="mobile"\] \.visualiser-dock-body\s*\{/);
  assert.match(storyStyles, /\.story-viewport:is\(\[data-viewport="tablet"\], \[data-viewport="mobile"\]\) \.device-rack\s*\{/);
});
