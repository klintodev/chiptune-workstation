import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createV2ProjectState } from "../src/v2/domain/index.js";
import { createWorkspaceState } from "../src/v2/state/workspace-state.js";

import {
  getBoundedPianoMove,
  getExpandedPianoEditorEndTick,
  getPianoDuplicateDeltaTicks,
  getPianoMarqueeNoteIds,
  getPianoToolForViewport,
  isPianoDuplicateShortcut,
  renamePianoPattern,
} from "../src/v2/ui/piano-roll.js";
import {
  createPatternForPlaylistTrack,
  createPlaylistSurface,
  createPlaylistPatternActivation,
  duplicatePlaylistInstrument,
  getPlaylistContextMenuPosition,
  getPlaylistMarqueeClipIds,
  getPlaylistRulerSeekTick,
  getPlaylistWheelScrollDelta,
  getSnappedPlaylistDropTick,
  isPlaylistDuplicateShortcut,
  renamePlaylistInstrument,
  resolvePlaylistFocusTarget,
  routePlaylistContextMenu,
} from "../src/v2/ui/playlist.js";
import {
  createStudioShell,
  getGlobalHistoryAction,
  isGlobalTransportShortcut,
} from "../src/v2/ui/studio-shell.js";
import { createDeviceWindow } from "../src/v2/ui/device-window.js";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(value, force) {
    if (force) this.values.add(value);
    else this.values.delete(value);
    return Boolean(force);
  }

  remove(value) {
    this.values.delete(value);
  }
}

class FakeNode extends EventTarget {
  constructor(tagName, ownerDocument, nodeType = 1) {
    super();
    this.attributes = new Map();
    this.children = [];
    this.classList = new FakeClassList();
    this.className = "";
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.id = "";
    this.isConnected = true;
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.style = {
      removeProperty(name) {
        delete this[name];
      },
    };
    this.tagName = tagName.toUpperCase();
    this.textContent = "";
    this.value = "";
  }

  append(...children) {
    for (const child of children) {
      this.children.push(child);
      if (child && typeof child === "object") child.parentNode = this;
    }
  }

  click() {
    if (!this.disabled) this.dispatchEvent(new Event("click"));
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector) {
    if (selector.startsWith("#")) return this.find((node) => node.id === selector.slice(1));
    const className = selector.match(/^\.([a-z0-9_-]+)/i)?.[1] ?? null;
    const dataAttributes = [...selector.matchAll(/\[data-([a-z0-9-]+)="([^"]*)"\]/gi)]
      .map(([, name, value]) => ({
        name: name.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase()),
        value,
      }));
    if (className || dataAttributes.length > 0) {
      return this.find((node) => (
        (!className || String(node.className).split(/\s+/).includes(className))
        && dataAttributes.every(({ name, value }) => node.dataset?.[name] === value)
      ));
    }
    return null;
  }

  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      if (child?.find) {
        const match = child.find(predicate);
        if (match) return match;
      }
    }
    return null;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
    this.isConnected = false;
    this.parentNode = null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

function createFakeDocument() {
  const document = {
    activeElement: null,
    createElement(tagName) {
      return new FakeNode(tagName, document);
    },
    createTextNode(value) {
      const node = new FakeNode("#text", document, 3);
      node.textContent = String(value);
      return node;
    },
  };
  document.body = document.createElement("body");
  document.activeElement = document.body;
  return document;
}

function createEventedState(initialState) {
  const events = new EventTarget();
  let state = structuredClone(initialState);
  return {
    addEventListener: events.addEventListener.bind(events),
    emit(type = "change") {
      events.dispatchEvent(new Event(type));
    },
    getState: () => state,
    removeEventListener: events.removeEventListener.bind(events),
    setState(nextState, type = "change") {
      state = structuredClone(nextState);
      events.dispatchEvent(new Event(type));
    },
  };
}

function createShellHarness({ playlistCursorTick = 0, schedulerState, workspacePlayback }) {
  const project = createEventedState({
    metadata: { title: "Integration" },
    mixer: { master: { volume: 0.35 } },
    patterns: [{ id: "pattern-1", lengthTicks: 384 }],
    tracks: [{ id: "track-1", clips: [] }],
    transport: {
      bpm: 120,
      loop: { enabled: false, mode: "custom", startTick: 0, endTick: 384 },
    },
  });
  const loopCalls = [];
  let undoCalls = 0;
  let redoCalls = 0;
  let beginHistoryCalls = 0;
  let endHistoryCalls = 0;
  project.setBpm = (bpm) => {
    project.setState({
      ...project.getState(),
      transport: { ...project.getState().transport, bpm },
    });
  };
  project.setLoop = (patch) => {
    loopCalls.push(patch);
    project.setState({
      ...project.getState(),
      transport: {
        ...project.getState().transport,
        loop: { ...project.getState().transport.loop, ...patch },
      },
    });
    return true;
  };
  project.setMasterVolume = (volume) => {
    project.setState({
      ...project.getState(),
      mixer: { master: { ...project.getState().mixer.master, volume } },
    });
    return true;
  };
  project.beginHistoryGroup = () => { beginHistoryCalls += 1; return true; };
  project.endHistoryGroup = () => { endHistoryCalls += 1; return true; };
  project.getArrangementEndTick = () => {
    const state = project.getState();
    const lengths = new Map(state.patterns.map((pattern) => [pattern.id, pattern.lengthTicks]));
    return Math.max(0, ...state.tracks.flatMap((track) => (
      track.clips.map((clip) => clip.startTick + lengths.get(clip.patternId))
    )));
  };
  project.getHistoryState = () => ({ canRedo: true, canUndo: true });
  project.undo = () => { undoCalls += 1; return true; };
  project.redo = () => { redoCalls += 1; return true; };
  const workspace = createEventedState({
    activePrimary: "piano-roll",
    playlist: { cursorTick: playlistCursorTick },
    playback: { ...workspacePlayback },
  });
  workspace.setPlayback = (patch) => workspace.setState({
    ...workspace.getState(),
    playback: { ...workspace.getState().playback, ...patch },
  });
  workspace.setPlaybackMode = (mode) => workspace.setPlayback({ mode });
  workspace.seekSongCalls = 0;
  workspace.seekSong = (tick) => {
    workspace.seekSongCalls += 1;
    const state = workspace.getState();
    workspace.setState({
      ...state,
      playlist: { ...state.playlist, cursorTick: tick },
      playback: { ...state.playback, songPlayheadTick: tick },
    });
  };
  workspace.setPatternPlayhead = (tick) => workspace.setPlayback({ patternPlayheadTick: tick });
  workspace.activatePrimary = () => false;
  workspace.activateMixer = () => false;

  const schedulerEvents = new EventTarget();
  let currentSchedulerState = { ...schedulerState };
  let playError = null;
  let seekError = null;
  let stopCalls = 0;
  const playCalls = [];
  const scheduler = {
    addEventListener: schedulerEvents.addEventListener.bind(schedulerEvents),
    getPlayheadTick: () => currentSchedulerState.retainedTick,
    getState: () => ({ ...currentSchedulerState }),
    pause: () => true,
    play(options) {
      playCalls.push(options);
      if (playError) throw playError;
      return true;
    },
    removeEventListener: schedulerEvents.removeEventListener.bind(schedulerEvents),
    seek() {
      if (seekError) throw seekError;
      return true;
    },
    setBpm: () => true,
    setMode: () => true,
    stop: () => { stopCalls += 1; return true; },
  };
  const persistence = createEventedState({ status: "saved" });
  const audio = createEventedState("running");
  audio.isReady = () => true;
  const shell = createStudioShell({
    audioEngine: audio,
    persistence,
    projectState: project,
    scheduler,
    workspaceState: workspace,
  });
  return {
    get historyCalls() { return { redo: redoCalls, undo: undoCalls }; },
    get historyGroupCalls() { return { begin: beginHistoryCalls, end: endHistoryCalls }; },
    get stopCalls() { return stopCalls; },
    loopCalls,
    playCalls,
    project,
    root: shell.root,
    scheduler,
    setPlayError(error) { playError = error; },
    setSchedulerState(nextState) {
      currentSchedulerState = { ...nextState };
      schedulerEvents.dispatchEvent(new Event("statechange"));
    },
    setSeekError(error) { seekError = error; },
    shell,
    workspace,
  };
}

const originalDocument = globalThis.document;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

test.before(() => {
  globalThis.document = createFakeDocument();
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
});

test.after(() => {
  globalThis.document = originalDocument;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
});

