import assert from "node:assert/strict";
import test from "node:test";

import { midiNoteToFrequency } from "../src/audio/pitch-policy.js";
import {
  createV2KeyboardAudition,
  V2_KEYBOARD_AUDITION_HEARTBEAT_SECONDS,
  V2_KEYBOARD_AUDITION_HOLD_SECONDS,
  V2_PIANO_PREVIEW_SECONDS,
} from "../src/v2/audio/keyboard-audition.js";
import { VOICE_RETIRE_RAMP_SECONDS } from "../src/v2/audio/klinto-chip-synth.js";

function keyEvent(type, code, values = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries({
    altKey: false,
    code,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    ...values,
  })) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}

test("V2 computer keys audition the selected Track through the production synth route", () => {
  const documentLike = new EventTarget();
  documentLike.querySelectorAll = () => [];
  let audioTime = 4;
  let graphSyncs = 0;
  const renderEvents = [];
  const inputEvents = [];
  const stops = [];
  const project = {
    id: "project-audition",
    tracks: [{
      id: "track-2",
      instrument: {
        params: {
          attackSeconds: 0.012,
          octave: 1,
          releaseSeconds: 0.2,
          waveform: "pulse25",
        },
      },
    }],
  };
  const audition = createV2KeyboardAudition({
    audioEngine: {
      getCurrentTime: () => audioTime,
      isReady: () => true,
    },
    documentLike,
    ensureAudioGraph: () => { graphSyncs += 1; },
    getProject: () => project,
    getSynthRuntime: () => ({
      trigger(event) {
        renderEvents.push(event);
        let ended = false;
        const listeners = new Set();
        return {
          addEndedListener(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          get ended() { return ended; },
          retire(time) {
            if (ended) return false;
            ended = true;
            stops.push({ kind: "retire", time });
            for (const listener of listeners) listener();
            return true;
          },
          stop(time) {
            if (ended) return false;
            ended = true;
            stops.push({ kind: "stop", time });
            for (const listener of listeners) listener();
            return true;
          },
        };
      },
    }),
    getTrackId: () => "track-2",
    keyupTarget: documentLike,
    onTrackInput: (trackId, event) => inputEvents.push({ ...event, trackId }),
  });

  const down = keyEvent("keydown", "KeyZ");
  documentLike.dispatchEvent(down);
  assert.equal(down.defaultPrevented, true);
  assert.equal(graphSyncs, 1);
  assert.equal(renderEvents.length, 1);
  assert.equal(renderEvents[0].trackId, "track-2");
  assert.equal(renderEvents[0].waveform, "pulse25");
  assert.equal(renderEvents[0].frequencyHz, midiNoteToFrequency(72));
  assert.equal(renderEvents[0].startTime, 4);
  assert.equal(renderEvents[0].durationSeconds, V2_KEYBOARD_AUDITION_HOLD_SECONDS);
  assert.equal(renderEvents[0].attackSeconds, 0.012);
  assert.equal(renderEvents[0].releaseSeconds, 0.2);
  assert.equal(audition.getActiveVoiceCount(), 1);
  assert.deepEqual(inputEvents, [{
    trackId: "track-2",
    releaseEndTime: 4,
  }], "keydown marks only the observed start, never the provisional 30-second gate");

  documentLike.dispatchEvent(keyEvent("keydown", "KeyZ", { repeat: true }));
  assert.equal(renderEvents.length, 1);

  audioTime = 5;
  const up = keyEvent("keyup", "KeyZ");
  documentLike.dispatchEvent(up);
  assert.equal(up.defaultPrevented, true);
  assert.deepEqual(stops, [{ kind: "stop", time: 5 }]);
  assert.equal(audition.getActiveVoiceCount(), 0);
  assert.deepEqual(inputEvents, [
    { trackId: "track-2", releaseEndTime: 4 },
    { trackId: "track-2", releaseEndTime: 5.21 },
  ]);
  assert.equal(audition.dispose(), true);
  assert.equal(audition.dispose(), false);
});

test("V2 keyboard audition enforces the shared sixteen-voice limit", () => {
  const documentLike = new EventTarget();
  documentLike.querySelectorAll = () => [];
  const retired = [];
  const inputEvents = [];
  const project = {
    tracks: [{
      id: "track-1",
      instrument: {
        params: {
          attackSeconds: 0.008,
          octave: 0,
          releaseSeconds: 0.03,
          waveform: "square",
        },
      },
    }],
  };
  const audition = createV2KeyboardAudition({
    audioEngine: { getCurrentTime: () => 2, isReady: () => true },
    documentLike,
    getProject: () => project,
    getSynthRuntime: () => ({
      trigger() {
        return {
          addEndedListener: () => () => {},
          retire: () => { retired.push(true); return true; },
          stop: () => true,
        };
      },
    }),
    getTrackId: () => "track-1",
    keyupTarget: documentLike,
    onTrackInput: (trackId, event) => inputEvents.push({ ...event, trackId }),
  });
  const codes = [
    "KeyZ", "KeyS", "KeyX", "KeyD", "KeyC", "KeyV", "KeyG", "KeyB", "KeyH",
    "KeyN", "KeyJ", "KeyM", "KeyQ", "Digit2", "KeyW", "Digit3", "KeyE",
  ];
  for (const code of codes) documentLike.dispatchEvent(keyEvent("keydown", code));
  assert.equal(retired.length, 1);
  assert.equal(inputEvents.filter(({ releaseEndTime }) => (
    releaseEndTime === 2
  )).length, codes.length);
  assert.equal(inputEvents.filter(({ releaseEndTime }) => (
    releaseEndTime === 2 + VOICE_RETIRE_RAMP_SECONDS
  )).length, 1);
  assert.equal(audition.getActiveVoiceCount(), 16);
  audition.dispose();
});

test("V2 keyboard audition marks the planned input end when a held voice expires naturally", () => {
  const documentLike = new EventTarget();
  documentLike.querySelectorAll = () => [];
  let finishVoice;
  const inputEvents = [];
  const project = {
    id: "project-natural-audition",
    tracks: [{
      id: "track-1",
      instrument: {
        params: {
          attackSeconds: 0.008,
          octave: 0,
          releaseSeconds: 0.03,
          waveform: "square",
        },
      },
    }],
  };
  const audition = createV2KeyboardAudition({
    audioEngine: { getCurrentTime: () => 7, isReady: () => true },
    documentLike,
    getProject: () => project,
    getSynthRuntime: () => ({
      trigger() {
        const listeners = new Set();
        let ended = false;
        finishVoice = () => {
          if (ended) return;
          ended = true;
          for (const listener of listeners) listener();
        };
        return {
          addEndedListener(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          get ended() { return ended; },
          retire: () => false,
          stop: () => false,
        };
      },
    }),
    getTrackId: () => "track-1",
    keyupTarget: documentLike,
    onTrackInput: (trackId, event) => inputEvents.push({ ...event, trackId }),
  });

  documentLike.dispatchEvent(keyEvent("keydown", "KeyZ"));
  assert.deepEqual(inputEvents, [{
    trackId: "track-1",
    releaseEndTime: 7,
  }]);
  assert.equal(audition.getActiveVoiceCount(), 1);

  finishVoice();
  assert.deepEqual(inputEvents, [
    { trackId: "track-1", releaseEndTime: 7 },
    {
      trackId: "track-1",
      releaseEndTime: 7
        + V2_KEYBOARD_AUDITION_HOLD_SECONDS
        + 0.03
        + 0.01,
    },
  ]);
  assert.equal(audition.getActiveVoiceCount(), 0);
  finishVoice();
  assert.equal(inputEvents.length, 2);
  audition.dispose();
});

test("V2 keyboard audition keeps held Track and shared Master routes alive with observed-time heartbeats", () => {
  const documentLike = new EventTarget();
  documentLike.querySelectorAll = () => [];
  let audioTime = 0;
  let selectedTrackId = "track-1";
  let heartbeatCallback;
  let heartbeatClears = 0;
  const inputEvents = [];
  const inputLifecycles = [];
  const renderEvents = [];
  const trackDeadlines = new Map();
  let masterDeadline = -Infinity;
  const project = {
    id: "project-overlapping-audition",
    tracks: [
      {
        id: "track-1",
        instrument: {
          params: {
            attackSeconds: 0.008,
            octave: 0,
            releaseSeconds: 0.2,
            waveform: "square",
          },
        },
      },
      {
        id: "track-2",
        instrument: {
          params: {
            attackSeconds: 0.02,
            octave: 1,
            releaseSeconds: 0.4,
            waveform: "pulse25",
          },
        },
      },
    ],
  };
  const audition = createV2KeyboardAudition({
    audioEngine: { getCurrentTime: () => audioTime, isReady: () => true },
    clearIntervalLike: () => { heartbeatClears += 1; },
    documentLike,
    getProject: () => project,
    getSynthRuntime: () => ({
      trigger(event) {
        renderEvents.push(event);
        const listeners = new Set();
        let ended = false;
        return {
          addEndedListener(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          get ended() { return ended; },
          retire: () => false,
          stop() {
            if (ended) return false;
            ended = true;
            for (const listener of listeners) listener();
            return true;
          },
        };
      },
    }),
    getTrackId: () => selectedTrackId,
    keyupTarget: documentLike,
    onTrackInput(trackId, event, lifecycle) {
      inputEvents.push({ ...event, trackId });
      inputLifecycles.push({ ...lifecycle, trackId });
      trackDeadlines.set(
        trackId,
        Math.max(trackDeadlines.get(trackId) ?? -Infinity, event.releaseEndTime),
      );
      masterDeadline = Math.max(masterDeadline, event.releaseEndTime);
    },
    setIntervalLike(callback, milliseconds) {
      assert.equal(milliseconds, V2_KEYBOARD_AUDITION_HEARTBEAT_SECONDS * 1000);
      heartbeatCallback = callback;
      return 1;
    },
  });

  documentLike.dispatchEvent(keyEvent("keydown", "KeyZ"));
  selectedTrackId = "track-2";
  documentLike.dispatchEvent(keyEvent("keydown", "KeyX"));
  assert.equal(renderEvents[0].trackId, "track-1");
  assert.equal(renderEvents[0].waveform, "square");
  assert.equal(renderEvents[0].frequencyHz, midiNoteToFrequency(60));
  assert.equal(renderEvents[1].trackId, "track-2");
  assert.equal(renderEvents[1].waveform, "pulse25");
  assert.equal(renderEvents[1].frequencyHz, midiNoteToFrequency(74));
  assert.deepEqual(inputEvents, [
    { trackId: "track-1", releaseEndTime: 0 },
    { trackId: "track-2", releaseEndTime: 0 },
  ]);

  audioTime = 1;
  documentLike.dispatchEvent(keyEvent("keyup", "KeyZ"));
  assert.equal(trackDeadlines.get("track-1"), 1.21);
  assert.equal(masterDeadline, 1.21);

  audioTime = 5;
  heartbeatCallback();
  audioTime = 10;
  heartbeatCallback();
  assert.equal(trackDeadlines.get("track-1"), 1.21, "a released Track is not overextended");
  assert.equal(trackDeadlines.get("track-2"), 10);
  assert.equal(masterDeadline, 10, "the still-held voice refreshes the shared Master route");

  audioTime = 12;
  documentLike.dispatchEvent(keyEvent("keyup", "KeyX"));
  assert.equal(trackDeadlines.get("track-2"), 12.41);
  assert.equal(masterDeadline, 12.41);
  assert.equal(heartbeatClears, 1);
  assert.deepEqual(inputLifecycles, [
    { inputId: "keyboard-audition:1", phase: "start", trackId: "track-1" },
    { inputId: "keyboard-audition:2", phase: "start", trackId: "track-2" },
    { inputId: "keyboard-audition:1", phase: "end", trackId: "track-1" },
    { inputId: "keyboard-audition:2", phase: "active", trackId: "track-2" },
    { inputId: "keyboard-audition:2", phase: "active", trackId: "track-2" },
    { inputId: "keyboard-audition:2", phase: "end", trackId: "track-2" },
  ]);
  audition.dispose();
});

test("V2 keyboard audition drains a held Track before remove/undo graph sync and ignores later keyup", () => {
  const documentLike = new EventTarget();
  documentLike.querySelectorAll = () => [];
  const instrument = {
    params: {
      attackSeconds: 0.008,
      octave: 0,
      releaseSeconds: 0.2,
      waveform: "square",
    },
  };
  const originalProject = {
    id: "project-track-removal",
    tracks: [
      { id: "track-held", instrument },
      { id: "track-retained", instrument },
    ],
  };
  let project = originalProject;
  let syncedTrackIds = new Set(project.tracks.map(({ id }) => id));
  const inputEvents = [];
  const inputLifecycles = [];
  let stopCalls = 0;
  const audition = createV2KeyboardAudition({
    audioEngine: { getCurrentTime: () => 3, isReady: () => true },
    documentLike,
    getProject: () => project,
    getSynthRuntime: () => ({
      trigger() {
        const listeners = new Set();
        let ended = false;
        return {
          addEndedListener(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          get ended() { return ended; },
          retire: () => false,
          stop() {
            if (ended) return false;
            stopCalls += 1;
            ended = true;
            for (const listener of listeners) listener();
            return true;
          },
        };
      },
    }),
    getTrackId: () => "track-held",
    keyupTarget: documentLike,
    onTrackInput(trackId, event, lifecycle) {
      if (!syncedTrackIds.has(trackId)) {
        throw new RangeError(`Unknown Track: ${trackId}`);
      }
      inputEvents.push({ ...event, trackId });
      inputLifecycles.push({ ...lifecycle, trackId });
    },
  });

  documentLike.dispatchEvent(keyEvent("keydown", "KeyZ"));
  assert.equal(audition.getActiveVoiceCount(), 1);

  project = {
    ...project,
    tracks: project.tracks.filter(({ id }) => id !== "track-held"),
  };
  assert.equal(audition.reconcileProject(project), true, "ownership drains before graph sync");
  assert.equal(audition.getActiveVoiceCount(), 0);
  assert.equal(stopCalls, 1);
  syncedTrackIds = new Set(project.tracks.map(({ id }) => id));

  project = originalProject;
  syncedTrackIds = new Set(project.tracks.map(({ id }) => id));
  assert.equal(audition.reconcileProject(project), false, "undo does not recreate key ownership");
  const keyup = keyEvent("keyup", "KeyZ");
  assert.doesNotThrow(() => documentLike.dispatchEvent(keyup));
  assert.equal(keyup.defaultPrevented, false);
  assert.equal(stopCalls, 1, "the removed Track no longer owns the key");
  assert.deepEqual(inputEvents, [
    { trackId: "track-held", releaseEndTime: 3 },
    { trackId: "track-held", releaseEndTime: 3.21 },
  ]);
  assert.deepEqual(inputLifecycles, [
    { inputId: "keyboard-audition:1", phase: "start", trackId: "track-held" },
    { inputId: "keyboard-audition:1", phase: "end", trackId: "track-held" },
  ]);
  audition.dispose();
});

test("V2 Piano previews use the explicit Track's complete finite audition event", () => {
  const documentLike = new EventTarget();
  documentLike.querySelectorAll = () => [];
  const renderEvents = [];
  const inputEvents = [];
  const inputLifecycles = [];
  let heartbeatStarts = 0;
  let finishPreview;
  const project = {
    id: "project-piano-preview",
    tracks: [
      {
        id: "track-fallback",
        instrument: {
          params: {
            attackSeconds: 0.008,
            octave: 0,
            releaseSeconds: 0.03,
            waveform: "square",
          },
        },
      },
      {
        id: "track-preview",
        instrument: {
          params: {
            attackSeconds: 0.02,
            octave: 1,
            releaseSeconds: 0.3,
            waveform: "pulse25",
          },
        },
      },
    ],
  };
  const audition = createV2KeyboardAudition({
    audioEngine: { getCurrentTime: () => 6, isReady: () => true },
    documentLike,
    getProject: () => project,
    getSynthRuntime: () => ({
      trigger(event) {
        renderEvents.push(event);
        const listeners = new Set();
        let ended = false;
        finishPreview = () => {
          if (ended) return false;
          ended = true;
          for (const listener of listeners) listener();
          return true;
        };
        return {
          addEndedListener(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          get ended() { return ended; },
          retire: finishPreview,
          stop: finishPreview,
        };
      },
    }),
    getTrackId: () => "track-fallback",
    keyupTarget: documentLike,
    onTrackInput(trackId, event, lifecycle) {
      inputEvents.push({ ...event, trackId });
      inputLifecycles.push({ ...lifecycle, trackId });
    },
    setIntervalLike() {
      heartbeatStarts += 1;
      return 1;
    },
  });

  assert.equal(audition.previewNote({
    noteId: "note-preview",
    patternId: "pattern-preview",
    pitch: 60,
    trackId: "track-preview",
    velocity: 0.35,
  }), true);
  assert.equal(V2_PIANO_PREVIEW_SECONDS, 0.14);
  assert.equal(renderEvents.length, 1);
  const preview = renderEvents[0];
  assert.equal(preview.trackId, "track-preview", "the explicit Piano Track overrides live-key context");
  assert.equal(preview.frequencyHz, midiNoteToFrequency(72), "the Track octave transposes stored pitch");
  assert.equal(preview.waveform, "pulse25");
  assert.equal(preview.attackSeconds, 0.02);
  assert.equal(preview.releaseSeconds, 0.3);
  assert.equal(preview.velocity, 0.35);
  assert.equal(preview.durationSeconds, V2_PIANO_PREVIEW_SECONDS);
  assert.equal(preview.startTime, 6);
  assert.equal(preview.releaseEndTime, 6 + V2_PIANO_PREVIEW_SECONDS + 0.3 + 0.01);
  assert.match(preview.ownership.occurrenceId, /^piano-preview:/);
  assert.deepEqual(preview.ownership, {
    clipId: null,
    mode: "audition",
    noteId: "note-preview",
    occurrenceId: preview.ownership.occurrenceId,
    patternId: "pattern-preview",
    projectId: "project-piano-preview",
    trackId: "track-preview",
  });
  assert.deepEqual(inputEvents, [{
    releaseEndTime: preview.releaseEndTime,
    trackId: "track-preview",
  }]);
  assert.deepEqual(inputLifecycles, [{
    inputId: preview.ownership.occurrenceId,
    phase: "start",
    trackId: "track-preview",
  }]);
  assert.equal(heartbeatStarts, 0, "finite previews do not start the held-key heartbeat");
  assert.equal(audition.getActiveVoiceCount(), 1);

  finishPreview();
  assert.equal(audition.getActiveVoiceCount(), 0);
  assert.deepEqual(inputEvents, [
    { releaseEndTime: preview.releaseEndTime, trackId: "track-preview" },
    { releaseEndTime: preview.releaseEndTime, trackId: "track-preview" },
  ]);
  assert.deepEqual(inputLifecycles, [
    { inputId: preview.ownership.occurrenceId, phase: "start", trackId: "track-preview" },
    { inputId: preview.ownership.occurrenceId, phase: "end", trackId: "track-preview" },
  ]);

  assert.equal(audition.previewNote({
    noteId: "silent-note",
    patternId: "pattern-preview",
    pitch: 64,
    trackId: "track-preview",
    velocity: 0,
  }), false);
  assert.equal(renderEvents.length, 1, "zero velocity schedules no preview voice");
  assert.equal(audition.dispose(), true);
});

test("V2 Piano preview retrigger retires only the prior preview without stealing held keys", (t) => {
  const documentLike = new EventTarget();
  documentLike.querySelectorAll = () => [];
  const voices = [];
  const project = {
    id: "project-preview-ownership",
    tracks: [{
      id: "track-1",
      instrument: {
        params: {
          attackSeconds: 0.008,
          octave: 0,
          releaseSeconds: 0.2,
          waveform: "square",
        },
      },
    }],
  };
  const audition = createV2KeyboardAudition({
    audioEngine: { getCurrentTime: () => 3, isReady: () => true },
    documentLike,
    getProject: () => project,
    getSynthRuntime: () => ({
      trigger(event) {
        const listeners = new Set();
        const operations = [];
        let ended = false;
        let stopTime = event.startTime + event.durationSeconds;
        const finish = (kind, time) => {
          if (ended) return false;
          operations.push({ kind, time });
          ended = true;
          for (const listener of listeners) listener();
          return true;
        };
        const record = {
          event,
          finishNaturally: () => finish("natural", stopTime),
          operations,
        };
        voices.push(record);
        return {
          addEndedListener(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          get ended() { return ended; },
          retire: (time) => finish("retire", time),
          stop(time) {
            if (ended || time >= stopTime) return false;
            stopTime = time;
            operations.push({ kind: "stop", time });
            return true;
          },
        };
      },
    }),
    getTrackId: () => "track-1",
    keyupTarget: documentLike,
  });
  t.after(() => audition.dispose());

  documentLike.dispatchEvent(keyEvent("keydown", "KeyZ"));
  assert.equal(audition.previewNote({
    noteId: "note-1",
    patternId: "pattern-1",
    pitch: 64,
    trackId: "track-1",
    velocity: 0.6,
  }), true);
  assert.equal(audition.previewNote({
    noteId: "note-2",
    patternId: "pattern-1",
    pitch: 67,
    trackId: "track-1",
    velocity: 0.7,
  }), true);

  assert.equal(voices.length, 3);
  assert.deepEqual(voices[0].operations, [], "the computer-key voice remains held");
  assert.deepEqual(
    voices[1].operations,
    [{ kind: "retire", time: 3 }],
    "retrigger immediately retires and removes exactly the prior Piano preview",
  );
  assert.deepEqual(voices[2].operations, []);
  assert.equal(audition.getActiveVoiceCount(), 2);
});

test("V2 Piano preview Track removal retires a release tail before graph synchronization", () => {
  const documentLike = new EventTarget();
  documentLike.querySelectorAll = () => [];
  let audioTime = 4;
  const instrument = {
    params: {
      attackSeconds: 0.008,
      octave: 0,
      releaseSeconds: 1,
      waveform: "square",
    },
  };
  let project = {
    id: "project-preview-track-removal",
    tracks: [
      { id: "track-preview", instrument },
      { id: "track-retained", instrument },
    ],
  };
  let syncedTrackIds = new Set(project.tracks.map(({ id }) => id));
  const inputEvents = [];
  const inputLifecycles = [];
  let previewRuntime;
  const audition = createV2KeyboardAudition({
    audioEngine: { getCurrentTime: () => audioTime, isReady: () => true },
    documentLike,
    getProject: () => project,
    getSynthRuntime: () => ({
      trigger(event) {
        const listeners = new Set();
        let ended = false;
        let stopTime = event.startTime + event.durationSeconds;
        const operations = [];
        const finish = (kind, time) => {
          if (ended) return false;
          operations.push({ kind, time });
          ended = true;
          for (const listener of listeners) listener();
          return true;
        };
        previewRuntime = {
          finishNaturally: () => finish("natural", stopTime),
          operations,
        };
        return {
          addEndedListener(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          get ended() { return ended; },
          retire: (time) => finish("retire", time),
          stop(time) {
            if (ended || time >= stopTime) return false;
            stopTime = time;
            operations.push({ kind: "stop", time });
            return true;
          },
        };
      },
    }),
    getTrackId: () => "track-retained",
    keyupTarget: documentLike,
    onTrackInput(trackId, event, lifecycle) {
      if (!syncedTrackIds.has(trackId)) {
        throw new RangeError(`Stale input lifecycle for removed Track: ${trackId}`);
      }
      inputEvents.push({ ...event, trackId });
      inputLifecycles.push({ ...lifecycle, trackId });
    },
  });

  assert.equal(audition.previewNote({
    noteId: "note-preview",
    patternId: "pattern-preview",
    pitch: 60,
    trackId: "track-preview",
    velocity: 0.8,
  }), true);
  const inputId = inputLifecycles[0].inputId;
  assert.deepEqual(inputLifecycles, [{
    inputId,
    phase: "start",
    trackId: "track-preview",
  }]);

  audioTime = 4.2;
  project = {
    ...project,
    tracks: project.tracks.filter(({ id }) => id !== "track-preview"),
  };
  assert.equal(audition.reconcileProject(project), true);
  assert.deepEqual(previewRuntime.operations, [{ kind: "retire", time: 4.2 }]);
  assert.equal(audition.getActiveVoiceCount(), 0);
  assert.deepEqual(inputEvents, [
    {
      releaseEndTime: 4 + V2_PIANO_PREVIEW_SECONDS + 1 + 0.01,
      trackId: "track-preview",
    },
    {
      releaseEndTime: 4.2 + VOICE_RETIRE_RAMP_SECONDS,
      trackId: "track-preview",
    },
  ]);
  assert.deepEqual(inputLifecycles, [
    { inputId, phase: "start", trackId: "track-preview" },
    { inputId, phase: "end", trackId: "track-preview" },
  ]);

  syncedTrackIds = new Set(project.tracks.map(({ id }) => id));
  assert.doesNotThrow(() => previewRuntime.finishNaturally());
  assert.equal(previewRuntime.finishNaturally(), false, "a retired preview cannot emit a later stale end");
  assert.equal(inputLifecycles.length, 2);
  audition.dispose();
});
