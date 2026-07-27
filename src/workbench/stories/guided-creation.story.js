import { createGuidedCreationFeature } from "../../features/guided-creation/guided-creation.js";
import { createScaleEntryController } from "../../features/guided-creation/scale-entry-controller.js";
import { createStarterService } from "../../features/guided-creation/starter-service.js";
import { createSessionState } from "../../state/session-state.js";
import { defineStory } from "../story-registry.js";
import { createArrangedProject } from "../story-fixtures.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";
import { displayStoryDialog } from "../story-utilities.js";

function mountGuidedCreation({ canvas, scenario }) {
  const root = createStoryRoot(canvas);
  root.innerHTML = `
    <div class="story-feature-toolbar">
      <div id="global-tools" class="global-tools"></div>
      <p>All previews and checkpoints are disposable workbench records.</p>
    </div>
  `;
  const projectState = createArrangedProject();
  projectState.setScaleGuide({
    lock: scenario.lock,
    scale: scenario.scale,
    tonic: scenario.tonic,
  });
  const sessionState = createSessionState();
  const entryController = createScaleEntryController({
    getScaleGuide: () => projectState.getState().scaleGuide,
  });
  if (scenario.bypass) entryController.armBypass();
  const checkpointService = {
    createCheckpoint: async () => true,
    list: async () => scenario.checkpoints ? [
      { checkpointId: "before-bass", createdAt: "2026-07-27T10:00:00.000Z", label: "Before changing the bass", operation: "manual", sourceProjectRevision: 6 },
      { checkpointId: "safe-return", createdAt: "2026-07-26T16:20:00.000Z", label: "Safe return", operation: "restore", sourceProjectRevision: 4 },
    ] : [],
    protectAndReplace: async () => true,
    restore: async () => true,
  };
  const persistence = {
    createProjectFromTemplate: async (project) => ({ id: "starter-project", project }),
    getActiveDocument: () => ({ id: "workbench-project", updatedAt: "2026-07-27T12:00:00.000Z" }),
  };
  const starterService = createStarterService({
    checkpointService,
    persistence,
    projectState,
  });
  const feature = createGuidedCreationFeature({
    checkpointService,
    entryController,
    getSelectedPatternId: () => "pattern-1",
    projectState,
    root: root.ownerDocument,
    sessionState,
    starterService,
  });
  root.querySelector("#guided-creation-open").click();
  const dialog = root.ownerDocument.querySelector(".guided-dialog");
  if (scenario.preview === "arpeggio") dialog.querySelector("[data-preview]").click();
  if (scenario.preview === "starter") dialog.querySelector("[data-starter-preview]").click();
  displayStoryDialog(root, dialog);
  return disposeAll(feature);
}

export const guidedCreationStory = defineStory({
  id: "guided-creation",
  title: "Guided creation",
  group: "Composition",
  description: "Inspect scale guidance, reversible pattern ideas, style starters, and device-local checkpoints.",
  source: "src/features/guided-creation/guided-creation.js",
  scenarios: [
    { id: "guide", title: "Scale guide", lock: true, scale: "major", tonic: 0, bypass: false, checkpoints: false, preview: null },
    { id: "bypass", title: "One-note bypass", lock: true, scale: "natural-minor", tonic: 9, bypass: true, checkpoints: false, preview: null },
    { id: "idea-preview", title: "Pattern idea preview", lock: true, scale: "major-pentatonic", tonic: 2, bypass: false, checkpoints: false, preview: "arpeggio" },
    { id: "starter", title: "Style starter preview", lock: false, scale: "chromatic", tonic: 0, bypass: false, checkpoints: false, preview: "starter" },
    { id: "checkpoints", title: "Saved checkpoints", lock: false, scale: "major", tonic: 0, bypass: false, checkpoints: true, preview: null },
  ],
  mount: mountGuidedCreation,
});
