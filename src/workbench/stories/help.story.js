import { createHelpFeature } from "../../features/help/help.js";
import { defineStory } from "../story-registry.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";
import { displayStoryDialog } from "../story-utilities.js";

function mountHelp({ canvas, scenario }) {
  const root = createStoryRoot(canvas);
  root.innerHTML = `
    <div class="story-feature-toolbar">
      <div id="global-tools" class="global-tools"></div>
      <p>Help terms remain linked to the production glossary.</p>
    </div>
    <div class="story-help-terms">
      <button class="term-help" type="button" data-help-term="pattern">Explain pattern</button>
      <button class="term-help" type="button" data-help-term="gate">Explain gate</button>
      <button class="term-help" type="button" data-help-term="velocity">Explain velocity</button>
    </div>
  `;
  const feature = createHelpFeature({ root: root.ownerDocument });
  const dialog = root.ownerDocument.querySelector("#help-dialog");
  displayStoryDialog(root, dialog);
  if (scenario.term) dialog.querySelector(`#help-${scenario.term}`)?.focus();
  return disposeAll(feature);
}

export const helpStory = defineStory({
  id: "help",
  title: "Help and glossary",
  group: "System",
  description: "Inspect first-loop guidance, plain-language music terms, shortcuts, and contextual term links.",
  source: "src/features/help/help.js",
  scenarios: [
    { id: "overview", title: "Help overview", term: null },
    { id: "pattern", title: "Pattern definition", term: "pattern" },
    { id: "gate", title: "Gate definition", term: "gate" },
  ],
  mount: mountHelp,
});
