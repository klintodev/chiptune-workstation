import { accountStory } from "./stories/account.story.js";
import { arrangerStory } from "./stories/arranger.story.js";
import { audioExportStory } from "./stories/audio-export.story.js";
import { audioStatusStory } from "./stories/audio-status.story.js";
import { helpStory } from "./stories/help.story.js";
import { instrumentStory } from "./stories/instrument.story.js";
import { keyboardStory } from "./stories/keyboard.story.js";
import { patternEditorStory } from "./stories/pattern-editor.story.js";
import { projectLibraryStory } from "./stories/project-library.story.js";
import { publishingStory } from "./stories/publishing.story.js";
import { remixImportStory } from "./stories/remix-import.story.js";
import { themeStory } from "./stories/theme.story.js";
import { visualiserStory } from "./stories/visualiser.story.js";
import { workspaceTabsStory } from "./stories/workspace-tabs.story.js";

export const stories = Object.freeze([
  arrangerStory,
  patternEditorStory,
  workspaceTabsStory,
  instrumentStory,
  keyboardStory,
  projectLibraryStory,
  audioExportStory,
  accountStory,
  publishingStory,
  remixImportStory,
  visualiserStory,
  audioStatusStory,
  helpStory,
  themeStory,
]);
