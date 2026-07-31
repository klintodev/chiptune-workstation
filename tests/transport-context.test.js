import assert from "node:assert/strict";
import test from "node:test";

import {
  createTransportControls,
  hasArrangementClips,
  hasPlayablePattern,
} from "../src/features/arranger/transport-controls.js";
import {
  DEFAULT_PATTERN_ID,
  DEFAULT_TRACK_ID,
  createProjectState,
} from "../src/state/project-state.js";
import { createSessionState } from "../src/state/session-state.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
test.after(() => {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
});

class MockClassList {
  constructor() {
    this.values = new Set();
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
  constructor(root) {
    super();
    this.attributes = new Map();
    this.classList = new MockClassList();
    this.disabled = false;
    this.hidden = false;
    this.open = false;
    this.root = root;
    this.textContent = "";
    this.title = "";
    this.value = "";
  }

  blur() {
    if (this.root.activeElement === this) this.root.activeElement = null;
  }

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

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  showModal() {
    this.open = true;
  }
}

function createScheduler({
  bpm = 120,
  mode = "arrangement",
  retainedStepIndex = 0,
  status = "stopped",
} = {}) {
  const events = new EventTarget();
  let state = { bpm, mode, retainedStepIndex, status };
  let stopCount = 0;
  const playCalls = [];

  function emit(detail = {}) {
    events.dispatchEvent(new CustomEvent("statechange", { detail }));
  }

  const scheduler = {
    addEventListener: events.addEventListener.bind(events),
    getPlayheadStep: () => state.retainedStepIndex,
    getState: () => Object.freeze({ ...state }),
    get playCalls() {
      return [...playCalls];
    },
    get stopCount() {
      return stopCount;
    },
    pause() {
      if (state.status !== "playing") return false;
      state = { ...state, status: "paused" };
      emit();
      return true;
    },
    play(nextMode = state.mode) {
      if (state.status === "playing") return false;
      playCalls.push(nextMode);
      state = { ...state, mode: nextMode, status: "playing" };
      emit();
      return true;
    },
    removeEventListener: events.removeEventListener.bind(events),
    setBpm(nextBpm) {
      if (state.bpm === nextBpm) return false;
      state = { ...state, bpm: nextBpm };
      emit();
      return true;
    },
    setMode(nextMode) {
      if (state.mode === nextMode) return false;
      if (state.status !== "stopped") scheduler.stop();
      state = {
        ...state,
        mode: nextMode,
        retainedStepIndex: nextMode === "pattern" ? 0 : state.retainedStepIndex,
      };
      emit();
      return true;
    },
    setStartStep(nextStep) {
      state = { ...state, retainedStepIndex: nextStep };
      emit();
      return true;
    },
    stop() {
      if (state.status === "stopped") return false;
      stopCount += 1;
      state = {
        ...state,
        retainedStepIndex: state.mode === "pattern" ? 0 : state.retainedStepIndex,
        status: "stopped",
      };
      emit();
      return true;
    },
  };
  return scheduler;
}

function createTransportHarness({
  projectState = createProjectState(),
  scheduler = createScheduler(),
  sessionState = createSessionState(),
} = {}) {
  const root = new EventTarget();
  const elements = new Map();
  root.activeElement = null;
  root.querySelector = (selector) => elements.get(selector) ?? null;
  const register = (selector) => {
    const element = new MockElement(root);
    elements.set(selector, element);
    return element;
  };
  for (const selector of [
    "#transport-loop",
    "#master-volume",
    "#master-volume-value",
    "#mobile-master-volume",
    "#mobile-master-volume-value",
    "#mobile-mix-close",
    "#mobile-mix-dialog",
    "#mobile-mix-done",
    "#mobile-mix-open",
    "#mobile-playback-mode",
    "#mobile-playback-mode-control",
    "#mobile-tempo",
    "#playback-mode",
    "#playback-mode-control",
    "#transport-play",
    "#transport-play-note-help",
    "#project-title",
    "#transport-start",
    "#transport-status",
    "#transport-stop",
    "#tempo",
    "#tempo-value",
    "#workstation-status",
  ]) register(selector);
  const feature = createTransportControls({
    audioEngine: { isReady: () => true },
    projectState,
    root,
    scheduler,
    sessionState,
  });
  return {
    elements,
    feature,
    projectState,
    root,
    scheduler,
    sessionState,
  };
}

function addNote(projectState, patternId = DEFAULT_PATTERN_ID) {
  projectState.updatePattern(patternId, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => (
      index === 0 ? { note: 60, gate: 0.75, volume: 0.8 } : step
    )),
  }));
}

function createArrangedProject() {
  const projectState = createProjectState();
  addNote(projectState);
  const clipId = projectState.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  return { clipId, projectState };
}

