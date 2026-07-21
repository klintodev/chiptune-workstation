import { createAudioEngine } from "./audio/audio-engine.js?v=20260721-3";
import { createTrackRuntimeRegistry } from "./audio/track-runtime-registry.js";
import { createFirebaseClient } from "./firebase/firebase-client.js";
import { createProjectState, getArrangementEnd } from "./state/project-state.js?v=20260721-3";
import { createArrangementScheduler } from "./transport/arrangement-scheduler.js?v=20260721-2";
import { createAudioAnalyserReader } from "./visualiser/audio-features.js";
import { fitCanvas, renderVisualFrame } from "./visualiser/canvas-renderer.js?v=20260721-3";

const elements = {
  canvas: document.querySelector("#player-canvas"),
  creator: document.querySelector("#player-creator"),
  error: document.querySelector("#player-error"),
  pause: document.querySelector("#player-pause"),
  play: document.querySelector("#player-play"),
  position: document.querySelector("#player-position"),
  restart: document.querySelector("#player-restart"),
  revision: document.querySelector("#player-revision"),
  status: document.querySelector("#player-status"),
  title: document.querySelector("#player-title"),
  volume: document.querySelector("#player-volume"),
};

let audioEngine = null;
let projectState = null;
let runtimes = null;
let scheduler = null;
let visualFrame = 0;
let analyserReader = null;
let visitorVolume = 1;
let context = null;
try {
  context = elements.canvas.getContext?.("2d") ?? null;
} catch {
  context = null;
}
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.status.textContent = "Unavailable";
}

function renderTransport() {
  if (!scheduler) return;
  const state = scheduler.getState();
  const ready = audioEngine.isReady();
  elements.play.disabled = state.status === "playing";
  elements.pause.disabled = !ready || state.status !== "playing";
  elements.restart.disabled = !ready;
  elements.volume.disabled = !ready;
  elements.play.textContent = ready ? (state.status === "paused" ? "Resume" : "Play") : "Enable and play";
  elements.status.textContent = state.status === "playing" ? "Playing" : state.status === "paused" ? "Paused" : "Stopped";
  elements.position.textContent = `Step ${String(scheduler.getPlayheadStep() + 1).padStart(3, "0")}`;
}

function renderVisuals(time = 0) {
  visualFrame = 0;
  if (!projectState || document.hidden) return;
  if (!context) {
    renderTransport();
    return;
  }
  const config = projectState.getState().visualiser;
  const { height, width } = fitCanvas(elements.canvas);
  const features = analyserReader.read(config.sensitivity);
  renderVisualFrame(context, features, config, {
    height,
    reducedMotion: reducedMotion.matches,
    time,
    width,
  });
  renderTransport();
  if (scheduler?.getState().status === "playing") visualFrame = requestAnimationFrame(renderVisuals);
}

function scheduleVisuals() {
  if (!visualFrame) visualFrame = requestAnimationFrame(renderVisuals);
}

async function ensureAudio() {
  if (audioEngine.isReady()) return;
  await audioEngine.enable();
  const master = projectState.getState().transport.masterVolume;
  audioEngine.setMasterVolume(master * visitorVolume);
}

async function play() {
  try {
    await ensureAudio();
    scheduler.play();
    renderTransport();
    scheduleVisuals();
  } catch (error) {
    showError(error.message || "Playback could not start.");
  }
}

function createPlayer(record) {
  projectState = createProjectState(record.document.project);
  audioEngine = createAudioEngine();
  runtimes = createTrackRuntimeRegistry({ audioEngine, projectState });
  const project = projectState.getState();
  scheduler = createArrangementScheduler({
    bpm: project.transport.bpm,
    getAudioTime: audioEngine.getCurrentTime,
    getProjectState: projectState.getState,
    getSelectedPatternId: () => project.patterns[0].id,
    getSelectedTrackId: () => project.tracks[0].id,
    getVoiceEngine: runtimes.getVoiceEngine,
  });
  analyserReader = createAudioAnalyserReader(audioEngine);
  scheduler.addEventListener("statechange", renderTransport);
  elements.title.textContent = record.title;
  elements.creator.textContent = record.creatorName;
  elements.revision.textContent = `Revision ${record.publicationRevision}`;
  document.title = `${record.title} - Klinto Studio`;
  document.querySelector('meta[name="description"]').content = `Listen to ${record.title} by ${record.creatorName}.`;
  if (getArrangementEnd(project) === 0) showError("This published snapshot does not contain an arranged pattern yet.");
  else {
    elements.status.textContent = "Ready to play";
    elements.play.disabled = false;
  }
  scheduleVisuals();
}

elements.play.addEventListener("click", () => void play());
elements.pause.addEventListener("click", () => {
  scheduler?.pause();
  cancelAnimationFrame(visualFrame);
  visualFrame = 0;
  renderTransport();
  scheduleVisuals();
});
elements.restart.addEventListener("click", () => {
  scheduler?.stop();
  scheduler?.setStartStep(0);
  void play();
});
elements.volume.addEventListener("input", () => {
  visitorVolume = Number(elements.volume.value) / 100;
  if (audioEngine?.isReady()) {
    audioEngine.setMasterVolume(projectState.getState().transport.masterVolume * visitorVolume);
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(visualFrame);
    visualFrame = 0;
  } else scheduleVisuals();
});
window.addEventListener("pagehide", () => {
  scheduler?.stop();
  runtimes?.dispose();
  void audioEngine?.dispose();
}, { once: true });

const publicationId = new URL(location.href).searchParams.get("id");
if (!publicationId || publicationId.length > 100) {
  showError("This share link is invalid.");
} else {
  try {
    const client = await createFirebaseClient();
    const publication = await client.getPublication(publicationId);
    if (!publication) showError("This published project does not exist or has been unpublished.");
    else createPlayer(publication);
  } catch (error) {
    showError(error.message || "The published project could not be loaded.");
  }
}
