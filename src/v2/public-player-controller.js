import { createAudioEngine } from "../audio/audio-engine.js";
import { setTextIfChanged } from "../shared/status-announcer.js";
import { fitCanvas } from "../visualiser/canvas-renderer.js";
import {
  canonicalizeV2Project,
  createSongOccurrences,
  getV2ArrangementEndTick,
} from "./domain/index.js";
import { createKlintoChipSynthRuntime } from "./audio/klinto-chip-synth.js";
import { createDeviceRuntimeRegistry } from "./audio/runtime-registry.js";
import { createV2Scheduler } from "./audio/v2-scheduler.js";

const PUBLIC_VISUAL_COLOURS = Object.freeze([
  "#f39bc4",
  "#c8ff32",
  "#79d9ff",
  "#ffd166",
  "#b8a1ff",
  "#ff8f70",
  "#8ee3c1",
  "#f6c1ff",
]);
const PUBLIC_VISUAL_BACKGROUND = "#080b08";
const PUBLIC_VISUAL_GRID = "#263027";
const PUBLIC_VISUAL_PLAYHEAD = "#fff7ed";
const MIN_VISUAL_PITCH = 36;
const MAX_VISUAL_PITCH = 112;

function buildVisualizationModel(project) {
  const trackOrder = new Map(project.tracks.map(({ id }, index) => [id, index]));
  return Object.freeze({
    arrangementEndTick: getV2ArrangementEndTick(project),
    notes: Object.freeze(createSongOccurrences(project, { audibleOnly: true }).map((note) => (
      Object.freeze({
        durationTicks: note.durationTicks,
        pitch: note.pitch,
        startTick: note.startTick,
        trackIndex: trackOrder.get(note.trackId) ?? 0,
      })
    ))),
  });
}

/**
 * Build the fixed public-player scene from musical data only. V7 deliberately
 * has no persisted visualiser state, so this model never enters Project data.
 */
export function createV2PublicVisualizationModel(projectCandidate) {
  return buildVisualizationModel(canonicalizeV2Project(projectCandidate));
}

/** Draw a generic arrangement overview. An incomplete/blocked Canvas is safe. */
export function renderV2PublicVisualization(
  context,
  model,
  { height, playheadTick = 0, width } = {},
) {
  if (
    !context
    || typeof context.fillRect !== "function"
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) return false;

  try {
    context.fillStyle = PUBLIC_VISUAL_BACKGROUND;
    context.fillRect(0, 0, width, height);
    context.fillStyle = PUBLIC_VISUAL_GRID;
    for (let column = 1; column < 16; column += 1) {
      const x = Math.round(column * width / 16);
      context.fillRect(x, 0, 1, height);
    }
    for (let row = 1; row < 8; row += 1) {
      const y = Math.round(row * height / 8);
      context.fillRect(0, y, width, 1);
    }

    const endTick = Math.max(1, model?.arrangementEndTick ?? 0);
    const pitchRange = MAX_VISUAL_PITCH - MIN_VISUAL_PITCH + 1;
    for (const note of model?.notes ?? []) {
      const x = note.startTick / endTick * width;
      const noteWidth = Math.max(2, note.durationTicks / endTick * width);
      const pitchOffset = MAX_VISUAL_PITCH - note.pitch;
      const y = Math.max(0, Math.min(height - 3, pitchOffset / pitchRange * height));
      context.fillStyle = PUBLIC_VISUAL_COLOURS[
        note.trackIndex % PUBLIC_VISUAL_COLOURS.length
      ];
      context.fillRect(x, y, Math.min(noteWidth, Math.max(1, width - x)), 3);
    }

    const boundedTick = Math.max(0, Math.min(endTick, playheadTick));
    context.fillStyle = PUBLIC_VISUAL_PLAYHEAD;
    context.fillRect(Math.round(boundedTick / endTick * (width - 1)), 0, 2, height);
    return true;
  } catch {
    return false;
  }
}

function setControlText(element, value) {
  if (element) setTextIfChanged(element, value);
}

function setControlDisabled(element, disabled) {
  if (element) element.disabled = disabled;
}

function requireVolume(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError("Visitor volume must be between zero and one.");
  }
  return value;
}

/**
 * Own native-V7 public playback. All browser/audio factories remain lazy and
 * injectable so malformed Projects fail before any AudioContext can exist.
 */
