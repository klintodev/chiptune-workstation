import { createVisualiserFeature } from "../../features/visualiser/visualiser.js";
import { createSessionState } from "../../state/session-state.js";
import { defineStory } from "../story-registry.js";
import { createArrangedProject, createStoryScheduler } from "../story-fixtures.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";

function mountVisualiser({ canvas, scenario }) {
  const root = createStoryRoot(canvas, { layout: "fill" });
  root.innerHTML = `
    <p class="story-note">Composition-derived notes use the production projection, semantic list, inspector, and canvas renderer.</p>
    <div class="story-feature-toolbar">
      <div id="global-tools" class="global-tools"></div>
      <button id="transport-play" type="button">Play</button>
      <button id="transport-stop" type="button">Stop</button>
    </div>
    <main class="daw-workspace story-visualiser-workspace">
      <div id="pattern-grid"><button type="button">Pattern step</button></div>
    </main>
  `;
  root.querySelector("#transport-play").disabled = !scenario.ready;
  root.querySelector("#transport-stop").disabled = scenario.status === "stopped";
  const projectState = createArrangedProject();
  projectState.setVisualiser({ palette: scenario.palette });
  const sessionState = createSessionState({
    workspace: {
      selectedPatternId: "pattern-1",
      selectedTrackId: "track-1",
    },
  });
  const scheduler = createStoryScheduler({
    mode: scenario.mode,
    status: scenario.status,
    stepIndex: scenario.stepIndex,
  });
  const feature = createVisualiserFeature({
    onEditNote() {},
    projectState,
    root: root.ownerDocument,
    scheduler,
    sessionState,
  });
  const dock = root.querySelector(".visualiser-dock");
  if (dock.dataset.size === "collapsed") dock.querySelector("[data-dock-toggle]").click();
  if (scenario.expanded) dock.querySelector("[data-resize]").click();
  return disposeAll(feature);
}

export const visualiserStory = defineStory({
  id: "visualiser",
  title: "Composition visualiser",
  group: "Visual",
  description: "Inspect projected notes, transport context, palettes, semantic explanations, and responsive dock sizes.",
  source: "src/features/visualiser/visualiser.js",
  scenarios: [
    { id: "studio", title: "Studio palette", palette: "arcade", mode: "arrangement", status: "stopped", stepIndex: 0, ready: true, expanded: false },
    { id: "playing", title: "Playing projection", palette: "neon", mode: "arrangement", status: "playing", stepIndex: 6, ready: true, expanded: false },
    { id: "expanded", title: "Expanded dock", palette: "ice", mode: "arrangement", status: "paused", stepIndex: 12, ready: true, expanded: true },
    { id: "pattern", title: "Pattern projection", palette: "sunset", mode: "pattern", status: "stopped", stepIndex: 3, ready: true, expanded: false },
  ],
  mount: mountVisualiser,
});
