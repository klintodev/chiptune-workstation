import { renderArrangementOffline } from "../../audio/offline-arrangement-renderer.js";
import { encodePcm16Wave } from "../../audio/wav-encoder.js";

const STYLESHEET_ID = "audio-export-styles";

function safeFilename(title) {
  const base = title.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "untitled-chiptune"}.wav`;
}

export function createAudioExportFeature({
  encodeWave = encodePcm16Wave,
  persistence,
  projectState,
  renderAudio = renderArrangementOffline,
  root = document,
  urlApi = URL,
} = {}) {
  if (!persistence || !projectState) throw new TypeError("Audio export requires persistence and project state.");
  const lifecycle = new AbortController();
  let busy = false;

  if (!root.getElementById(STYLESHEET_ID)) {
    const stylesheet = root.createElement("link");
    stylesheet.id = STYLESHEET_ID;
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./src/features/audio-export/audio-export.css?v=20260721-2";
    root.head.append(stylesheet);
  }

  const actions = root.querySelector("#project-share-render-actions")
    ?? root.querySelector(".project-dialog-actions");
  const panel = root.querySelector(".project-dialog-panel");
  if (!actions || !panel) throw new Error("Audio export could not find the project library.");
  const button = root.createElement("button");
  button.id = "audio-export-wav";
  button.type = "button";
  button.textContent = "Export WAV";
  const status = root.createElement("p");
  status.id = "audio-export-status";
  status.className = "audio-export-status";
  status.setAttribute("role", "status");
  actions.append(button);
  panel.append(status);

  function setStatus(message = "", { error = false } = {}) {
    status.textContent = message;
    status.classList.toggle("error", error);
    status.hidden = !message;
  }

  async function exportWave() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    button.textContent = "Rendering...";
    setStatus("Rendering the complete arrangement locally...");
    try {
      await persistence.saveNow();
      await new Promise((resolve) => globalThis.requestAnimationFrame?.(resolve) ?? setTimeout(resolve, 0));
      const rendered = await renderAudio(projectState.getState());
      const wave = encodeWave(rendered);
      const blob = new Blob([wave], { type: "audio/wav" });
      const url = urlApi.createObjectURL(blob);
      const download = root.createElement("a");
      download.href = url;
      download.download = safeFilename(projectState.getState().metadata.title);
      root.body.append(download);
      download.click();
      download.remove();
      globalThis.setTimeout(() => urlApi.revokeObjectURL(url), 0);
      setStatus(`WAV ready: ${download.download}`);
    } catch (error) {
      setStatus(error?.message || "Audio export failed.", { error: true });
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = "Export WAV";
    }
  }

  button.addEventListener("click", () => void exportWave(), { signal: lifecycle.signal });
  status.hidden = true;

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      button.remove();
      status.remove();
      root.getElementById(STYLESHEET_ID)?.remove();
    },
    exportWave,
  });
}
