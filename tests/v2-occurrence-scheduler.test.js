import assert from "node:assert/strict";
import test from "node:test";

import { createV2Scheduler } from "../src/v2/audio/occurrence-scheduler.js";
import { createDefaultV2Project } from "../src/v2/domain/index.js";

function note(id, pitch, startTick = 0, durationTicks = 24, velocity = 0.7) {
  return { id, pitch, startTick, durationTicks, velocity };
}

function createHarness(project = structuredClone(createDefaultV2Project()), options = {}) {
  let audioTime = 10;
  let intervalCallback = null;
  let timerCount = 0;
  const scheduled = [];
  const stopped = [];
  const retired = [];
  const synth = {
    trigger(event) {
      const record = { ended: false, event };
      scheduled.push(record);
      return {
        get ended() { return record.ended; },
        retire(time) { retired.push({ record, time }); return true; },
        stop(time) { stopped.push({ record, time }); return true; },
      };
    },
  };
  const scheduler = createV2Scheduler({
    clearIntervalFn() {},
    getAudioTime: () => audioTime,
    getPatternId: () => "pattern-1",
    getProject: () => project,
    getSynthRuntime: () => synth,
    getTrackId: () => "track-1",
    lookAheadSeconds: 0.1,
    setIntervalFn(callback) {
      intervalCallback = callback;
      timerCount += 1;
      return timerCount;
    },
    startLeadSeconds: 0,
    ...options,
  });
  return {
    get intervalCallback() { return intervalCallback; },
    get project() { return project; },
    set project(value) { project = value; },
    get timerCount() { return timerCount; },
    retired,
    scheduled,
    scheduler,
    setAudioTime(value) { audioTime = value; },
    stopped,
  };
}

test("canonical simultaneous submission retires the oldest voice before number seventeen", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = Array.from({ length: 17 }, (_, index) => (
    note(`note-${String(index).padStart(2, "0")}`, 36 + index, 0, 384)
  ));
  const harness = createHarness(project);
  assert.equal(harness.scheduler.play({ mode: "pattern" }), true);
  assert.equal(harness.scheduler.play({ mode: "pattern" }), false);
  assert.equal(harness.timerCount, 1);
  assert.deepEqual(harness.scheduled.map(({ event }) => event.pitch), Array.from({ length: 17 }, (_, i) => 36 + i));
  assert.equal(harness.retired.length, 1);
  assert.equal(harness.retired[0].record, harness.scheduled[0]);
  assert.equal(harness.retired[0].time, 10);
  assert.equal(harness.scheduler.getScheduledVoiceCount(), 16);
});

test("future scheduled voices count toward the canonical Track cap until retired or ended", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = Array.from({ length: 17 }, (_, index) => (
    note(`future-${String(index).padStart(2, "0")}`, 60, index, 1)
  ));
  const harness = createHarness(project, { lookAheadSeconds: 0.5 });

  harness.scheduler.play({ mode: "pattern" });

  assert.equal(harness.scheduled.length, 17);
  assert.equal(harness.retired.length, 1);
  assert.equal(harness.retired[0].record, harness.scheduled[0]);
  assert.equal(harness.retired[0].time, 10 + 16 / 192);
  assert.equal(harness.scheduler.getScheduledVoiceCount(), 16);
});
test("Pattern loop wrap keeps canonical identity and clips gates at the boundary", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = [note("edge", 60, 383, 1)];
  const harness = createHarness(project, { lookAheadSeconds: 0.5 });
  harness.scheduler.play({ mode: "pattern" });
  harness.setAudioTime(11.99);
  harness.intervalCallback();
  harness.setAudioTime(13.6);
  harness.intervalCallback();
  assert.deepEqual(harness.scheduled.map(({ event }) => event.startTime), [
    10 + 383 / 192,
    12 + 383 / 192,
  ]);
  assert.equal(new Set(harness.scheduled.map(({ event }) => event.occurrenceId)).size, 2);
  assert.deepEqual(harness.scheduled.map(({ event }) => event.playbackDurationTicks), [1, 1]);
});

