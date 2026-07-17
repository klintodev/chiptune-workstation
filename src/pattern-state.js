export const PATTERN_STEP_COUNT = 16;
export const MIN_PATTERN_NOTE = 36;
export const MAX_PATTERN_NOTE = 112;

function validateStepIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= PATTERN_STEP_COUNT) {
    throw new RangeError(`Step index must be between 0 and ${PATTERN_STEP_COUNT - 1}.`);
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
  if (initialSteps === undefined) return Array(PATTERN_STEP_COUNT).fill(null);
  if (!Array.isArray(initialSteps) || initialSteps.length !== PATTERN_STEP_COUNT) {
    throw new RangeError(`A pattern must contain exactly ${PATTERN_STEP_COUNT} steps.`);
  }

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
    return Object.freeze({ steps: Object.freeze([...steps]) });
  }

  function emitChange() {
    events.dispatchEvent(new CustomEvent("change", { detail: getState() }));
  }

  function setStep(index, note) {
    validateStepIndex(index);
    validateNote(note);
    if (steps[index] === note) return;
    const nextSteps = [...steps];
    nextSteps[index] = note;
    steps = nextSteps;
    emitChange();
  }

  function clearStep(index) {
    validateStepIndex(index);
    if (steps[index] === null) return;
    const nextSteps = [...steps];
    nextSteps[index] = null;
    steps = nextSteps;
    emitChange();
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    clearStep,
    getState,
    removeEventListener: events.removeEventListener.bind(events),
    setStep,
  });
}
