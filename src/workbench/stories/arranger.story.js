import { createArrangerFeature } from "../../features/arranger/arranger-feature.js";
import { createProjectState } from "../../state/project-state.js";
import { createSessionState } from "../../state/session-state.js";
import { defineStory } from "../story-registry.js";
import { createArrangedProject, createStoryScheduler } from "../story-fixtures.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";

function arrangerMarkup() {
  return `
    <div class="story-arranger">
      <header class="global-header story-transport">
        <button id="project-title" type="button">Neon Overpass</button>
        <div class="transport-controls">
          <button id="transport-start" type="button" aria-label="Return to start">⏮</button>
          <button id="transport-play" class="transport-play" type="button" aria-label="Play">▶</button>
          <button id="transport-stop" type="button" aria-label="Stop">■</button>
          <button id="transport-loop" type="button" aria-label="Loop arrangement" aria-pressed="false">↻</button>
        </div>
        <label class="mode-control"><span>Play</span><select id="playback-mode"><option value="arrangement">Song</option><option value="pattern">Pattern</option></select></label>
        <label class="tempo-control"><span>Tempo</span><input id="tempo" value="120" /><output id="tempo-value">120</output></label>
        <label class="master-control"><span>Master</span><input id="master-volume" type="range" min="0" max="100" /><output id="master-volume-value">35%</output></label>
        <button id="mobile-mix-open" type="button">Mix</button>
        <output id="transport-status">Song · Stopped · step 001</output>
      </header>
      <section class="arrangement-stage" aria-labelledby="arrangement-title">
        <div class="arrangement-heading">
          <div><span class="panel-context">Song timeline</span><h2 id="arrangement-title">Arrangement</h2></div>
          <p id="arrangement-error" class="arrangement-error" role="alert" hidden></p>
        </div>
        <p id="arrangement-empty" class="arrangement-empty">Your song is empty. Add a loop below.</p>
        <div class="arrangement-scroll" tabindex="0" aria-label="Track arrangement timeline">
          <div id="arrangement-canvas" class="arrangement-canvas"></div>
        </div>
      </section>
      <section class="story-arranger-controls">
        <div class="pattern-toolbar">
          <label><span>Pattern</span><select id="pattern-select"></select></label>
          <label><span>Name</span><input id="pattern-name" /></label>
          <label><span>Keyboard octave</span><select id="pattern-root-octave"><option value="2">C2</option><option value="3">C3</option><option value="4">C4</option><option value="5">C5</option><option value="6">C6</option></select></label>
          <output id="pattern-usage"></output>
          <input id="place-start" type="hidden" value="1" />
          <button id="place-pattern" class="place-pattern" type="button">Add loop to song</button>
          <button id="pattern-new" type="button">New pattern</button>
          <button id="pattern-variation" type="button">Duplicate variation</button>
          <button id="pattern-delete" type="button">Delete pattern</button>
          <span>Add to <strong id="place-track-name">Pulse lead</strong></span>
        </div>
        <section id="selected-clip-inspector" class="selected-clip-inspector" hidden>
          <strong>Selected clip</strong>
          <span id="selected-clip-pattern"></span>
          <label>Track <select id="selected-clip-track"></select></label>
          <label>Start <input id="selected-clip-start" type="number" /></label>
          <button id="selected-clip-back-four" type="button">−4</button>
          <button id="selected-clip-back" type="button">−1</button>
          <button id="selected-clip-forward" type="button">+1</button>
          <button id="selected-clip-forward-four" type="button">+4</button>
          <button id="selected-clip-variation" type="button">Create variation</button>
          <button id="selected-clip-remove" type="button">Remove clip</button>
        </section>
        <details id="selected-track-menu" class="track-menu">
          <summary>Track options</summary>
          <label>Track name <input id="selected-track-name" /></label>
          <button id="selected-track-up" type="button">Move up</button>
          <button id="selected-track-down" type="button">Move down</button>
          <button id="selected-track-remove" type="button">Remove track</button>
        </details>
      </section>
      <dialog id="mobile-mix-dialog" class="mobile-mix-dialog">
        <div>
          <label>Play <select id="mobile-playback-mode"><option value="arrangement">Song</option><option value="pattern">Pattern</option></select></label>
          <label>Tempo <input id="mobile-tempo" value="120" /></label>
          <label>Master <input id="mobile-master-volume" type="range" min="0" max="100" /><output id="mobile-master-volume-value">35%</output></label>
          <button id="mobile-mix-close" type="button">Close</button>
          <button id="mobile-mix-done" type="button">Done</button>
        </div>
      </dialog>
    </div>
  `;
}

function mountArranger({ canvas, scenario }) {
  const root = createStoryRoot(canvas, { layout: "fill" });
  root.innerHTML = arrangerMarkup();
  const projectState = scenario.empty ? createProjectState() : createArrangedProject();
  const scheduler = createStoryScheduler({
    mode: scenario.mode,
    status: scenario.status,
    stepIndex: scenario.stepIndex,
  });
  const sessionState = createSessionState({
    workspace: {
      arrangementStartStep: scenario.stepIndex,
      playbackMode: scenario.mode,
      selectedPatternId: "pattern-1",
      selectedTrackId: "track-1",
    },
  });
  const feature = createArrangerFeature({
    audioEngine: { isReady: () => scenario.ready },
    inputController: { stopAll() {} },
    notePreview: { stop() {} },
    projectState,
    root: root.ownerDocument,
    scheduler,
    sessionState,
  });
  feature.render();
  return disposeAll(feature);
}

export const arrangerStory = defineStory({
  id: "arranger",
  title: "Arranger",
  group: "Arrangement",
  description: "Exercise the production timeline, track mixer, clips, pattern library, and transport as one isolated composite.",
  source: "src/features/arranger/arranger-feature.js",
  scenarios: [
    { id: "song", title: "Arranged song", empty: false, ready: true, mode: "arrangement", status: "stopped", stepIndex: 0 },
    { id: "playing", title: "Playing", empty: false, ready: true, mode: "arrangement", status: "playing", stepIndex: 9 },
    { id: "pattern-mode", title: "Pattern playback", empty: false, ready: true, mode: "pattern", status: "paused", stepIndex: 5 },
    { id: "empty", title: "Empty song", empty: true, ready: true, mode: "arrangement", status: "stopped", stepIndex: 0 },
    { id: "audio-disabled", title: "Audio unavailable", empty: false, ready: false, mode: "arrangement", status: "stopped", stepIndex: 0 },
  ],
  mount: mountArranger,
});