test("tempo changes retain the tick playhead, cancel future submissions and rebuild once", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = [
    note("now", 60, 0, 12),
    note("future", 61, 18, 12),
    note("later", 62, 36, 12),
  ];
  const harness = createHarness(project, { lookAheadSeconds: 0.2 });
  harness.scheduler.play({ mode: "pattern" });
  assert.equal(harness.scheduled.length, 3);
  harness.setAudioTime(10.05);
  const beforeTick = harness.scheduler.getPlayheadTick();
  assert.equal(harness.scheduler.setBpm(240), true);
  assert.ok(Math.abs(harness.scheduler.getPlayheadTick() - beforeTick) < 1e-9);
  assert.equal(harness.retired.length, 2);
  assert.equal(harness.scheduler.getState().bpm, 240);
  assert.equal(harness.timerCount, 1);
});

test("seek and stop release owned voices without leaving the scheduler running", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = [note("first", 60, 0, 384), note("middle", 64, 192, 24)];
  const harness = createHarness(project, { lookAheadSeconds: 0.5 });
  harness.scheduler.play({ mode: "pattern" });
  assert.equal(harness.scheduled.length, 1);
  harness.setAudioTime(10.1);
  assert.equal(harness.scheduler.seek(192), true);
  assert.equal(harness.retired.length, 1);
  assert.equal(harness.stopped.length, 0);
  assert.equal(harness.scheduled.at(-1).event.noteId, "middle");
  assert.equal(harness.scheduler.stop(), true);
  assert.equal(harness.scheduler.getState().status, "stopped");
  assert.equal(harness.scheduler.getPlayheadTick(), 192);
  assert.equal(harness.scheduler.stop(), false);
});

test("Song loop changes rebuild only the future suffix and preserve one clock", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = [note("pulse", 60, 0, 12)];
  project.tracks[0].clips = [{ id: "clip-1", patternId: "pattern-1", startTick: 0 }];
  project.transport.loop = { enabled: true, mode: "custom", startTick: 0, endTick: 96 };
  const harness = createHarness(project, { lookAheadSeconds: 0.5 });
  harness.scheduler.play({ mode: "song" });
  assert.equal(harness.scheduled[0].event.startTime, 10);

  harness.setAudioTime(10.1);
  const nextProject = structuredClone(project);
  nextProject.transport.loop.endTick = 48;
  harness.project = nextProject;
  harness.scheduler.syncProject();
  assert.equal(harness.timerCount, 1);
  assert.ok(harness.retired.some(({ record }) => record.event.startTime > 10.1));
  harness.setAudioTime(10.26);
  harness.intervalCallback();
  assert.ok(harness.scheduled.some(({ event }) => event.occurrenceId.endsWith("cycle:1")));
});

test("syncProject retires deleted future Pattern voices while preserving unchanged submissions", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = [
    note("stable", 60, 24, 12),
    note("moving", 64, 48, 12),
  ];
  const harness = createHarness(project, { lookAheadSeconds: 0.5 });
  harness.scheduler.play({ mode: "pattern" });
  const stableRecord = harness.scheduled.find(({ event }) => event.noteId === "stable");
  const movingRecord = harness.scheduled.find(({ event }) => event.noteId === "moving");

  const nextProject = structuredClone(project);
  nextProject.patterns[0].notes = [
    note("stable", 60, 24, 12),
    note("moving", 64, 72, 12),
  ];
  harness.project = nextProject;
  harness.scheduler.syncProject();

  assert.equal(harness.retired.some(({ record }) => record === stableRecord), false);
  assert.equal(harness.retired.some(({ record }) => record === movingRecord), true);
  assert.equal(harness.scheduled.filter(({ event }) => event.noteId === "stable").length, 1);
  assert.equal(harness.scheduled.at(-1).event.noteId, "moving");
  assert.equal(harness.scheduled.at(-1).event.startTick, 72);
});