test("an empty project starts in Pattern mode with arrangement-only controls unavailable", () => {
  const harness = createTransportHarness();
  const mode = harness.elements.get("#playback-mode");
  const modeControl = harness.elements.get("#playback-mode-control");
  const mobileMode = harness.elements.get("#mobile-playback-mode");
  const mobileModeControl = harness.elements.get("#mobile-playback-mode-control");
  const loop = harness.elements.get("#transport-loop");
  const play = harness.elements.get("#transport-play");

  assert.equal(hasArrangementClips(harness.projectState.getState()), false);
  assert.equal(harness.scheduler.getState().mode, "pattern");
  assert.equal(harness.sessionState.getState().workspace.playbackMode, "pattern");
  assert.equal(mode.value, "pattern");
  assert.equal(modeControl.hidden, true);
  assert.equal(mode.disabled, true);
  assert.equal(mobileModeControl.hidden, true);
  assert.equal(mobileMode.disabled, true);
  assert.equal(loop.hidden, true);
  assert.equal(loop.disabled, true);
  assert.equal(play.disabled, true);
  assert.equal(play.getAttribute("aria-label"), "Play pattern");
  assert.equal(play.getAttribute("aria-describedby"), "transport-play-note-help");
  assert.equal(harness.elements.get("#transport-play-note-help").hidden, false);
  assert.equal(harness.elements.get("#transport-status").textContent, "Pattern · Stopped · step 001");

  harness.sessionState.setWorkspace({ playbackMode: "arrangement" });
  assert.equal(harness.sessionState.getState().workspace.playbackMode, "pattern");
  assert.equal(harness.scheduler.getState().mode, "pattern");
  harness.feature.dispose();
});

test("the first note enables Pattern playback and existing stop controls", () => {
  const harness = createTransportHarness();
  const play = harness.elements.get("#transport-play");
  const stop = harness.elements.get("#transport-stop");
  const start = harness.elements.get("#transport-start");

  addNote(harness.projectState);

  assert.equal(hasPlayablePattern(harness.projectState.getState(), DEFAULT_PATTERN_ID), true);
  assert.equal(play.disabled, false);
  assert.equal(play.getAttribute("aria-describedby"), null);
  assert.equal(harness.elements.get("#transport-play-note-help").hidden, true);
  play.click();
  assert.deepEqual(harness.scheduler.playCalls, ["pattern"]);
  assert.equal(harness.scheduler.getState().status, "playing");
  assert.equal(play.getAttribute("aria-label"), "Pause pattern");
  assert.equal(stop.disabled, false);
  assert.equal(start.disabled, false);

  stop.click();
  assert.equal(harness.scheduler.getState().status, "stopped");
  play.click();
  start.click();
  assert.equal(harness.scheduler.getState().status, "stopped");
  assert.equal(harness.scheduler.getState().mode, "pattern");
  harness.feature.dispose();
});

test("adding the first clip keeps active Pattern playback and restores arrangement controls", () => {
  const harness = createTransportHarness();
  addNote(harness.projectState);
  harness.elements.get("#transport-play").click();

  const stopCount = harness.scheduler.stopCount;
  harness.projectState.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  harness.projectState.updatePattern(DEFAULT_PATTERN_ID, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => (
      index === 1 ? { note: 64, gate: 0.75, volume: 0.8 } : step
    )),
  }));

  assert.equal(harness.scheduler.getState().mode, "pattern");
  assert.equal(harness.scheduler.getState().status, "playing");
  assert.equal(harness.scheduler.stopCount, stopCount);
  assert.equal(harness.sessionState.getState().workspace.playbackMode, "pattern");
  assert.equal(harness.elements.get("#playback-mode-control").hidden, false);
  assert.equal(harness.elements.get("#playback-mode").disabled, false);
  assert.equal(harness.elements.get("#transport-loop").hidden, false);
  assert.equal(harness.elements.get("#transport-loop").disabled, false);
  harness.feature.dispose();
});

