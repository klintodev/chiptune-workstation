import { createRemixImportFeature } from "../../features/remixing/remix-import-feature.js";
import { defineStory } from "../story-registry.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";
import { displayStoryDialog } from "../story-utilities.js";

function mountRemixImport({ canvas, scenario }) {
  const root = createStoryRoot(canvas);
  root.innerHTML = `<p class="story-note">The production remix consent flow uses a fixed publication and a disposable local-project service.</p>`;
  const location = {
    href: scenario.invalid
      ? "https://workbench.test/?remix=demo&revision=0"
      : "https://workbench.test/?remix=demo-publication&revision=4",
  };
  const feature = createRemixImportFeature({
    history: {
      replaceState(_state, _title, href) {
        location.href = href;
      },
    },
    location,
    persistence: {
      openProject: async () => true,
    },
    remixService: {
      importPublication: async () => ({
        document: {
          id: "local-remix",
          project: { metadata: { title: "Source Skyline remix" } },
        },
        provenance: {
          creatorName: "Pixel Friend",
          publicationId: "demo-publication",
          publicationRevision: 4,
          sourceTitle: "Source Skyline",
        },
      }),
    },
    root: root.ownerDocument,
  });
  const dialog = root.ownerDocument.querySelector(".remix-import-dialog");
  displayStoryDialog(root, dialog);
  return disposeAll(feature);
}

export const remixImportStory = defineStory({
  id: "remix-import",
  title: "Remix import",
  group: "Cloud",
  description: "Inspect revision consent, rights copy, local-copy creation, success, and invalid-intent handling.",
  source: "src/features/remixing/remix-import-feature.js",
  scenarios: [
    { id: "consent", title: "Import consent", invalid: false },
    { id: "invalid", title: "Invalid request", invalid: true },
  ],
  mount: mountRemixImport,
});
