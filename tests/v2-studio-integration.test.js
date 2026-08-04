import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getBoundedPianoMove,
  getPianoMarqueeNoteIds,
} from "../src/v2/ui/piano-roll.js";
import { resolvePlaylistFocusTarget } from "../src/v2/ui/playlist.js";import {
  createStudioShell,
  getGlobalHistoryAction,
} from "../src/v2/ui/studio-shell.js";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(value, force) {
    if (force) this.values.add(value);
    else this.values.delete(value);
    return Boolean(force);
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
    this.style = {};
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

function createShellHarness({ schedulerState, workspacePlayback }) {
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
    workspace.setPlayback({ songPlayheadTick: tick });
  };
  workspace.setPatternPlayhead = (tick) => workspace.setPlayback({ patternPlayheadTick: tick });
  workspace.activatePrimary = () => false;
  workspace.activateMixer = () => false;

  const schedulerEvents = new EventTarget();
  let currentSchedulerState = { ...schedulerState };
  let playError = null;
  let seekError = null;
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
    stop: () => true,
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

  const loopSummary = harness.root.querySelector("#loop-summary");
  assert.equal(loopSummary.textContent, "Song loop: Off");
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
  loopEnabled.checked = true;
  loopEnabled.dispatchEvent(new Event("change"));
  assert.deepEqual(harness.loopCalls.at(-1), { enabled: true });
  assert.equal(loopSummary.textContent, "Song loop: On");

  harness.workspace.setPlayback({ mode: "pattern" });
  assert.equal(loopSummary.textContent, "Pattern repeats");
  harness.workspace.setPlayback({ mode: "song" });
  assert.equal(loopSummary.textContent, "Song loop: On");

  loopStart.value = "24";
  loopEnd.value = "96";
  loopEnd.dispatchEvent(new Event("change"));
  assert.deepEqual(harness.loopCalls.at(-1), {
    endTick: 96,
    mode: "custom",
    startTick: 24,
  });

  harness.root.querySelector("#global-undo").click();
  harness.root.querySelector("#global-redo").click();
  assert.deepEqual(harness.historyCalls, { redo: 1, undo: 1 });
  harness.shell.dispose();
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
  const auditionStop = handler.indexOf("if (removedTrack) keyboardAudition.stopAll()");
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
  assert.match(piano, /function startPan\(event\)/);
  assert.ok(piano.includes('event.target.closest?.(".v2-note-resize")'));
  assert.match(piano, /"pointercancel"/);
  assert.match(piano, /role: "listbox"/);
  assert.match(piano, /"aria-multiselectable": "true"/);
  assert.match(piano, /role: "option",\s+tabIndex: -1/);
  assert.match(playlist, /role: "gridcell",\s+tabIndex: -1/);
  assert.match(playlist, /onOpenInstrument\(track\.id, event\.currentTarget\)/);
  assert.doesNotMatch(piano, /requestAnimationFrame/);
  assert.doesNotMatch(playlist, /requestAnimationFrame/);
  assert.match(shell, /dispatchEvent\(new CustomEvent\("transportframe"/);
  assert.match(studio, /surfaceHost\.replacePrimary/);
  assert.match(studio, /markTrackInput\(trackId, event\.releaseEndTime\)/);
  assert.match(studio, /disposeAudioGraph\(\)/);
  assert.match(scheduler, /releaseVoices\(activeSession, now, \(record\) => !isRecordStillOwned/);
});
