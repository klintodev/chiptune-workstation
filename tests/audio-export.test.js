import assert from "node:assert/strict";
import test from "node:test";

import {
  createArrangementRenderPlan,
  EXPORT_CHANNELS,
  EXPORT_SAMPLE_RATE,
} from "../src/audio/offline-arrangement-renderer.js";
import { encodePcm16Wave } from "../src/audio/wav-encoder.js";
import { createDefaultProject } from "../src/state/project-state.js";

function createSong() {
  const project = structuredClone(createDefaultProject());
  project.patterns[0].steps[0] = { note: 60, gate: 0.75, volume: 0.7 };
  project.tracks[0].clips = [{ id: "clip-1", patternId: "pattern-1", startStep: 4 }];
  return project;
}

test("render plan schedules arrangement notes with project timing and mix", () => {
  const project = createSong();
  project.transport.bpm = 120;
  project.transport.masterVolume = 0.5;
  project.tracks[0].instrument.octaveOffset = 1;
  project.tracks[0].instrument.volume = 0.4;
  project.tracks[0].mixer.volume = 0.8;

  const plan = createArrangementRenderPlan(project);
  const note = plan.tracks[0].notes[0];

  assert.equal(plan.channels, EXPORT_CHANNELS);
  assert.equal(plan.sampleRate, EXPORT_SAMPLE_RATE);
  assert.equal(plan.masterVolume, 0.5);
  assert.equal(plan.stepDurationSeconds, 0.125);
  assert.equal(plan.endStep, 20);
  assert.equal(plan.tracks[0].instrumentVolume, 0.4);
  assert.equal(plan.tracks[0].trackVolume, 0.8);
  assert.equal(note.startTime, 0.5);
  assert.equal(note.durationSeconds, 0.09375);
  assert.ok(Math.abs(note.frequency - 523.2511) < 0.001);
});

test("render plan honours mute and solo state", () => {
  const project = createSong();
  project.tracks.push({
    ...structuredClone(project.tracks[0]),
    id: "track-2",
    name: "Lead",
    clips: [{ id: "clip-2", patternId: "pattern-1", startStep: 4 }],
    mixer: { muted: false, solo: true, volume: 0.6 },
  });

  assert.deepEqual(createArrangementRenderPlan(project).tracks.map((track) => track.id), ["track-2"]);
  project.tracks[1].mixer.muted = true;
  assert.deepEqual(createArrangementRenderPlan(project).tracks, []);
});

test("render plan rejects empty and excessively long exports before rendering", () => {
  assert.throws(
    () => createArrangementRenderPlan(createDefaultProject()),
    /Place at least one pattern/,
  );
  assert.throws(
    () => createArrangementRenderPlan(createSong(), { maxDurationSeconds: 1 }),
    /limited to 0 minutes/,
  );
});

test("WAV encoder writes stereo signed 16-bit PCM with a valid header", () => {
  const samples = new Float32Array([-1, 1]);
  const wave = encodePcm16Wave({
    getChannelData: () => samples,
    length: samples.length,
    numberOfChannels: 1,
    sampleRate: EXPORT_SAMPLE_RATE,
  });
  const view = new DataView(wave);
  const text = (start, end) => new TextDecoder().decode(new Uint8Array(wave.slice(start, end)));

  assert.equal(text(0, 4), "RIFF");
  assert.equal(text(8, 12), "WAVE");
  assert.equal(text(36, 40), "data");
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), EXPORT_SAMPLE_RATE);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(wave.byteLength, 52);
  assert.equal(view.getInt16(44, true), -32_768);
  assert.equal(view.getInt16(46, true), -32_768);
  assert.equal(view.getInt16(48, true), 32_767);
  assert.equal(view.getInt16(50, true), 32_767);
});
