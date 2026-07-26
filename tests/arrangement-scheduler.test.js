import assert from "node:assert/strict";
import test from "node:test";

import { createArrangementScheduler } from "../src/transport/arrangement-scheduler.js";
import {
  DEFAULT_PATTERN_ID,
  DEFAULT_TRACK_ID,
  createProjectState,
} from "../src/state/project-state.js";

function addNote(project, patternId, note = 60) {
  project.updatePattern(patternId, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => index === 0
      ? { note, gate: 0.75, volume: 0.7 }
      : step),
  }));
}

function createHarness(schedulerOptions = {}) {
  const project = createProjectState();
  let audioTime = 10;
  let timerCount = 0;
  let intervalCallback = null;
  const triggered = [];
  const stopped = [];
  const engines = new Map();
  const scheduler = createArrangementScheduler({
    getAudioTime: () => audioTime,
    getProjectState: project.getState,
    getSelectedPatternId: () => DEFAULT_PATTERN_ID,
    getSelectedTrackId: () => DEFAULT_TRACK_ID,
    getVoiceEngine(trackId) {
      if (!engines.has(trackId)) {
        engines.set(trackId, {
          trigger(options) {
            const record = { options, trackId };
            triggered.push(record);
            return { stop: (time) => stopped.push({ record, time }) };
          },
        });
      }
      return engines.get(trackId);
    },
    setIntervalFn(callback) {
      timerCount += 1;
      intervalCallback = callback;
      return timerCount;
    },
    clearIntervalFn() {},
    ...schedulerOptions,
  });
  return {
    get intervalCallback() { return intervalCallback; },
    get timerCount() { return timerCount; },
    project,
    scheduler,
    setAudioTime(value) { audioTime = value; },
    stopped,
    triggered,
  };
}

test("one scheduler clock triggers every track at the same audio time", () => {
  const harness = createHarness();
  addNote(harness.project, DEFAULT_PATTERN_ID);
  harness.project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  const secondTrackId = harness.project.addTrack("Bass");
  harness.project.addClip(secondTrackId, DEFAULT_PATTERN_ID, 0);

  assert.equal(harness.scheduler.play("arrangement"), true);
  assert.equal(harness.scheduler.play("arrangement"), false);
  assert.equal(harness.timerCount, 1);
  assert.equal(harness.triggered.length, 2);
  assert.deepEqual(new Set(harness.triggered.map(({ trackId }) => trackId)), new Set([
    DEFAULT_TRACK_ID,
    secondTrackId,
  ]));
  assert.equal(harness.triggered[0].options.startTime, harness.triggered[1].options.startTime);
});

test("pattern preview plays only the selected track and loops the pattern", () => {
  const harness = createHarness();
  addNote(harness.project, DEFAULT_PATTERN_ID, 64);
  harness.project.addTrack("Silent neighbour");

  harness.scheduler.play("pattern");

  assert.equal(harness.triggered.length, 1);
  assert.equal(harness.triggered[0].trackId, DEFAULT_TRACK_ID);
  assert.equal(harness.triggered[0].options.frequency > 300, true);
});

test("owned voices can be released without stopping other tracks", () => {
  const harness = createHarness();
  addNote(harness.project, DEFAULT_PATTERN_ID);
  const firstClipId = harness.project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  const secondTrackId = harness.project.addTrack("Bass");
  harness.project.addClip(secondTrackId, DEFAULT_PATTERN_ID, 0);
  harness.scheduler.play("arrangement");

  assert.equal(harness.scheduler.releaseOwnedBy({ clipId: firstClipId }), true);
  assert.equal(harness.stopped.length, 1);
  assert.equal(harness.stopped[0].record.trackId, DEFAULT_TRACK_ID);
  assert.equal(harness.scheduler.getScheduledVoiceCount(), 1);
});

test("arrangement playback rejects a start position beyond the final clip", () => {
  const harness = createHarness();
  addNote(harness.project, DEFAULT_PATTERN_ID);
  harness.project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  harness.scheduler.setStartStep(32);

  assert.throws(() => harness.scheduler.play("arrangement"), /beyond the final clip/);
  assert.equal(harness.timerCount, 0);
});
test("arrangement playback starts from the selected timeline step", () => {
  const harness = createHarness();
  harness.project.updatePattern(DEFAULT_PATTERN_ID, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => index === 8
      ? { note: 67, gate: 0.75, volume: 0.7 }
      : step),
  }));
  harness.project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  harness.scheduler.setStartStep(8);

  assert.equal(harness.scheduler.play("arrangement"), true);
  assert.equal(harness.scheduler.getPlayheadStep(), 8);
  assert.equal(harness.triggered.length, 1);
  assert.equal(harness.triggered[0].options.frequency > 390, true);
});

test("timeline snapshots follow the scheduler's audio clock", () => {
  const harness = createHarness();
  addNote(harness.project, DEFAULT_PATTERN_ID);
  harness.project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);

  harness.scheduler.play("arrangement");
  harness.setAudioTime(10.1125);
  const playing = harness.scheduler.getTimelineSnapshot();

  assert.equal(playing.mode, "arrangement");
  assert.equal(playing.status, "playing");
  assert.equal(playing.stepIndex, 0);
  assert.ok(Math.abs(playing.stepProgress - 0.5) < 0.0001);
  assert.equal(playing.stepDurationSeconds, 0.125);

  harness.scheduler.pause();
  const paused = harness.scheduler.getTimelineSnapshot();
  assert.equal(paused.audioTime, null);
  assert.equal(paused.status, "paused");
  assert.equal(paused.stepProgress, 0);
});

test("a playing whole-arrangement loop follows extension and becomes empty safely", () => {
  const harness = createHarness();
  const errors = [];
  harness.scheduler.addEventListener("statechange", (event) => {
    if (event.detail.error) errors.push(event.detail.error);
  });
  addNote(harness.project, DEFAULT_PATTERN_ID);
  const first = harness.project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  harness.project.setLoop({
    enabled: true,
    endStep: 16,
    mode: "arrangement",
    startStep: 0,
  });

  harness.scheduler.play("arrangement");
  const second = harness.project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 16);
  harness.setAudioTime(11.96);
  harness.intervalCallback();
  assert.equal(harness.triggered.length, 2);

  harness.project.removeClip(second);
  harness.project.removeClip(first);
  harness.setAudioTime(12.1);
  harness.intervalCallback();
  harness.setAudioTime(13);
  harness.intervalCallback();
  assert.equal(harness.scheduler.getState().status, "stopped");
  assert.deepEqual(errors, []);
});

test("shortening a live loop replaces the complete pre-scheduled future suffix", () => {
  const harness = createHarness({
    lookAheadSeconds: 0.5,
    startLeadSeconds: 0,
  });
  addNote(harness.project, DEFAULT_PATTERN_ID);
  harness.project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  harness.project.setLoop({
    enabled: true,
    endStep: 3,
    mode: "custom",
    startStep: 0,
  });
  harness.scheduler.play("arrangement");

  harness.setAudioTime(10.01);
  harness.project.setLoop({ endStep: 2, mode: "custom" });
  harness.intervalCallback();

  assert.equal(harness.scheduler.getTimelineSnapshot(10.26).stepIndex, 0);
  assert.equal(harness.scheduler.getTimelineSnapshot(10.39).stepIndex, 1);
  assert.equal(harness.scheduler.getTimelineSnapshot(10.505).stepIndex, 0);
  assert.ok(harness.stopped.some(({ record }) => record.options.startTime === 10.375));
});