test("V2 shell uses retained pause phase, workspace stopped phase, and contains transport errors", () => {
  const harness = createShellHarness({
    schedulerState: { mode: "song", retainedTick: 192, status: "paused" },
    workspacePlayback: { mode: "song", patternPlayheadTick: 0, songPlayheadTick: 384 },
  });
  const status = harness.root.querySelector("#transport-status");
  const play = harness.root.querySelector("#transport-play");
  const start = harness.root.querySelector("#transport-start");
  const announcer = harness.root.querySelector("#workstation-status");

  assert.match(status.value, /bar 1, beat 3/);
  play.click();
  assert.deepEqual(harness.playCalls.at(-1), { mode: "song", startTick: 192 });

  harness.setSchedulerState({ mode: "song", retainedTick: 0, status: "stopped" });
  assert.match(status.value, /bar 2, beat 1/);
  play.click();
  assert.deepEqual(harness.playCalls.at(-1), { mode: "song", startTick: 384 });

  harness.setPlayError(new RangeError("Place an audible Pattern in Playlist before playing Song mode."));
  play.click();
  assert.match(announcer.textContent, /Place an audible Pattern/);

  harness.setSeekError(new RangeError("Seek tick is outside the playback range."));
  start.click();
  assert.equal(harness.workspace.seekSongCalls, 0);
  assert.match(announcer.textContent, /outside the playback range/);
  harness.shell.dispose();
});

test("V2 header removes Ready and keeps its Share slot inside Menu", () => {
  const harness = createShellHarness({
    schedulerState: { mode: "pattern", retainedTick: 0, status: "stopped" },
    workspacePlayback: { mode: "pattern", patternPlayheadTick: 0, songPlayheadTick: 0 },
  });

  assert.equal(harness.root.querySelector("#audio-status-open"), null);
  assert.equal(harness.root.querySelector("#audio-state"), null);
  const shareSlot = harness.shell.slots.share;
  assert.equal(shareSlot.id, "v2-project-share-slot");
  assert.equal(shareSlot.parentNode?.parentNode?.tagName, "DETAILS");
  assert.match(shareSlot.parentNode.parentNode.className, /v2-secondary-menu/);
  harness.shell.dispose();
});

test("a second Stop returns the Playlist cursor, scheduler, and playheads to tick zero", () => {
  const harness = createShellHarness({
    playlistCursorTick: 144,
    schedulerState: { mode: "song", retainedTick: 144, status: "stopped" },
    workspacePlayback: { mode: "song", patternPlayheadTick: 96, songPlayheadTick: 144 },
  });
  const stop = harness.root.querySelector("#transport-stop");
  const announcer = harness.root.querySelector("#workstation-status");

  assert.equal(stop.disabled, false);
  assert.equal(stop.title, "Return Playlist to start");
  stop.click();

  assert.equal(harness.stopCalls, 1);
  assert.equal(harness.workspace.getState().playlist.cursorTick, 0);
  assert.equal(harness.workspace.getState().playback.patternPlayheadTick, 0);
  assert.equal(harness.workspace.getState().playback.songPlayheadTick, 0);
  assert.equal(stop.disabled, true);
  assert.equal(announcer.textContent, "Playlist returned to start.");
  harness.shell.dispose();
});

test("Stop returns playing Song transport to its cue before a second Stop returns to start", () => {
  const harness = createShellHarness({
    playlistCursorTick: 144,
    schedulerState: { mode: "song", retainedTick: 96, status: "playing" },
    workspacePlayback: { mode: "song", patternPlayheadTick: 24, songPlayheadTick: 96 },
  });
  const stop = harness.root.querySelector("#transport-stop");

  stop.click();

  assert.equal(harness.stopCalls, 1);
  assert.equal(harness.workspace.getState().playlist.cursorTick, 144);
  assert.equal(harness.workspace.getState().playback.songPlayheadTick, 96);

  harness.workspace.setPlayback({ songPlayheadTick: 144 });
  harness.setSchedulerState({ mode: "song", retainedTick: 144, status: "stopped" });
  assert.equal(stop.disabled, false);
  assert.equal(stop.title, "Return Playlist to start");
  assert.equal(harness.workspace.getState().playback.patternPlayheadTick, 24);

  stop.click();
  assert.equal(harness.stopCalls, 2);
  assert.equal(harness.workspace.getState().playlist.cursorTick, 0);
  assert.equal(harness.workspace.getState().playback.patternPlayheadTick, 0);
  assert.equal(harness.workspace.getState().playback.songPlayheadTick, 0);
  assert.equal(stop.disabled, true);
  harness.shell.dispose();
});

test("shell owns one direct transport frame stream plus retained loop and history controls", () => {
  const harness = createShellHarness({
    schedulerState: { mode: "song", retainedTick: 48, status: "stopped" },
    workspacePlayback: { mode: "song", patternPlayheadTick: 24, songPlayheadTick: 48 },
  });
  const frames = [];
  harness.root.addEventListener("transportframe", (event) => frames.push(event.detail));
  harness.setSchedulerState({ mode: "song", retainedTick: 96, status: "playing" });
  assert.equal(frames.at(-1).songTick, 96);
  assert.equal(frames.at(-1).patternTick, 24);

  const loopToggle = harness.root.querySelector("#transport-loop");
  const loopSummary = harness.root.querySelector("#loop-summary");
  assert.equal(loopSummary.textContent, "Song loop range");
  assert.equal(loopToggle.getAttribute("aria-pressed"), "false");
  const loopEnabled = harness.root.querySelector("#loop-enabled");
  const loopStart = harness.root.querySelector("#loop-start");
  const loopEnd = harness.root.querySelector("#loop-end");
  const announcer = harness.root.querySelector("#workstation-status");
  assert.equal(loopEnabled.disabled, true);
  loopEnabled.checked = true;
  loopEnabled.dispatchEvent(new Event("change"));
  assert.equal(harness.loopCalls.length, 0);
  assert.match(announcer.textContent, /Playlist clip/);

  const state = harness.project.getState();
  harness.project.setState({
    ...state,
    tracks: [{ ...state.tracks[0], clips: [{ id: "clip-1", patternId: "pattern-1", startTick: 0 }] }],
  });
  assert.equal(loopEnabled.disabled, false);
  loopToggle.click();
  assert.deepEqual(harness.loopCalls.at(-1), {
    enabled: true,
    endTick: 384,
    mode: "arrangement",
    startTick: 0,
  });
  assert.equal(loopToggle.getAttribute("aria-pressed"), "true");

  harness.workspace.setPlayback({ mode: "pattern" });
  assert.equal(loopToggle.getAttribute("aria-label"), "Pattern loop on");
  assert.equal(loopToggle.getAttribute("aria-pressed"), "true");
  const loopCallCount = harness.loopCalls.length;
  loopToggle.click();
  assert.equal(harness.workspace.getState().playback.patternLoopEnabled, false);
  assert.equal(loopToggle.getAttribute("aria-label"), "Pattern loop off");
  assert.equal(loopToggle.getAttribute("aria-pressed"), "false");
  assert.equal(harness.loopCalls.length, loopCallCount);
  loopToggle.click();
  assert.equal(harness.workspace.getState().playback.patternLoopEnabled, true);
  harness.workspace.setPlayback({ mode: "song" });
  assert.equal(loopToggle.getAttribute("aria-label"), "Song loop on");
  assert.equal(loopToggle.getAttribute("aria-pressed"), "true");

  loopStart.value = "24";
  loopEnd.value = "96";
  loopEnd.dispatchEvent(new Event("change"));
  assert.deepEqual(harness.loopCalls.at(-1), {
    endTick: 96,
    mode: "custom",
    startTick: 24,
  });
  assert.equal(loopToggle.getAttribute("aria-pressed"), "false");
  loopToggle.click();
  assert.deepEqual(harness.loopCalls.at(-1), {
    enabled: true,
    endTick: 384,
    mode: "arrangement",
    startTick: 0,
  });
  assert.equal(loopToggle.getAttribute("aria-pressed"), "true");
  const master = harness.root.querySelector("#master-volume");
  const masterValue = harness.root.querySelector("#master-volume-value");
  master.value = "62";
  master.dispatchEvent(new Event("input"));
  assert.equal(harness.project.getState().mixer.master.volume, 0.62);
  assert.equal(masterValue.value, "62%");
  const arrowDown = new Event("keydown");
  Object.defineProperty(arrowDown, "key", { value: "ArrowRight" });
  const arrowRepeat = new Event("keydown");
  Object.defineProperty(arrowRepeat, "key", { value: "ArrowRight" });
  const arrowUp = new Event("keyup");
  Object.defineProperty(arrowUp, "key", { value: "ArrowRight" });
  master.dispatchEvent(arrowDown);
  master.dispatchEvent(arrowRepeat);
  assert.deepEqual(harness.historyGroupCalls, { begin: 1, end: 0 });
  master.dispatchEvent(arrowUp);
  assert.deepEqual(harness.historyGroupCalls, { begin: 1, end: 1 });

  harness.root.querySelector("#global-undo").click();
  harness.root.querySelector("#global-redo").click();
  assert.deepEqual(harness.historyCalls, { redo: 1, undo: 1 });
  master.dispatchEvent(arrowDown);
  harness.shell.dispose();
  assert.deepEqual(harness.historyGroupCalls, { begin: 2, end: 2 });
});

