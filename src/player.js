import { createAudioEngine } from "./audio/audio-engine.js";
import { createTrackRuntimeRegistry } from "./audio/track-runtime-registry.js";
import { createFirebaseClient } from "./firebase/firebase-client.js";
import { publicErrorMessage } from "./shared/public-error.js";
import { buildRemixStudioUrl } from "./features/remixing/remix-intent.js";
import { setTextIfChanged } from "./shared/status-announcer.js";
import { createProjectState, getArrangementEnd } from "./state/project-state.js";
import { createArrangementScheduler } from "./transport/arrangement-scheduler.js";
import { fitCanvas } from "./visualiser/canvas-renderer.js";
import { buildCompositionProjection } from "./visualiser/composition-projection.js";
import { renderCompositionFrame } from "./visualiser/signal-stack-renderer.js";
import {
  getVisualiserPalette,
  getVisualiserTrackColour,
} from "./visualiser/visualiser-palette.js";
import { createV2PublicPlayerController } from "./v2/public-player-controller.js";
import {
  PROJECT_SCHEMA_VERSION as CURRENT_PROJECT_SCHEMA_VERSION,
  normalizeV2Project,
} from "./v2/domain/schema.js";

const elements = {
  canvas: document.querySelector("#player-canvas"),
  creator: document.querySelector("#player-creator"),
  error: document.querySelector("#player-error"),
  pause: document.querySelector("#player-pause"),
  play: document.querySelector("#player-play"),
  position: document.querySelector("#player-position"),
  restart: document.querySelector("#player-restart"),
  remix: document.querySelector("#player-remix"),
  remixCancel: document.querySelector("#player-remix-cancel"),
  remixConfirm: document.querySelector("#player-remix-confirm"),
  remixDialog: document.querySelector("#player-remix-dialog"),
  remixSection: document.querySelector("#player-remix-section"),
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
let remixUrl = null;
let v2Controller = null;
let context = null;
try {
  context = elements.canvas.getContext?.("2d") ?? null;
} catch {
  context = null;
}
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function showError(message) {
  setTextIfChanged(elements.error, message);
  elements.error.hidden = false;
  setTextIfChanged(elements.status, "Unavailable");
}

function readTheme() {
  const palette = getVisualiserPalette(projectState?.getState().visualiser.palette);
  return Object.freeze({
    background: palette.background,
    grid: palette.grid,
    ink: palette.ink,
    muted: palette.muted,
  });
}

function getProjection() {
  const paletteId = projectState.getState().visualiser.palette;
  const projection = buildCompositionProjection(projectState.getState(), scheduler.getTimelineSnapshot());
  return Object.freeze({
    ...projection,
    notes: Object.freeze(projection.notes.map((note) => Object.freeze({
      ...note,
      colour: getVisualiserTrackColour(paletteId, note.trackIndex),
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
  setTextIfChanged(
    elements.status,
    state.status === "playing" ? "Playing" : state.status === "paused" ? "Paused" : "Stopped",
  );
  setTextIfChanged(elements.position, `Step ${String(scheduler.getPlayheadStep() + 1).padStart(3, "0")}`);
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
    if (v2Controller) {
      await v2Controller.play();
      return;
    }
    await ensureAudio();
    scheduler.play();
    renderTransport();
    scheduleVisuals();
  } catch (error) {
    showError(publicErrorMessage(error, {
      context: "Shared playback failed to start.",
      fallback: "Playback could not start. Try reloading the page.",
    }));
  }
}

function createPlayer(record) {
  let hasArrangement = false;
  if ([7, CURRENT_PROJECT_SCHEMA_VERSION].includes(record.document.project.schemaVersion)) {
    v2Controller = createV2PublicPlayerController({
      canvas: elements.canvas,
      controls: {
        pause: elements.pause,
        play: elements.play,
        position: elements.position,
        restart: elements.restart,
        status: elements.status,
        volume: elements.volume,
      },
      onError: (error) => showError(publicErrorMessage(error, {
        context: "Shared playback failed.",
        fallback: "Playback stopped because the published snapshot could not be played safely.",
      })),
      project: normalizeV2Project(record.document.project),
      reducedMotion,
    });
    hasArrangement = v2Controller.hasPlayableArrangement();
  } else {
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
    hasArrangement = getArrangementEnd(project) > 0;
  }
  elements.title.textContent = record.title;
  elements.creator.textContent = record.creatorName;
  elements.revision.textContent = `Revision ${record.publicationRevision}`;
  if (record.allowRemix === true) {
    remixUrl = buildRemixStudioUrl(record);
    elements.remixSection.hidden = false;
  }
  document.title = `${record.title} - Klinto Studio`;
  document.querySelector('meta[name="description"]').content = `Listen to ${record.title} by ${record.creatorName}.`;
  if (!hasArrangement) showError("This published snapshot does not contain an arranged pattern yet.");
  else {
    setTextIfChanged(elements.status, "Ready to play");
    elements.play.disabled = false;
  }
  if (v2Controller) v2Controller.refresh();
  else scheduleVisuals();
}

elements.play.addEventListener("click", () => void play());
elements.pause.addEventListener("click", () => {
  if (v2Controller) {
    v2Controller.pause();
    return;
  }
  scheduler?.pause();
  cancelAnimationFrame(visualFrame);
  visualFrame = 0;
  renderTransport();
  scheduleVisuals();
});
elements.restart.addEventListener("click", () => {
  if (v2Controller) {
    void v2Controller.restart().catch((error) => {
      showError(publicErrorMessage(error, {
        context: "Shared playback failed to restart.",
        fallback: "Playback could not restart. Try reloading the page.",
      }));
    });
    return;
  }
  scheduler?.stop();
  scheduler?.setStartStep(0);
  void play();
});
elements.volume.addEventListener("input", () => {
  visitorVolume = Number(elements.volume.value) / 100;
  if (v2Controller) {
    v2Controller.setVisitorVolume(visitorVolume);
    return;
  }
  if (audioEngine?.isReady()) {
    audioEngine.setMasterVolume(projectState.getState().transport.masterVolume * visitorVolume);
  }
});
elements.remix.addEventListener("click", () => {
  if (remixUrl) elements.remixDialog.showModal();
});
elements.remixCancel.addEventListener("click", () => elements.remixDialog.close());
elements.remixDialog.addEventListener("cancel", () => elements.remixDialog.close());
elements.remixConfirm.addEventListener("click", () => {
  if (!remixUrl) return;
  elements.remixConfirm.disabled = true;
  elements.remixConfirm.textContent = "Opening studio…";
  location.assign(remixUrl);
});
document.addEventListener("visibilitychange", () => {
  if (v2Controller) {
    v2Controller.setVisible(!document.hidden);
    return;
  }
  if (document.hidden) {
    cancelAnimationFrame(visualFrame);
    visualFrame = 0;
  } else scheduleVisuals();
});
reducedMotion.addEventListener("change", () => {
  if (v2Controller) v2Controller.refresh();
  else scheduleVisuals();
});
window.addEventListener("pagehide", () => {
  if (v2Controller) {
    void v2Controller.dispose();
    return;
  }
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
    showError(publicErrorMessage(error, {
      context: "Published project failed to load.",
      fallback: "The published project could not be loaded.",
    }));
  }
}
