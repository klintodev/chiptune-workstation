import { MAX_PATTERN_NOTE, MIN_PATTERN_NOTE } from "./pattern-state.js";

export function createPatternEditor({
  patternState,
  grid,
  pitchSelect,
  octaveSelect,
  selectedNoteOutput,
  getNoteName,
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

  function setSelectedNote(note) {
    if (!Number.isInteger(note) || note < MIN_PATTERN_NOTE || note > MAX_PATTERN_NOTE) {
      throw new RangeError(`Selected note must be between ${MIN_PATTERN_NOTE} and ${MAX_PATTERN_NOTE}.`);
    }
    pitchSelect.value = String(note % 12);
    octaveSelect.value = String(Math.floor(note / 12) - 1);
    if (selectedStepIndex !== null) patternState.setStep(selectedStepIndex, note);
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

  function createStep(index) {
    const container = document.createElement("div");
    const setButton = document.createElement("button");
    const number = document.createElement("span");
    const value = document.createElement("strong");
    const clearButton = document.createElement("button");

    container.className = "pattern-step";
    setButton.className = "pattern-step-set";
    setButton.type = "button";
    number.textContent = String(index + 1).padStart(2, "0");
    clearButton.className = "pattern-step-clear";
    clearButton.type = "button";
    clearButton.textContent = "Clear";
    clearButton.setAttribute("aria-label", `Clear step ${index + 1}`);

    setButton.append(number, value);
    setButton.addEventListener("click", () => {
      selectedStepIndex = index;
      patternState.setStep(index, getSelectedNote());
      render();
    });
    clearButton.addEventListener("click", () => {
      selectedStepIndex = index;
      patternState.clearStep(index);
      render();
    });
    container.append(setButton, clearButton);
    grid.append(container);
    stepElements.push({ clearButton, container, setButton, value });
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

    steps.forEach((note, index) => {
      const elements = stepElements[index];
      const hasNote = note !== null;
      elements.container.classList.toggle("has-note", hasNote);
      elements.container.classList.toggle("selected", index === selectedStepIndex);
      elements.container.classList.toggle("playhead", index === playheadStepIndex);
      elements.container.classList.toggle(
        "playhead-playing",
        index === playheadStepIndex && playbackStatus === "playing",
      );
      elements.setButton.setAttribute("aria-pressed", String(index === selectedStepIndex));
      elements.value.textContent = hasNote ? getNoteName(note) : "Rest";
      elements.clearButton.disabled = !hasNote;
      elements.setButton.setAttribute(
        "aria-label",
        `Step ${index + 1}, ${hasNote ? getNoteName(note) : "rest"}.${index === playheadStepIndex ? ` ${playbackStatus === "playing" ? "Playing now" : "Transport position"}.` : ""} Set to ${selectedNoteName}.`,
      );
    });
  }

  function handleSelectionChange(event) {
    event.currentTarget.blur();
    constrainPitchSelection();
    if (selectedStepIndex !== null) patternState.setStep(selectedStepIndex, getSelectedNote());
    render();
  }

  pitchSelect.addEventListener("change", handleSelectionChange);
  octaveSelect.addEventListener("change", handleSelectionChange);
  patternState.addEventListener("change", render);
  render();

  function dispose() {
    pitchSelect.removeEventListener("change", handleSelectionChange);
    octaveSelect.removeEventListener("change", handleSelectionChange);
    patternState.removeEventListener("change", render);
  }

  return Object.freeze({ dispose, render, setPlayhead, setSelectedNote });
}
