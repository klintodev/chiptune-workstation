import { instrumentDefaults } from "../state/instrument-state.js";
import {
  MAX_PROJECT_PATTERNS,
  MAX_PROJECT_TRACKS,
  createDefaultProject,
  createProjectState,
  validateProject,
} from "../state/project-state.js";
import { MAX_PROJECT_FILE_BYTES } from "../persistence/project-document.js";
import {
  DEFAULT_PATTERN_GATE,
  DEFAULT_PATTERN_ROOT_OCTAVE,
  DEFAULT_PATTERN_VOLUME,
  SUPPORTED_PATTERN_LENGTHS,
} from "../state/pattern-state.js";
import { normalizeScaleGuide } from "./scale.js";

export const STARTER_LIBRARY_VERSION = 1;
export const STARTER_RECIPE_VERSION = 1;
export const STARTER_DESTINATIONS = Object.freeze(["new", "add", "replace"]);

const MAX_STARTER_RECIPE_BYTES = 256_000;
const INSTRUMENT_NAMES = Object.freeze({
  noise: "Noise",
  pulse12: "12.5% pulse",
  pulse25: "25% pulse",
  sawtooth: "Sawtooth",
  square: "Square",
  triangle: "Triangle",
});

function note(noteValue, gate = DEFAULT_PATTERN_GATE, volume = DEFAULT_PATTERN_VOLUME) {
  return Object.freeze({ note: noteValue, gate, volume });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const STARTER_RECIPES = deepFreeze([
  {
    libraryVersion: STARTER_LIBRARY_VERSION,
    recipeVersion: STARTER_RECIPE_VERSION,
    id: "arcade-night-drive",
    name: "Arcade night drive",
    description: "A minor-key pulse lead, grounded bass ostinato, and crisp noise rhythm with an intro, drive, and lift.",
    tempo: 148,
    scaleGuide: { tonic: 9, scale: "minor-pentatonic", lock: true },
    patterns: [
      {
        key: "lead",
        name: "Night lead",
        rootOctave: 4,
        steps: [
          note(69), null, note(72), null, note(76), null, note(72), null,
          note(67), null, note(69), null, note(72), null, note(76, 1, 0.82), null,
        ],
      },
      {
        key: "bass",
        name: "Drive bass",
        rootOctave: 3,
        steps: [
          note(45, 0.5, 0.82), null, note(45, 0.5, 0.7), null,
          note(48, 0.5, 0.78), null, note(45, 0.5, 0.7), null,
          note(43, 0.5, 0.82), null, note(43, 0.5, 0.7), null,
          note(48, 0.5, 0.78), null, note(52, 0.5, 0.72), null,
        ],
      },
      {
        key: "drums",
        name: "Noise drive",
        rootOctave: 3,
        steps: [
          note(48, 0.25, 0.9), null, note(48, 0.25, 0.5), null,
          note(55, 0.25, 0.82), null, note(48, 0.25, 0.5), null,
          note(48, 0.25, 0.9), null, note(48, 0.25, 0.5), null,
          note(55, 0.25, 0.82), note(48, 0.25, 0.45), note(48, 0.25, 0.55), null,
        ],
      },
    ],
    tracks: [
      {
        key: "lead",
        name: "Pulse lead",
        instrument: { ...instrumentDefaults, voiceType: "pulse25", volume: 0.28, releaseSeconds: 0.08 },
        clips: [
          { patternKey: "lead", startStep: 16 },
          { patternKey: "lead", startStep: 32 },
          { patternKey: "lead", startStep: 48 },
        ],
      },
      {
        key: "bass",
        name: "Triangle bass",
        instrument: { ...instrumentDefaults, voiceType: "triangle", octaveOffset: -1, volume: 0.42 },
        clips: [
          { patternKey: "bass", startStep: 0 },
          { patternKey: "bass", startStep: 16 },
          { patternKey: "bass", startStep: 32 },
          { patternKey: "bass", startStep: 48 },
        ],
      },
      {
        key: "drums",
        name: "Noise drums",
        instrument: { ...instrumentDefaults, voiceType: "noise", volume: 0.24, releaseSeconds: 0.02 },
        clips: [
          { patternKey: "drums", startStep: 16 },
          { patternKey: "drums", startStep: 32 },
          { patternKey: "drums", startStep: 48 },
        ],
      },
    ],
    sections: [
      { name: "Intro", startStep: 0, endStep: 16 },
      { name: "Drive", startStep: 16, endStep: 48 },
      { name: "Lift", startStep: 48, endStep: 64 },
    ],
  },
  {
    libraryVersion: STARTER_LIBRARY_VERSION,
    recipeVersion: STARTER_RECIPE_VERSION,
    id: "bright-call-and-response",
    name: "Bright call and response",
    description: "A major-pentatonic lead answers a compact square bass across two clear song sections.",
    tempo: 132,
    scaleGuide: { tonic: 0, scale: "major-pentatonic", lock: true },
    patterns: [
      {
        key: "call",
        name: "Bright call",
        rootOctave: 4,
        steps: [
          note(60), null, note(64), null, note(67), null, note(72, 1, 0.82), null,
          null, null, null, null, null, null, null, null,
        ],
      },
      {
        key: "answer",
        name: "Bright answer",
        rootOctave: 4,
        steps: [
          null, null, null, null, null, null, null, null,
          note(69), null, note(67), null, note(64), null, note(60, 1, 0.82), null,
        ],
      },
      {
        key: "bass",
        name: "Walking square",
        rootOctave: 3,
        steps: [
          note(48, 0.5, 0.78), null, note(48, 0.5, 0.66), null,
          note(52, 0.5, 0.72), null, note(55, 0.5, 0.7), null,
          note(57, 0.5, 0.78), null, note(55, 0.5, 0.66), null,
          note(52, 0.5, 0.72), null, note(48, 0.5, 0.7), null,
        ],
      },
    ],
    tracks: [
      {
        key: "call",
        name: "Call",
        instrument: { ...instrumentDefaults, voiceType: "pulse12", volume: 0.28, releaseSeconds: 0.06 },
        clips: [{ patternKey: "call", startStep: 0 }, { patternKey: "call", startStep: 16 }],
      },
      {
        key: "answer",
        name: "Response",
        instrument: { ...instrumentDefaults, voiceType: "pulse25", volume: 0.25, releaseSeconds: 0.08 },
        clips: [{ patternKey: "answer", startStep: 0 }, { patternKey: "answer", startStep: 16 }],
      },
      {
        key: "bass",
        name: "Square bass",
        instrument: { ...instrumentDefaults, voiceType: "square", octaveOffset: -1, volume: 0.34 },
        clips: [{ patternKey: "bass", startStep: 0 }, { patternKey: "bass", startStep: 16 }],
      },
    ],
    sections: [
      { name: "Question", startStep: 0, endStep: 16 },
      { name: "Answer", startStep: 16, endStep: 32 },
    ],
  },
]);

function boundedText(value, label, maximum = 64) {
  if (typeof value !== "string" || value.trim() === "" || value.trim().length > maximum) {
    throw new TypeError(`${label} must contain 1 to ${maximum} characters.`);
  }
  return value.trim();
}

function uniqueName(base, names, maximum) {
  let result = base.slice(0, maximum).trim();
  let suffix = 2;
  while (names.has(result)) {
    const ending = ` ${suffix}`;
    result = `${base.slice(0, maximum - ending.length).trimEnd()}${ending}`;
    suffix += 1;
  }
  names.add(result);
  return result;
}

function nextIdentifier(prefix, ids) {
  let number = 1;
  while (ids.has(`${prefix}-${number}`)) number += 1;
  const id = `${prefix}-${number}`;
  ids.add(id);
  return id;
}

function cloneStep(step) {
  return step === null ? null : { ...step };
}

export function normalizeStarterRecipe(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("A starter recipe is required.");
  }
  if (
    candidate.libraryVersion !== STARTER_LIBRARY_VERSION
    || candidate.recipeVersion !== STARTER_RECIPE_VERSION
  ) {
    throw new RangeError(
      `Starter recipes must use library ${STARTER_LIBRARY_VERSION} and recipe ${STARTER_RECIPE_VERSION}.`,
    );
  }
  const serialized = JSON.stringify(candidate);
  if (!serialized || new TextEncoder().encode(serialized).byteLength > MAX_STARTER_RECIPE_BYTES) {
    throw new RangeError("This starter recipe is too large to preview safely.");
  }
  const id = boundedText(candidate.id, "Starter recipe ID");
  const name = boundedText(candidate.name, "Starter recipe name");
  const description = boundedText(candidate.description, "Starter recipe description", 240);
  if (!Number.isFinite(candidate.tempo) || candidate.tempo < 40 || candidate.tempo > 240) {
    throw new RangeError("Starter tempo must be between 40 and 240 BPM.");
  }
  const scaleGuide = normalizeScaleGuide(candidate.scaleGuide);
  if (
    !Array.isArray(candidate.patterns)
    || candidate.patterns.length === 0
    || candidate.patterns.length > MAX_PROJECT_PATTERNS
  ) throw new RangeError(`A starter must propose between one and ${MAX_PROJECT_PATTERNS} patterns.`);
  if (
    !Array.isArray(candidate.tracks)
    || candidate.tracks.length === 0
    || candidate.tracks.length > MAX_PROJECT_TRACKS
  ) throw new RangeError(`A starter must propose between one and ${MAX_PROJECT_TRACKS} tracks.`);

  const patternKeys = new Set();
  const patterns = candidate.patterns.map((pattern) => {
    const key = boundedText(pattern?.key, "Starter pattern key");
    if (patternKeys.has(key)) throw new RangeError("Starter pattern keys must be unique.");
    patternKeys.add(key);
    const patternName = boundedText(pattern.name, "Starter pattern name", 32);
    const rootOctave = pattern.rootOctave ?? DEFAULT_PATTERN_ROOT_OCTAVE;
    if (!SUPPORTED_PATTERN_LENGTHS.includes(pattern.steps?.length)) {
      throw new RangeError("Starter patterns must use a supported pattern length.");
    }
    return {
      key,
      name: patternName,
      rootOctave,
      steps: pattern.steps.map(cloneStep),
    };
  });
  const trackKeys = new Set();
  const tracks = candidate.tracks.map((track) => {
    const key = boundedText(track?.key, "Starter track key");
    if (trackKeys.has(key)) throw new RangeError("Starter track keys must be unique.");
    trackKeys.add(key);
    const clips = track.clips?.map((clip) => {
      if (!patternKeys.has(clip?.patternKey)) {
        throw new RangeError(`Starter clip references unknown pattern: ${clip?.patternKey}.`);
      }
      return { patternKey: clip.patternKey, startStep: clip.startStep };
    });
    if (!Array.isArray(clips)) throw new TypeError("Starter tracks require a clip collection.");
    return {
      key,
      name: boundedText(track.name, "Starter track name", 32),
      instrument: { ...track.instrument },
      clips,
    };
  });
  if (!Array.isArray(candidate.sections) || candidate.sections.length === 0) {
    throw new TypeError("A starter must describe at least one arrangement section.");
  }
  const sections = candidate.sections.map((section) => {
    const startStep = section?.startStep;
    const endStep = section?.endStep;
    if (
      !Number.isInteger(startStep)
      || !Number.isInteger(endStep)
      || startStep < 0
      || endStep <= startStep
      || endStep > 256
    ) throw new RangeError("Starter arrangement sections must fit steps 1 to 256.");
    return {
      name: boundedText(section.name, "Starter section name", 32),
      startStep,
      endStep,
    };
  });
  return deepFreeze({
    libraryVersion: STARTER_LIBRARY_VERSION,
    recipeVersion: STARTER_RECIPE_VERSION,
    id,
    name,
    description,
    tempo: candidate.tempo,
    scaleGuide,
    patterns,
    tracks,
    sections,
  });
}

