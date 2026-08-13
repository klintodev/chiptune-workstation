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
      createElement("p", { textContent: "Click a pitch name in the Piano Roll to hear a fixed short preview at the default note velocity, or click an existing note to preview its stored pitch and velocity. These clicks work in Draw and Select and use that Piano Roll's selected Audition Track without starting playback or changing the Pattern. Moving the pointer into a drag, right-clicking or cancelling does not preview, even if the pointer returns to where it started. Zero-velocity notes remain silent; if audio is disabled, the click opens Audio Setup. Starting another preview stops the previous preview." }),
      createElement("p", { textContent: "Use the wheel or trackpad to scroll the Piano Roll viewport. On compact layouts, you can also drag within the editor to move the viewport. Hold Control or Command while scrolling to zoom around the pointer; the Piano Roll has no Pan or zoom buttons." }),
      createElement("p", { textContent: "In Piano Roll, hold Control or Command and drag empty grid space to select notes. Delete removes the selection, and Control or Command+B duplicates it to the right. Control or Command with arrows edits selected notes. In Playlist, the same drag gesture selects clips, dragging a selected clip moves the group, and Control or Command+B duplicates it to the right." }),
      createElement("p", { textContent: "Playlist clips show a miniature of their linked Pattern. Left-to-right position shows when each audible note starts, mark length shows how long it lasts, and higher or lower marks show pitch movement. Notes that begin together stack as chords, rests stay empty, and stronger marks indicate higher velocity. The miniature updates with Pattern edits and does not create separate clip notes—select, drag, right-click or double-click the clip as usual." }),
      createElement("p", { textContent: "Notes at different pitches may overlap in one Pattern, so you can build chords directly in the Piano Roll. Notes on the same pitch may meet end to start but cannot overlap. A same-pitch conflict from draw, move, transpose, resize, duplicate, paste or import is rejected as a whole, leaving the notes, selection and undo history unchanged." }),
      createElement("p", { textContent: "The Pattern name is always editable in the Piano Roll title. Press Enter or move focus away to save a valid name; press Escape to restore its current saved value. Space types normally while the field is focused. Pattern actions Rename focuses and selects this same field. Drag the rest of the title bar to move the Piano Roll." }),
      createElement("p", { textContent: "Track names are always editable in Playlist. Press Enter or move focus away to save a valid name; press Escape to restore its current saved value. Space types normally while the field is focused. The separate Destination or Choose track button changes where new clips are placed. Right-click a Playlist Instrument tile for Rename Instrument, Duplicate Instrument and New Pattern. Rename focuses and selects that same Track-name input. Duplicate creates an independent Track below it with the same Klinto Chip sound, a unique name and fresh identity; Mixer settings, Effects and clips are not copied. The new Instrument becomes the Playlist destination and can be undone. At eight Tracks, duplication is disabled." }),
      createElement("p", { textContent: "Use Mute or Solo beside a Playlist Instrument to control its Track without opening the Mixer. Several Tracks can be soloed together; mute always wins. The same pressed state appears in Playlist and Mixer and can be undone." }),
      createElement("p", { textContent: "Right-click a Playlist Track outside its Instrument tile and choose New Pattern to create and edit a Pattern through that Track. A clip takes priority over the Track beneath it, so right-clicking a clip deletes only that clip." }),
      createElement("p", { textContent: "Space toggles playback throughout Studio except while typing in a text field. Escape closes the active device window and returns focus to its launcher." }),
      createElement("p", { textContent: "In Pattern mode, playback continues through the end of the 4/4 bar containing the final stored note content, including the space after the last note. A note ending exactly on a bar line does not add another bar, while an empty Pattern performs one silent bar. Loop repeats that complete performance span, and normal Instrument release or Effect tails may ring through its trailing space. Playlist clips and Song timing still use the Pattern's exact content-derived length." }),
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
