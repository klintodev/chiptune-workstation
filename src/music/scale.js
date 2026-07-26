export const SCALE_IDS = Object.freeze([
  "major",
  "natural-minor",
  "major-pentatonic",
  "minor-pentatonic",
  "chromatic",
]);

export const SCALE_NAMES = Object.freeze({
  major: "Major",
  "natural-minor": "Natural minor",
  "major-pentatonic": "Major pentatonic",
  "minor-pentatonic": "Minor pentatonic",
  chromatic: "Chromatic",
});

const SCALE_INTERVALS = Object.freeze({
  major: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
  "natural-minor": Object.freeze([0, 2, 3, 5, 7, 8, 10]),
  "major-pentatonic": Object.freeze([0, 2, 4, 7, 9]),
  "minor-pentatonic": Object.freeze([0, 3, 5, 7, 10]),
  chromatic: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
});

export const DEFAULT_SCALE_GUIDE = Object.freeze({
  tonic: 0,
  scale: "major",
  lock: false,
});

function pitchClass(note) {
  return ((note % 12) + 12) % 12;
}

export function normalizeScaleGuide(candidate = DEFAULT_SCALE_GUIDE) {
  const tonic = candidate?.tonic ?? DEFAULT_SCALE_GUIDE.tonic;
  const scale = candidate?.scale ?? DEFAULT_SCALE_GUIDE.scale;
  const lock = candidate?.lock ?? DEFAULT_SCALE_GUIDE.lock;
  if (!Number.isInteger(tonic) || tonic < 0 || tonic > 11) {
    throw new RangeError("Scale tonic must be a pitch class from 0 to 11.");
  }
  if (!SCALE_IDS.includes(scale)) {
    throw new RangeError(`Scale must be one of: ${SCALE_IDS.join(", ")}.`);
  }
  if (typeof lock !== "boolean") throw new TypeError("Scale lock must be a boolean.");
  return Object.freeze({ tonic, scale, lock });
}

export function getScalePitchClasses(guide) {
  const normalized = normalizeScaleGuide(guide);
  return Object.freeze(SCALE_INTERVALS[normalized.scale].map((interval) => (
    pitchClass(normalized.tonic + interval)
  )));
}

export function classifyScaleNote(note, guide) {
  if (!Number.isInteger(note)) throw new TypeError("A scale note must be an integer MIDI pitch.");
  const normalized = normalizeScaleGuide(guide);
  const noteClass = pitchClass(note);
  return Object.freeze({
    inScale: getScalePitchClasses(normalized).includes(noteClass),
    tonic: noteClass === normalized.tonic,
  });
}

export function snapMidiNoteToScale(note, guide, {
  bypass = false,
  maximum = 127,
  minimum = 0,
} = {}) {
  if (!Number.isInteger(note)) throw new TypeError("A scale note must be an integer MIDI pitch.");
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum > maximum) {
    throw new RangeError("Scale note bounds are invalid.");
  }
  if (note < minimum || note > maximum) {
    throw new RangeError(`Scale note must be between ${minimum} and ${maximum}.`);
  }
  const normalized = normalizeScaleGuide(guide);
  if (bypass || !normalized.lock || classifyScaleNote(note, normalized).inScale) return note;

  for (let distance = 1; distance <= 12; distance += 1) {
    const lower = note - distance;
    if (lower >= minimum && classifyScaleNote(lower, normalized).inScale) return lower;
    const higher = note + distance;
    if (higher <= maximum && classifyScaleNote(higher, normalized).inScale) return higher;
  }
  throw new RangeError("No note in the selected scale fits the requested bounds.");
}
