export const DEFAULT_PATTERN_LENGTH = 16;
export const SUPPORTED_PATTERN_LENGTHS = Object.freeze([4, 8, 16, 32]);
export const MIN_PATTERN_NOTE = 36;
export const MAX_PATTERN_NOTE = 112;

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

function createInitialSteps(initialSteps) {
  if (initialSteps === undefined) return Array(DEFAULT_PATTERN_LENGTH).fill(null);
  if (!Array.isArray(initialSteps)) throw new TypeError("Pattern steps must be an array.");
  validateLength(initialSteps.length);

  return initialSteps.map((note) => {
    if (note === null) return null;
    validateNote(note);
    return note;
  });
}

export function createPatternState(initialSteps) {
  const events = new EventTarget();
  let steps = createInitialSteps(initialSteps);

  function getState() {
    return Object.freeze({
      length: steps.length,
      steps: Object.freeze([...steps]),
    });
  }

  function emitChange() {
    events.dispatchEvent(new CustomEvent("change", { detail: getState() }));
  }

  function setStep(index, note) {
    validateStepIndex(index, steps.length);
    validateNote(note);
    if (steps[index] === note) return false;
    const nextSteps = [...steps];
    nextSteps[index] = note;
    steps = nextSteps;
    emitChange();
    return true;
  }

  function clearStep(index) {
    validateStepIndex(index, steps.length);
    if (steps[index] === null) return false;
    const nextSteps = [...steps];
    nextSteps[index] = null;
    steps = nextSteps;
    emitChange();
    return true;
  }

  function setLength(nextLength) {
    validateLength(nextLength);
    if (steps.length === nextLength) return false;
    const nextSteps = steps.slice(0, nextLength);
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
    setLength,
    setStep,
  });
}