test("global history shortcut ignores native editors and already-owned composite events", () => {
  const base = {
    altKey: false,
    ctrlKey: true,
    defaultPrevented: false,
    key: "z",
    metaKey: false,
    shiftKey: false,
    target: null,
  };
  assert.equal(getGlobalHistoryAction(base), "undo");
  assert.equal(getGlobalHistoryAction({ ...base, shiftKey: true }), "redo");
  assert.equal(getGlobalHistoryAction({ ...base, key: "y" }), "redo");
  assert.equal(getGlobalHistoryAction({ ...base, defaultPrevented: true }), null);
  assert.equal(getGlobalHistoryAction({
    ...base,
    target: { closest: () => ({ tagName: "INPUT" }) },
  }), null);
});

test("global transport shortcut owns plain Space outside text entry", () => {
  const target = (match = null, properties = {}) => ({
    closest: (selector) => (selector.includes(match) ? properties.closestMatch ?? {} : null),
    ...properties,
  });
  const base = {
    altKey: false,
    code: "Space",
    ctrlKey: false,
    defaultPrevented: false,
    key: " ",
    metaKey: false,
    target: null,
  };

  assert.equal(isGlobalTransportShortcut(base), true);
  assert.equal(isGlobalTransportShortcut({ ...base, target: target("input", { closestMatch: { type: "range" } }) }), true);
  assert.equal(isGlobalTransportShortcut({ ...base, target: target("input", { closestMatch: { type: "number" } }) }), true);
  assert.equal(isGlobalTransportShortcut({ ...base, target: target("input", { closestMatch: { type: "text" } }) }), false);
  assert.equal(isGlobalTransportShortcut({ ...base, target: target("textarea") }), false);
  assert.equal(isGlobalTransportShortcut({ ...base, target: { isContentEditable: true } }), false);
  assert.equal(isGlobalTransportShortcut({ ...base, ctrlKey: true }), false);
  assert.equal(isGlobalTransportShortcut({ ...base, defaultPrevented: true }), false);
  assert.equal(isGlobalTransportShortcut({ ...base, code: "Enter", key: "Enter" }), false);
});

test("Piano pointer geometry bounds moves and marquee selection to the Pattern grid", () => {
  const notes = [
    { id: "left", durationTicks: 24, pitch: 36, startTick: 0 },
    { id: "middle", durationTicks: 48, pitch: 60, startTick: 96 },
    { id: "right", durationTicks: 24, pitch: 112, startTick: 168 },
  ];
  assert.deepEqual(
    getBoundedPianoMove(notes, -96, 12, 192),
    { deltaPitch: 0, deltaTick: 0 },
  );
  assert.deepEqual(
    getBoundedPianoMove([notes[1]], 240, -80, 192),
    { deltaPitch: -24, deltaTick: 48 },
  );
  assert.deepEqual(
    getPianoMarqueeNoteIds(notes, {
      fromPitch: 54,
      fromTick: 72,
      patternLength: 192,
      toPitch: 66,
      toTick: 160,
    }),
    ["middle"],
  );
  assert.deepEqual(
    getPianoMarqueeNoteIds(notes, {
      fromPitch: 0,
      fromTick: -100,
      patternLength: 192,
      toPitch: 40,
      toTick: 25,
    }),
    ["left"],
  );
});

test("Piano pointer drags extend the editor horizon one bar at a time", () => {
  assert.equal(getExpandedPianoEditorEndTick(384, 383), 384);
  assert.equal(getExpandedPianoEditorEndTick(384, 384), 768);
  assert.equal(getExpandedPianoEditorEndTick(768, 900), 1_152);
  assert.equal(getExpandedPianoEditorEndTick(3_072, 3_072), 3_072);
});

test("Piano duplicate-right uses the exact selection span and an unrepeated platform modifier B", () => {
  assert.equal(getPianoDuplicateDeltaTicks([
    { durationTicks: 18, startTick: 0 },
    { durationTicks: 30, startTick: 72 },
    { durationTicks: 12, startTick: 48 },
  ]), 102);
  assert.equal(getPianoDuplicateDeltaTicks([]), 0);

  assert.equal(isPianoDuplicateShortcut({ ctrlKey: true, key: "b" }), true);
  assert.equal(isPianoDuplicateShortcut({ key: "B", metaKey: true }), true);
  assert.equal(isPianoDuplicateShortcut({ ctrlKey: true, key: "b", repeat: true }), false);
  assert.equal(isPianoDuplicateShortcut({ altKey: true, ctrlKey: true, key: "b" }), false);
  assert.equal(isPianoDuplicateShortcut({ ctrlKey: true, key: "b", shiftKey: true }), false);
  assert.equal(isPianoDuplicateShortcut({ ctrlKey: true, defaultPrevented: true, key: "b" }), false);
  assert.equal(isPianoDuplicateShortcut({ ctrlKey: true, key: "d" }), false);
  assert.equal(isPianoDuplicateShortcut({ key: "b" }), false);
});

test("Piano compact navigation restores the last visible desktop tool", () => {
  for (const desktopTool of ["draw", "select"]) {
    assert.equal(getPianoToolForViewport(false, desktopTool), desktopTool);
    assert.equal(getPianoToolForViewport(true, desktopTool), "pan");
    assert.equal(getPianoToolForViewport(false, desktopTool), desktopTool);
  }
  assert.equal(getPianoToolForViewport(false, "pan"), "draw");
});

test("Playlist modifier-wheel scrolling follows the dominant axis and normalizes delta modes", () => {
  assert.equal(getPlaylistWheelScrollDelta({ deltaX: 20, deltaY: 120 }), 120);
  assert.equal(getPlaylistWheelScrollDelta({ deltaX: -160, deltaY: 40 }), -160);
  assert.equal(getPlaylistWheelScrollDelta({ deltaMode: 1, deltaY: 3 }), 120);
  assert.equal(getPlaylistWheelScrollDelta({ clientWidth: 800, deltaMode: 2, deltaY: -1 }), -800);
  assert.equal(getPlaylistWheelScrollDelta({ deltaY: Number.NaN }), 0);
});

test("Playlist Instrument Mute and Solo switches share canonical Track Mixer state", () => {
  const projectState = createV2ProjectState();
  const secondTrackId = projectState.addTrack("Bass");
  const workspaceState = createWorkspaceState(projectState);
  workspaceState.activatePlaylist();
  const announcements = [];
  const operations = [];
  let instrumentOpenCount = 0;
  projectState.addEventListener("change", (event) => operations.push(event.detail?.operation));

  const surface = createPlaylistSurface({
    announce: (message) => announcements.push(message),
    onOpenInstrument: () => { instrumentOpenCount += 1; },
    projectState,
    workspaceState,
  });
  const findSwitch = (trackId, action) => surface.node.find(({ dataset }) => (
    dataset.trackId === trackId && dataset.playlistTrackAction === action
  ));

  assert.equal(findSwitch("track-1", "mute").getAttribute("aria-pressed"), "false");
  assert.equal(findSwitch("track-1", "solo").getAttribute("aria-pressed"), "false");

  findSwitch("track-1", "mute").click();
  assert.equal(projectState.getTrack("track-1").mixer.muted, true);
  assert.equal(projectState.getTrack("track-1").mixer.solo, false);
  assert.equal(findSwitch("track-1", "mute").getAttribute("aria-pressed"), "true");
  assert.deepEqual(operations, ["set-track-mixer"]);
  assert.equal(instrumentOpenCount, 0);
  assert.equal(announcements.at(-1), "Pulse 1 muted.");

  projectState.undo();
  assert.equal(projectState.getTrack("track-1").mixer.muted, false);
  assert.equal(findSwitch("track-1", "mute").getAttribute("aria-pressed"), "false");
  projectState.redo();
  assert.equal(findSwitch("track-1", "mute").getAttribute("aria-pressed"), "true");

  findSwitch("track-1", "solo").click();
  findSwitch(secondTrackId, "solo").click();
  findSwitch(secondTrackId, "mute").click();
  assert.equal(projectState.getTrack("track-1").mixer.solo, true);
  assert.deepEqual(
    (({ muted, solo }) => ({ muted, solo }))(projectState.getTrack(secondTrackId).mixer),
    { muted: true, solo: true },
  );
  assert.equal(findSwitch(secondTrackId, "mute").getAttribute("aria-pressed"), "true");
  assert.equal(findSwitch(secondTrackId, "solo").getAttribute("aria-pressed"), "true");
  assert.equal(instrumentOpenCount, 0);
  surface.dispose();
});

