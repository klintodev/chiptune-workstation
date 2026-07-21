import { isTrackAudible } from "../../state/project-state.js";
import { getTrackColour, getVoiceLabel } from "../../shared/track-presentation.js";
import { createAnalyserReader } from "../../visualiser/audio-features.js?v=20260721-1";
import { fitCanvas } from "../../visualiser/canvas-renderer.js?v=20260721-3";
import { renderSignalStackFrame } from "../../visualiser/signal-stack-renderer.js?v=20260721-2";

const STYLESHEET_ID = "visualiser-styles";

function resolveColour(root, value, fallback) {
  if (!value?.startsWith("var(")) return value || fallback;
  const property = value.slice(4, -1).trim();
  return root.defaultView?.getComputedStyle(root.documentElement).getPropertyValue(property).trim() || fallback;
}

function readTheme(root) {
  const styles = root.defaultView?.getComputedStyle(root.documentElement);
  const read = (property, fallback) => styles?.getPropertyValue(property).trim() || fallback;
  return Object.freeze({
    background: read("--bg-0", "#211b28"),
    grid: read("--line", "#40374d"),
    ink: read("--ink", "#f3ecf7"),
    muted: read("--muted", "#a99bbd"),
  });
}

function transportLabel(session) {
  const mode = session.workspace.playbackMode === "pattern" ? "Pattern" : "Arrangement";
  const state = session.transport.status || "stopped";
  const step = String((session.transport.retainedStepIndex ?? 0) + 1).padStart(3, "0");
  return `${mode} · ${state} · step ${step}`;
}