export function createV2PublicPlayerController({
  audioEngineFactory = createAudioEngine,
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  canvas = null,
  controls = {},
  fitCanvasToDisplay = fitCanvas,
  onError = () => {},
  project: projectCandidate,
  reducedMotion = null,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  runtimeRegistryFactory = createDeviceRuntimeRegistry,
  schedulerFactory = createV2Scheduler,
  synthRuntimeFactory = createKlintoChipSynthRuntime,
} = {}) {
  // Native validation is intentionally first: this path must never migrate or
  // partially activate malformed/future public snapshots.
  const project = canonicalizeV2Project(projectCandidate);
  const visualizationModel = buildVisualizationModel(project);
  const arrangementEndTick = visualizationModel.arrangementEndTick;
  const audioEngine = audioEngineFactory();
  let context2d = null;
  let disposed = false;
  let graphInitialization = null;
  let hasStarted = false;
  let runtimeRegistry = null;
  let scheduler = null;
  let synthRuntime = null;
  let visible = true;
  let visitorVolume = 1;
  let visualFrame = null;

  try {
    context2d = canvas?.getContext?.("2d") ?? null;
  } catch {
    context2d = null;
  }

  function getSchedulerState() {
    return scheduler?.getState?.() ?? Object.freeze({ status: "stopped" });
  }

  function getPlayheadTick() {
    try {
      return scheduler?.getPlayheadTick?.() ?? 0;
    } catch {
      return 0;
    }
  }

  function renderTransport() {
    const state = getSchedulerState();
    const ready = !disposed && scheduler !== null && audioEngine.isReady() === true;
    const playable = arrangementEndTick > 0;
    setControlDisabled(controls.play, disposed || !playable || state.status === "playing");
    setControlDisabled(controls.pause, !ready || state.status !== "playing");
    setControlDisabled(controls.restart, !ready || !playable);
    setControlDisabled(controls.volume, !ready);
    setControlText(
      controls.play,
      ready ? (state.status === "paused" ? "Resume" : "Play") : "Enable and play",
    );
    if (!playable) setControlText(controls.status, "Unavailable");
    else if (!hasStarted) setControlText(controls.status, "Ready to play");
    else {
      setControlText(
        controls.status,
        state.status === "playing"
          ? "Playing"
          : state.status === "paused"
            ? "Paused"
            : "Stopped",
      );
    }
    setControlText(
      controls.position,
      `Tick ${String(Math.max(0, Math.floor(getPlayheadTick()))).padStart(4, "0")}`,
    );
  }

  function renderCanvas() {
    if (!context2d || !canvas) return false;
    let dimensions;
    try {
      dimensions = fitCanvasToDisplay(canvas);
    } catch {
      dimensions = {
        height: Number.isFinite(canvas.height) && canvas.height > 0 ? canvas.height : 1,
        width: Number.isFinite(canvas.width) && canvas.width > 0 ? canvas.width : 1,
      };
    }
    return renderV2PublicVisualization(context2d, visualizationModel, {
      height: dimensions.height,
      playheadTick: getPlayheadTick(),
      width: dimensions.width,
    });
  }

  function render() {
    if (disposed || !visible) return false;
    renderCanvas();
    renderTransport();
    return true;
  }

  function cancelScheduledFrame() {
    if (visualFrame === null) return false;
    try { cancelFrame?.(visualFrame); } catch {}
    visualFrame = null;
    return true;
  }

  function scheduleVisualFrame() {
    const playing = getSchedulerState().status === "playing";
    if (
      disposed
      || !visible
      || !playing
      || reducedMotion?.matches === true
      || typeof requestFrame !== "function"
    ) {
      cancelScheduledFrame();
      return false;
    }
    if (visualFrame !== null) return false;
    try {
      visualFrame = requestFrame(() => {
        visualFrame = null;
        render();
        scheduleVisualFrame();
      });
      return true;
    } catch {
      visualFrame = null;
      return false;
    }
  }

  function handleSchedulerChange(event) {
    const error = event?.detail?.error;
    render();
    scheduleVisualFrame();
    if (error) {
      try { onError(error); } catch {}
    }
  }

  async function initializeGraph() {
    if (!audioEngine.isReady()) await audioEngine.enable();
    if (disposed) throw new Error("The public player has been disposed.");
    if (scheduler) {
      audioEngine.setMasterVolume(visitorVolume);
      return;
    }

    const destination = audioEngine.getInputNode();
    const context = destination?.context;
    if (!context) throw new TypeError("The public audio destination has no AudioContext.");
    let nextRegistry = null;
    let nextScheduler = null;
    let nextSynth = null;
    try {
      nextRegistry = runtimeRegistryFactory({ context, destination });
      nextRegistry.sync(project);
      nextSynth = synthRuntimeFactory({
        context,
        getOutputNode(trackId) {
          const output = nextRegistry.getTrackInputNode(trackId);
          if (!output) throw new RangeError(`Unknown public audio Track: ${trackId}.`);
          return output;
        },
      });
      nextScheduler = schedulerFactory({
        bpm: project.transport.bpm,
        getAudioTime: audioEngine.getCurrentTime,
        getProject: () => project,
        getSynthRuntime: () => nextSynth,
        getTrackId: () => project.tracks[0].id,
        onTrackInput: (trackId, event) => nextRegistry.markTrackInput(trackId, event.releaseEndTime),
      });
      nextScheduler.addEventListener?.("statechange", handleSchedulerChange);
      if (disposed) throw new Error("The public player has been disposed.");
      runtimeRegistry = nextRegistry;
      scheduler = nextScheduler;
      synthRuntime = nextSynth;
      audioEngine.setMasterVolume(visitorVolume);
    } catch (error) {
      nextScheduler?.removeEventListener?.("statechange", handleSchedulerChange);
      nextScheduler?.dispose?.();
      nextSynth?.dispose?.();
      nextRegistry?.dispose?.();
      throw error;
    }
  }

  async function ensureAudio() {
    if (disposed) throw new Error("The public player has been disposed.");
    if (scheduler) {
      audioEngine.setMasterVolume(visitorVolume);
      return;
    }
    if (!graphInitialization) graphInitialization = initializeGraph();
    try {
      await graphInitialization;
    } finally {
      graphInitialization = null;
    }
  }

  async function play() {
    if (arrangementEndTick <= 0) {
      throw new RangeError("This published snapshot does not contain an arranged Pattern yet.");
    }
    await ensureAudio();
    const changed = scheduler.play("song");
    hasStarted = true;
    render();
    scheduleVisualFrame();
    return changed;
  }

  function pause() {
    const changed = scheduler?.pause?.() ?? false;
    render();
    scheduleVisualFrame();
    return changed;
  }

  async function restart() {
    if (arrangementEndTick <= 0) {
      throw new RangeError("This published snapshot does not contain an arranged Pattern yet.");
    }
    await ensureAudio();
    scheduler.stop();
    const changed = scheduler.play({ mode: "song", startTick: 0 });
    hasStarted = true;
    render();
    scheduleVisualFrame();
    return changed;
  }

  function setVisitorVolume(nextVolume) {
    visitorVolume = requireVolume(nextVolume);
    if (audioEngine.isReady()) audioEngine.setMasterVolume(visitorVolume);
    return visitorVolume;
  }

  function setVisible(nextVisible) {
    visible = nextVisible !== false;
    if (!visible) cancelScheduledFrame();
    else {
      render();
      scheduleVisualFrame();
    }
    return visible;
  }

  function refresh() {
    render();
    scheduleVisualFrame();
  }

  async function dispose() {
    if (disposed) return false;
    disposed = true;
    cancelScheduledFrame();
    scheduler?.removeEventListener?.("statechange", handleSchedulerChange);
    scheduler?.dispose?.();
    synthRuntime?.dispose?.();
    runtimeRegistry?.dispose?.();
    scheduler = null;
    synthRuntime = null;
    runtimeRegistry = null;
    renderTransport();
    await audioEngine.dispose();
    return true;
  }

  render();

  return Object.freeze({
    dispose,
    getProject: () => project,
    getState: () => Object.freeze({
      arrangementEndTick,
      audioReady: audioEngine.isReady() === true,
      playheadTick: getPlayheadTick(),
      status: getSchedulerState().status,
      visitorVolume,
    }),
    hasPlayableArrangement: () => arrangementEndTick > 0,
    pause,
    play,
    refresh,
    restart,
    setVisible,
    setVisitorVolume,
  });
}