function materializeRecipeProject(recipe) {
  const base = structuredClone(createDefaultProject());
  const patternIds = new Map(recipe.patterns.map((pattern, index) => [
    pattern.key,
    `pattern-${index + 1}`,
  ]));
  const project = {
    ...base,
    metadata: { title: recipe.name },
    scaleGuide: { ...recipe.scaleGuide },
    transport: {
      ...base.transport,
      bpm: recipe.tempo,
      loop: {
        enabled: false,
        startStep: 0,
        endStep: Math.max(...recipe.sections.map(({ endStep }) => endStep)),
      },
    },
    patterns: recipe.patterns.map((pattern) => ({
      id: patternIds.get(pattern.key),
      name: pattern.name,
      rootOctave: pattern.rootOctave,
      steps: pattern.steps.map(cloneStep),
    })),
    tracks: recipe.tracks.map((track, trackIndex) => ({
      id: `track-${trackIndex + 1}`,
      name: track.name,
      instrument: { ...track.instrument },
      mixer: { muted: false, pan: 0, solo: false, volume: 1 },
      clips: track.clips.map((clip, clipIndex) => ({
        id: `clip-${trackIndex + 1}-${clipIndex + 1}`,
        patternId: patternIds.get(clip.patternKey),
        startStep: clip.startStep,
      })),
    })),
  };
  validateProject(project);
  return structuredClone(createProjectState(project).getState());
}

