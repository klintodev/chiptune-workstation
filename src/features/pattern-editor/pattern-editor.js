import {
  DEFAULT_PATTERN_VOLUME,
  MAX_PATTERN_NOTE,
  MIN_PATTERN_NOTE,
  SUPPORTED_PATTERN_GATES,
} from "../../state/pattern-state.js";

const GRID_NAVIGATION_KEYS = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]);

export function createPatternEditor({
  clearButton,
  gateControl,
  getNoteName,
  grid,
  isNoiseTrack = () => false,
  octaveSelect,
  onEditAction,
  patternState,
  pitchSelect,
  previewInput,
  previewNote,
  selectedNoteOutput,
  stepNumberOutput,
  stepSummaryOutput,
  volumeInput,
  volumeOutput,
}) {
  const lifecycle = new AbortController();
  const stepElements = [];
  const inspector = clearButton.closest(".selected-step-inspector");
  const inspectorWorkspace = inspector?.closest(".pattern-workspace");
  const gridScroll = grid.closest(".pattern-grid-scroll");
  const gateButtons = [...gateControl.querySelectorAll("[data-gate]")].map((button) => ({
    button,
    gate: Number(button.dataset.gate),
  }));
  let activePatternId = patternState.getState().patternId;
  let activeVolumeStepIndex = null;
  let inspectorOpen = false;
  let selectedStepIndex = null;

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



  function selectStep(index, shouldPreview = false) {
    onEditAction?.();
    selectedStepIndex = index;
    const step = patternState.getState().steps[index];
    if (step !== null) {
      loadStepControls(step);
      if (shouldPreview) previewSelectedNote(step.note, step.volume);
    }
    render();
  }

  function focusStep(index) {
    stepElements[index]?.setButton.focus();
  }

  function createStep(index) {
    const ownerDocument = grid.ownerDocument ?? document;
    const container = ownerDocument.createElement("div");
    const editButton = ownerDocument.createElement("button");
    const setButton = ownerDocument.createElement("button");
    const number = ownerDocument.createElement("span");
    const value = ownerDocument.createElement("strong");
    const detail = ownerDocument.createElement("span");
    const meter = ownerDocument.createElement("span");
    detail.className = "pattern-step-meter";
    detail.setAttribute("aria-hidden", "true");
    detail.append(meter);
    container.className = "pattern-step";
    setButton.className = "pattern-step-set";
    setButton.type = "button";
    setButton.dataset.stepIndex = String(index);
    number.textContent = String(index + 1).padStart(2, "0");
    setButton.append(number, value, detail);
    editButton.className = "pattern-step-edit";
    editButton.type = "button";
    editButton.dataset.stepIndex = String(index);
    editButton.textContent = "\u2699";
    editButton.title = "Edit note";
    setButton.addEventListener("click", () => {
      inspectorOpen = false;
      selectStep(index);
    }, { signal: lifecycle.signal });
    setButton.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      inspectorOpen = false;
      selectedStepIndex = null;
      onEditAction?.();
      patternState.clearStep(index);
      render();
    }, { signal: lifecycle.signal });
    editButton.addEventListener("click", () => {
      inspectorOpen = true;
      selectStep(index);
    }, { signal: lifecycle.signal });
    container.append(setButton, editButton);
    grid.append(container);
    stepElements.push({ container, detail, editButton, meter, setButton, value });
  }

  function syncStepElements(length) {
    while (stepElements.length < length) createStep(stepElements.length);
    while (stepElements.length > length) stepElements.pop().container.remove();
    if (selectedStepIndex !== null && selectedStepIndex >= length) {
      inspectorOpen = false;
      selectedStepIndex = null;
    }

    grid.setAttribute("aria-label", `${length}-step pattern`);
    grid.style.setProperty("--pattern-step-count", String(length));
  }
  function positionInspector() {
    if (!inspector || !inspectorWorkspace || selectedStepIndex === null) return;
    const selectedStep = stepElements[selectedStepIndex]?.container;
    if (!selectedStep) return;

    const workspaceBounds = inspectorWorkspace.getBoundingClientRect();
    const stepBounds = selectedStep.getBoundingClientRect();
    const inspectorWidth = inspector.offsetWidth || 320;
    const edgeGap = 8;
    const targetX = stepBounds.left + (stepBounds.width / 2) - workspaceBounds.left;
    const minimumCenter = (inspectorWidth / 2) + edgeGap;
    const maximumCenter = workspaceBounds.width - (inspectorWidth / 2) - edgeGap;
    const popoverCenter = maximumCenter < minimumCenter
      ? workspaceBounds.width / 2
      : Math.min(maximumCenter, Math.max(minimumCenter, targetX));
    const popoverLeft = popoverCenter - (inspectorWidth / 2);
    const arrowLeft = Math.min(inspectorWidth - 14, Math.max(14, targetX - popoverLeft));

    inspector.style.setProperty("--step-popover-left", `${popoverCenter}px`);
    inspector.style.setProperty("--step-arrow-left", `${arrowLeft}px`);
  }
  function renderInspector(pattern) {
    const selectedStep = selectedStepIndex === null ? null : pattern.steps[selectedStepIndex];
    const hasSelection = selectedStepIndex !== null;
    const hasNote = selectedStep !== null;
    if (inspector) {
      inspector.hidden = !hasSelection || !inspectorOpen;
      if (hasSelection && inspectorOpen) positionInspector();
    }
    stepNumberOutput.textContent = hasSelection
      ? String(selectedStepIndex + 1).padStart(2, "0")
      : "--";
    stepSummaryOutput.value = !hasSelection
      ? "Select a step"
      : hasNote ? (isNoiseTrack() ? "Hit" : getNoteName(selectedStep.note)) : "Rest";
    clearButton.disabled = !hasNote;
    gateControl.classList.toggle("disabled", !hasNote);
    volumeInput.disabled = !hasNote;
    for (const { button, gate } of gateButtons) {
      const selected = hasNote && selectedStep.gate === gate;
      button.disabled = !hasNote;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected || (!hasNote && gate === SUPPORTED_PATTERN_GATES[0]) ? 0 : -1;
    }
    const volumePercent = Math.round((selectedStep?.volume ?? DEFAULT_PATTERN_VOLUME) * 100);
    if (activeVolumeStepIndex === null) volumeInput.value = String(volumePercent);
    volumeOutput.value = `${volumePercent}%`;
  }

  function render() {
    constrainPitchSelection();
    const pattern = patternState.getState();
    if (pattern.patternId !== activePatternId) {
      activePatternId = pattern.patternId;
      inspectorOpen = false;
      selectedStepIndex = null;
      activeVolumeStepIndex = null;
    }
    syncStepElements(pattern.steps.length);
    selectedNoteOutput.value = getNoteName(getSelectedNote());
    pattern.steps.forEach((step, index) => {
      const elements = stepElements[index];
      const hasNote = step !== null;
      const noteLabel = hasNote ? (isNoiseTrack() ? "Hit" : getNoteName(step.note)) : "Rest";
      elements.container.classList.toggle("has-note", hasNote);
      elements.container.classList.toggle("selected", index === selectedStepIndex);
      elements.editButton.hidden = !hasNote;
      elements.editButton.setAttribute("aria-label", `Edit step ${index + 1}, ${noteLabel}`);

      elements.setButton.tabIndex = index === (selectedStepIndex ?? 0) ? 0 : -1;
      elements.setButton.setAttribute("aria-pressed", String(index === selectedStepIndex));
      elements.setButton.title = hasNote ? "Right-click to clear this note." : "";
      elements.value.textContent = noteLabel;
      elements.meter.style.width = hasNote ? `${Math.round(step.volume * 100)}%` : "0%";
      elements.detail.title = hasNote
        ? `${Math.round(step.gate * 100)}% gate · ${Math.round(step.volume * 100)}% velocity`
        : "";
      elements.setButton.setAttribute(
        "aria-label",
        `Step ${index + 1}, ${hasNote ? `${noteLabel}, ${Math.round(step.gate * 100)}% gate, ${Math.round(step.volume * 100)}% volume` : "rest"}.`,
      );
    });
    renderInspector(pattern);
  }

  function getFocusedStepIndex(target) {
    const index = Number(target?.dataset?.stepIndex);
    return Number.isInteger(index) ? index : null;
  }

  function handleGridKeyDown(event) {
    if (event.repeat || event.target?.matches?.("input, select, textarea, [role=radio]")) return;
    const isNavigation = GRID_NAVIGATION_KEYS.has(event.key);
    const isAssign = event.key === "Enter";
    const isClear = event.key === "Delete" || event.key === "Backspace";
    if (!isNavigation && !isAssign && !isClear) return;
    event.preventDefault();
    event.stopPropagation();
    const { length } = patternState.getState();
    const currentIndex = selectedStepIndex ?? getFocusedStepIndex(event.target) ?? 0;
    if (isNavigation) {
      const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const nextIndex = currentIndex + delta;
      if (nextIndex < 0 || nextIndex >= length) return;
      selectStep(nextIndex);
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

  function handlePreviewChange() {
    if (!previewInput.checked || selectedStepIndex === null) return;
    const step = patternState.getState().steps[selectedStepIndex];
    if (step) previewSelectedNote(step.note, step.volume);
  }

  for (const { button, gate } of gateButtons) {
    button.addEventListener("click", () => {
      if (selectedStepIndex === null || patternState.getState().steps[selectedStepIndex] === null) return;
      onEditAction?.();
      patternState.setGate(selectedStepIndex, gate);
      render();
    }, { signal: lifecycle.signal });
  }
  clearButton.addEventListener("click", () => {
    if (selectedStepIndex === null) return;
    onEditAction?.();
    patternState.clearStep(selectedStepIndex);
    render();
    focusStep(selectedStepIndex);
  }, { signal: lifecycle.signal });
  volumeInput.addEventListener("pointerdown", () => {
    if (selectedStepIndex === null || patternState.getState().steps[selectedStepIndex] === null) return;
    onEditAction?.();
    activeVolumeStepIndex = selectedStepIndex;
    patternState.beginHistoryGroup();
  }, { signal: lifecycle.signal });
  volumeInput.addEventListener("input", () => {
    const stepIndex = activeVolumeStepIndex ?? selectedStepIndex;
    if (stepIndex === null || patternState.getState().steps[stepIndex] === null) return;
    onEditAction?.();
    patternState.setVolume(stepIndex, Number(volumeInput.value) / 100);
    volumeOutput.value = `${Math.round(Number(volumeInput.value))}%`;
  }, { signal: lifecycle.signal });
  const finishVolumeEdit = () => {
    if (activeVolumeStepIndex === null) return;
    const stepIndex = activeVolumeStepIndex;
    activeVolumeStepIndex = null;
    patternState.endHistoryGroup();
    const step = patternState.getState().steps[stepIndex];
    if (step) previewSelectedNote(step.note, step.volume);
    render();
  };
  volumeInput.addEventListener("pointerup", finishVolumeEdit, { signal: lifecycle.signal });
  volumeInput.addEventListener("pointercancel", finishVolumeEdit, { signal: lifecycle.signal });
  volumeInput.addEventListener("change", finishVolumeEdit, { signal: lifecycle.signal });
  pitchSelect.addEventListener("change", handleNoteSelectionChange, { signal: lifecycle.signal });
  octaveSelect.addEventListener("change", handleNoteSelectionChange, { signal: lifecycle.signal });
  previewInput.addEventListener("change", handlePreviewChange, { signal: lifecycle.signal });
  grid.addEventListener("keydown", handleGridKeyDown, { signal: lifecycle.signal });
  gridScroll?.addEventListener("scroll", positionInspector, { signal: lifecycle.signal });
  globalThis.addEventListener?.("resize", positionInspector, { signal: lifecycle.signal });
  patternState.addEventListener("change", render);
  render();

  function dispose() {
    lifecycle.abort();
    if (activeVolumeStepIndex !== null) patternState.endHistoryGroup();
    patternState.removeEventListener("change", render);
  }

  return Object.freeze({ dispose, render, setSelectedNote });
}
