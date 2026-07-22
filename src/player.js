import { createAudioEngine } from "./audio/audio-engine.js?v=20260721-3";
import { createTrackRuntimeRegistry } from "./audio/track-runtime-registry.js?v=20260722-1";
import { createFirebaseClient } from "./firebase/firebase-client.js?v=20260722-1";
import { getTrackColour } from "./shared/track-presentation.js";
import { createProjectState, getArrangementEnd } from "./state/project-state.js?v=20260722-1";
import { createArrangementScheduler } from "./transport/arrangement-scheduler.js?v=20260722-1";
import { fitCanvas } from "./visualiser/canvas-renderer.js?v=20260721-3";
import { buildCompositionProjection } from "./visualiser/composition-projection.js?v=20260722-1";
import { renderCompositionFrame } from "./visualiser/signal-stack-renderer.js?v=20260722-1";

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

function resolveColour(value, fallback) {
  if (!value?.startsWith("var(")) return value || fallback;
  const property = value.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(property).trim() || fallback;
}

function readTheme() {
  const styles = getComputedStyle(document.documentElement);
  const read = (property, fallback) => styles.getPropertyValue(property).trim() || fallback;
  return Object.freeze({
    background: read("--bg-0", "#211b28"),
    grid: read("--line", "#40374d"),
    ink: read("--ink", "#f3ecf7"),
    muted: read("--muted", "#a99bbd"),
  });
}

function getProjection() {
  const projection = buildCompositionProjection(projectState.getState(), scheduler.getTimelineSnapshot());
  return Object.freeze({
    ...projection,
    notes: Object.freeze(projection.notes.map((note) => Object.freeze({
      ...note,
      colour: resolveColour(getTrackColour(note.trackIndex), "#f0a6c8"),
    }))),
  });
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

function renderVisuals() {
  visualFrame = 0;
  if (!projectState || document.hidden) return;
  if (!context) {
    renderTransport();
    return;
  }
  const { height, ratio, width } = fitCanvas(elements.canvas);
  renderCompositionFrame(context, getProjection(), {
    ...readTheme(),
    height,
    ratio,
    width,
  });
  renderTransport();
  if (scheduler?.getState().status === "playing" && !reducedMotion.matches) {
    visualFrame = requestAnimationFrame(renderVisuals);
  }
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
  scheduler.addEventListener("statechange", () => {
    renderTransport();
    scheduleVisuals();
  });
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
reducedMotion.addEventListener("change", scheduleVisuals);
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
