import { createThemeFeature } from "../../features/theme/theme.js";
import { createSessionState } from "../../state/session-state.js";
import { defineStory } from "../story-registry.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";

function mountTheme({ canvas, scenario }) {
  const root = createStoryRoot(canvas);
  root.innerHTML = `
    <div class="story-theme-swatch">
      <div>
        <span class="panel-context">Local theme surface</span>
        <h2>Theme tokens</h2>
        <p>The production toggle updates only this isolated surface.</p>
      </div>
      <button id="theme-toggle" class="theme-toggle" type="button" aria-pressed="false">
        <span data-theme-icon aria-hidden="true">☾</span>
        <span data-theme-label>Dark</span>
      </button>
      <div class="story-theme-palette" aria-label="Theme colour tokens">
        <span>Background</span><span>Panel</span><span>Accent</span><span>Danger</span>
      </div>
    </div>
  `;
  const sessionState = createSessionState({ theme: { value: scenario.theme } });
  const feature = createThemeFeature({ root, sessionState });
  return disposeAll(feature);
}

export const themeStory = defineStory({
  id: "theme",
  title: "Theme",
  group: "System",
  description: "Verify the production theme toggle, labels, pressed state, and shared colour tokens in isolation.",
  source: "src/features/theme/theme.js",
  scenarios: [
    { id: "dark", title: "Dark studio", theme: "dark" },
    { id: "light", title: "Light studio", theme: "light" },
  ],
  mount: mountTheme,
});