test("Playlist Track action rail wires labelled, ordered, focus-stable Mixer switches", async () => {
  const playlist = await readFile(new URL("../src/v2/ui/playlist.js", import.meta.url), "utf8");

  assert.match(playlist, /const TRACK_ACTION_ORDER = Object\.freeze\(\[\s*"select",\s*"instrument",\s*"mute",\s*"solo",\s*"move-up",\s*"move-down",\s*"remove",?\s*\]\)/);
  assert.match(playlist, /"aria-label": `Mute \$\{track\.name\} Instrument`,\s*"aria-pressed": String\(track\.mixer\.muted\),\s*dataset: \{ playlistTrackAction: "mute", trackId: track\.id \}/);
  assert.match(playlist, /"aria-label": `Solo \$\{track\.name\} Instrument`,\s*"aria-pressed": String\(track\.mixer\.solo\),\s*dataset: \{ playlistTrackAction: "solo", trackId: track\.id \}/);
  assert.match(playlist, /const current = projectState\.getTrack\(track\.id\);\s*const next = !current\.mixer\[field\]/);
  assert.match(playlist, /rememberFocus\(\{[\s\S]*?trackAction,[\s\S]*?trackId: track\.id,[\s\S]*?\}\);\s*mutateProject\(\(\) => projectState\.setTrackMixer\(track\.id, \{ \[field\]: next \}\)\)/);
  assert.match(playlist, /for \(const toggle of \[mute, solo\]\) \{\s*toggle\.addEventListener\("contextmenu", \(event\) => \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\)/);
  assert.match(playlist, /className: "v2-playlist-track-actions"[\s\S]*className: "v2-playlist-track-switches"[\s\S]*\[mute, solo\][\s\S]*className: "v2-playlist-track-management"[\s\S]*\[up, down, remove\]/);
});

test("Playlist context routing isolates clip, Instrument, and Track right-clicks", () => {
  const createTarget = ({ clipId = null, instrumentTrackId = null, trackId = null } = {}) => {
    const clip = clipId ? { dataset: { clipId } } : null;
    const instrument = instrumentTrackId ? { dataset: { trackId: instrumentTrackId } } : null;
    const lane = trackId ? { dataset: { trackId } } : null;
    return {
      closest(selector) {
        if (selector === ".v2-playlist-clip") return clip;
        if (selector === ".v2-playlist-instrument") return instrument;
        if (selector === ".v2-playlist-lane") return lane;
        return null;
      },
    };
  };
  const calls = [];
  const createEvent = (target) => ({
    target,
    preventDefault: () => calls.push("prevent"),
    stopPropagation: () => calls.push("stop"),
  });
  const handlers = {
    onClip: (clipId) => calls.push(`clip:${clipId}`),
    onInstrument: (trackId) => calls.push(`instrument:${trackId}`),
    onTrack: (trackId) => calls.push(`track:${trackId}`),
  };

  assert.equal(routePlaylistContextMenu(createEvent(createTarget({
    clipId: "clip-2",
    instrumentTrackId: "track-2",
    trackId: "track-2",
  })), handlers), true);
  assert.deepEqual(calls, ["prevent", "stop", "clip:clip-2"]);

  calls.length = 0;
  assert.equal(routePlaylistContextMenu(createEvent(createTarget({ trackId: "track-2" })), handlers), true);
  assert.deepEqual(calls, ["prevent", "stop", "track:track-2"]);

  calls.length = 0;
  assert.equal(routePlaylistContextMenu(createEvent(createTarget({
    instrumentTrackId: "track-2",
    trackId: "track-2",
  })), handlers), true);
  assert.deepEqual(calls, ["prevent", "stop", "instrument:track-2"]);

  calls.length = 0;
  assert.equal(routePlaylistContextMenu(createEvent(createTarget()), handlers), false);
  assert.deepEqual(calls, []);
});

test("Playlist Track menus stay inside the viewport", () => {
  assert.deepEqual(getPlaylistContextMenuPosition({
    clientX: 120,
    clientY: 140,
    menuHeight: 80,
    menuWidth: 210,
    viewportHeight: 600,
    viewportWidth: 800,
  }), { left: 120, top: 140 });
  assert.deepEqual(getPlaylistContextMenuPosition({
    clientX: 794,
    clientY: 594,
    menuHeight: 80,
    menuWidth: 210,
    viewportHeight: 600,
    viewportWidth: 800,
  }), { left: 582, top: 512 });
  assert.deepEqual(getPlaylistContextMenuPosition({
    clientX: -20,
    clientY: -30,
    menuHeight: 80,
    menuWidth: 210,
    viewportHeight: 600,
    viewportWidth: 800,
  }), { left: 8, top: 8 });
  assert.equal(getPlaylistContextMenuPosition({ clientX: Number.NaN }), null);
});

test("Playlist Instrument rename cancels cleanly and renders the shared owner name", () => {
  let cancelledMutationCount = 0;
  assert.equal(renamePlaylistInstrument({
    mutate: () => { cancelledMutationCount += 1; },
    requestedName: null,
  }), false);
  assert.equal(cancelledMutationCount, 0);

  const projectState = createV2ProjectState();
  const announcements = [];
  let mutationCount = 0;
  let renderCount = 0;
  assert.equal(renamePlaylistInstrument({
    announce: (message) => announcements.push(message),
    mutate: (action) => { mutationCount += 1; return action(); },
    projectState,
    render: () => { renderCount += 1; },
    requestedName: "  Lead Chip  ",
    trackId: "track-1",
  }), true);
  assert.equal(projectState.getTrack("track-1").name, "Lead Chip");
  assert.equal(mutationCount, 1);
  assert.equal(renderCount, 1);
  assert.deepEqual(announcements, ["Renamed Instrument to Lead Chip."]);

  assert.equal(renamePlaylistInstrument({
    announce: (message) => announcements.push(message),
    mutate: (action) => { mutationCount += 1; return action(); },
    projectState,
    render: () => { renderCount += 1; },
    requestedName: "Lead Chip",
    trackId: "track-1",
  }), false);
  assert.equal(mutationCount, 2);
  assert.equal(renderCount, 1);
  assert.equal(announcements.length, 1);

  const beforeInvalid = projectState.getState();
  assert.throws(() => renamePlaylistInstrument({
    projectState,
    requestedName: "   ",
    trackId: "track-1",
  }), TypeError);
  assert.equal(projectState.getState(), beforeInvalid);
});

test("Playlist Instrument duplicate selects and focuses its independent Track", () => {
  const projectState = createV2ProjectState();
  projectState.setInstrumentParam("track-1", "waveform", "triangle");
  const announcements = [];
  const playlistPatches = [];
  let mutationCount = 0;
  let renderedTrackId = null;

  const trackId = duplicatePlaylistInstrument({
    announce: (message) => announcements.push(message),
    mutate: (action) => { mutationCount += 1; return action(); },
    projectState,
    render: (nextTrackId) => { renderedTrackId = nextTrackId; },
    setPlaylist: (patch) => playlistPatches.push(patch),
    sourceTrackId: "track-1",
  });

  assert.equal(trackId, "track-2");
  assert.equal(projectState.getTrack(trackId).name, "Pulse 1 copy");
  assert.equal(projectState.getTrack(trackId).instrument.params.waveform, "triangle");
  assert.equal(mutationCount, 1);
  assert.equal(renderedTrackId, trackId);
  assert.deepEqual(playlistPatches, [{
    destinationTrackId: trackId,
    selectedClipId: null,
    selectedClipIds: [],
  }]);
  assert.deepEqual(announcements, ["Duplicated Pulse 1 Instrument as Pulse 1 copy."]);
});

test("Playlist Instrument context menu wires duplicate between rename and New Pattern", async () => {
  const playlist = await readFile(new URL("../src/v2/ui/playlist.js", import.meta.url), "utf8");
  const renameIndex = playlist.indexOf('textContent: "Rename Instrument"');
  const duplicateIndex = playlist.indexOf('textContent: "Duplicate Instrument"');
  const newPatternIndex = playlist.indexOf('textContent: "New Pattern"', duplicateIndex);

  assert.ok(renameIndex >= 0 && renameIndex < duplicateIndex && duplicateIndex < newPatternIndex);
  assert.match(playlist, /\[renameInstrument, duplicateInstrument, newPattern\]/);
  assert.match(playlist, /contextMenu\.duplicateInstrument\.hidden = !instrumentTarget/);
  assert.match(playlist, /contextMenu\.duplicateInstrument\.disabled = trackCapReached/);
  assert.match(playlist, /A Project supports at most eight Instruments/);
  assert.match(playlist, /duplicateInstrumentForTrack\(trackId\)/);
  assert.match(playlist, /rememberFocus\(\{ clipId: null, trackAction: "instrument", trackId, trackIndex \}\)/);
  assert.match(playlist, /setPlaylist: \(patch\) => setSession\(patch\)/);
});

test("an open Instrument updates owner labels through rename, undo, and redo without rebuilding", () => {
  const previousDocument = globalThis.document;
  const document = createFakeDocument();
  globalThis.document = document;
  try {
    const projectState = createV2ProjectState();
    const track = projectState.getTrack("track-1");
    const deviceWindow = createDeviceWindow({
      device: {
        instanceId: track.instrument.instanceId,
        kind: "instrument",
        trackId: track.id,
      },
      mobile: true,
      onClose: () => {},
      projectState,
    });
    const title = deviceWindow.node.find(({ tagName }) => tagName === "H2");
    const attack = deviceWindow.node.find(({ dataset }) => dataset.deviceParam === "attackSeconds");
    const originalNode = deviceWindow.node;
    const originalAttack = attack;

    assert.equal(title.textContent, "Pulse 1, Klinto Chip");
    assert.equal(attack.getAttribute("aria-label"), "Pulse 1, Klinto Chip, Attack");

    projectState.renameTrack(track.id, "Lead Chip");
    assert.equal(deviceWindow.node, originalNode);
    assert.equal(deviceWindow.node.find(({ dataset }) => dataset.deviceParam === "attackSeconds"), originalAttack);
    assert.equal(title.textContent, "Lead Chip, Klinto Chip");
    assert.equal(attack.getAttribute("aria-label"), "Lead Chip, Klinto Chip, Attack");

    projectState.undo();
    assert.equal(title.textContent, "Pulse 1, Klinto Chip");
    assert.equal(attack.getAttribute("aria-label"), "Pulse 1, Klinto Chip, Attack");
    projectState.redo();
    assert.equal(title.textContent, "Lead Chip, Klinto Chip");
    assert.equal(attack.getAttribute("aria-label"), "Lead Chip, Klinto Chip, Attack");
    assert.equal(deviceWindow.node.find(({ dataset }) => dataset.deviceParam === "attackSeconds"), originalAttack);
    deviceWindow.dispose();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("creating a Pattern from a Track binds destination and Piano audition without adding a clip", () => {
  const projectState = createV2ProjectState();
  const trackId = projectState.addTrack();
  const workspaceState = createWorkspaceState(projectState);
  workspaceState.activatePlaylist();
  const order = [];
  const announcements = [];
  const beforeClips = projectState.getState().tracks.map(({ clips }) => clips.length);

  const patternId = createPatternForPlaylistTrack({
    announce: (message) => announcements.push(message),
    onOpenPattern: (openedPatternId, auditionTrackId) => {
      order.push(`open:${openedPatternId}:${auditionTrackId}`);
      workspaceState.activatePianoRoll(openedPatternId, { auditionTrackId });
      workspaceState.setAuditionTrack(openedPatternId, auditionTrackId);
    },
    projectState,
    render: () => order.push("render"),
    setActivePattern: (id) => workspaceState.setActivePattern(id),
    setPlaylist: (patch) => workspaceState.setPlaylist(patch),
    trackId,
  });

  assert.equal(projectState.getPattern(patternId).name, "Pattern 2");
  assert.deepEqual(projectState.getState().tracks.map(({ clips }) => clips.length), beforeClips);
  assert.equal(workspaceState.getState().playlist.destinationTrackId, trackId);
  assert.equal(workspaceState.getState().playlist.selectedClipId, null);
  assert.deepEqual(workspaceState.getState().playlist.selectedClipIds, []);
  assert.equal(workspaceState.getState().activePatternId, patternId);
  assert.equal(workspaceState.getState().activePrimary, "piano-roll");
  assert.equal(workspaceState.getState().patternSurfaces[patternId].auditionTrackId, trackId);
  assert.deepEqual(order, ["render", `open:${patternId}:${trackId}`]);
  assert.deepEqual(announcements, ["Created Pattern 2 for Track 2."]);
});

test("Playlist marquee selection intersects clips across Tracks in either drag direction", () => {
  const project = {
    patterns: [
      { id: "pattern-a", lengthTicks: 96 },
      { id: "pattern-b", lengthTicks: 48 },
    ],
    tracks: [
      {
        id: "track-1",
        clips: [
          { id: "clip-a", patternId: "pattern-a", startTick: 0 },
          { id: "clip-b", patternId: "pattern-b", startTick: 144 },
        ],
      },
      {
        id: "track-2",
        clips: [{ id: "clip-c", patternId: "pattern-a", startTick: 72 }],
      },
      {
        id: "track-3",
        clips: [{ id: "clip-d", patternId: "pattern-b", startTick: 300 }],
      },
    ],
  };
  const forward = getPlaylistMarqueeClipIds(project, {
    startTick: 80,
    endTick: 160,
    startTrackIndex: 0,
    endTrackIndex: 1,
  });
  const reverse = getPlaylistMarqueeClipIds(project, {
    startTick: 160,
    endTick: 80,
    startTrackIndex: 1,
    endTrackIndex: 0,
  });
  assert.deepEqual(forward, ["clip-a", "clip-b", "clip-c"]);
  assert.deepEqual(reverse, forward);
  assert.deepEqual(getPlaylistMarqueeClipIds(project, {
    startTick: 192,
    endTick: 300,
    startTrackIndex: 0,
    endTrackIndex: 2,
  }), []);
});

test("Playlist duplicate-right shortcut requires an unrepeated exact platform modifier B", () => {
  assert.equal(isPlaylistDuplicateShortcut({ ctrlKey: true, key: "b" }), true);
  assert.equal(isPlaylistDuplicateShortcut({ key: "B", metaKey: true }), true);
  assert.equal(isPlaylistDuplicateShortcut({ ctrlKey: true, key: "b", repeat: true }), false);
  assert.equal(isPlaylistDuplicateShortcut({ ctrlKey: true, key: "b", shiftKey: true }), false);
  assert.equal(isPlaylistDuplicateShortcut({ ctrlKey: true, key: "d" }), false);
  assert.equal(isPlaylistDuplicateShortcut({ key: "b" }), false);
});

test("Playlist pointer positions snap to the visible Track grid and reject Track headers", () => {
  assert.equal(getSnappedPlaylistDropTick({
    clientX: 723,
    pixelsPerTick: 0.36,
    snapTicks: 24,
    timelineLeft: 333,
  }), 192);
  assert.equal(getSnappedPlaylistDropTick({
    clientX: 652,
    pixelsPerTick: 0.36,
    snapTicks: 48,
    timelineLeft: 333,
  }), null);
  assert.equal(getSnappedPlaylistDropTick({
    clientX: 10_000,
    pixelsPerTick: 0.36,
    snapTicks: 24,
    timelineLeft: 0,
  }), 6120);
  assert.equal(getSnappedPlaylistDropTick({
    clientX: Number.NaN,
    pixelsPerTick: 0.36,
    snapTicks: 24,
    timelineLeft: 0,
  }), null);

  const rulerTarget = {
    closest(selector) { return selector === ".v2-playlist-ruler" ? this : null; },
  };
  assert.equal(getPlaylistRulerSeekTick({
    button: 0,
    clientX: 723,
    target: rulerTarget,
  }, {
    pixelsPerTick: 0.36,
    snapTicks: 24,
    timelineLeft: 333,
  }), 192);
  assert.equal(getPlaylistRulerSeekTick({
    button: 2,
    clientX: 723,
    target: rulerTarget,
  }, {
    pixelsPerTick: 0.36,
    snapTicks: 24,
    timelineLeft: 333,
  }), null);
  assert.equal(getPlaylistRulerSeekTick({
    button: 0,
    clientX: 723,
    target: { closest: () => null },
  }, {
    pixelsPerTick: 0.36,
    snapTicks: 24,
    timelineLeft: 333,
  }), null);
});

test("Playlist focus preference resolves stable clip, nearest clip, Track header, then heading", () => {
  const project = {
    tracks: [
      {
        id: "track-1",
        clips: [
          { id: "clip-a", startTick: 0 },
          { id: "clip-b", startTick: 192 },
        ],
      },
      {
        id: "track-2",
        clips: [{ id: "clip-c", startTick: 96 }],
      },
    ],
  };
  assert.deepEqual(
    resolvePlaylistFocusTarget(project, { clipId: "clip-b", tick: 192, trackId: "track-1" }),
    { clipId: "clip-b", trackId: "track-1" },
  );
  const withoutSelected = structuredClone(project);
  withoutSelected.tracks[0].clips = withoutSelected.tracks[0].clips.filter(({ id }) => id !== "clip-b");
  assert.deepEqual(
    resolvePlaylistFocusTarget(withoutSelected, {
      clipId: "clip-b",
      tick: 192,
      trackId: "track-1",
      trackIndex: 0,
    }),
    { clipId: "clip-a", trackId: "track-1" },
  );
  const withoutTrack = { tracks: [structuredClone(project.tracks[1])] };
  assert.deepEqual(
    resolvePlaylistFocusTarget(withoutTrack, {
      clipId: "clip-b",
      tick: 192,
      trackId: "track-1",
      trackIndex: 0,
    }),
    { clipId: "clip-c", trackId: "track-2" },
  );
  assert.deepEqual(
    resolvePlaylistFocusTarget({ tracks: [{ id: "track-2", clips: [] }] }, {
      tick: 192,
      trackId: "track-1",
      trackIndex: 0,
    }),
    { clipId: null, trackId: "track-2" },
  );
});
test("Studio integration orders workspace and graph repair before scheduler rescheduling", async () => {
  const source = await readFile(new URL("../src/v2/studio-app.js", import.meta.url), "utf8");
  const start = source.indexOf("function handleProjectChange(event)");
  const end = source.indexOf("projectState.addEventListener", start);
  const handler = source.slice(start, end);
  const workspaceRepair = Math.max(
    handler.indexOf("workspaceState.replaceProject"),
    handler.indexOf("workspaceState.repairProject"),
  );
  const removedTrackDetection = handler.indexOf("const removedTrack");
  const auditionStop = handler.indexOf("if (removedTrack) keyboardAudition.reconcileProject(project)");
  const graphSync = handler.indexOf("ensureAudioGraph()");
  const modeSync = handler.indexOf("scheduler.setMode");
  const projectSync = handler.indexOf("scheduler.syncProject");
  const bpmSync = handler.indexOf("scheduler.setBpm");
  const trackSnapshotSync = handler.indexOf("synchronizedTrackIds = nextTrackIds");

  assert.ok(removedTrackDetection >= 0);
  assert.ok(auditionStop > removedTrackDetection);
  assert.ok(workspaceRepair > auditionStop);
  assert.ok(graphSync > workspaceRepair);
  assert.ok(modeSync > graphSync);
  assert.ok(bpmSync > graphSync);
  assert.ok(projectSync > bpmSync);
  assert.ok(trackSnapshotSync > projectSync);
  assert.match(source, /let synchronizedTrackIds = new Set/);
  assert.match(handler, /\[\.\.\.synchronizedTrackIds\].*!nextTrackIds\.has\(trackId\)/s);
  assert.match(source, /songPlayheadTick: result\.startTick/);
  assert.match(source, /synchronizeTransportSession/);
  assert.match(source, /synchronizePatternPlaybackContext/);
});

test("Piano Roll and Playlist write canonical snap keys", async () => {
  const [pianoRoll, playlist] = await Promise.all([
    readFile(new URL("../src/v2/ui/piano-roll.js", import.meta.url), "utf8"),
    readFile(new URL("../src/v2/ui/playlist.js", import.meta.url), "utf8"),
  ]);
  assert.match(pianoRoll, /updatePatternSession\(\{ snap \}\)/);
  assert.doesNotMatch(pianoRoll, /updatePatternSession\(\{ snapTicks \}\)/);
  assert.match(playlist, /setSession\(\{ snap: snapValue \}\)/);
  assert.doesNotMatch(playlist, /setSession\(\{ snapTicks \}\)/);
});

test("Piano Pattern rename request cancels safely and reports canonical results", () => {
  const announcements = [];
  const projectState = createV2ProjectState();

  assert.equal(renamePianoPattern({
    announce: (message) => announcements.push(message),
    patternId: "pattern-1",
    projectState,
    requestedName: null,
  }), false);
  assert.equal(projectState.getPattern("pattern-1").name, "Pattern 1");
  assert.deepEqual(announcements, []);

  assert.equal(renamePianoPattern({
    announce: (message) => announcements.push(message),
    patternId: "pattern-1",
    projectState,
    requestedName: "  Lead Arp  ",
  }), true);
  assert.equal(projectState.getPattern("pattern-1").name, "Lead Arp");
  assert.deepEqual(announcements, ["Renamed Pattern to Lead Arp."]);

  assert.equal(renamePianoPattern({
    announce: (message) => announcements.push(message),
    patternId: "pattern-1",
    projectState,
    requestedName: "Lead Arp",
  }), false);
  assert.equal(announcements.length, 1);

  const renamed = projectState.getState();
  assert.equal(renamePianoPattern({
    announce: (message) => announcements.push(message),
    patternId: "pattern-1",
    projectState,
    requestedName: "   ",
  }), false);
  assert.equal(projectState.getState(), renamed);
  assert.deepEqual(announcements, [
    "Renamed Pattern to Lead Arp.",
    "Pattern name must contain 1 to 32 characters.",
  ]);
});

test("visible Piano Roll title delegates rename and refreshes the existing overlay", async () => {
  const [piano, studio] = await Promise.all([
    readFile(new URL("../src/v2/ui/piano-roll.js", import.meta.url), "utf8"),
    readFile(new URL("../src/v2/studio-app.js", import.meta.url), "utf8"),
  ]);

  assert.match(piano, /requestPatternName = \(pattern\) => globalThis\.prompt\?\.\("Pattern name", pattern\.name\)/);
  assert.match(piano, /function requestPatternRename\(returnFocus = canvas\)/);
  assert.match(piano, /requestedName = requestPatternName\(pattern\)/);
  assert.match(piano, /renamePianoPattern\(\{\s*announce,\s*patternId: pattern\.id,\s*projectState,\s*requestedName,\s*\}\)/);
  assert.match(piano, /rename\.addEventListener\("click", \(\) => requestPatternRename\(rename\)\)/);
  assert.match(piano, /requestPatternRename,\s*\}\);/);

  assert.match(studio, /patternName: pattern\.name,\s*name: `\$\{pattern\.name\}, Piano Roll`/);
  assert.match(studio, /titleAction\.className = "v2-floating-window-title-action"/);
  assert.match(studio, /titleAction\.setAttribute\("aria-label", `Rename \$\{descriptor\.patternName\}`\)/);
  assert.match(studio, /titleAction\.addEventListener\("click", \(\) => \{\s*owner\.requestPatternRename\?\.\(titleAction\)/);

  const openOverlay = studio.slice(
    studio.indexOf("function openPianoOverlay"),
    studio.indexOf("function synchronizePianoOverlay"),
  );
  const samePatternStart = openOverlay.indexOf(
    "if (!replace && pianoOverlay?.descriptor.patternId === descriptor.patternId)",
  );
  const samePatternUpdate = openOverlay.slice(
    samePatternStart,
    openOverlay.indexOf("closePianoOverlay()", samePatternStart),
  );
  assert.match(samePatternUpdate, /pianoOverlay\.titleAction\.textContent = descriptor\.name/);
  assert.match(samePatternUpdate, /pianoOverlay\.descriptor = descriptor/);
  assert.match(samePatternUpdate, /dom\.editorHost\.setAttribute\("aria-label", descriptor\.name\)/);
  assert.match(samePatternUpdate, /return false/);

  const projectChange = studio.slice(
    studio.indexOf("function handleProjectChange(event)"),
    studio.indexOf('projectState.addEventListener("change", handleProjectChange)'),
  );
  assert.match(projectChange, /if \(pianoOverlay\) \{\s*synchronizePianoOverlay\(workspaceState\.getState\(\), project\)/);
});

test("Playlist Pattern double-click opens instead of rebuilding on the first click", () => {
  let cancelledHandle = null;
  let openCount = 0;
  let pendingCallback = null;
  let scheduledDelay = null;
  let selectCount = 0;
  const activation = createPlaylistPatternActivation({
    cancel(handle) {
      cancelledHandle = handle;
      pendingCallback = null;
    },
    onOpen() {
      openCount += 1;
    },
    onSelect() {
      selectCount += 1;
    },
    schedule(callback, delay) {
      pendingCallback = callback;
      scheduledDelay = delay;
      return "pending-selection";
    },
  });

  assert.equal(activation.click(1), true);
  assert.equal(scheduledDelay, 250);
  assert.equal(activation.click(2), false);
  assert.equal(activation.doubleClick(), true);
  assert.equal(cancelledHandle, "pending-selection");
  assert.equal(pendingCallback, null);
  assert.equal(selectCount, 0);
  assert.equal(openCount, 1);

  activation.click(1);
  pendingCallback();
  assert.equal(selectCount, 1);
  assert.equal(openCount, 1);
});

test("Piano pointer audition stays isolated from editing gestures and keeps its routing context", async () => {
  const [piano, studio] = await Promise.all([
    readFile(new URL("../src/v2/ui/piano-roll.js", import.meta.url), "utf8"),
    readFile(new URL("../src/v2/studio-app.js", import.meta.url), "utf8"),
  ]);
  const sourceBlock = (source, startLabel, endLabel) => {
    const start = source.indexOf(startLabel);
    const end = source.indexOf(endLabel, start + startLabel.length);
    assert.notEqual(start, -1, `missing source block: ${startLabel}`);
    assert.notEqual(end, -1, `missing source boundary: ${endLabel}`);
    return source.slice(start, end);
  };

  assert.match(piano, /onAuditionPitch\s*=\s*\(\)\s*=>\s*false/);
  assert.match(
    piano,
    /className:\s*"v2-pitch-label"[\s\S]*?dataset:\s*\{\s*pitch\s*\}/,
  );

  const audition = sourceBlock(piano, "function auditionPitch", "function updatePatternSession");
  assert.match(
    audition,
    /onAuditionPitch\(Object\.freeze\(\{\s*noteId,\s*patternId:\s*pattern\.id,\s*pitch,\s*trackId:\s*auditionTrackId\(\),\s*velocity,\s*\}\)\)/,
  );
  assert.match(piano, /const PIANO_CLICK_SLOP_PX\s*=\s*4/);
  assert.match(
    piano,
    /function exceedsPianoClickSlop\(originX,\s*originY,\s*event\)\s*\{[\s\S]*?event\.clientX[\s\S]*?event\.clientY[\s\S]*?PIANO_CLICK_SLOP_PX[\s\S]*?\}/,
  );

  const pointer = sourceBlock(piano, "function handlePointerDown", "function handleContextMenu");
  const primaryGuard = pointer.indexOf("event.button !== 0");
  const pitchTarget = pointer.indexOf('.v2-pitch-label');
  const pitchPan = pointer.indexOf("startPan(event, { pitch })", pitchTarget);
  const pitchGesture = pointer.indexOf("startPitchAudition(", pitchTarget);
  const pitchReturn = pointer.indexOf("return;", pitchGesture);
  const notePan = pointer.indexOf("startPan(event, { note })", pitchReturn);
  const drawBranch = pointer.indexOf('tool === "draw"');
  assert.ok(primaryGuard >= 0 && primaryGuard < pitchTarget);
  assert.ok(pitchTarget < pitchPan && pitchPan < pitchGesture);
  assert.match(pointer.slice(pitchTarget, pitchReturn), /pitchLabel\.dataset\.pitch/);
  assert.ok(pitchGesture < pitchReturn && pitchReturn < notePan && notePan < drawBranch);
  assert.doesNotMatch(pointer, /auditionPitch\(/, "pointerdown must defer every preview to gesture commit");

  const move = sourceBlock(piano, "function startNoteMove", "function startNoteResize");
  const movePreview = sourceBlock(move, "move(moveEvent)", "commit(");
  const moveCommit = sourceBlock(move, "commit(", "cancel:");
  const stationaryMove = move.indexOf("if (deltaTick === 0 && deltaPitch === 0)");
  const stationaryMoveAudition = move.indexOf("auditionPitch(", stationaryMove);
  const stationaryMoveReturn = move.indexOf("return;", stationaryMove);
  assert.doesNotMatch(movePreview, /auditionPitch\(/);
  assert.match(move, /let dragged\s*=\s*false/);
  assert.match(movePreview, /exceedsPianoClickSlop\(originX,\s*originY,\s*moveEvent\)/);
  assert.match(movePreview, /dragged/);
  assert.match(moveCommit, /exceedsPianoClickSlop\(originX,\s*originY,\s*upEvent\)/);
  assert.match(moveCommit, /if \(!dragged\)[\s\S]*?auditionPitch\(/);
  assert.ok(stationaryMove >= 0 && stationaryMove < stationaryMoveAudition);
  assert.ok(stationaryMoveAudition < stationaryMoveReturn);
  assert.equal(move.match(/auditionPitch\(/g)?.length, 1);

  const resize = sourceBlock(piano, "function startNoteResize", "function startPitchAudition");
  const resizePreview = sourceBlock(resize, "move(moveEvent)", "commit(");
  const resizeCommit = sourceBlock(resize, "commit(", "cancel:");
  const stationaryResize = resize.indexOf("if (deltaTick === 0)");
  const stationaryResizeAudition = resize.indexOf("auditionPitch(", stationaryResize);
  const stationaryResizeReturn = resize.indexOf("return;", stationaryResize);
  assert.doesNotMatch(resizePreview, /auditionPitch\(/);
  assert.match(resize, /let dragged\s*=\s*false/);
  assert.match(resizePreview, /exceedsPianoClickSlop\(originX,\s*originY,\s*moveEvent\)/);
  assert.match(resizePreview, /dragged/);
  assert.match(resizeCommit, /exceedsPianoClickSlop\(originX,\s*originY,\s*upEvent\)/);
  assert.match(resizeCommit, /if \(!dragged\)[\s\S]*?auditionPitch\(/);
  assert.ok(stationaryResize >= 0 && stationaryResize < stationaryResizeAudition);
  assert.ok(stationaryResizeAudition < stationaryResizeReturn);
  assert.equal(resize.match(/auditionPitch\(/g)?.length, 1);

  const pitch = sourceBlock(piano, "function startPitchAudition", "function startPan");
  const pitchPreview = sourceBlock(pitch, "move(moveEvent)", "commit(");
  assert.match(pitch, /let dragged\s*=\s*false/);
  assert.match(pitchPreview, /exceedsPianoClickSlop\(originX,\s*originY,\s*moveEvent\)/);
  assert.doesNotMatch(pitchPreview, /auditionPitch\(/);
  assert.match(pitch, /commit\(upEvent\)\s*\{[\s\S]*?exceedsPianoClickSlop\(originX,\s*originY,\s*upEvent\)[\s\S]*?if \(!dragged\) auditionPitch\(/);
  assert.equal(pitch.match(/auditionPitch\(/g)?.length, 1);

  const pan = sourceBlock(piano, "function startPan", "function handlePointerDown");
  const panPreview = sourceBlock(pan, "move(moveEvent)", "commit(");
  const panCommit = sourceBlock(pan, "commit(", "cancel()");
  const context = sourceBlock(piano, "function handleContextMenu", "function renderInspector");
  assert.match(pan, /let dragged\s*=\s*false/);
  assert.match(panPreview, /exceedsPianoClickSlop\(originX,\s*originY,\s*moveEvent\)/);
  assert.doesNotMatch(panPreview, /auditionPitch\(/);
  assert.match(panCommit, /exceedsPianoClickSlop\(originX,\s*originY,\s*upEvent\)/);
  assert.match(panCommit, /if \(dragged\) return;[\s\S]*?if \(note\)[\s\S]*?auditionPitch\([\s\S]*?else if \(Number\.isInteger\(pitch\)\)[\s\S]*?auditionPitch\(/);
  assert.equal(pan.match(/auditionPitch\(/g)?.length, 2, "stationary Pan clicks audition notes and pitch labels");
  assert.doesNotMatch(context, /auditionPitch\(/);

  const pianoWiring = sourceBlock(
    studio,
    'if (surface.kind === "piano-roll")',
    'if (surface.kind === "playlist")',
  );
  assert.match(
    pianoWiring,
    /onAuditionPitch\(context\)\s*\{\s*if \(!audioEngine\.isReady\(\)\) \{[\s\S]*?return false;\s*\}\s*return keyboardAudition\.previewNote\(context\);\s*\}/,
  );
});

test("Piano overlap paths batch paste and preserve pointer/session atomicity", async () => {
  const piano = await readFile(new URL("../src/v2/ui/piano-roll.js", import.meta.url), "utf8");
  const sourceBlock = (startLabel, endLabel) => {
    const start = piano.indexOf(startLabel);
    const end = piano.indexOf(endLabel, start + startLabel.length);
    assert.notEqual(start, -1, `missing source block: ${startLabel}`);
    assert.notEqual(end, -1, `missing source boundary: ${endLabel}`);
    return piano.slice(start, end);
  };

  const paste = sourceBlock("function pasteSelection", "function deleteSelection");
  assert.equal(
    paste.match(/projectState\.addNotes\(/g)?.length,
    1,
    "Paste must submit exactly one atomic note batch",
  );
  assert.doesNotMatch(paste, /projectState\.addNote\(/);
  assert.doesNotMatch(paste, /beginHistoryGroup|endHistoryGroup/);

  const update = sourceBlock("function updateSelectedNotes", "function moveSelection");
  const projectCommit = update.indexOf("projectState.updatePattern");
  const selectionCommit = update.indexOf("persistPointerSelection(ids)");
  assert.ok(projectCommit >= 0 && projectCommit < selectionCommit);
  assert.match(update, /selectOnSuccess/);

  const moveAction = sourceBlock("function moveSelection", "function resizeSelection");
  const resizeAction = sourceBlock("function resizeSelection", "function changeVelocity");
  assert.match(moveAction, /ids\s*=\s*selectedNoteIds/);
  assert.match(moveAction, /updateSelectedNotes\([\s\S]*?ids,\s*options\)/);
  assert.match(resizeAction, /ids\s*=\s*selectedNoteIds/);
  assert.match(resizeAction, /updateSelectedNotes\([\s\S]*?ids,\s*options/);

  const moveGesture = sourceBlock("function startNoteMove", "function startNoteResize");
  const resizeGesture = sourceBlock("function startNoteResize", "function startPitchAudition");
  assert.match(
    moveGesture,
    /moveSelection\(deltaTick,\s*deltaPitch,\s*dragSelection,\s*\{\s*selectOnSuccess:\s*true\s*\}\)/,
  );
  assert.doesNotMatch(moveGesture, /persistPointerSelection\(/);
  assert.match(
    resizeGesture,
    /resizeSelection\(deltaTick,\s*dragSelection,\s*\{\s*selectOnSuccess:\s*true\s*\}\)/,
  );
  assert.doesNotMatch(resizeGesture, /persistPointerSelection\(/);

  const inspector = sourceBlock("function renderInspector", "function updatePlayhead");
  const createAction = inspector.slice(
    inspector.indexOf('textContent: "Create note here"'),
    inspector.indexOf("return;"),
  );
  const createAttempt = createAction.indexOf("addNoteAt(cursorTick, cursorPitch)");
  const createCatch = createAction.indexOf("catch (error)", createAttempt);
  const createAnnouncement = createAction.indexOf("announce(", createCatch);
  assert.ok(createAttempt >= 0 && createAttempt < createCatch);
  assert.ok(createCatch < createAnnouncement);
  assert.match(createAction.slice(createCatch), /renderEditor\(\)[\s\S]*?renderHeader\(\)/);
});

test("editor composites, shared playheads, opener routing, and replacement ownership are wired", async () => {
  const [piano, playlist, shell, studio, scheduler] = await Promise.all([
    readFile(new URL("../src/v2/ui/piano-roll.js", import.meta.url), "utf8"),
    readFile(new URL("../src/v2/ui/playlist.js", import.meta.url), "utf8"),
    readFile(new URL("../src/v2/ui/studio-shell.js", import.meta.url), "utf8"),
    readFile(new URL("../src/v2/studio-app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/v2/audio/occurrence-scheduler.js", import.meta.url), "utf8"),
  ]);
  assert.match(piano, /function startDraw\(event\)/);
  assert.match(piano, /function startMarquee\(event\)/);
  assert.match(piano, /function startPan\(event(?:,|\))/);
  assert.match(
    piano,
    /for \(const \[value, label\] of \[\s*\["draw",\s*"Draw"\],\s*\["select",\s*"Select"\]\s*\]\)/,
    "the visible Piano Roll toolbar exposes only Draw and Select",
  );
  assert.doesNotMatch(piano, /\["pan", "Pan"\]/);
  assert.match(piano, /let desktopTool = "draw";\s*let tool = getPianoToolForViewport\(mobileEditorQuery\?\.matches, desktopTool\)/);
  assert.match(piano, /const nextTool = getPianoToolForViewport\(event\.matches, desktopTool\);\s*if \(tool === nextTool\) return;\s*tool = nextTool/);
  assert.ok(piano.includes('event.target.closest?.(".v2-note-resize")'));
  assert.match(piano, /"pointercancel"/);
  assert.match(piano, /role: "listbox"/);
  assert.match(piano, /"aria-multiselectable": "true"/);
  assert.match(piano, /role: "option",\s+tabIndex: -1/);
  assert.match(piano, /"aria-keyshortcuts": "Delete Backspace Control\+B Meta\+B"/);
  assert.match(piano, /if \(isMod\(event\) && !note\) \{\s+startMarquee\(event\)/);
  assert.match(piano, /projectState\.duplicateNotes/);
  assert.match(piano, /projectState\.removeNotes\(pattern\.id, ids\)/);
  assert.match(playlist, /role: "gridcell",\s+tabIndex: -1/);
  assert.match(playlist, /"aria-multiselectable": "true"/);
  assert.match(playlist, /function startMarquee\(event\)/);
  assert.match(playlist, /projectState\.moveClips/);
  assert.match(playlist, /projectState\.duplicateClips/);
  assert.match(playlist, /isPlaylistDuplicateShortcut\(event\)/);
  assert.match(playlist, /suppressFollowingPlaylistClick/);
  assert.match(playlist, /getPlaylistRulerSeekTick\(event,[\s\S]*seekSong\(rulerSeekTick\)/);
  assert.match(playlist, /type === "playback\/seek-song"/);
  assert.match(playlist, /onOpenInstrument\(track\.id, event\.currentTarget\)/);
  assert.match(playlist, /routePlaylistContextMenu\(event,[\s\S]*onClip:[\s\S]*onInstrument:[\s\S]*onTrack:/);
  assert.match(playlist, /className: "v2-action-menu-panel v2-playlist-track-context-menu"/);
  assert.match(playlist, /textContent: "Rename Instrument"/);
  assert.match(playlist, /promptInstrumentName\(track\)/);
  assert.match(playlist, /projectState\.renameTrack\(trackId, requestedName\)/);
  assert.match(playlist, /trackAction: "instrument"/);
  assert.match(playlist, /createElement\("span", \{ textContent: track\.name, title: track\.name \}\),\s+createElement\("small", \{ textContent: "Klinto Chip" \}\)/);
  assert.match(playlist, /createPatternForPlaylistTrack\([\s\S]*onOpenPattern,[\s\S]*trackId/);
  assert.doesNotMatch(playlist, /event\.target\.closest\?\.\("button"\)\) return;\s+event\.preventDefault\(\);/);
  assert.match(playlist, /const ADD_INSTRUMENT_ROW_HEIGHT = 44/);
  assert.match(playlist, /className: "v2-playlist-add-instrument-row"/);
  assert.match(playlist, /timeline\.append\(addInstrumentRow\)/);
  assert.doesNotMatch(playlist, /v2-playlist-header-leading/);
  assert.ok(
    playlist.indexOf('className: "v2-playlist-add-instrument-row"')
      > playlist.indexOf("state.tracks.forEach"),
    "the Add Instrument row should follow the Track lanes",
  );
  assert.doesNotMatch(piano, /requestAnimationFrame/);
  assert.doesNotMatch(playlist, /requestAnimationFrame/);
  assert.match(shell, /dispatchEvent\(new CustomEvent\("transportframe"/);
  assert.match(studio, /surfaceHost\.replacePrimary/);
  assert.match(studio, /onSeek\(tick\)[\s\S]*workspaceState\.setPlaybackMode\("song"\)/);
  assert.match(studio, /markTrackInput\(trackId, event\.releaseEndTime\)/);
  assert.match(
    studio,
    /markTrackInput\(trackId, event\.releaseEndTime, inputLifecycle\)/,
  );
  assert.match(studio, /disposeAudioGraph\(\)/);
  assert.match(scheduler, /releaseVoices\(activeSession, now, \(record\) => !isRecordStillOwned/);
});
