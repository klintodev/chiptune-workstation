import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_PATTERN_ID,
  DEFAULT_TRACK_ID,
  createProjectState,
} from "../src/state/project-state.js";
import { createSessionState } from "../src/state/session-state.js";
import { createWorkspaceTabs } from "../src/features/workspace-tabs/workspace-tabs.js";

class MockClassList {
  constructor(...values) {
    this.values = new Set(values);
  }

  contains(value) {
    return this.values.has(value);
  }

  toggle(value, force) {
    if (force) this.values.add(value);
    else this.values.delete(value);
    return force;
  }
}

class MockElement extends EventTarget {
  constructor(root, ...classes) {
    super();
    this.attributes = new Map();
    this.classList = new MockClassList(...classes);
    this.descendants = new Set();
    this.disabled = false;
    this.hidden = false;
    this.root = root;
    this.style = { setProperty() {} };
    this.tabIndex = 0;
    this.textContent = "";
  }

  contains(element) {
    return element === this || this.descendants.has(element);
  }

  focus() {
    this.root.activeElement = this;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

function createWorkspaceHarness({
  projectState = createProjectState(),
  sessionState = createSessionState(),
} = {}) {
  const elements = new Map();
  const root = {
    activeElement: null,
    defaultView: {
      matchMedia: () => ({ matches: true }),
    },
    ownerDocument: null,
    querySelector: (selector) => elements.get(selector) ?? null,
    querySelectorAll: () => [],
  };
  const register = (selector, ...classes) => {
    const element = new MockElement(root, ...classes);
    elements.set(selector, element);
    return element;
  };
  const arrangement = register(".arrangement-section", "arrangement-section");
  const arrangementControl = new MockElement(root);
  arrangement.descendants.add(arrangementControl);
  const clipInspector = register("#selected-clip-inspector");
  const clipInspectorControl = new MockElement(root);
  clipInspector.descendants.add(clipInspectorControl);
  const patternSelect = register("#pattern-select");
  const dawWorkspace = register(".daw-workspace", "daw-workspace");
  const editorDock = register("#editor-dock", "editor-dock");
  const collapse = register("#workspace-collapse");
  const locate = register("#dock-context-locate");
  const dockPanels = register("#dock-panels");
  register("#dock-context-dot");
  register("#dock-context-kicker");
  register("#dock-context-title");
  for (const panelId of ["sequencer", "instrument", "keyboard"]) {
    register(`#dock-panel-${panelId}`);
    register(`[role="tab"][data-panel="${panelId}"]`);
  }
  const feature = createWorkspaceTabs({
    arrangementSection: arrangement,
    projectState,
    root,
    sessionState,
  });
  return {
    arrangement,
    arrangementControl,
    clipInspectorControl,
    collapse,
    dawWorkspace,
    dockPanels,
    editorDock,
    feature,
    locate,
    patternSelect,
    projectState,
    root,
    sessionState,
  };
}

function addClip(projectState) {
  return projectState.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
}

test("an initially empty project exposes an expanded editor without arrangement controls", () => {
  const projectState = createProjectState();
  projectState.updatePattern(DEFAULT_PATTERN_ID, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => index === 0 ? { note: 60, gate: 0.75, volume: 0.8 } : step),
  }));
  const sessionState = createSessionState({
    workspace: { detailPanelCollapsed: true },
  });
  const harness = createWorkspaceHarness({ projectState, sessionState });

  assert.equal(harness.arrangement.hidden, true);
  assert.equal(harness.locate.hidden, true);
  assert.equal(harness.locate.disabled, true);
  assert.equal(harness.collapse.hidden, true);
  assert.equal(harness.collapse.disabled, true);
  assert.equal(harness.dawWorkspace.classList.contains("editor-only"), true);
  assert.equal(harness.editorDock.classList.contains("collapsed"), false);
  assert.equal(harness.dockPanels.hidden, false);
  assert.equal(sessionState.getState().workspace.detailPanelCollapsed, false);
  harness.feature.dispose();
});

test("adding the first clip restores the arrangement and its workspace controls", () => {
  const harness = createWorkspaceHarness();

  addClip(harness.projectState);

  assert.equal(harness.arrangement.hidden, false);
  assert.equal(harness.locate.hidden, false);
  assert.equal(harness.locate.disabled, false);
  assert.equal(harness.collapse.hidden, false);
  assert.equal(harness.collapse.disabled, false);
  assert.equal(harness.dawWorkspace.classList.contains("editor-only"), false);
  harness.feature.dispose();
});

test("removing the final clip restores focus from hidden arrangement-owned controls", () => {
  for (const focusSource of ["arrangementControl", "clipInspectorControl"]) {
    const projectState = createProjectState();
    const clipId = addClip(projectState);
    const sessionState = createSessionState({
      workspace: {
        activeDockPanel: focusSource === "arrangementControl" ? "instrument" : "sequencer",
      },
    });
    const harness = createWorkspaceHarness({ projectState, sessionState });
    harness.root.activeElement = harness[focusSource];

    projectState.removeClip(clipId);

    assert.equal(harness.arrangement.hidden, true);
    assert.equal(harness.root.activeElement, harness.patternSelect);
    assert.equal(sessionState.getState().workspace.activeDockPanel, "sequencer");
    assert.equal(harness.dawWorkspace.classList.contains("editor-only"), true);
    harness.feature.dispose();
  }
});

test("opening projects with and without clips updates the layout from project state", () => {
  const harness = createWorkspaceHarness();
  const arranged = createProjectState();
  addClip(arranged);

  harness.projectState.replace(arranged.getState(), { source: "open" });
  assert.equal(harness.arrangement.hidden, false);

  harness.projectState.replace(createProjectState().getState(), { source: "new" });
  assert.equal(harness.arrangement.hidden, true);
  assert.equal(harness.collapse.disabled, true);
  harness.feature.dispose();
});

test("removing the track containing the final clip returns to editor-only mode", () => {
  const projectState = createProjectState();
  addClip(projectState);
  projectState.addTrack();
  const harness = createWorkspaceHarness({ projectState });
  harness.root.activeElement = harness.arrangementControl;

  projectState.removeTrack(DEFAULT_TRACK_ID, { allowClips: true });

  assert.equal(harness.arrangement.hidden, true);
  assert.equal(harness.root.activeElement, harness.patternSelect);
  harness.feature.dispose();
});

test("editor-only workspace CSS consumes the complete workspace row", async () => {
  const styles = await readFile(
    new URL("../src/features/workspace-tabs/workspace-tabs.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /\.daw-workspace\.editor-only\s*{\s*grid-template-rows:\s*minmax\(0,\s*1fr\);/);
});
