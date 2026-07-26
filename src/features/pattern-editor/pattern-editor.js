import {
  DEFAULT_PATTERN_VOLUME,
  MAX_PATTERN_NOTE,
  MIN_PATTERN_NOTE,
  SUPPORTED_PATTERN_GATES,
} from "../../state/pattern-state.js";
import { classifyScaleNote } from "../../music/scale.js";

const GRID_NAVIGATION_KEYS = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]);
const DEFAULT_SELECTED_NOTE = 60;
const GATE_LABELS = Object.freeze({
  0.25: "1/4",
  0.5: "1/2",
  0.75: "3/4",
  1: "Full",
});

export function getPatternBankRange(length, bankIndex, bankSize) {
  const count = Math.max(1, Math.ceil(length / bankSize));
  const index = Math.min(count - 1, Math.max(0, bankIndex));
  const start = index * bankSize;
  return Object.freeze({
    count,
    end: Math.min(length, start + bankSize),
    index,
    start,
  });
}

export function createPatternEditor({
  addButton,
  bankNext,
  bankPrevious,
  bankRange,
  clearButton,
  closeButton,
  doneButton,
  gateControl,
  getNoteName,
  getScaleGuide,
  grid,
  noteDownButton,
  noteUpButton,
  onEditAction,
  onSelectionChange = () => {},
  onStepCleared = () => {},
  patternState,
  previewInput,
  previewNote,
  resolveNewNote = (note) => note,
  selectedNoteOutput,
  selectionEmpty,
  selectionSummary,
  stepNumberOutput,
  stepSummaryOutput,
  summaryGate,
  summaryNote,
  summaryStep,
  summaryVolume,
  volumeInput,
  volumeOutput,
}) {
  const lifecycle = new AbortController();
  const stepElements = [];
  const inspector = clearButton.closest(".selected-step-inspector");
  const gridScroll = grid.closest(".pattern-grid-scroll");
  const gateButtons = [...gateControl.querySelectorAll("[data-gate]")].map((button) => ({
    button,
    gate: Number(button.dataset.gate),
  }));
  const gateOutput = gateControl.querySelector("output");
  let activePatternId = patternState.getState().patternId;
  let activeVolumeStepIndex = null;
  let bankIndex = 0;
  let dialogReturnFocus = null;
  let inspectorOpen = false;
  let playbackStatus = "stopped";
  let playheadStepIndex = null;
  let selectedNote = DEFAULT_SELECTED_NOTE;
  let selectedStepIndex = null;

  function getSelectedNote() {
    return selectedNote;
  }

  function loadStepControls(step) {
    if (step === null) return;
    selectedNote = step.note;
  }

  function previewSelectedNote(note, volume = DEFAULT_PATTERN_VOLUME) {
    if (previewInput.checked) previewNote?.(note, volume);
  }

  function setSelectedNote(note) {
    onEditAction?.();
    if (!Number.isInteger(note) || note < MIN_PATTERN_NOTE || note > MAX_PATTERN_NOTE) {
      throw new RangeError(`Selected note must be between ${MIN_PATTERN_NOTE} and ${MAX_PATTERN_NOTE}.`);
    }
    selectedNote = note;
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
    onSelectionChange(index);
    if ((globalThis.innerWidth ?? 1280) <= 900) {
      const bankSize = (globalThis.innerWidth ?? 1280) <= 560 ? 4 : 8;
      bankIndex = Math.floor(index / bankSize);
    }
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

  function closeInspector({ restoreFocus = true } = {}) {
    inspectorOpen = false;
    if (inspector?.open) inspector.close();
    if (restoreFocus && dialogReturnFocus?.isConnected) dialogReturnFocus.focus();
    dialogReturnFocus = null;
  }

  function openInspector(index, invoker) {
    dialogReturnFocus = invoker ?? stepElements[index]?.editButton ?? null;
    inspectorOpen = true;
    selectStep(index);
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
      closeInspector({ restoreFocus: false });
      const step = patternState.getState().steps[index];
      selectStep(index, step !== null);
      if (step === null) {
        const note = resolveNewNote(getSelectedNote());
        patternState.setStep(index, note);
        previewSelectedNote(note, patternState.getState().steps[index].volume);
        render();
      }
    }, { signal: lifecycle.signal });
    setButton.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      closeInspector({ restoreFocus: false });
      selectedStepIndex = null;
      onSelectionChange(null);
      onEditAction?.();
      patternState.clearStep(index);
      onStepCleared(index);
      render();
    }, { signal: lifecycle.signal });
    editButton.addEventListener("click", () => {
      openInspector(index, editButton);
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
      onSelectionChange(null);
    }

    grid.setAttribute("aria-label", `${length}-step pattern`);
    grid.style.setProperty("--pattern-step-count", String(length));
  }
  function renderInspector(pattern) {
    const selectedStep = selectedStepIndex === null ? null : pattern.steps[selectedStepIndex];
    const hasSelection = selectedStepIndex !== null;
    const hasNote = selectedStep !== null;
    if (inspector && hasSelection && inspectorOpen && !inspector.open) {
      inspector.showModal();
      (hasNote ? noteDownButton : addButton).focus();
    } else if (inspector?.open && (!hasSelection || !inspectorOpen)) {
      inspector.close();
    }
    stepNumberOutput.textContent = hasSelection
      ? String(selectedStepIndex + 1).padStart(2, "0")
      : "--";
    stepSummaryOutput.value = !hasSelection
      ? "Select a step"
      : hasNote ? getNoteName(selectedStep.note) : "Rest";
    addButton.hidden = hasNote;
    addButton.textContent = `Add ${getNoteName(getSelectedNote())}`;
    clearButton.disabled = !hasNote;
    gateControl.classList.toggle("disabled", !hasNote);
    volumeInput.disabled = !hasNote;
    noteDownButton.disabled = getSelectedNote() <= MIN_PATTERN_NOTE;
    noteUpButton.disabled = getSelectedNote() >= MAX_PATTERN_NOTE;
    for (const { button, gate } of gateButtons) {
      const selected = hasNote && selectedStep.gate === gate;
      button.disabled = !hasNote;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected || (!hasNote && gate === SUPPORTED_PATTERN_GATES[0]) ? 0 : -1;
    }
    if (gateOutput) {
      gateOutput.value = hasNote
        ? selectedStep.gate === 1 ? "Full · 100%" : `${Math.round(selectedStep.gate * 100)}%`
        : "—";
    }
    const volumePercent = Math.round((selectedStep?.volume ?? DEFAULT_PATTERN_VOLUME) * 100);
    if (activeVolumeStepIndex === null) volumeInput.value = String(volumePercent);
    volumeOutput.value = `${volumePercent}%`;
    selectionEmpty.hidden = hasSelection;
    selectionSummary.hidden = !hasSelection;
    if (hasSelection) {
      summaryStep.value = String(selectedStepIndex + 1).padStart(2, "0");
      summaryNote.value = hasNote ? getNoteName(selectedStep.note) : "Rest";
      summaryGate.value = hasNote ? GATE_LABELS[selectedStep.gate] ?? `${Math.round(selectedStep.gate * 100)}%` : "—";
      summaryVolume.value = hasNote ? `${volumePercent}%` : "—";
    }
  }

  function renderBank(length) {
    const bankSize = (globalThis.innerWidth ?? 1280) <= 560 ? 4 : 8;
    const range = getPatternBankRange(length, bankIndex, bankSize);
    bankIndex = range.index;
    bankRange.value = `Steps ${range.start + 1}\u2013${range.end} of ${length}`;
    bankPrevious.disabled = range.index === 0;
    bankNext.disabled = range.index === range.count - 1;
    if ((globalThis.innerWidth ?? 1280) <= 900) {
      grid.style.width = `${range.count * 100}%`;
      grid.style.setProperty("--pattern-bank-size", String(bankSize));
    } else {
      grid.style.removeProperty("width");
      grid.style.removeProperty("--pattern-bank-size");
    }
  }

  function render() {
    const pattern = patternState.getState();
    if (pattern.patternId !== activePatternId) {
      activePatternId = pattern.patternId;
      closeInspector({ restoreFocus: false });
      selectedStepIndex = null;
      onSelectionChange(null);
      activeVolumeStepIndex = null;
      bankIndex = 0;
    }
    syncStepElements(pattern.steps.length);
    renderBank(pattern.steps.length);
    selectedNoteOutput.value = getNoteName(getSelectedNote());
    pattern.steps.forEach((step, index) => {
      const elements = stepElements[index];
      const hasNote = step !== null;
      const noteLabel = hasNote ? getNoteName(step.note) : "Rest";
      const scale = hasNote && getScaleGuide ? classifyScaleNote(step.note, getScaleGuide()) : null;
      elements.container.classList.toggle("has-note", hasNote);
      elements.container.classList.toggle("in-scale", scale?.inScale === true);
      elements.container.classList.toggle("out-of-scale", scale?.inScale === false);
      elements.container.classList.toggle("tonic", scale?.tonic === true);
      elements.container.dataset.scaleRole = !hasNote
        ? ""
        : scale?.tonic ? "Tonic" : scale?.inScale ? "In scale" : "Outside scale";
      elements.container.classList.toggle("selected", index === selectedStepIndex);
      const isPlayhead = index === playheadStepIndex;
      elements.container.classList.toggle("playback-step", isPlayhead);
      elements.container.dataset.playbackState = isPlayhead ? playbackStatus : "";
      elements.editButton.textContent = hasNote ? "\u2699" : "+";
      elements.editButton.title = hasNote ? "Edit note" : "Add or choose a note";
      elements.editButton.setAttribute(
        "aria-label",
        hasNote ? `Edit step ${index + 1}, ${noteLabel}` : `Choose a note for empty step ${index + 1}`,
      );

      elements.setButton.tabIndex = index === (selectedStepIndex ?? 0) ? 0 : -1;
      elements.setButton.setAttribute("aria-pressed", String(index === selectedStepIndex));
      if (isPlayhead && playbackStatus !== "stopped") {
        elements.setButton.setAttribute("aria-current", "step");
      } else {
        elements.setButton.removeAttribute("aria-current");
      }
      elements.setButton.title = hasNote ? "Right-click to clear this note." : "";
      elements.value.textContent = hasNote ? noteLabel : "+ Note";
      elements.meter.style.width = hasNote ? `${Math.round(step.volume * 100)}%` : "0%";
      elements.detail.title = hasNote
        ? `${Math.round(step.gate * 100)}% gate · ${Math.round(step.volume * 100)}% velocity`
        : "";
      elements.setButton.setAttribute(
        "aria-label",
        `Step ${index + 1}, ${hasNote ? `${noteLabel}, ${elements.container.dataset.scaleRole.toLowerCase()}, ${Math.round(step.gate * 100)}% gate, ${Math.round(step.volume * 100)}% volume` : "rest"}.`,
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
    onSelectionChange(currentIndex);
    onEditAction?.();
    if (isAssign) {
      const current = patternState.getState().steps[currentIndex];
      const note = current === null ? resolveNewNote(getSelectedNote()) : getSelectedNote();
      patternState.setStep(currentIndex, note);
      previewSelectedNote(note, patternState.getState().steps[currentIndex].volume);
    } else {
      patternState.clearStep(currentIndex);
    }
    render();
    focusStep(currentIndex);
  }

  function showBank(index, { focus = false } = {}) {
    const { length } = patternState.getState();
    const bankSize = (globalThis.innerWidth ?? 1280) <= 560 ? 4 : 8;
    const range = getPatternBankRange(length, index, bankSize);
    bankIndex = range.index;
    renderBank(length);
    const target = stepElements[range.start]?.container;
    const reduceMotion = grid.ownerDocument?.defaultView
      ?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    gridScroll?.scrollTo?.({ behavior: reduceMotion ? "auto" : "smooth", left: target?.offsetLeft ?? 0 });
    if (focus) focusStep(range.start);
  }

  function handlePreviewChange() {
    if (!previewInput.checked || selectedStepIndex === null) return;
    const step = patternState.getState().steps[selectedStepIndex];
    if (step) previewSelectedNote(step.note, step.volume);
  }

  function selectGate(gate) {
    if (selectedStepIndex === null || patternState.getState().steps[selectedStepIndex] === null) return;
    onEditAction?.();
    patternState.setGate(selectedStepIndex, gate);
    render();
  }

  for (const { button, gate } of gateButtons) {
    button.addEventListener("click", () => selectGate(gate), { signal: lifecycle.signal });
  }
  addButton.addEventListener("click", () => {
    if (selectedStepIndex === null) return;
    const note = resolveNewNote(getSelectedNote());
    patternState.setStep(selectedStepIndex, note);
    previewSelectedNote(note, patternState.getState().steps[selectedStepIndex].volume);
    render();
  }, { signal: lifecycle.signal });
  closeButton.addEventListener("click", closeInspector, { signal: lifecycle.signal });
  doneButton.addEventListener("click", closeInspector, { signal: lifecycle.signal });
  inspector.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeInspector();
  }, { signal: lifecycle.signal });
  gateControl.addEventListener("keydown", (event) => {
    const currentIndex = gateButtons.findIndex(({ button }) => button === event.target);
    if (currentIndex === -1) return;
    let nextIndex = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = Math.min(gateButtons.length - 1, currentIndex + 1);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = gateButtons.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = gateButtons[nextIndex];
    next.button.focus();
    selectGate(next.gate);
  }, { signal: lifecycle.signal });
  clearButton.addEventListener("click", () => {
    if (selectedStepIndex === null) return;
    const clearedIndex = selectedStepIndex;
    onEditAction?.();
    patternState.clearStep(selectedStepIndex);
    onStepCleared(clearedIndex);
    render();
    addButton.focus();
  }, { signal: lifecycle.signal });
  noteDownButton.addEventListener("click", () => {
    const note = getSelectedNote();
    if (note > MIN_PATTERN_NOTE) setSelectedNote(note - 1);
  }, { signal: lifecycle.signal });
  noteUpButton.addEventListener("click", () => {
    const note = getSelectedNote();
    if (note < MAX_PATTERN_NOTE) setSelectedNote(note + 1);
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
  previewInput.addEventListener("change", handlePreviewChange, { signal: lifecycle.signal });
  bankPrevious.addEventListener("click", () => showBank(bankIndex - 1), { signal: lifecycle.signal });
  bankNext.addEventListener("click", () => showBank(bankIndex + 1), { signal: lifecycle.signal });
  grid.addEventListener("keydown", handleGridKeyDown, { signal: lifecycle.signal });
  globalThis.addEventListener?.("resize", () => renderBank(patternState.getState().length), { signal: lifecycle.signal });
  patternState.addEventListener("change", render);
  render();

  function dispose() {
    lifecycle.abort();
    if (activeVolumeStepIndex !== null) patternState.endHistoryGroup();
    patternState.removeEventListener("change", render);
  }

  function inspectStep(index, { focus = true } = {}) {
    if (!Number.isInteger(index) || index < 0 || index >= patternState.getState().length) return false;
    openInspector(index, focus ? stepElements[index]?.setButton : null);
    if (focus) {
      globalThis.requestAnimationFrame?.(() => {
        (patternState.getState().steps[index] ? noteDownButton : addButton).focus();
      });
    }
    return true;
  }

  function setPlayhead(stepIndex, status, mode) {
    const length = patternState.getState().length;
    const nextStatus = mode === "pattern" ? status : "stopped";
    const nextStepIndex = nextStatus === "stopped"
      ? null
      : ((stepIndex % length) + length) % length;
    if (nextStepIndex === playheadStepIndex && nextStatus === playbackStatus) return;
    if (playheadStepIndex !== null) {
      const previous = stepElements[playheadStepIndex];
      previous?.container.classList.remove("playback-step");
      if (previous) previous.container.dataset.playbackState = "";
      previous?.setButton.removeAttribute("aria-current");
    }
    playbackStatus = nextStatus;
    playheadStepIndex = nextStepIndex;
    if (playheadStepIndex === null) return;
    const next = stepElements[playheadStepIndex];
    next?.container.classList.add("playback-step");
    if (next) next.container.dataset.playbackState = playbackStatus;
    next?.setButton.setAttribute("aria-current", "step");
    if ((globalThis.innerWidth ?? 1280) <= 900) {
      const bankSize = (globalThis.innerWidth ?? 1280) <= 560 ? 4 : 8;
      const playheadBank = Math.floor(playheadStepIndex / bankSize);
      if (playheadBank !== bankIndex) showBank(playheadBank);
    }
  }

  return Object.freeze({ dispose, inspectStep, render, setPlayhead, setSelectedNote });
}
