import { createAudioExportFeature } from "../../features/audio-export/audio-export.js";
import { defineStory } from "../story-registry.js";
import { createArrangedProject, createStoryPersistence } from "../story-fixtures.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";
import { projectLibraryMarkup } from "../story-markup.js";

function mountAudioExport({ canvas, scenario }) {
  const root = createStoryRoot(canvas);
  root.innerHTML = `
    <p class="story-note">The production WAV export action mounted in its real project-library context. Rendering uses a deterministic silent buffer.</p>
    <div class="story-project-library story-export"></div>
  `;
  root.querySelector(".story-project-library").innerHTML = projectLibraryMarkup();
  const projectState = createArrangedProject();
  const persistence = createStoryPersistence(projectState);
  const feature = createAudioExportFeature({
    encodeWave: () => new Uint8Array([82, 73, 70, 70]),
    persistence,
    projectState,
    renderAudio: async () => ({ channelData: [new Float32Array(8)], sampleRate: 48_000 }),
    root: root.ownerDocument,
    urlApi: {
      createObjectURL: () => "blob:workbench-audio-export",
      revokeObjectURL() {},
    },
  });
  const status = root.querySelector("#audio-export-status");
  if (scenario.status) {
    status.hidden = false;
    status.textContent = scenario.status;
    status.classList.toggle("error", scenario.error);
  }
  return disposeAll(feature);
}

export const audioExportStory = defineStory({
  id: "audio-export",
  title: "Audio export",
  group: "Projects",
  description: "Inspect local WAV rendering entry, progress copy, completed filenames, and error presentation.",
  source: "src/features/audio-export/audio-export.js",
  scenarios: [
    { id: "ready", title: "Ready to export", status: "", error: false },
    { id: "rendering", title: "Rendering", status: "Rendering the complete arrangement locally…", error: false },
    { id: "complete", title: "WAV ready", status: "WAV ready: neon-overpass.wav", error: false },
    { id: "error", title: "Render error", status: "The arrangement could not be rendered.", error: true },
  ],
  mount: mountAudioExport,
});
