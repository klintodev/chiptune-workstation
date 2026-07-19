export const DEFAULT_PATTERN_LENGTH = 16;
export const SUPPORTED_PATTERN_LENGTHS = Object.freeze([4, 8, 16, 32]);
export const MIN_PATTERN_NOTE = 36;
export const MAX_PATTERN_NOTE = 112;
export const DEFAULT_PATTERN_GATE = 0.75;
export const DEFAULT_PATTERN_VOLUME = 0.7;
export const SUPPORTED_PATTERN_GATES = Object.freeze([0.25, 0.5, 0.75, 1]);
export const MAX_PATTERN_HISTORY = 100;

function validateLength(length) {
  if (!SUPPORTED_PATTERN_LENGTHS.includes(length)) {
    throw new RangeError(
      `Pattern length must be one of: ${SUPPORTED_PATTERN_LENGTHS.join(", ")}.`,
    );
  }
}

function validateStepIndex(index, length) {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new RangeError(`Step index must be between 0 and ${length - 1}.`);
  }
}

function validateNote(note) {
  if (!Number.isInteger(note) || note < MIN_PATTERN_NOTE || note > MAX_PATTERN_NOTE) {
    throw new RangeError(
      `Pattern note must be an integer between ${MIN_PATTERN_NOTE} and ${MAX_PATTERN_NOTE}.`,
    );
  }
}

function validateGate(gate) {
  if (!SUPPORTED_PATTERN_GATES.includes(gate)) {
    throw new RangeError(
      `Pattern gate must be one of: ${SUPPORTED_PATTERN_GATES.join(", ")}.`,
    );
  }
}

function createNoteStep(note, gate = DEFAULT_PATTERN_GATE, volume = DEFAULT_PATTERN_VOLUME) {
  validateNote(note);
  validateGate(gate);
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new RangeError("Pattern volume must be between zero and one.");
  }
  return { note, gate, volume };
}

function cloneStep(step) {
  return step === null ? null : { ...step };
}

function cloneSteps(steps) {
  return steps.map(cloneStep);
}

function normalizeStep(step) {
  if (step === null) return null;
  if (Number.isInteger(step)) return createNoteStep(step);
  if (!step || typeof step !== "object") throw new TypeError("Invalid pattern step.");
  const volume = step.volume ?? (step.accented === true ? 1 : DEFAULT_PATTERN_VOLUME);
  return createNoteStep(step.note, step.gate, volume);
}

function createInitialSteps(initialSteps) {
  if (initialSteps === undefined) return Array(DEFAULT_PATTERN_LENGTH).fill(null);
  if (!Array.isArray(initialSteps)) throw new TypeError("Pattern steps must be an array.");
  validateLength(initialSteps.length);
  return initialSteps.map(normalizeStep);
}

function validateSemitoneDelta(semitones) {
  if (!Number.isInteger(semitones) || semitones === 0) {
    throw new RangeError("Transpose amount must be a non-zero integer.");
  }
}

export function createPatternState(initialSteps) {
  const events = new EventTarget();
  const past = [];
  const future = [];
  let historyGroupActive = false;
  let groupedHistoryRecorded = false;
  let steps = createInitialSteps(initialSteps);

  function getState() {
    return Object.freeze({
      canRedo: future.length > 0,
      canUndo: past.length > 0,
      length: steps.length,
      steps: Object.freeze(
        steps.map((step) => step === null ? null : Object.freeze(cloneStep(step))),
      ),
    });
  }

  function emitChange() {
    events.dispatchEvent(new CustomEvent("change", { detail: getState() }));
  }

  function retainPast(snapshot) {
    past.push(snapshot);
    if (past.length > MAX_PATTERN_HISTORY) past.shift();
  }

  function commit(nextSteps) {
    if (!historyGroupActive || !groupedHistoryRecorded) {
      retainPast(cloneSteps(steps));
      groupedHistoryRecorded = historyGroupActive;
    }
    future.length = 0;
    steps = cloneSteps(nextSteps);
    emitChange();
    return true;
  }

  function beginHistoryGroup() {
    historyGroupActive = true;
    groupedHistoryRecorded = false;
  }

  function endHistoryGroup() {
    historyGroupActive = false;
    groupedHistoryRecorded = false;
  }
  function replaceStep(index, nextStep) {
    const nextSteps = cloneSteps(steps);
    nextSteps[index] = cloneStep(nextStep);
    return commit(nextSteps);
  }

  function setStep(index, note) {
    validateStepIndex(index, steps.length);
    validateNote(note);
    const current = steps[index];
    if (current?.note === note) return false;
    return replaceStep(
      index,
      createNoteStep(note, current?.gate ?? DEFAULT_PATTERN_GATE, current?.volume ?? DEFAULT_PATTERN_VOLUME),
    );
  }

  function clearStep(index) {
    validateStepIndex(index, steps.length);
    if (steps[index] === null) return false;
    return replaceStep(index, null);
  }

  function setGate(index, gate) {
    validateStepIndex(index, steps.length);
    validateGate(gate);
    const current = steps[index];
    if (current === null || current.gate === gate) return false;
    return replaceStep(index, createNoteStep(current.note, gate, current.volume));
  }

  function setVolume(index, volume) {
    validateStepIndex(index, steps.length);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new RangeError("Pattern volume must be between zero and one.");
    }
    const current = steps[index];
    if (current === null || current.volume === volume) return false;
    return replaceStep(index, createNoteStep(current.note, current.gate, volume));
  }

  function setLength(nextLength) {
    validateLength(nextLength);
    if (steps.length === nextLength) return false;
    const nextSteps = cloneSteps(steps.slice(0, nextLength));
    while (nextSteps.length < nextLength) nextSteps.push(null);
    return commit(nextSteps);
  }

  function canDuplicate() {
    return steps.length < SUPPORTED_PATTERN_LENGTHS.at(-1);
  }

  function duplicate() {
    if (!canDuplicate()) return false;
    return commit([...cloneSteps(steps), ...cloneSteps(steps)]);
  }

  function clearPattern() {
    if (steps.every((step) => step === null)) return false;
    return commit(Array(steps.length).fill(null));
  }

  function canTranspose(semitones) {
    validateSemitoneDelta(semitones);
    return steps.some((step) => step !== null) && steps.every(
      (step) => step === null ||
        (step.note + semitones >= MIN_PATTERN_NOTE && step.note + semitones <= MAX_PATTERN_NOTE),
    );
  }

  function transpose(semitones) {
    if (!canTranspose(semitones)) return false;
    return commit(steps.map(
      (step) => step === null
        ? null
        : createNoteStep(step.note + semitones, step.gate, step.volume),
    ));
  }

  function undo() {
    endHistoryGroup();
    if (past.length === 0) return false;
    future.push(cloneSteps(steps));
    steps = cloneSteps(past.pop());
    emitChange();
    return true;
  }

  function redo() {
    endHistoryGroup();
    if (future.length === 0) return false;
    retainPast(cloneSteps(steps));
    steps = cloneSteps(future.pop());
    emitChange();
    return true;
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    beginHistoryGroup,
    canDuplicate,
    canTranspose,
    clearPattern,
    clearStep,
    duplicate,
    endHistoryGroup,
    getState,
    redo,
    removeEventListener: events.removeEventListener.bind(events),
    setVolume,
    setGate,
    setLength,
    setStep,
    transpose,
    undo,
  });
}
