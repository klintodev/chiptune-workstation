import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createDefaultProject } from "../src/state/project-state.js";
import { createDefaultV2Project } from "../src/v2/domain/schema.js";
import {
  createV2PublicPlayerController,
  createV2PublicVisualizationModel,
  renderV2PublicVisualization,
} from "../src/v2/public-player-controller.js";

function playableProject() {
  const project = structuredClone(createDefaultV2Project());
  project.metadata.title = "Public V7 fixture";
  project.mixer.master.volume = 0.2;
  project.patterns[0].notes.push({
    durationTicks: 24,
    id: "note-public",
    pitch: 67,
    startTick: 12,
    velocity: 0.8,
  });
  project.tracks[0].clips.push({
    id: "clip-public",
    patternId: project.patterns[0].id,
    startTick: 0,
  });
  return project;
}

function control() {
  return { disabled: false, textContent: "" };
}

function controls() {
  return {
    pause: control(),
    play: control(),
    position: control(),
    restart: control(),
    status: control(),
    volume: control(),
  };
}

function createHarness() {
  const calls = {
    engineDispose: 0,
    engineEnable: 0,
    markedTrackIds: [],
    registryDispose: 0,
    registryProjects: [],
    schedulerDispose: 0,
    schedulerPause: 0,
    schedulerPlay: [],
    schedulerStop: 0,
    synthDispose: 0,
    volumes: [],
  };
  const context = { currentTime: 3 };
  const destination = { context };
  let ready = false;
  const audioEngine = {
    async dispose() { calls.engineDispose += 1; ready = false; },
    async enable() { calls.engineEnable += 1; ready = true; },
    getCurrentTime: () => context.currentTime,
    getInputNode: () => destination,
    isReady: () => ready,
    setMasterVolume(value) { calls.volumes.push(value); return true; },
  };
  const trackInput = { context };
  const registry = {
    dispose() { calls.registryDispose += 1; return true; },
    getTrackInputNode: () => trackInput,
    markTrackInput(trackId, inputEndTime) {
      calls.markedTrackIds.push([trackId, inputEndTime]);
      return true;
    },
    sync(project) { calls.registryProjects.push(project); return {}; },
  };
  const synth = {
    dispose() { calls.synthDispose += 1; return true; },
    trigger: () => ({ stop() {} }),
  };
  let schedulerOptions = null;
  let schedulerState = { status: "stopped" };
  let playheadTick = 0;
  const listeners = new Set();
  function emit(error) {
    const event = { detail: { ...schedulerState, ...(error ? { error } : {}) } };
    for (const listener of listeners) listener(event);
  }
  const scheduler = {
    addEventListener(type, listener) { if (type === "statechange") listeners.add(listener); },
    dispose() { calls.schedulerDispose += 1; listeners.clear(); return true; },
    getPlayheadTick: () => playheadTick,
    getState: () => schedulerState,
    pause() {
      calls.schedulerPause += 1;
      schedulerState = { status: "paused" };
      emit();
      return true;
    },
    play(options) {
      calls.schedulerPlay.push(options);
      schedulerState = { status: "playing" };
      playheadTick = 48;
      emit();
      return true;
    },
    removeEventListener(type, listener) { if (type === "statechange") listeners.delete(listener); },
    stop() {
      calls.schedulerStop += 1;
      schedulerState = { status: "stopped" };
      playheadTick = 0;
      emit();
      return true;
    },
  };
  const fillCalls = [];
  const context2d = {
    fillStyle: "",
    fillRect(...values) { fillCalls.push({ fillStyle: this.fillStyle, values }); },
  };
  const canvas = { getContext: () => context2d, height: 120, width: 320 };

  return {
    audioEngine,
    calls,
    canvas,
    context,
    fillCalls,
    registry,
    scheduler,
    schedulerOptions: () => schedulerOptions,
    synth,
    emitSchedulerError: (error) => emit(error),
    factories: {
      audioEngineFactory: () => audioEngine,
      fitCanvasToDisplay: () => ({ height: 120, ratio: 1, width: 320 }),
      runtimeRegistryFactory(options) {
        assert.equal(options.context, context);
        assert.equal(options.destination, destination);
        return registry;
      },
      schedulerFactory(options) { schedulerOptions = options; return scheduler; },
      synthRuntimeFactory(options) {
        assert.equal(options.context, context);
        assert.equal(options.getOutputNode("track-1"), trackInput);
        return synth;
      },
    },
  };
}

test("native V7 validation fails closed before any audio factory is touched", () => {
  let audioFactories = 0;
  const options = {
    audioEngineFactory() { audioFactories += 1; return {}; },
    project: createDefaultProject(),
  };
  assert.throws(() => createV2PublicPlayerController(options), /V7 Project|Unsupported project schema/);
  assert.equal(audioFactories, 0);

  const future = playableProject();
  future.schemaVersion = 8;
  assert.throws(
    () => createV2PublicPlayerController({ ...options, project: future }),
    /Unsupported project schema version: 8/,
  );
  assert.equal(audioFactories, 0);

  const malformed = playableProject();
  malformed.tracks[0].instrument.type = "project-supplied-device";
  assert.throws(
    () => createV2PublicPlayerController({ ...options, project: malformed }),
    /Unknown Instrument type/,
  );
  assert.equal(audioFactories, 0);
});

