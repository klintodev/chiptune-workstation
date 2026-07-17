import {
  DEFAULT_PATTERN_GATE,
  MAX_PATTERN_NOTE,
  MIN_PATTERN_NOTE,
} from "./pattern-state.js";

const GRID_NAVIGATION_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
]);

export function createPatternEditor({
  patternState,
  grid,
  pitchSelect,
  octaveSelect,
  gateSelect,
  accentInput,
  previewInput,
  selectedNoteOutput,
  getNoteName,
  previewNote,
  onEditAction,
}) {
  const stepElements = [];
  let selectedStepIndex = null;
  let playheadStepIndex = 0;
  let playbackStatus = "stopped";

  function getSelectedNote() {
    return (Number(octaveSelect.value) + 1) * 12 + Number(pitchSelect.value);
  }

  function constrainPitchSelection() {
    const octave = Number(octaveSelect.value);
    for (const option of pitchSelect.options) {
      const note = (octave + 1) * 12 + Number(option.value);
      option.disabled = note < MIN_PATTERN_NOTE || note > MAX_PATTERN_NOTE;
    }
    if (pitchSelect.selectedOptions[0]?.disabled) {
      pitchSelect.value = [...pitchSelect.options].find((option) => !option.disabled).value;
    }
  }

  function loadStepControls(step) {
    if (step === null) return;
    pitchSelect.value = String(step.note % 12);
    octaveSelect.value = String(Math.floor(step.note / 12) - 1);
    gateSelect.value = String(step.gate);
    accentInput.checked = step.accented;
    constrainPitchSelection();
  }

  function previewSelectedNote(note, accented = accentInput.checked) {
    if (previewInput.checked) previewNote?.(note, accented);
  }

  function setSelectedNote(note) {
    onEditAction?.();
    if (!Number.isInteger(note) || note < MIN_PATTERN_NOTE || note > MAX_PATTERN_NOTE) {
      throw new RangeError(`Selected note must be between ${MIN_PATTERN_NOTE} and ${MAX_PATTERN_NOTE}.`);
    }
    pitchSelect.value = String(note % 12);
    octaveSelect.value = String(Math.floor(note / 12) - 1);
    if (selectedStepIndex !== null) patternState.setStep(selectedStepIndex, note);
    previewSelectedNote(note);
    render();
  }

  function setPlayhead(stepIndex, nextPlaybackStatus) {
    const { length } = patternState.getState();
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= length) {
      throw new RangeError(`Playhead step must be between 0 and ${length - 1}.`);
    }
    playheadStepIndex = stepIndex;
    playbackStatus = nextPlaybackStatus;
    render();
  }

  function selectStep(index, assignRest, shouldPreview = true) {
    onEditAction?.();
    selectedStepIndex = index;
    const step = patternState.getState().steps[index];
    if (step === null && assignRest) {
      patternState.setStep(index, getSelectedNote());
      if (shouldPreview) previewSelectedNote(getSelectedNote());
    } else if (step !== null) {
      loadStepControls(step);
      if (shouldPreview) previewSelectedNote(step.note, step.accented);
    }
    render();
  }

  function focusStep(index) {
    stepElements[index]?.setButton.focus();
  }

  function createStep(index) {
    const container = document.createElement("div");
    const setButton = document.createElement("button");
    const number = document.createElement("span");
    const value = document.createElement("strong");
    const detail = document.createElement("small");
    const clearButton = document.createElement("button");

    container.className = "pattern-step";
    setButton.className = "pattern-step-set";
    setButton.type = "button";
    setButton.dataset.stepIndex = String(index);
    number.textContent = String(index + 1).padStart(2, "0");
    clearButton.className = "pattern-step-clear";
    clearButton.type = "button";
    clearButton.dataset.stepIndex = String(index);
    clearButton.textContent = "Clear";
    clearButton.setAttribute("aria-label", `Clear step ${index + 1}`);

    setButton.append(number, value, detail);
    setButton.addEventListener("click", () => {
      const step = patternState.getState().steps[index];
      selectStep(index, step === null);
    });
    clearButton.addEventListener("click", () => {
      onEditAction?.();
      selectedStepIndex = index;
      patternState.clearStep(index);
      gateSelect.value = String(DEFAULT_PATTERN_GATE);
      accentInput.checked = false;
      render();
    });
    container.append(setButton, clearButton);
    grid.append(container);
    stepElements.push({ clearButton, container, detail, setButton, value });
  }

  function syncStepElements(length) {
    while (stepElements.length < length) createStep(stepElements.length);
    while (stepElements.length > length) stepElements.pop().container.remove();
    if (selectedStepIndex !== null && selectedStepIndex >= length) selectedStepIndex = null;
    if (playheadStepIndex >= length) playheadStepIndex = 0;
    grid.setAttribute("aria-label", `${length}-step pattern`);
  }

  function render() {
    constrainPitchSelection();
    const selectedNoteName = getNoteName(getSelectedNote());
    const { steps } = patternState.getState();
    syncStepElements(steps.length);
    selectedNoteOutput.value = selectedNoteName;

    steps.forEach((step, index) => {
      const elements = stepElements[index];
      const hasNote = step !== null;
      elements.container.classList.toggle("has-note", hasNote);
      elements.container.classList.toggle("accented", step?.accented ?? false);
      elements.container.classList.toggle("selected", index === selectedStepIndex);
      elements.container.classList.toggle("playhead", index === playheadStepIndex);
      elements.container.classList.toggle(
        "playhead-playing",
        index === playheadStepIndex && playbackStatus === "playing",
      );
      elements.setButton.tabIndex = index === (selectedStepIndex ?? 0) ? 0 : -1;
      elements.setButton.setAttribute("aria-pressed", String(index === selectedStepIndex));
      elements.value.textContent = hasNote ? getNoteName(step.note) : "Rest";
      elements.detail.textContent = hasNote
        ? `${Math.round(step.gate * 100)}%${step.accented ? " / Accent" : ""}`
        : "";
      elements.clearButton.disabled = !hasNote;
      elements.setButton.setAttribute(
        "aria-label",
        `Step ${index + 1}, ${hasNote ? `${getNoteName(step.note)}, ${Math.round(step.gate * 100)}% gate${step.accented ? ", accented" : ""}` : "rest"}.${index === playheadStepIndex ? ` ${playbackStatus === "playing" ? "Playing now" : "Transport position"}.` : ""}`,
      );
    });
  }

  function getFocusedStepIndex(target) {
    const index = Number(target?.dataset?.stepIndex);
    return Number.isInteger(index) ? index : null;
  }

  function getColumnCount() {
    const columns = getComputedStyle(grid).gridTemplateColumns
      .split(" ")
      .filter(Boolean).length;
    return Math.max(1, columns);
  }

  function handleGridKeyDown(event) {
    if (event.repeat) return;
    const isNavigation = GRID_NAVIGATION_KEYS.has(event.key);
    const isAssign = event.key === "Enter";
    const isClear = event.key === "Delete" || event.key === "Backspace";
    if (!isNavigation && !isAssign && !isClear) return;

    event.preventDefault();
    event.stopPropagation();
    const { length } = patternState.getState();
    const currentIndex = selectedStepIndex ?? getFocusedStepIndex(event.target) ?? 0;

    if (isNavigation) {
      const columns = getColumnCount();
      const delta = {
        ArrowDown: columns,
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -columns,
      }[event.key];
      const nextIndex = currentIndex + delta;
      if (nextIndex < 0 || nextIndex >= length) return;
      selectStep(nextIndex, false, false);
      focusStep(nextIndex);
      return;
    }

    selectedStepIndex = currentIndex;
    onEditAction?.();
    if (isAssign) {
      const note = getSelectedNote();
      patternState.setStep(currentIndex, note);
      previewSelectedNote(note);
    } else {
      patternState.clearStep(currentIndex);
      gateSelect.value = String(DEFAULT_PATTERN_GATE);
      accentInput.checked = false;
    }
    render();
    focusStep(currentIndex);
  }

  function handleNoteSelectionChange(event) {
    onEditAction?.();
    event.currentTarget.blur();
    constrainPitchSelection();
    const note = getSelectedNote();
    if (selectedStepIndex !== null) patternState.setStep(selectedStepIndex, note);
    previewSelectedNote(note);
    render();
  }

  function handleGateChange() {
    onEditAction?.();
    if (selectedStepIndex !== null) {
      patternState.setGate(selectedStepIndex, Number(gateSelect.value));
    }
    gateSelect.blur();
    render();
  }

  function handleAccentChange() {
    onEditAction?.();
    if (selectedStepIndex !== null) {
      patternState.setAccent(selectedStepIndex, accentInput.checked);
      const step = patternState.getState().steps[selectedStepIndex];
      if (step) previewSelectedNote(step.note, step.accented);
    }
    render();
  }

  function handlePreviewChange() {
    if (!previewInput.checked || selectedStepIndex === null) return;
    const step = patternState.getState().steps[selectedStepIndex];
    if (step) previewSelectedNote(step.note, step.accented);
  }

  pitchSelect.addEventListener("change", handleNoteSelectionChange);
  octaveSelect.addEventListener("change", handleNoteSelectionChange);
  gateSelect.addEventListener("change", handleGateChange);
  accentInput.addEventListener("change", handleAccentChange);
  previewInput.addEventListener("change", handlePreviewChange);
  grid.addEventListener("keydown", handleGridKeyDown);
  patternState.addEventListener("change", render);
  render();

  function dispose() {
    pitchSelect.removeEventListener("change", handleNoteSelectionChange);
    octaveSelect.removeEventListener("change", handleNoteSelectionChange);
    gateSelect.removeEventListener("change", handleGateChange);
    accentInput.removeEventListener("change", handleAccentChange);
    previewInput.removeEventListener("change", handlePreviewChange);
    grid.removeEventListener("keydown", handleGridKeyDown);
    patternState.removeEventListener("change", render);
  }

  return Object.freeze({ dispose, render, setPlayhead, setSelectedNote });
}
