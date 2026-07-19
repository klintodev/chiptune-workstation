import { queryRequired } from "../../shared/query-required.js";

const PANEL_IDS = Object.freeze(["sequencer", "instrument", "keyboard"]);

export function createWorkspaceTabs({ root = document, sessionState }) {
  const lifecycle = new AbortController();
  const dawWorkspace = queryRequired(root, ".daw-workspace");
  const editorDock = queryRequired(root, "#editor-dock");
  const tablist = queryRequired(root, "#workspace-tabs");
  const collapse = queryRequired(root, "#workspace-collapse");
  const dockPanels = queryRequired(root, "#dock-panels");
  const tabs = new Map(PANEL_IDS.map((panelId) => [
    panelId,
    queryRequired(root, `[role="tab"][data-panel="${panelId}"]`),
  ]));
  const panels = new Map(PANEL_IDS.map((panelId) => [
    panelId,
    queryRequired(root, `#dock-panel-${panelId}`),
  ]));

  function select(panelId, { focus = false } = {}) {
    if (!tabs.has(panelId)) throw new RangeError(`Unknown workspace panel: ${panelId}`);
    sessionState.setWorkspace({ activeDockPanel: panelId, detailPanelCollapsed: false });
    render();
    if (focus) tabs.get(panelId).focus();
  }

  function render() {
    const workspace = sessionState.getState().workspace;
    const activePanel = tabs.has(workspace.activeDockPanel)
      ? workspace.activeDockPanel
      : PANEL_IDS[0];
    const collapsed = workspace.detailPanelCollapsed === true;
    dawWorkspace.classList.toggle("detail-collapsed", collapsed);
    editorDock.classList.toggle("collapsed", collapsed);
    dockPanels.hidden = collapsed;
    collapse.setAttribute("aria-expanded", String(!collapsed));
    collapse.textContent = collapsed ? "Expand editor" : "Collapse editor";
    for (const panelId of PANEL_IDS) {
      const active = panelId === activePanel;
      const tab = tabs.get(panelId);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      panels.get(panelId).hidden = collapsed || !active;
    }
  }

  tablist.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"][data-panel]');
    if (tab) select(tab.dataset.panel);
  }, { signal: lifecycle.signal });
  tablist.addEventListener("keydown", (event) => {
    const tab = event.target.closest('[role="tab"][data-panel]');
    if (!tab) return;
    const currentIndex = PANEL_IDS.indexOf(tab.dataset.panel);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % PANEL_IDS.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + PANEL_IDS.length) % PANEL_IDS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = PANEL_IDS.length - 1;
    else return;
    event.preventDefault();
    select(PANEL_IDS[nextIndex], { focus: true });
  }, { signal: lifecycle.signal });
  collapse.addEventListener("click", () => {
    const { detailPanelCollapsed } = sessionState.getState().workspace;
    sessionState.setWorkspace({ detailPanelCollapsed: !detailPanelCollapsed });
  }, { signal: lifecycle.signal });

  const handleSessionChange = (event) => {
    if (event.detail.slice === "workspace") render();
  };
  sessionState.addEventListener("change", handleSessionChange, { signal: lifecycle.signal });
  render();

  return Object.freeze({
    dispose: () => lifecycle.abort(),
    render,
    select,
  });
}