function addRecipeToProject(currentProject, recipe) {
  if (currentProject.patterns.length + recipe.patterns.length > MAX_PROJECT_PATTERNS) {
    throw new RangeError(`This starter would exceed the ${MAX_PROJECT_PATTERNS}-pattern project limit.`);
  }
  if (currentProject.tracks.length + recipe.tracks.length > MAX_PROJECT_TRACKS) {
    throw new RangeError(`This starter would exceed the ${MAX_PROJECT_TRACKS}-track project limit.`);
  }
  const patternIds = new Set(currentProject.patterns.map(({ id }) => id));
  const trackIds = new Set(currentProject.tracks.map(({ id }) => id));
  const clipIds = new Set(currentProject.tracks.flatMap((track) => track.clips.map(({ id }) => id)));
  const patternNames = new Set(currentProject.patterns.map(({ name }) => name));
  const trackNames = new Set(currentProject.tracks.map(({ name }) => name));
  const recipePatternIds = new Map();
  const patterns = recipe.patterns.map((pattern) => {
    const id = nextIdentifier("pattern", patternIds);
    recipePatternIds.set(pattern.key, id);
    return {
      id,
      name: uniqueName(pattern.name, patternNames, 32),
      rootOctave: pattern.rootOctave,
      steps: pattern.steps.map(cloneStep),
    };
  });
  const tracks = recipe.tracks.map((track) => ({
    id: nextIdentifier("track", trackIds),
    name: uniqueName(track.name, trackNames, 32),
    instrument: { ...track.instrument },
    mixer: { muted: false, pan: 0, solo: false, volume: 1 },
    clips: track.clips.map((clip) => ({
      id: nextIdentifier("clip", clipIds),
      patternId: recipePatternIds.get(clip.patternKey),
      startStep: clip.startStep,
    })),
  }));
  const project = {
    ...structuredClone(currentProject),
    patterns: [...structuredClone(currentProject.patterns), ...patterns],
    tracks: [...structuredClone(currentProject.tracks), ...tracks],
  };
  validateProject(project);
  return structuredClone(createProjectState(project).getState());
}

