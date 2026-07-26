import { queryRequired } from "../../shared/query-required.js";
import { getTrackColour } from "../../shared/track-presentation.js";

const PANEL_IDS = Object.freeze(["sequencer", "instrument", "keyboard"]);

export function getAdjacentWorkspacePanel(panelId, key) {
  const index = PANEL_IDS.indexOf(panelId);
  if (index < 0) return PANEL_IDS[0];
  if (key === "Home") return PANEL_IDS[0];
  if (key === "End") return PANEL_IDS.at(-1);
  const delta = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  return PANEL_IDS[(index + delta + PANEL_IDS.length) % PANEL_IDS.length];
}

export function createWorkspaceTabs({ projectState, root = document, sessionState }) {
  const lifecycle = new AbortController();
  const dawWorkspace = queryRequired(root, ".daw-workspace");
  const editorDock = queryRequired(root, "#editor-dock");
  const collapse = queryRequired(root, "#workspace-collapse");
  const locate = queryRequired(root, "#dock-context-locate");
  const dockPanels = queryRequired(root, "#dock-panels");
  const contextDot = queryRequired(root, "#dock-context-dot");
  const contextKicker = queryRequired(root, "#dock-context-kicker");
  const contextTitle = queryRequired(root, "#dock-context-title");
  const panels = new Map(PANEL_IDS.map((panelId) => [
    panelId,
    queryRequired(root, `#dock-panel-${panelId}`),
  ]));
  const tabs = new Map(PANEL_IDS.map((panelId) => [
    panelId,
    queryRequired(root, `[role="tab"][data-panel="${panelId}"]`),
  ]));
  let locateTimeout = 0;

  function select(panelId, { focus = false } = {}) {
    if (!panels.has(panelId)) throw new RangeError(`Unknown workspace panel: ${panelId}`);
    sessionState.setWorkspace({ activeDockPanel: panelId, detailPanelCollapsed: false });
    if (focus) tabs.get(panelId).focus();
  }

  function getContext(project, workspace, panelId) {
    const trackIndex = Math.max(0, project.tracks.findIndex(({ id }) => id === workspace.selectedTrackId));
    const track = project.tracks[trackIndex] ?? project.tracks[0];
    const pattern = project.patterns.find(({ id }) => id === workspace.selectedPatternId) ?? project.patterns[0];
    const selectedClip = workspace.selectedClipId
      ? project.tracks.flatMap((candidate) => candidate.clips.map((clip) => ({
        clip,
        track: candidate,
      }))).find(({ clip }) => clip.id === workspace.selectedClipId)
      : null;
    const clipPattern = selectedClip
      ? project.patterns.find(({ id }) => id === selectedClip.clip.patternId)
      : null;
    const clipContext = selectedClip
      ? `Clip · ${clipPattern?.name ?? "Loop"} · ${selectedClip.track.name}`
      : null;
    if (panelId === "keyboard") {
      return {
        colour: getTrackColour(trackIndex),
        kicker: "Keyboard",
        title: clipContext ? `${clipContext} · computer keys mapped` : `${track.name} · computer keys mapped`,
      };
    }
    if (panelId === "instrument") {
      return {
        colour: getTrackColour(trackIndex),
        kicker: "Instrument",
        title: clipContext ?? track.name,
      };
    }
    return {
      colour: "var(--accent)",
      kicker: "Pattern",
      title: clipContext ?? pattern.name,
    };
  }

  function render() {
    const project = projectState.getState();
    const workspace = sessionState.getState().workspace;
    const hasClips = project.tracks.some((track) => track.clips.length > 0);
    const activePanel = panels.has(workspace.activeDockPanel) ? workspace.activeDockPanel : "sequencer";
    const collapsed = workspace.detailPanelCollapsed === true;
    dawWorkspace.classList.toggle("awaiting-first-clip", !hasClips);
    dawWorkspace.classList.toggle("detail-collapsed", collapsed);
    editorDock.classList.toggle("collapsed", collapsed);
    dockPanels.hidden = collapsed;
    collapse.setAttribute("aria-expanded", String(!collapsed));
    collapse.textContent = collapsed ? "Expand ▴" : "Collapse ▾";
    for (const panelId of PANEL_IDS) {
      const selected = panelId === activePanel;
      const tab = tabs.get(panelId);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels.get(panelId).hidden = collapsed || !selected;
    }
    const context = getContext(project, workspace, activePanel);
    contextDot.style.setProperty("--dock-context-colour", context.colour);
    contextKicker.textContent = context.kicker;
    contextTitle.textContent = context.title;
    locate.setAttribute("aria-label", `${context.kicker}: ${context.title}. Locate in arrangement`);
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
    const reduceMotion = root.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    source.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
    source.classList.remove("locate-flash");
    if (!reduceMotion) globalThis.requestAnimationFrame?.(() => source.classList.add("locate-flash"));
    globalThis.clearTimeout(locateTimeout);
    locateTimeout = globalThis.setTimeout(() => source.classList.remove("locate-flash"), 1100);
  }

  for (const [panelId, tab] of tabs) {
    tab.addEventListener("click", () => select(panelId), { signal: lifecycle.signal });
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "Home", "End"].includes(event.key)) {
        return;
      }
      event.preventDefault();
      select(getAdjacentWorkspacePanel(panelId, event.key), { focus: true });
    }, { signal: lifecycle.signal });
  }
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
