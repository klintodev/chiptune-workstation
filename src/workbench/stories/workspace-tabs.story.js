import { createWorkspaceTabs } from "../../features/workspace-tabs/workspace-tabs.js";
import { createSessionState } from "../../state/session-state.js";
import { defineStory } from "../story-registry.js";
import { createArrangedProject } from "../story-fixtures.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";

function mountWorkspaceTabs({ canvas, scenario }) {
  const root = createStoryRoot(canvas, { layout: "fill" });
  root.innerHTML = `
    <p class="story-note">The production tablist, context projection, keyboard navigation, and collapse state.</p>
    <div class="daw-workspace story-workspace-shell">
      <section class="story-arrangement-source" aria-label="Arrangement source">
        <div class="arrangement-track-row">
          <button class="track-header" data-track-id="track-1"><span class="panel-context">Arrangement source</span><strong>Pulse lead</strong></button>
          <div class="track-lane" aria-hidden="true">
            <span class="arrangement-clip story-source-clip" data-clip-id="clip-1" data-pattern-id="pattern-1"><strong>Lead pulse</strong><small>1-16</small></span>
          </div>
        </div>
      </section>
      <section id="editor-dock" class="editor-dock" aria-label="Editing workspace">
        <div class="editor-tabbar">
          <button id="dock-context-locate" class="dock-context" type="button">
            <span id="dock-context-dot" aria-hidden="true"></span>
            <span id="dock-context-kicker">Pattern</span>
            <strong id="dock-context-title">Lead pulse</strong>
            <span aria-hidden="true">◎</span>
          </button>
          <div class="workspace-tabs" role="tablist" aria-label="Editing tools">
            <button id="workspace-tab-pattern" type="button" role="tab" aria-controls="dock-panel-sequencer" data-panel="sequencer">Pattern</button>
            <button id="workspace-tab-instrument" type="button" role="tab" aria-controls="dock-panel-instrument" data-panel="instrument">Instrument</button>
            <button id="workspace-tab-keyboard" type="button" role="tab" aria-controls="dock-panel-keyboard" data-panel="keyboard">Keyboard</button>
          </div>
          <div class="dock-actions">
            <button id="workspace-collapse" type="button" aria-expanded="true" aria-controls="dock-panels">Collapse</button>
          </div>
        </div>
        <div id="dock-panels" class="dock-panels">
          <section id="dock-panel-sequencer" class="dock-panel"><h2>Pattern editor</h2><p>16 steps · Lead pulse</p></section>
          <section id="dock-panel-instrument" class="dock-panel"><h2>Instrument rack</h2><p>Pulse lead</p></section>
          <section id="dock-panel-keyboard" class="dock-panel"><h2>Playable keyboard</h2><p>Computer keys mapped</p></section>
        </div>
      </section>
    </div>
  `;
  const projectState = createArrangedProject();
  const sessionState = createSessionState({
    workspace: {
      activeDockPanel: scenario.panel,
      detailPanelCollapsed: scenario.collapsed,
      selectedPatternId: "pattern-1",
      selectedTrackId: "track-1",
    },
  });
  const feature = createWorkspaceTabs({
    arrangementSection: root.querySelector(".story-arrangement-source"),
    projectState,
    root,
    sessionState,
  });
  return disposeAll(feature);
}

export const workspaceTabsStory = defineStory({
  id: "workspace-tabs",
  title: "Workspace tabs",
  group: "Editing",
  description: "Exercise tab selection, contextual labels, collapse behaviour, and roving keyboard focus.",
  source: "src/features/workspace-tabs/workspace-tabs.js",
  scenarios: [
    { id: "pattern", title: "Pattern panel", panel: "sequencer", collapsed: false },
    { id: "instrument", title: "Instrument panel", panel: "instrument", collapsed: false },
    { id: "keyboard", title: "Keyboard panel", panel: "keyboard", collapsed: false },
    { id: "collapsed", title: "Collapsed dock", panel: "sequencer", collapsed: true },
  ],
  mount: mountWorkspaceTabs,
});