function validateProjectSize(project) {
  const bytes = new TextEncoder().encode(JSON.stringify(project)).byteLength;
  if (bytes > MAX_PROJECT_FILE_BYTES) {
    throw new RangeError("This starter would make the project too large to save safely.");
  }
  return bytes;
}

export function listStarterRecipes() {
  return STARTER_RECIPES.map((recipe) => Object.freeze({
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    libraryVersion: recipe.libraryVersion,
    recipeVersion: recipe.recipeVersion,
  }));
}

export function getStarterRecipe(recipeId) {
  const recipe = STARTER_RECIPES.find(({ id }) => id === recipeId);
  if (!recipe) throw new RangeError(`Unknown starter recipe: ${recipeId}.`);
  return recipe;
}

export function createStarterPreview({
  currentProject,
  destination,
  recipe: candidate,
}) {
  if (!STARTER_DESTINATIONS.includes(destination)) {
    throw new RangeError(`Starter destination must be one of: ${STARTER_DESTINATIONS.join(", ")}.`);
  }
  const recipe = normalizeStarterRecipe(candidate);
  const source = currentProject ?? createDefaultProject();
  validateProject(source);
  const targetProject = destination === "add"
    ? addRecipeToProject(source, recipe)
    : materializeRecipeProject(recipe);
  const serializedBytes = validateProjectSize(targetProject);
  return deepFreeze({
    destination,
    recipe,
    sourceSignature: JSON.stringify(source),
    serializedBytes,
    targetProject,
    proposal: {
      tempo: recipe.tempo,
      scaleGuide: { ...recipe.scaleGuide },
      patterns: recipe.patterns.map(({ name, steps }) => ({ name, length: steps.length })),
      tracks: recipe.tracks.map(({ name, instrument }) => ({
        name,
        instrument: INSTRUMENT_NAMES[instrument.voiceType] ?? instrument.voiceType,
      })),
      sections: recipe.sections.map((section) => ({ ...section })),
    },
  });
}
