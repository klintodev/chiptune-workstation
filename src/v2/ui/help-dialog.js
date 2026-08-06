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
      createElement("p", { textContent: "In Piano Roll, arrow keys move the cursor and Enter creates or selects a note. Control or Command with arrows edits selected notes. In Playlist, arrows move the insertion cursor; Enter selects or opens a clip; Alt with arrows moves it." }),
      createElement("p", { textContent: "Space toggles playback throughout Studio except while typing in a text field. Escape closes the active device window and returns focus to its launcher." }),
    ]),
    createElement("section", {}, [
      createElement("h3", { textContent: "Projects and sound" }),
      createElement("p", { textContent: "Projects autosave locally. Use Projects in the Studio menu to create, duplicate, import, download or recover a project. Audio begins only after you enable it in Audio setup." }),
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
