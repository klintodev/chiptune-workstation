import { queryRequired } from "../../shared/query-required.js";
import { getTrackColour } from "../../shared/track-presentation.js";

const PANEL_IDS = Object.freeze(["sequencer", "instrument", "keyboard"]);

export function createWorkspaceTabs({ projectState, root = document, sessionState }) {
  const lifecycle = new AbortController();
  const dawWorkspace = queryRequired(root, ".daw-workspace");
  const editorDock = queryRequired(root, "#editor-dock");
  const collapse = queryRequired(root, "#workspace-collapse");
  const keyboardToggle = queryRequired(root, "#workspace-keyboard-toggle");
  const locate = queryRequired(root, "#dock-context-locate");
  const dockPanels = queryRequired(root, "#dock-panels");
  const contextDot = queryRequired(root, "#dock-context-dot");
  const contextKicker = queryRequired(root, "#dock-context-kicker");
  const contextTitle = queryRequired(root, "#dock-context-title");
  const panels = new Map(PANEL_IDS.map((panelId) => [
    panelId,
    queryRequired(root, `#dock-panel-${panelId}`),
  ]));
  let previousPanel = "sequencer";
  let locateTimeout = 0;

  function select(panelId) {
    if (!panels.has(panelId)) throw new RangeError(`Unknown workspace panel: ${panelId}`);
    if (panelId !== "keyboard") previousPanel = panelId;
    sessionState.setWorkspace({ activeDockPanel: panelId, detailPanelCollapsed: false });
  }

  function getContext(project, workspace, panelId) {
    const trackIndex = Math.max(0, project.tracks.findIndex(({ id }) => id === workspace.selectedTrackId));
    const track = project.tracks[trackIndex] ?? project.tracks[0];
    const pattern = project.patterns.find(({ id }) => id === workspace.selectedPatternId) ?? project.patterns[0];
    if (panelId === "keyboard") {
      return { colour: getTrackColour(trackIndex), kicker: "Keybed", title: `${track.name} · computer keys mapped` };
    }
    if (panelId === "instrument") {
      return { colour: getTrackColour(trackIndex), kicker: "Instrument", title: track.name };
    }
    return { colour: "var(--accent)", kicker: "Pattern", title: pattern.name };
  }

  function render() {
    const project = projectState.getState();
    const workspace = sessionState.getState().workspace;
    const activePanel = panels.has(workspace.activeDockPanel) ? workspace.activeDockPanel : "sequencer";
    const collapsed = workspace.detailPanelCollapsed === true;
    if (activePanel !== "keyboard") previousPanel = activePanel;
    dawWorkspace.classList.toggle("detail-collapsed", collapsed);
    editorDock.classList.toggle("collapsed", collapsed);
    dockPanels.hidden = collapsed;
    collapse.setAttribute("aria-expanded", String(!collapsed));
    collapse.textContent = collapsed ? "Expand ▴" : "Collapse ▾";
    keyboardToggle.setAttribute("aria-pressed", String(activePanel === "keyboard"));
    keyboardToggle.setAttribute("aria-label", activePanel === "keyboard" ? "Close keyboard" : "Open keyboard");
    keyboardToggle.classList.toggle("active", activePanel === "keyboard");
    for (const panelId of PANEL_IDS) panels.get(panelId).hidden = collapsed || panelId !== activePanel;
    const context = getContext(project, workspace, activePanel);
    contextDot.style.setProperty("--dock-context-colour", context.colour);
    contextKicker.textContent = context.kicker;
    contextTitle.textContent = context.title;
  }

  function findSource() {
    const workspace = sessionState.getState().workspace;
    const activePanel = panels.has(workspace.activeDockPanel) ? workspace.activeDockPanel : "sequencer";
    if (activePanel === "sequencer") {
      const clips = [...root.querySelectorAll(".arrangement-clip")];
      return clips.find((clip) => clip.dataset.clipId === workspace.selectedClipId)
        ?? clips.find((clip) => clip.dataset.patternId === workspace.selectedPatternId)
        ?? null;
    }
    return [...root.querySelectorAll(".arrangement-track-row")]
      .find((row) => row.querySelector(".track-header")?.dataset.trackId === workspace.selectedTrackId)
      ?.querySelector(".track-header") ?? null;
  }

  function locateSource() {
    const source = findSource();
    if (!source) return;
    source.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    source.classList.remove("locate-flash");
    globalThis.requestAnimationFrame?.(() => source.classList.add("locate-flash"));
    globalThis.clearTimeout(locateTimeout);
    locateTimeout = globalThis.setTimeout(() => source.classList.remove("locate-flash"), 1100);
  }

  keyboardToggle.addEventListener("click", () => {
    const { activeDockPanel } = sessionState.getState().workspace;
    select(activeDockPanel === "keyboard" ? previousPanel : "keyboard");
  }, { signal: lifecycle.signal });
  collapse.addEventListener("click", () => {
    const { detailPanelCollapsed } = sessionState.getState().workspace;
    sessionState.setWorkspace({ detailPanelCollapsed: !detailPanelCollapsed });
  }, { signal: lifecycle.signal });
  locate.addEventListener("click", locateSource, { signal: lifecycle.signal });

  sessionState.addEventListener("change", (event) => {
    if (event.detail.slice === "workspace") render();
  }, { signal: lifecycle.signal });
  projectState.addEventListener("change", render, { signal: lifecycle.signal });
  render();

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      globalThis.clearTimeout(locateTimeout);
    },
    render,
    select,
  });
}
