export const DEFAULT_PATTERN_LENGTH = 16;
export const SUPPORTED_PATTERN_LENGTHS = Object.freeze([4, 8, 16, 32]);
export const MIN_PATTERN_NOTE = 36;
export const MAX_PATTERN_NOTE = 112;
export const DEFAULT_PATTERN_GATE = 0.75;
export const SUPPORTED_PATTERN_GATES = Object.freeze([0.25, 0.5, 0.75, 1]);

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

function createNoteStep(note, gate = DEFAULT_PATTERN_GATE, accented = false) {
  validateNote(note);
  validateGate(gate);
  if (typeof accented !== "boolean") throw new TypeError("Pattern accent must be a boolean.");
  return { note, gate, accented };
}

function cloneStep(step) {
  return step === null ? null : { ...step };
}

function normalizeStep(step) {
  if (step === null) return null;
  if (Number.isInteger(step)) return createNoteStep(step);
  if (!step || typeof step !== "object") throw new TypeError("Invalid pattern step.");
  return createNoteStep(step.note, step.gate, step.accented);
}

function createInitialSteps(initialSteps) {
  if (initialSteps === undefined) return Array(DEFAULT_PATTERN_LENGTH).fill(null);
  if (!Array.isArray(initialSteps)) throw new TypeError("Pattern steps must be an array.");
  validateLength(initialSteps.length);
  return initialSteps.map(normalizeStep);
}

export function createPatternState(initialSteps) {
  const events = new EventTarget();
  let steps = createInitialSteps(initialSteps);

  function getState() {
    return Object.freeze({
      length: steps.length,
      steps: Object.freeze(
        steps.map((step) => step === null ? null : Object.freeze(cloneStep(step))),
      ),
    });
  }

  function emitChange() {
    events.dispatchEvent(new CustomEvent("change", { detail: getState() }));
  }

  function replaceStep(index, nextStep) {
    const nextSteps = [...steps];
    nextSteps[index] = nextStep;
    steps = nextSteps;
    emitChange();
    return true;
  }

  function setStep(index, note) {
    validateStepIndex(index, steps.length);
    validateNote(note);
    const current = steps[index];
    if (current?.note === note) return false;
    return replaceStep(
      index,
      createNoteStep(note, current?.gate ?? DEFAULT_PATTERN_GATE, current?.accented ?? false),
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
    return replaceStep(index, createNoteStep(current.note, gate, current.accented));
  }

  function setAccent(index, accented) {
    validateStepIndex(index, steps.length);
    if (typeof accented !== "boolean") throw new TypeError("Pattern accent must be a boolean.");
    const current = steps[index];
    if (current === null || current.accented === accented) return false;
    return replaceStep(index, createNoteStep(current.note, current.gate, accented));
  }

  function setLength(nextLength) {
    validateLength(nextLength);
    if (steps.length === nextLength) return false;
    const nextSteps = steps.slice(0, nextLength).map(cloneStep);
    while (nextSteps.length < nextLength) nextSteps.push(null);
    steps = nextSteps;
    emitChange();
    return true;
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    clearStep,
    getState,
    removeEventListener: events.removeEventListener.bind(events),
    setAccent,
    setGate,
    setLength,
    setStep,
  });
}
