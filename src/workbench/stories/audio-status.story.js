import { createAudioStatusFeature } from "../../features/audio-status/audio-status.js";
import { createSessionState } from "../../state/session-state.js";
import { defineStory } from "../story-registry.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";
import { displayStoryDialog } from "../story-utilities.js";

function createAudioEngine(initialState) {
  const events = new EventTarget();
  let state = initialState;
  const startedAt = performance.now();
  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    async enable() {
      state = "running";
      events.dispatchEvent(new Event("statechange"));
    },
    getCurrentTime: () => (performance.now() - startedAt) / 1000,
    getSampleRate: () => state === "idle" ? null : 48_000,
    getState: () => state,
    isReady: () => state === "running",
  });
}

function mountAudioStatus({ canvas, scenario }) {
  const root = createStoryRoot(canvas);
  root.innerHTML = `
    <div class="story-audio-status">
      <button id="audio-status-open" class="status-cluster" type="button" aria-haspopup="dialog" aria-controls="audio-setup">
        <span id="status-light" class="status-light" aria-hidden="true"></span>
        <div><span class="status-label">Audio</span><strong id="audio-state">Not started</strong></div>
      </button>
      <span>Header projection</span>
    </div>
    <dialog id="audio-setup" class="audio-setup" aria-labelledby="setup-title">
      <div class="audio-setup-card">
        <div>
          <p class="eyebrow">Audio lifecycle</p>
          <h2 id="setup-title">Klinto Studio</h2>
          <p id="status-description" class="lede"></p>
        </div>
        <div class="audio-setup-actions">
          <button id="audio-action" class="primary-action" type="button"><span>Start making music</span><span aria-hidden="true">↗</span></button>
          <button id="audio-setup-close" type="button">Continue without sound</button>
        </div>
        <div id="error-panel" class="error-panel" role="alert" hidden>
          <strong>Audio could not start</strong><p id="error-message"></p>
        </div>
        <div class="meters" aria-label="Audio engine information">
          <div><span>Context</span><strong id="context-state">—</strong></div>
          <div><span>Sample rate</span><strong id="sample-rate">—</strong></div>
          <div><span>Audio time</span><strong id="audio-time">—</strong></div>
        </div>
      </div>
    </dialog>
  `;

  const audioEngine = createAudioEngine(scenario.engineState);
  const sessionState = createSessionState({
    audio: {
      status: scenario.engineState,
      error: scenario.error ? { code: "fixture-error", message: scenario.error } : null,
    },
  });
  const feature = createAudioStatusFeature({
    audioEngine,
    createUnexpectedError: (error) => ({ message: error?.message ?? "Unexpected audio error." }),
    isAudioEngineError: () => false,
    root,
    sessionState,
  });
  feature.render();
  displayStoryDialog(root, root.querySelector("#audio-setup"));
  return disposeAll(feature);
}

export const audioStatusStory = defineStory({
  id: "audio-status",
  title: "Audio status",
  group: "System",
  description: "Inspect lifecycle copy, diagnostics, actions, and error presentation with a deterministic fake engine.",
  source: "src/features/audio-status/audio-status.js",
  scenarios: [
    { id: "idle", title: "Not started", engineState: "idle" },
    { id: "running", title: "Running", engineState: "running" },
    { id: "suspended", title: "Browser suspended", engineState: "suspended" },
    { id: "error", title: "Permission error", engineState: "idle", error: "Your browser blocked audio startup. Try again after interacting with the page." },
  ],
  mount: mountAudioStatus,
});