test("final clip removal selects Pattern and only stops active Song playback", async (t) => {
  await t.test("Song stopped", () => {
    const { clipId, projectState } = createArrangedProject();
    const scheduler = createScheduler({ mode: "arrangement", status: "stopped" });
    const harness = createTransportHarness({ projectState, scheduler });

    projectState.removeClip(clipId);

    assert.equal(scheduler.getState().mode, "pattern");
    assert.equal(scheduler.getState().status, "stopped");
    assert.equal(scheduler.stopCount, 0);
    assert.equal(harness.elements.get("#playback-mode-control").hidden, true);
    harness.feature.dispose();
  });

  await t.test("Song playing", () => {
    const { clipId, projectState } = createArrangedProject();
    const scheduler = createScheduler({ mode: "arrangement", status: "playing" });
    const harness = createTransportHarness({ projectState, scheduler });

    projectState.removeClip(clipId);

    assert.equal(scheduler.getState().mode, "pattern");
    assert.equal(scheduler.getState().status, "stopped");
    assert.equal(scheduler.stopCount, 1);
    assert.equal(harness.sessionState.getState().workspace.playbackMode, "pattern");
    harness.feature.dispose();
  });

  await t.test("Pattern playing", () => {
    const { clipId, projectState } = createArrangedProject();
    const scheduler = createScheduler({ mode: "pattern", status: "playing" });
    const sessionState = createSessionState({ workspace: { playbackMode: "pattern" } });
    const harness = createTransportHarness({ projectState, scheduler, sessionState });

    projectState.removeClip(clipId);

    assert.equal(scheduler.getState().mode, "pattern");
    assert.equal(scheduler.getState().status, "playing");
    assert.equal(scheduler.stopCount, 0);
    harness.feature.dispose();
  });
});

test("empty and arranged project switching preserves valid modes", () => {
  const harness = createTransportHarness();
  const arranged = createArrangedProject().projectState.getState();

  harness.projectState.replace(arranged, { operation: "open-project" });
  assert.equal(harness.elements.get("#playback-mode-control").hidden, false);
  assert.equal(harness.scheduler.getState().mode, "pattern");

  const mode = harness.elements.get("#playback-mode");
  mode.value = "arrangement";
  mode.dispatchEvent(new Event("change"));
  assert.equal(harness.scheduler.getState().mode, "arrangement");
  harness.elements.get("#transport-play").click();
  assert.equal(harness.scheduler.getState().status, "playing");
  assert.equal(harness.scheduler.playCalls.at(-1), "arrangement");

  harness.projectState.replace(createProjectState().getState(), { operation: "open-project" });
  assert.equal(harness.scheduler.getState().mode, "pattern");
  assert.equal(harness.scheduler.getState().status, "stopped");
  assert.equal(harness.elements.get("#playback-mode-control").hidden, true);

  harness.projectState.replace(arranged, { operation: "open-project" });
  assert.equal(harness.scheduler.getState().mode, "pattern");
  assert.equal(harness.elements.get("#playback-mode-control").hidden, false);
  harness.feature.dispose();
});

test("removing the track containing the final clip restores Pattern-only transport", () => {
  const { projectState } = createArrangedProject();
  projectState.addTrack();
  const scheduler = createScheduler({ mode: "arrangement", status: "playing" });
  const harness = createTransportHarness({ projectState, scheduler });

  projectState.removeTrack(DEFAULT_TRACK_ID, { allowClips: true });

  assert.equal(hasArrangementClips(projectState.getState()), false);
  assert.equal(scheduler.getState().mode, "pattern");
  assert.equal(scheduler.getState().status, "stopped");
  assert.equal(scheduler.stopCount, 1);
  assert.equal(harness.elements.get("#transport-loop").hidden, true);
  harness.feature.dispose();
});

test("undo and redo update transport availability across the zero/one clip boundary", () => {
  const harness = createTransportHarness();
  addNote(harness.projectState);
  harness.projectState.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  assert.equal(harness.elements.get("#playback-mode-control").hidden, false);

  harness.projectState.undo();
  assert.equal(harness.scheduler.getState().mode, "pattern");
  assert.equal(harness.elements.get("#playback-mode-control").hidden, true);
  assert.equal(harness.elements.get("#transport-loop").hidden, true);

  harness.projectState.redo();
  assert.equal(harness.scheduler.getState().mode, "pattern");
  assert.equal(harness.elements.get("#playback-mode-control").hidden, false);
  assert.equal(harness.elements.get("#transport-loop").hidden, false);
  harness.feature.dispose();
});

test("deleting a pattern and its final clip references restores Pattern-only transport", () => {
  const projectState = createProjectState();
  const patternId = projectState.createPattern();
  addNote(projectState, patternId);
  projectState.addClip(DEFAULT_TRACK_ID, patternId, 0);
  const scheduler = createScheduler({ mode: "arrangement", status: "playing" });
  const sessionState = createSessionState({
    workspace: { playbackMode: "arrangement", selectedPatternId: patternId },
  });
  const harness = createTransportHarness({ projectState, scheduler, sessionState });

  projectState.deletePattern(patternId, { removeReferences: true });

  assert.equal(hasArrangementClips(projectState.getState()), false);
  assert.equal(scheduler.getState().mode, "pattern");
  assert.equal(scheduler.getState().status, "stopped");
  assert.equal(scheduler.stopCount, 1);
  assert.equal(harness.elements.get("#playback-mode-control").hidden, true);
  harness.feature.dispose();
});
