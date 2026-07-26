import {
  DEFAULT_PATTERN_GATE,
  DEFAULT_PATTERN_VOLUME,
  MAX_PATTERN_NOTE,
  MIN_PATTERN_NOTE,
  SUPPORTED_PATTERN_GATES,
} from "../state/pattern-state.js";
import { snapMidiNoteToScale } from "./scale.js";

const SCOPES = new Set(["pitch", "rhythm", "velocity", "gate"]);

function createRandom(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("Variation seed must be an unsigned 32-bit integer.");
  }
  let state = seed || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function choose(values, random) {
  return values[Math.min(values.length - 1, Math.floor(random() * values.length))];
}

function integer(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function number(value, label, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function cloneStep(step) {
  return step === null ? null : Object.freeze({ ...step });
}

export function createVariationPreview({
  endStep,
  guide,
  options,
  pattern,
  seed,
  startStep = 0,
}) {
  if (!Array.isArray(pattern?.steps)) throw new TypeError("A variation destination pattern is required.");
  const resolvedEnd = endStep ?? pattern.steps.length;
  integer(startStep, "Variation start step", 0, pattern.steps.length - 1);
  integer(resolvedEnd, "Variation end step", startStep + 1, pattern.steps.length);
  if (!Array.isArray(options?.scopes) || options.scopes.length === 0) {
    throw new TypeError("Variation requires at least one explicit scope.");
  }
  const scopes = new Set(options.scopes);
  for (const scope of scopes) {
    if (!SCOPES.has(scope)) throw new RangeError(`Unsupported variation scope: ${scope}.`);
  }

  const minimum = integer(options.minimumNote ?? MIN_PATTERN_NOTE, "Minimum note", MIN_PATTERN_NOTE, MAX_PATTERN_NOTE);
  const maximum = integer(options.maximumNote ?? MAX_PATTERN_NOTE, "Maximum note", minimum, MAX_PATTERN_NOTE);
  const density = number(options.density ?? 0.65, "Variation density", 0, 1);
  const maximumLeap = integer(options.maximumLeap ?? 12, "Maximum melodic leap", 0, 24);
  const minimumVelocity = number(options.minimumVelocity ?? 0.45, "Minimum velocity", 0, 1);
  const maximumVelocity = number(options.maximumVelocity ?? 0.9, "Maximum velocity", minimumVelocity, 1);
  const gates = options.gates ?? SUPPORTED_PATTERN_GATES;
  if (!Array.isArray(gates) || gates.length === 0 || gates.some((gate) => !SUPPORTED_PATTERN_GATES.includes(gate))) {
    throw new RangeError("Variation gates must be a non-empty subset of supported gates.");
  }

  const random = createRandom(seed);
  const steps = pattern.steps.map(cloneStep);
  let previousNote = null;
  for (let index = startStep; index < resolvedEnd; index += 1) {
    const current = steps[index];
    if (current === null && !scopes.has("rhythm")) continue;
    if (scopes.has("rhythm") && random() > density) {
      steps[index] = null;
      continue;
    }
    const base = current ?? Object.freeze({
      note: previousNote ?? Math.max(minimum, Math.min(maximum, 60)),
      gate: DEFAULT_PATTERN_GATE,
      volume: DEFAULT_PATTERN_VOLUME,
    });
    let note = base.note;
    if (scopes.has("pitch")) {
      const lower = previousNote === null ? minimum : Math.max(minimum, previousNote - maximumLeap);
      const upper = previousNote === null ? maximum : Math.min(maximum, previousNote + maximumLeap);
      note = lower + Math.floor(random() * (upper - lower + 1));
      if (guide) note = snapMidiNoteToScale(note, { ...guide, lock: true }, { minimum: lower, maximum: upper });
    }
    const next = Object.freeze({
      note,
      gate: scopes.has("gate") ? choose(gates, random) : base.gate,
      volume: scopes.has("velocity")
        ? minimumVelocity + random() * (maximumVelocity - minimumVelocity)
        : base.volume,
    });
    steps[index] = next;
    previousNote = next.note;
  }
  return Object.freeze({
    destinationPatternId: pattern.id,
    endStep: resolvedEnd,
    options: Object.freeze({ ...options, scopes: Object.freeze([...scopes]) }),
    seed,
    startStep,
    steps: Object.freeze(steps),
  });
}
