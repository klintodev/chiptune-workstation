import { createProjectLibraryFeature } from "../../features/project-library/project-library.js";
import { defineStory } from "../story-registry.js";
import { createArrangedProject, createStoryPersistence } from "../story-fixtures.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";
import { projectLibraryMarkup } from "../story-markup.js";

function mountProjectLibrary({ canvas, scenario }) {
  const root = createStoryRoot(canvas);
  root.innerHTML = `
    <p class="story-note">A disposable local project catalogue with New, Duplicate, recovery, share, and render actions.</p>
    <div class="story-project-library"></div>
  `;
  root.querySelector(".story-project-library").innerHTML = projectLibraryMarkup();
  const projectState = createArrangedProject();
  const persistence = createStoryPersistence(projectState, {
    persistent: scenario.persistent,
    status: scenario.status,
  });
  const feature = createProjectLibraryFeature({
    downloadProject() {},
    persistence,
    projectState,
    root: root.ownerDocument,
  });
  root.querySelector("#project-library-open").click();
  return disposeAll(feature);
}

export const projectLibraryStory = defineStory({
  id: "project-library",
  title: "Project library",
  group: "Projects",
  description: "Inspect local project naming, save state, catalogue actions, deletion, and storage recovery messaging.",
  source: "src/features/project-library/project-library.js",
  scenarios: [
    { id: "saved", title: "Saved projects", persistent: true, status: "saved" },
    { id: "saving", title: "Saving", persistent: true, status: "saving" },
    { id: "unsaved", title: "Unsaved changes", persistent: true, status: "unsaved" },
    { id: "storage-unavailable", title: "Storage unavailable", persistent: false, status: "unavailable" },
  ],
  mount: mountProjectLibrary,
});
