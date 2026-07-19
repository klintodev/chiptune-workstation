import {
  DEFAULT_PATTERN_GATE,
  DEFAULT_PATTERN_VOLUME,
  MAX_PATTERN_NOTE,
  MIN_PATTERN_NOTE,
} from "../../state/pattern-state.js";

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
  previewInput,
  selectedNoteOutput,
  getNoteName,
  previewNote,
  onEditAction,
}) {
  const stepElements = [];
  let activeVolumeStepIndex = null;
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
    constrainPitchSelection();
  }

  function previewSelectedNote(note, volume = DEFAULT_PATTERN_VOLUME) {
    if (previewInput.checked) previewNote?.(note, volume);
  }

  function setSelectedNote(note) {
    onEditAction?.();
    if (!Number.isInteger(note) || note < MIN_PATTERN_NOTE || note > MAX_PATTERN_NOTE) {
      throw new RangeError(`Selected note must be between ${MIN_PATTERN_NOTE} and ${MAX_PATTERN_NOTE}.`);
    }
    pitchSelect.value = String(note % 12);
    octaveSelect.value = String(Math.floor(note / 12) - 1);
    let volume = DEFAULT_PATTERN_VOLUME;
    if (selectedStepIndex !== null) {
      patternState.setStep(selectedStepIndex, note);
      volume = patternState.getState().steps[selectedStepIndex].volume;
    }
    previewSelectedNote(note, volume);
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
      if (shouldPreview) previewSelectedNote(getSelectedNote(), DEFAULT_PATTERN_VOLUME);
    } else if (step !== null) {
      loadStepControls(step);
      if (shouldPreview) previewSelectedNote(step.note, step.volume);
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
    const volumeControl = document.createElement("label");
    const volumeLabel = document.createElement("span");
    const volumeInput = document.createElement("input");
    const volumeOutput = document.createElement("output");
    const clearButton = document.createElement("button");

    container.className = "pattern-step";
    setButton.className = "pattern-step-set";
    setButton.type = "button";
    setButton.dataset.stepIndex = String(index);
    number.textContent = String(index + 1).padStart(2, "0");
    volumeControl.className = "pattern-step-volume";
    volumeLabel.textContent = "Volume";
    volumeInput.type = "range";
    volumeInput.min = "0";
    volumeInput.max = "100";
    volumeInput.step = "1";
    volumeInput.value = String(DEFAULT_PATTERN_VOLUME * 100);
    volumeInput.dataset.stepIndex = String(index);
    volumeInput.setAttribute("aria-label", `Step ${index + 1} volume`);
    volumeOutput.value = `${Math.round(DEFAULT_PATTERN_VOLUME * 100)}%`;
    volumeControl.append(volumeLabel, volumeOutput, volumeInput);
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
      render();
    });
    volumeInput.addEventListener("pointerdown", () => {
      onEditAction?.();
      patternState.beginHistoryGroup();
      activeVolumeStepIndex = index;
    });
    volumeInput.addEventListener("input", () => {
      onEditAction?.();
      patternState.setVolume(index, Number(volumeInput.value) / 100);
    });
    const finishVolumeEdit = () => {
      activeVolumeStepIndex = null;
      patternState.endHistoryGroup();
    };
    volumeInput.addEventListener("pointerup", finishVolumeEdit);
    volumeInput.addEventListener("pointercancel", finishVolumeEdit);
    volumeInput.addEventListener("change", () => {
      finishVolumeEdit();
      const step = patternState.getState().steps[index];
      if (step) previewSelectedNote(step.note, step.volume);
    });
    container.append(setButton, volumeControl, clearButton);
    grid.append(container);
    stepElements.push({
      clearButton,
      container,
      detail,
      setButton,
      value,
      volumeControl,
      volumeInput,
      volumeOutput,
    });
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
      elements.container.classList.toggle("selected", index === selectedStepIndex);
      elements.container.classList.toggle("playhead", index === playheadStepIndex);
      elements.container.classList.toggle(
        "playhead-playing",
        index === playheadStepIndex && playbackStatus === "playing",
      );
      elements.setButton.tabIndex = index === (selectedStepIndex ?? 0) ? 0 : -1;
      elements.setButton.setAttribute("aria-pressed", String(index === selectedStepIndex));
      elements.value.textContent = hasNote ? getNoteName(step.note) : "Rest";
      elements.detail.textContent = hasNote ? `${Math.round(step.gate * 100)}% gate` : "";
      elements.volumeControl.hidden = !hasNote;
      elements.volumeInput.disabled = !hasNote;
      const volumePercent = Math.round((step?.volume ?? DEFAULT_PATTERN_VOLUME) * 100);
      if (index !== activeVolumeStepIndex) elements.volumeInput.value = String(volumePercent);
      elements.volumeOutput.value = `${volumePercent}%`;
      elements.clearButton.disabled = !hasNote;
      elements.setButton.setAttribute(
        "aria-label",
        `Step ${index + 1}, ${hasNote ? `${getNoteName(step.note)}, ${Math.round(step.gate * 100)}% gate, ${Math.round(step.volume * 100)}% volume` : "rest"}.${index === playheadStepIndex ? ` ${playbackStatus === "playing" ? "Playing now" : "Transport position"}.` : ""}`,
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
    if (event.repeat || event.target?.matches?.("input, select, textarea")) return;
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
      previewSelectedNote(note, patternState.getState().steps[currentIndex].volume);
    } else {
      patternState.clearStep(currentIndex);
      gateSelect.value = String(DEFAULT_PATTERN_GATE);
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
    const volume = selectedStepIndex === null
      ? DEFAULT_PATTERN_VOLUME
      : patternState.getState().steps[selectedStepIndex]?.volume ?? DEFAULT_PATTERN_VOLUME;
    previewSelectedNote(note, volume);
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

  function handlePreviewChange() {
    if (!previewInput.checked || selectedStepIndex === null) return;
    const step = patternState.getState().steps[selectedStepIndex];
    if (step) previewSelectedNote(step.note, step.volume);
  }

  pitchSelect.addEventListener("change", handleNoteSelectionChange);
  octaveSelect.addEventListener("change", handleNoteSelectionChange);
  gateSelect.addEventListener("change", handleGateChange);
  previewInput.addEventListener("change", handlePreviewChange);
  grid.addEventListener("keydown", handleGridKeyDown);
  patternState.addEventListener("change", render);
  render();

  function dispose() {
    pitchSelect.removeEventListener("change", handleNoteSelectionChange);
    octaveSelect.removeEventListener("change", handleNoteSelectionChange);
    gateSelect.removeEventListener("change", handleGateChange);
    previewInput.removeEventListener("change", handlePreviewChange);
    grid.removeEventListener("keydown", handleGridKeyDown);
    patternState.removeEventListener("change", render);
  }

  return Object.freeze({ dispose, render, setPlayhead, setSelectedNote });
}
