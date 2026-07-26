import {
  DEFAULT_PATTERN_GATE,
  DEFAULT_PATTERN_VOLUME,
  MAX_PATTERN_NOTE,
  MIN_PATTERN_NOTE,
  SUPPORTED_PATTERN_GATES,
} from "../state/pattern-state.js";
import {
  getScalePitchClasses,
  normalizeScaleGuide,
  snapMidiNoteToScale,
} from "./scale.js";

export const RECIPE_VERSION = 1;
export const RECIPE_TYPES = Object.freeze(["arpeggio", "rhythm"]);

const CHORD_INTERVALS = Object.freeze({
  major: Object.freeze([0, 4, 7]),
  minor: Object.freeze([0, 3, 7]),
  diminished: Object.freeze([0, 3, 6]),
});
const DIRECTIONS = new Set(["up", "down", "up-down"]);
const RATES = new Set([1, 2, 4]);

function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function boundedNumber(value, label, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function validateStep(step) {
  if (step === null) return null;
  boundedInteger(step?.note, "Recipe note", MIN_PATTERN_NOTE, MAX_PATTERN_NOTE);
  if (!SUPPORTED_PATTERN_GATES.includes(step.gate)) {
    throw new RangeError(`Recipe gate must be one of: ${SUPPORTED_PATTERN_GATES.join(", ")}.`);
  }
  boundedNumber(step.volume, "Recipe velocity", 0, 1);
  return Object.freeze({ note: step.note, gate: step.gate, volume: step.volume });
}

function validateDestination(pattern, startStep, endStep) {
  if (!Array.isArray(pattern?.steps)) throw new TypeError("A recipe destination pattern is required.");
  boundedInteger(startStep, "Recipe start step", 0, pattern.steps.length - 1);
  boundedInteger(endStep, "Recipe end step", startStep + 1, pattern.steps.length);
}

function pitchAtOrAbove(reference, pitchClass) {
  const referenceClass = ((reference % 12) + 12) % 12;
  return reference + ((pitchClass - referenceClass + 12) % 12);
}

function arpeggioNotes(recipe, guide) {
  if (!(recipe.quality in CHORD_INTERVALS)) {
    throw new RangeError(`Chord quality must be one of: ${Object.keys(CHORD_INTERVALS).join(", ")}.`);
  }
  if (!DIRECTIONS.has(recipe.direction)) {
    throw new RangeError("Arpeggio direction must be up, down, or up-down.");
  }
  if (!RATES.has(recipe.rate)) throw new RangeError("Arpeggio rate must be 1, 2, or 4 steps.");
  boundedInteger(recipe.octaveSpan, "Arpeggio octave span", 1, 3);
  const pitchClasses = getScalePitchClasses(guide);
  const scaleDegree = boundedInteger(recipe.scaleDegree, "Scale degree", 1, pitchClasses.length);
  const reference = boundedInteger(
    recipe.rootMidi ?? 60,
    "Recipe root note",
    MIN_PATTERN_NOTE,
    MAX_PATTERN_NOTE,
  );
  const chordRoot = pitchAtOrAbove(reference, pitchClasses[scaleDegree - 1]);
  const ascending = [];
  for (let octave = 0; octave < recipe.octaveSpan; octave += 1) {
    for (const interval of CHORD_INTERVALS[recipe.quality]) {
      const note = chordRoot + octave * 12 + interval;
      if (note <= MAX_PATTERN_NOTE) ascending.push(note);
    }
  }
  if (ascending.length === 0) throw new RangeError("The recipe does not fit the supported note range.");
  if (recipe.direction === "down") return [...ascending].reverse();
  if (recipe.direction === "up-down" && ascending.length > 1) {
    return [...ascending, ...ascending.slice(1, -1).reverse()];
  }
  return ascending;
}

function createArpeggioSteps(recipe, guide, length) {
  const notes = arpeggioNotes(recipe, guide);
  const gate = recipe.gate ?? DEFAULT_PATTERN_GATE;
  const volume = recipe.volume ?? DEFAULT_PATTERN_VOLUME;
  if (!SUPPORTED_PATTERN_GATES.includes(gate)) throw new RangeError("Recipe gate is unsupported.");
  boundedNumber(volume, "Recipe velocity", 0, 1);
  return Array.from({ length }, (_, index) => {
    if (index % recipe.rate !== 0) return null;
    const proposedNote = notes[Math.floor(index / recipe.rate) % notes.length];
    const note = snapMidiNoteToScale(proposedNote, guide, {
      minimum: MIN_PATTERN_NOTE,
      maximum: MAX_PATTERN_NOTE,
    });
    return validateStep({ note, gate, volume });
  });
}

function createRhythmSteps(recipe, guide, length) {
  const proposedNote = boundedInteger(recipe.note, "Rhythm note", MIN_PATTERN_NOTE, MAX_PATTERN_NOTE);
  const note = snapMidiNoteToScale(proposedNote, guide, {
    minimum: MIN_PATTERN_NOTE,
    maximum: MAX_PATTERN_NOTE,
  });
  const density = boundedNumber(recipe.density, "Rhythm density", 0, 1);
  const gate = recipe.gate ?? DEFAULT_PATTERN_GATE;
  const volume = recipe.volume ?? DEFAULT_PATTERN_VOLUME;
  const accentEvery = boundedInteger(recipe.accentEvery ?? 4, "Accent interval", 1, 16);
  if (!SUPPORTED_PATTERN_GATES.includes(gate)) throw new RangeError("Recipe gate is unsupported.");
  boundedNumber(volume, "Recipe velocity", 0, 1);
  return Array.from({ length }, (_, index) => {
    const active = Math.floor((index + 1) * density) > Math.floor(index * density);
    if (!active) return null;
    return validateStep({
      note,
      gate,
      volume: index % accentEvery === 0 ? Math.min(1, volume + 0.2) : volume,
    });
  });
}

export function normalizeRecipe(candidate) {
  if (!candidate || typeof candidate !== "object") throw new TypeError("A recipe is required.");
  if (candidate.version !== RECIPE_VERSION) {
    throw new RangeError(`Recipe version must be ${RECIPE_VERSION}.`);
  }
  if (!RECIPE_TYPES.includes(candidate.type)) {
    throw new RangeError(`Recipe type must be one of: ${RECIPE_TYPES.join(", ")}.`);
  }
  if (typeof candidate.id !== "string" || candidate.id.trim() === "" || candidate.id.length > 64) {
    throw new TypeError("Recipe ID must contain 1 to 64 characters.");
  }
  if (typeof candidate.name !== "string" || candidate.name.trim() === "" || candidate.name.length > 64) {
    throw new TypeError("Recipe name must contain 1 to 64 characters.");
  }
  return Object.freeze({ ...candidate, id: candidate.id.trim(), name: candidate.name.trim() });
}

export function createRecipePreview({
  endStep,
  guide,
  pattern,
  recipe: candidate,
  startStep = 0,
}) {
  const recipe = normalizeRecipe(candidate);
  const normalizedGuide = normalizeScaleGuide(guide);
  const resolvedEnd = endStep ?? pattern?.steps?.length;
  validateDestination(pattern, startStep, resolvedEnd);
  const length = resolvedEnd - startStep;
  const generated = recipe.type === "arpeggio"
    ? createArpeggioSteps(recipe, normalizedGuide, length)
    : createRhythmSteps(recipe, normalizedGuide, length);
  const steps = pattern.steps.map((step) => step === null ? null : validateStep(step));
  const replaced = steps.slice(startStep, resolvedEnd);
  steps.splice(startStep, length, ...generated);
  return Object.freeze({
    destinationPatternId: pattern.id,
    endStep: resolvedEnd,
    generated: Object.freeze(generated),
    recipe,
    replaced: Object.freeze(replaced),
    resultingLength: steps.length,
    startStep,
    steps: Object.freeze(steps),
  });
}