test("syncProject retires future Song voices owned by deleted Tracks and clips", async (t) => {
  await t.test("Track deletion preserves the unchanged Track occurrence", () => {
    const project = structuredClone(createDefaultV2Project());
    project.patterns[0].notes = [note("future", 60, 48, 12)];
    project.tracks[0].clips = [{ id: "clip-1", patternId: "pattern-1", startTick: 0 }];
    const secondTrack = structuredClone(project.tracks[0]);
    secondTrack.id = "track-2";
    secondTrack.name = "Pulse 2";
    secondTrack.instrument.instanceId = "instrument-track-2";
    secondTrack.clips = [{ id: "clip-2", patternId: "pattern-1", startTick: 0 }];
    project.tracks.push(secondTrack);
    const harness = createHarness(project, { lookAheadSeconds: 0.5 });
    harness.scheduler.play({ mode: "song" });
    const stableRecord = harness.scheduled.find(({ event }) => event.trackId === "track-1");
    const deletedRecord = harness.scheduled.find(({ event }) => event.trackId === "track-2");

    const nextProject = structuredClone(project);
    nextProject.tracks = nextProject.tracks.filter(({ id }) => id === "track-1");
    harness.project = nextProject;
    harness.scheduler.syncProject();

    assert.equal(harness.retired.some(({ record }) => record === stableRecord), false);
    assert.equal(harness.retired.some(({ record }) => record === deletedRecord), true);
  });

  await t.test("clip deletion cancels a submitted future voice", () => {
    const project = structuredClone(createDefaultV2Project());
    project.patterns[0].notes = [note("future", 60, 48, 12)];
    project.tracks[0].clips = [{ id: "clip-1", patternId: "pattern-1", startTick: 0 }];
    const harness = createHarness(project, { lookAheadSeconds: 0.5 });
    harness.scheduler.play({ mode: "song" });
    const deletedRecord = harness.scheduled[0];

    const nextProject = structuredClone(project);
    nextProject.tracks[0].clips = [];
    harness.project = nextProject;
    harness.scheduler.syncProject();

    assert.equal(harness.retired.some(({ record }) => record === deletedRecord), true);
  });
});

test("syncProject stops an active Pattern whose stable Pattern identity was deleted", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = [note("future", 60, 48, 12)];
  project.patterns.push({ id: "pattern-2", name: "Pattern 2", lengthTicks: 384, notes: [] });
  const harness = createHarness(project, { lookAheadSeconds: 0.5 });
  harness.scheduler.play({ mode: "pattern" });
  const deletedRecord = harness.scheduled[0];

  const nextProject = structuredClone(project);
  nextProject.patterns = nextProject.patterns.filter(({ id }) => id === "pattern-2");
  harness.project = nextProject;
  harness.scheduler.syncProject();

  assert.equal(harness.scheduler.getState().status, "stopped");
  assert.equal(harness.retired.some(({ record }) => record === deletedRecord), true);
});

test("onTrackInput receives the absolute scheduled instrument input end", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = [note("voice", 60, 0, 24)];
  const inputs = [];
  const harness = createHarness(project, {
    onTrackInput: (trackId, event) => inputs.push({ event, trackId }),
  });
  harness.scheduler.play({ mode: "pattern" });

  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].trackId, "track-1");
  assert.equal(inputs[0].event, harness.scheduled[0].event);
  assert.equal(Number.isFinite(inputs[0].event.releaseEndTime), true);
  assert.ok(inputs[0].event.releaseEndTime > inputs[0].event.startTime);
});
test("empty Song playback stays safe even when a custom loop was imported enabled", () => {
  const project = structuredClone(createDefaultV2Project());
  project.transport.loop = { enabled: true, mode: "custom", startTick: 0, endTick: 96 };
  const harness = createHarness(project);

  assert.throws(
    () => harness.scheduler.play({ mode: "song" }),
    /Place an audible Pattern in Playlist/,
  );
  assert.equal(harness.scheduler.getState().status, "stopped");
  assert.equal(harness.timerCount, 0);
});
test("mode switch and disposal are repeat-safe lifecycle boundaries", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = [note("voice", 60, 0, 384)];
  project.tracks[0].clips = [{ id: "clip-1", patternId: "pattern-1", startTick: 0 }];
  const harness = createHarness(project);
  harness.scheduler.play({ mode: "pattern" });
  assert.equal(harness.scheduler.setMode("song"), true);
  assert.equal(harness.scheduler.getState().status, "stopped");
  assert.equal(harness.scheduler.getState().mode, "song");
  assert.equal(harness.scheduler.dispose(), true);
  assert.equal(harness.scheduler.dispose(), false);
  assert.throws(() => harness.scheduler.play({ mode: "song" }), /disposed/);
});
