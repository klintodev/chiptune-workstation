import { createElement } from "./dom.js";

export function createV2HelpDialog({ root = document } = {}) {
  const dialog = createElement("dialog", {
    className: "project-dialog v2-help-dialog",
    "aria-labelledby": "v2-help-title",
  });
  const close = createElement("button", {
    type: "button",
    "aria-label": "Close help",
    textContent: "Close",
  });
  const title = createElement("h2", { id: "v2-help-title", textContent: "Klinto Studio V2 help" });
  const panel = createElement("div", { className: "project-dialog-panel" }, [
    createElement("header", {}, [
      createElement("div", {}, [
        createElement("span", { className: "panel-context", textContent: "Focused workstation" }),
        title,
      ]),
      close,
    ]),
    createElement("section", {}, [
      createElement("h3", { textContent: "Three primary surfaces" }),
      createElement("p", { textContent: "Piano Roll edits reusable Patterns. Playlist arranges Pattern clips on Tracks. Mixer balances Tracks and opens Instruments or Effects in a separate device window." }),
    ]),
    createElement("section", {}, [
      createElement("h3", { textContent: "Keyboard editing" }),
      createElement("p", { textContent: "In Piano Roll, hold Control or Command and drag empty grid space to select notes. Delete removes the selection, and Control or Command+B duplicates it to the right. Control or Command with arrows edits selected notes. In Playlist, the same drag gesture selects clips, dragging a selected clip moves the group, and Control or Command+B duplicates it to the right." }),
      createElement("p", { textContent: "Right-click a Playlist Instrument tile and choose Rename Instrument to change its shared Instrument and Track name. Klinto Chip remains the Instrument type. The rename can be undone; cancelling leaves the name unchanged and returns focus to the Instrument tile." }),
      createElement("p", { textContent: "Right-click a Playlist Track outside its Instrument tile and choose New Pattern to create and edit a Pattern through that Track. A clip takes priority over the Track beneath it, so right-clicking a clip deletes only that clip." }),
      createElement("p", { textContent: "Space toggles playback throughout Studio except while typing in a text field. Escape closes the active device window and returns focus to its launcher." }),
      createElement("p", { textContent: "Click the Playlist ruler to set the Song start position. Stop once returns playback there; press Stop again, or double-click it while playing, to return to the beginning." }),
    ]),
    createElement("section", {}, [
      createElement("h3", { textContent: "Projects and sound" }),
      createElement("p", { textContent: "Projects autosave locally. Use Projects in the Studio menu to create, duplicate or recover a project, and use Share for publishing. Audio setup appears automatically when playback needs it." }),
    ]),
  ]);
  dialog.append(panel);
  root.body.append(dialog);

  let returnFocus = null;
  function hide() {
    if (dialog.open) dialog.close();
    queueMicrotask(() => returnFocus?.isConnected && returnFocus.focus());
  }
  function show(opener = root.activeElement) {
    returnFocus = opener;
    if (!dialog.open) dialog.showModal();
    close.focus();
  }

  close.addEventListener("click", hide);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    hide();
  });

  return Object.freeze({
    dialog,
    dispose() {
      dialog.remove();
      returnFocus = null;
    },
    hide,
    show,
  });
}