export function createVisualiserFeature({
  audioEngine,
  projectState,
  root = document,
  sessionState,
  trackRuntimes,
} = {}) {
  if (!audioEngine || !projectState || !sessionState || !trackRuntimes) {
    throw new TypeError("Visualiser requires audio, project, session, and track runtime state.");
  }
  const lifecycle = new AbortController();
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const readers = new Map();
  let animationFrame = 0;

  if (!root.getElementById(STYLESHEET_ID)) {
    const stylesheet = root.createElement("link");
    stylesheet.id = STYLESHEET_ID;
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./src/features/visualiser/visualiser.css?v=20260721-7";
    root.head.append(stylesheet);
  }

  const open = root.createElement("button");
  open.id = "visualiser-open";
  open.type = "button";
  open.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15v4M5 5v6M12 12v7M12 5v3M19 16v3M19 5v7"/><circle cx="5" cy="13" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="19" cy="14" r="2"/></svg><span class="visually-hidden">Open signal visualiser</span>`;
  open.setAttribute("aria-label", "Open signal visualiser");
  open.title = "Open signal visualiser";
  (root.querySelector("#global-tools") ?? root.querySelector(".global-status"))?.append(open);

  const template = root.createElement("template");
  template.innerHTML = `
    <dialog class="visualiser-dialog" aria-labelledby="visualiser-title" aria-describedby="visualiser-description">
      <section class="visualiser-panel">
        <header class="visualiser-header">
          <div class="visualiser-heading">
            <span class="panel-context">Signal stack</span>
            <h2 id="visualiser-title">Track signals</h2>
            <p id="visualiser-description" class="visually-hidden">A pixel visualisation with one audio-reactive lane for every project track.</p>
          </div>
          <output class="visualiser-status" data-status aria-live="polite"></output>
          <div class="visualiser-actions">
            <button type="button" data-play title="Play"><span aria-hidden="true">&#9654;</span><span>Play</span></button>
            <button type="button" data-stop title="Stop"><span aria-hidden="true">&#9632;</span><span>Stop</span></button>
            <button type="button" data-close title="Close visualiser"><span>Close</span><span aria-hidden="true">&times;</span></button>
          </div>
        </header>
        <div class="visualiser-stage">
          <canvas aria-label="Signal Stack visualiser"></canvas>
          <p data-fallback hidden>Canvas visuals are not supported in this browser. Music playback is unaffected.</p>
        </div>
        <ol class="visually-hidden" data-track-list aria-label="Visualised tracks"></ol>
      </section>
    </dialog>`;
  const dialog = template.content.querySelector(".visualiser-dialog");
  root.body.append(dialog);

  const canvas = dialog.querySelector("canvas");
  const status = dialog.querySelector("[data-status]");
  const trackList = dialog.querySelector("[data-track-list]");
  const play = dialog.querySelector("[data-play]");
  const stop = dialog.querySelector("[data-stop]");
  let context = null;
  try {
    context = canvas.getContext?.("2d", { alpha: false }) ?? null;
    if (context) context.imageSmoothingEnabled = false;
  } catch {
    context = null;
  }

  function getReader(trackId) {
    let reader = readers.get(trackId);
    if (reader) return reader;
    reader = createAnalyserReader({
      getObservationNode: () => trackRuntimes.getObservationNode(trackId),
      isReady: audioEngine.isReady,
    });
    readers.set(trackId, reader);
    return reader;
  }

  function getTrackFrames() {
    const project = projectState.getState();
    const sensitivity = project.visualiser?.sensitivity ?? 1;
    const activeIds = new Set(project.tracks.map(({ id }) => id));
    for (const trackId of readers.keys()) {
      if (!activeIds.has(trackId)) readers.delete(trackId);
    }
    return project.tracks.map((track, index) => ({
      audible: isTrackAudible(project, track.id),
      colour: resolveColour(root, getTrackColour(index), "#f0a6c8"),
      features: getReader(track.id).read(sensitivity),
      gain: track.mixer.volume * track.instrument.volume,
      id: track.id,
      name: track.name,
      voiceLabel: getVoiceLabel(track.instrument.voiceType),
      voiceType: track.instrument.voiceType,
    }));
  }

  function syncTrackDescription() {
    const project = projectState.getState();
    trackList.replaceChildren(...project.tracks.map((track, index) => {
      const item = root.createElement("li");
      item.textContent = `${track.name}, ${getVoiceLabel(track.instrument.voiceType)}, track ${index + 1}`;
      return item;
    }));
  }

  function syncTransport() {
    status.textContent = transportLabel(sessionState.getState());
    const sourcePlay = root.getElementById("transport-play");
    const sourceStop = root.getElementById("transport-stop");
    play.disabled = sourcePlay?.disabled ?? true;
    stop.disabled = sourceStop?.disabled ?? true;
  }

  function draw(time = 0) {
    animationFrame = 0;
    if (!context || !dialog.open || root.visibilityState === "hidden") return;
    syncTransport();
    const { height, ratio, width } = fitCanvas(canvas);
    renderSignalStackFrame(context, getTrackFrames(), {
      ...readTheme(root),
      height,
      ratio,
      reducedMotion: reducedMotion?.matches === true,
      time,
      width,
    });
    if (audioEngine.isReady()) animationFrame = requestAnimationFrame(draw);
  }

  function scheduleDraw() {
    if (!animationFrame && dialog.open) animationFrame = requestAnimationFrame(draw);
  }

  open.addEventListener("click", () => {
    syncTrackDescription();
    syncTransport();
    if (!dialog.open) dialog.showModal();
    scheduleDraw();
  }, { signal: lifecycle.signal });
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close(), { signal: lifecycle.signal });
  play.addEventListener("click", () => root.getElementById("transport-play")?.click(), { signal: lifecycle.signal });
  stop.addEventListener("click", () => root.getElementById("transport-stop")?.click(), { signal: lifecycle.signal });
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }, { signal: lifecycle.signal });
  projectState.addEventListener("change", () => {
    syncTrackDescription();
    scheduleDraw();
  }, { signal: lifecycle.signal });
  sessionState.addEventListener("change", () => {
    syncTransport();
    scheduleDraw();
  }, { signal: lifecycle.signal });
  reducedMotion?.addEventListener?.("change", scheduleDraw, { signal: lifecycle.signal });
  root.addEventListener("visibilitychange", scheduleDraw, { signal: lifecycle.signal });

  if (!context) {
    canvas.hidden = true;
    dialog.querySelector("[data-fallback]").hidden = false;
  }
  syncTrackDescription();
  syncTransport();

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      cancelAnimationFrame(animationFrame);
      readers.clear();
      dialog.remove();
      open.remove();
      root.getElementById(STYLESHEET_ID)?.remove();
    },
    open: () => open.click(),
  });
}
