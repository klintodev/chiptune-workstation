import { getTrackColour, getVoiceLabel } from "../../shared/track-presentation.js";
import { fitCanvas } from "../../visualiser/canvas-renderer.js?v=20260721-3";
import { buildCompositionProjection } from "../../visualiser/composition-projection.js?v=20260722-1";
import { renderCompositionFrame } from "../../visualiser/signal-stack-renderer.js?v=20260722-1";

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
  projectState,
  root = document,
  scheduler,
  sessionState,
} = {}) {
  if (!projectState || !scheduler || !sessionState) {
    throw new TypeError("Visualiser requires project, scheduler, and session state.");
  }
  const lifecycle = new AbortController();
  const reducedMotion = root.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)");
  let animationFrame = 0;

  const open = root.createElement("button");
  open.id = "visualiser-open";
  open.type = "button";
  open.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15v4M5 5v6M12 12v7M12 5v3M19 16v3M19 5v7"/><circle cx="5" cy="13" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="19" cy="14" r="2"/></svg><span class="visually-hidden">Open composition visualiser</span>`;
  open.setAttribute("aria-label", "Open composition visualiser");
  open.title = "Open composition visualiser";
  (root.querySelector("#global-tools") ?? root.querySelector(".global-status"))?.append(open);

  const template = root.createElement("template");
  template.innerHTML = `
    <dialog class="visualiser-dialog" aria-labelledby="visualiser-title" aria-describedby="visualiser-description">
      <section class="visualiser-panel">
        <header class="visualiser-header">
          <div class="visualiser-heading">
            <span class="panel-context">Composition field</span>
            <h2 id="visualiser-title">Upcoming notes</h2>
            <p id="visualiser-description" class="visually-hidden">A pixel-art perspective projection of upcoming notes in the project arrangement.</p>
          </div>
          <output class="visualiser-status" data-status aria-live="polite"></output>
          <div class="visualiser-actions">
            <button type="button" data-play title="Play"><span aria-hidden="true">&#9654;</span><span>Play</span></button>
            <button type="button" data-stop title="Stop"><span aria-hidden="true">&#9632;</span><span>Stop</span></button>
            <button type="button" data-close title="Close visualiser"><span>Close</span><span aria-hidden="true">&times;</span></button>
          </div>
        </header>
        <div class="visualiser-stage">
          <canvas aria-label="Composition note visualiser"></canvas>
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

  function getProjection() {
    const project = projectState.getState();
    const workspace = sessionState.getState().workspace;
    const projection = buildCompositionProjection(project, scheduler.getTimelineSnapshot(), {
      selectedPatternId: workspace.selectedPatternId,
      selectedTrackId: workspace.selectedTrackId,
    });
    return Object.freeze({
      ...projection,
      notes: Object.freeze(projection.notes.map((note) => Object.freeze({
        ...note,
        colour: resolveColour(root, getTrackColour(note.trackIndex), "#f0a6c8"),
      }))),
    });
  }

  function syncTrackDescription() {
    const project = projectState.getState();
    trackList.replaceChildren(...project.tracks.map((track, index) => {
      const item = root.createElement("li");
      const pan = track.mixer.pan === 0
        ? "centre"
        : `${Math.round(Math.abs(track.mixer.pan) * 100)}% ${track.mixer.pan < 0 ? "left" : "right"}`;
      item.textContent = `${track.name}, ${getVoiceLabel(track.instrument.voiceType)}, ${pan}, track ${index + 1}`;
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

  function draw() {
    animationFrame = 0;
    if (!context || !dialog.open || root.visibilityState === "hidden") return;
    syncTransport();
    const { height, ratio, width } = fitCanvas(canvas);
    renderCompositionFrame(context, getProjection(), {
      ...readTheme(root),
      height,
      ratio,
      width,
    });
    if (scheduler.getState().status === "playing" && !reducedMotion?.matches) {
      animationFrame = requestAnimationFrame(draw);
    }
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
  scheduler.addEventListener("statechange", scheduleDraw, { signal: lifecycle.signal });
  reducedMotion?.addEventListener("change", scheduleDraw, { signal: lifecycle.signal });
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
      dialog.remove();
      open.remove();
    },
    open: () => open.click(),
  });
}
