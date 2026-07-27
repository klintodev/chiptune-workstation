import { createPublishingFeature } from "../../features/publishing/publishing.js";
import { defineStory } from "../story-registry.js";
import { createArrangedProject, createStoryPersistence } from "../story-fixtures.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";
import { createStoryEventSource, displayStoryDialog } from "../story-utilities.js";

function mountPublishing({ canvas, scenario }) {
  const root = createStoryRoot(canvas);
  root.innerHTML = `
    <div class="story-feature-toolbar">
      <div id="global-tools" class="global-tools"></div>
      <div id="project-share-render-actions" class="project-dialog-actions"></div>
    </div>
    <dialog id="project-library-dialog"></dialog>
  `;
  const projectState = createArrangedProject();
  const persistence = createStoryPersistence(projectState);
  const accountEvents = createStoryEventSource({
    account: scenario.verified
      ? { displayName: "Chip Pilot", email: "pilot@example.test", emailVerified: true }
      : scenario.signedIn
        ? { displayName: "Chip Pilot", email: "pilot@example.test", emailVerified: false }
        : null,
  });
  let publication = scenario.published ? {
    allowRemix: scenario.allowRemix,
    creatorName: "Chip Pilot",
    url: "https://example.test/play/neon-overpass",
  } : null;
  const publicationService = Object.freeze({
    getCurrentPublication: async () => publication,
    publish: async (creatorName) => {
      publication = { allowRemix: false, creatorName, url: "https://example.test/play/neon-overpass" };
      return publication;
    },
    setRemixPermission: async (allowRemix) => {
      publication = { ...publication, allowRemix };
      return publication;
    },
    unpublish: async () => {
      publication = null;
    },
  });
  const feature = createPublishingFeature({
    accountService: {
      addEventListener: accountEvents.addEventListener,
      getState: accountEvents.getState,
    },
    persistence,
    publicationService,
    provenanceRepository: {
      get: async () => scenario.derivative ? {
        creatorName: "Pixel Friend",
        publicationId: "source-demo",
        publicationRevision: 4,
        sourceTitle: "Source Skyline",
      } : null,
    },
    root: root.ownerDocument,
  });
  root.querySelector("#project-publish").click();
  const dialog = root.ownerDocument.querySelector(".publishing-dialog");
  displayStoryDialog(root, dialog);
  return disposeAll(feature);
}

export const publishingStory = defineStory({
  id: "publishing",
  title: "Publishing",
  group: "Cloud",
  description: "Inspect sharing eligibility, creator attribution, public-link controls, remix permission, and derivative review.",
  source: "src/features/publishing/publishing.js",
  scenarios: [
    { id: "signed-out", title: "Sign-in required", signedIn: false, verified: false, published: false, derivative: false },
    { id: "verification", title: "Verification required", signedIn: true, verified: false, published: false, derivative: false },
    { id: "ready", title: "Ready to publish", signedIn: true, verified: true, published: false, derivative: false },
    { id: "published", title: "Published link", signedIn: true, verified: true, published: true, allowRemix: false, derivative: false },
    { id: "remix-enabled", title: "Remixing enabled", signedIn: true, verified: true, published: true, allowRemix: true, derivative: false },
    { id: "derivative", title: "Derivative attribution", signedIn: true, verified: true, published: false, derivative: true },
  ],
  mount: mountPublishing,
});