test("V7 public playback composes the shared graph and keeps visitor volume post-master", async () => {
  const project = playableProject();
  const before = JSON.stringify(project);
  const harness = createHarness();
  const elements = controls();
  const playbackErrors = [];
  const controller = createV2PublicPlayerController({
    ...harness.factories,
    canvas: harness.canvas,
    controls: elements,
    onError(error) {
      playbackErrors.push(error);
      elements.status.textContent = "Unavailable";
    },
    project,
  });

  assert.equal(controller.hasPlayableArrangement(), true);
  assert.equal(elements.status.textContent, "Ready to play");
  assert.equal(elements.play.disabled, false);
  assert.equal(elements.volume.disabled, true);
  assert.ok(harness.fillCalls.length > 0);

  controller.setVisitorVolume(0.42);
  assert.deepEqual(harness.calls.volumes, []);
  await controller.play();
  assert.equal(harness.calls.engineEnable, 1);
  assert.equal(harness.calls.registryProjects.length, 1);
  assert.equal(harness.calls.registryProjects[0].schemaVersion, 7);
  assert.equal(harness.schedulerOptions().getProject(), harness.calls.registryProjects[0]);
  assert.equal(harness.schedulerOptions().getSynthRuntime(), harness.synth);
  harness.schedulerOptions().onTrackInput("track-1", { releaseEndTime: 4.75 });
  assert.deepEqual(harness.calls.markedTrackIds, [["track-1", 4.75]]);
  assert.deepEqual(harness.calls.schedulerPlay, ["song"]);
  assert.deepEqual(harness.calls.volumes, [0.42]);
  assert.notEqual(harness.calls.volumes[0], project.mixer.master.volume * 0.42);
  assert.equal(elements.status.textContent, "Playing");
  assert.equal(elements.position.textContent, "Tick 0048");
  assert.equal(JSON.stringify(project), before);
  const schedulingError = new Error("scheduled playback failed");
  harness.emitSchedulerError(schedulingError);
  assert.deepEqual(playbackErrors, [schedulingError]);
  assert.equal(elements.status.textContent, "Unavailable");

  controller.setVisitorVolume(0.25);
  assert.deepEqual(harness.calls.volumes, [0.42, 0.25]);
  assert.equal(project.mixer.master.volume, 0.2);
  assert.throws(() => controller.setVisitorVolume(1.1), /between zero and one/);

  assert.equal(controller.pause(), true);
  assert.equal(elements.status.textContent, "Paused");
  await controller.restart();
  assert.equal(harness.calls.schedulerStop, 1);
  assert.deepEqual(harness.calls.schedulerPlay.at(-1), { mode: "song", startTick: 0 });

  assert.equal(await controller.dispose(), true);
  assert.equal(await controller.dispose(), false);
  assert.equal(harness.calls.schedulerDispose, 1);
  assert.equal(harness.calls.synthDispose, 1);
  assert.equal(harness.calls.registryDispose, 1);
  assert.equal(harness.calls.engineDispose, 1);
});

test("the generic V7 visual is transient and Canvas failure remains safe", async () => {
  const project = playableProject();
  const model = createV2PublicVisualizationModel(project);
  assert.deepEqual(Object.keys(model), ["arrangementEndTick", "notes"]);
  assert.equal("visualiser" in project, false);
  assert.equal(model.notes.length, 1);
  assert.equal(renderV2PublicVisualization(null, model, { height: 100, width: 100 }), false);

  const drawCalls = [];
  const context = {
    fillStyle: "",
    fillRect(...values) { drawCalls.push([this.fillStyle, ...values]); },
  };
  assert.equal(renderV2PublicVisualization(context, model, {
    height: 100,
    playheadTick: 48,
    width: 200,
  }), true);
  assert.ok(drawCalls.length > 10);

  const harness = createHarness();
  const controller = createV2PublicPlayerController({
    ...harness.factories,
    canvas: { getContext() { throw new Error("Canvas blocked"); } },
    controls: controls(),
    project,
  });
  assert.doesNotThrow(() => controller.refresh());
  assert.equal(await controller.dispose(), true);
});

test("an empty V7 snapshot never enables audio playback", async () => {
  const harness = createHarness();
  const controller = createV2PublicPlayerController({
    ...harness.factories,
    controls: controls(),
    project: createDefaultV2Project(),
  });
  assert.equal(controller.hasPlayableArrangement(), false);
  await assert.rejects(controller.play(), /does not contain an arranged Pattern/);
  assert.equal(harness.calls.engineEnable, 0);
  await controller.dispose();
});

test("the browser entry dispatches V7 while retaining the legacy V1 player", async () => {
  const source = await readFile(new URL("../src/player.js", import.meta.url), "utf8");
  assert.match(source, /record\.document\.project\.schemaVersion === 7/);
  assert.match(source, /createV2PublicPlayerController/);
  assert.match(source, /projectState = createProjectState\(record\.document\.project\)/);
  assert.match(source, /master \* visitorVolume/);
  assert.match(source, /v2Controller\.setVisitorVolume\(visitorVolume\)/);
});
