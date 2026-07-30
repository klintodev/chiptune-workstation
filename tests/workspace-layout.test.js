import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_PATTERN_ID,
  DEFAULT_TRACK_ID,
  createProjectState,
} from "../src/state/project-state.js";
import { createPatternLibrary } from "../src/features/arranger/pattern-library.js";
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
    this.isConnected = true;
    this.open = false;
    this.options = [];
    this.value = "";
  }

  contains(element) {
    return element === this || this.descendants.has(element);
  }

  blur() {}

  click() {
    this.dispatchEvent(new Event("click"));
  }

  close() {
    this.open = false;
  }

  focus() {
    this.root.activeElement = this;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  replaceChildren(...children) {
    this.options = children;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  showModal() {
    this.open = true;
  }
}

function createWorkspaceHarness({
  projectState = createProjectState(),
  sessionState = createSessionState(),
} = {}) {
  const elements = new Map();
  const root = {
    activeElement: null,
    createElement: () => new MockElement(root),
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
  const panels = new Map();
  const tabs = new Map();
  for (const panelId of ["sequencer", "instrument", "keyboard"]) {
    panels.set(panelId, register(`#dock-panel-${panelId}`));
    tabs.set(panelId, register(`[role="tab"][data-panel="${panelId}"]`));
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
    panels,
    tabs,
  };
}

function createPatternLibraryHarness({ projectState, sessionState }) {
  const elements = new Map();
  const root = {
    activeElement: null,
    createElement: () => new MockElement(root),
    querySelector: (selector) => elements.get(selector) ?? null,
  };
  const register = (selector) => {
    const element = new MockElement(root);
    elements.set(selector, element);
    return element;
  };
  for (const selector of [
    "#pattern-new",
    "#pattern-delete",
    "#pattern-delete-cancel",
    "#pattern-delete-confirm",
    "#pattern-delete-dialog",
    "#pattern-delete-message",
    "#pattern-name",
    "#place-pattern",
    "#place-start",
    "#place-track-name",
    "#pattern-root-octave",
    "#pattern-select",
    "#pattern-usage",
    "#pattern-variation",
  ]) register(selector);
  const feature = createPatternLibrary({ projectState, root, sessionState });
  return {
    feature,
    place: elements.get("#place-pattern"),
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
    workspace: { activeDockPanel: "instrument", detailPanelCollapsed: true },
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
  assert.equal(sessionState.getState().workspace.activeDockPanel, "sequencer");
  assert.equal(harness.tabs.get("sequencer").getAttribute("aria-selected"), "true");

  harness.feature.select("instrument");
  assert.equal(sessionState.getState().workspace.activeDockPanel, "instrument");
  assert.equal(harness.panels.get("instrument").hidden, false);
  harness.feature.select("keyboard");
  assert.equal(sessionState.getState().workspace.activeDockPanel, "keyboard");
  assert.equal(harness.panels.get("keyboard").hidden, false);
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

test("the real Add loop control reveals and selects the first arrangement clip", () => {
  const projectState = createProjectState();
  projectState.updatePattern(DEFAULT_PATTERN_ID, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => (
      index === 0 ? { note: 60, gate: 0.75, volume: 0.8 } : step
    )),
  }));
  const sessionState = createSessionState();
  const workspace = createWorkspaceHarness({ projectState, sessionState });
  const patternLibrary = createPatternLibraryHarness({ projectState, sessionState });

  assert.equal(patternLibrary.place.disabled, false);
  assert.equal(patternLibrary.place.classList.contains("place-pattern-primary"), true);
  patternLibrary.place.click();

  const [createdClip] = projectState.getState().tracks[0].clips;
  assert.ok(createdClip);
  assert.equal(sessionState.getState().workspace.selectedClipId, createdClip.id);
  assert.equal(workspace.arrangement.hidden, false);
  assert.equal(patternLibrary.place.classList.contains("place-pattern-primary"), false);
  patternLibrary.feature.dispose();
  workspace.feature.dispose();
});
test("removing the final clip restores focus from hidden arrangement-owned controls", () => {
  for (const focusSource of ["arrangementControl", "clipInspectorControl", "locate", "collapse"]) {
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

test("removing the final clip from collapsed Instrument expands and selects Pattern", () => {
  const projectState = createProjectState();
  const clipId = addClip(projectState);
  const sessionState = createSessionState({
    workspace: { activeDockPanel: "instrument", detailPanelCollapsed: true },
  });
  const harness = createWorkspaceHarness({ projectState, sessionState });
  harness.root.activeElement = harness.panels.get("instrument");

  projectState.removeClip(clipId);

  const workspace = sessionState.getState().workspace;
  assert.equal(workspace.activeDockPanel, "sequencer");
  assert.equal(workspace.detailPanelCollapsed, false);
  assert.equal(harness.tabs.get("sequencer").getAttribute("aria-selected"), "true");
  assert.equal(harness.tabs.get("instrument").getAttribute("aria-selected"), "false");
  assert.equal(harness.panels.get("sequencer").hidden, false);
  assert.equal(harness.panels.get("instrument").hidden, true);
  assert.equal(harness.dockPanels.hidden, false);
  assert.equal(harness.root.activeElement, harness.patternSelect);
  harness.feature.dispose();
});
test("opening projects with and without clips updates the layout from project state", () => {
  const harness = createWorkspaceHarness();
  const arranged = createProjectState();
  addClip(arranged);

  harness.projectState.replace(arranged.getState(), { source: "open" });
  assert.equal(harness.arrangement.hidden, false);

  harness.feature.select("instrument");
  harness.projectState.replace(createProjectState().getState(), { operation: "open-project" });
  assert.equal(harness.arrangement.hidden, true);
  assert.equal(harness.collapse.disabled, true);
  assert.equal(harness.sessionState.getState().workspace.activeDockPanel, "sequencer");
  assert.equal(harness.tabs.get("sequencer").getAttribute("aria-selected"), "true");

  harness.feature.select("keyboard");
  harness.projectState.replace(createProjectState().getState(), { source: "new" });
  assert.equal(harness.sessionState.getState().workspace.activeDockPanel, "sequencer");
  assert.equal(harness.panels.get("sequencer").hidden, false);
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

test("editor-only sizing keeps a compact composer and fills responsive viewports", async () => {
  const [workspaceStyles, patternStyles, html] = await Promise.all([
    readFile(new URL("../src/features/workspace-tabs/workspace-tabs.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/pattern-editor/pattern-editor.css", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
  ]);

  assert.match(
    workspaceStyles,
    /\.daw-workspace\.editor-only\s*{\s*grid-template-rows:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(
    workspaceStyles,
    /@media \(max-width: 900px\)[\s\S]*\.daw-workspace\.editor-only\s*{[\s\S]*display:\s*grid;[\s\S]*min-height:\s*calc\(100dvh - var\(--global-bar-height\)\);/,
  );
  assert.match(
    patternStyles,
    /\.daw-workspace\.editor-only \.pattern-workspace\s*{[^}]*height:\s*340px;[^}]*max-height:\s*340px;/,
  );
  assert.match(
    patternStyles,
    /@media \(max-width: 900px\)[\s\S]*\.daw-workspace\.editor-only \.pattern-workspace\s*{[^}]*height:\s*270px;/,
  );
  assert.doesNotMatch(html, /song-play-(?:help|message|next)|Go to Add loop|Song needs this loop/);
});
