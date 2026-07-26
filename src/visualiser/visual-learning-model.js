import { getVoiceLabel } from "../shared/track-presentation.js";

export const VISUAL_PRESENTATION_MODES = Object.freeze(["lanes", "stereo"]);
export const VISUAL_MOTION_MODES = Object.freeze(["full", "reduced"]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeVisualPreferences(candidate = {}) {
  return Object.freeze({
    contrast: candidate.contrast === "high" ? "high" : "standard",
    motion: candidate.motion === "reduced" ? "reduced" : "full",
    presentation: candidate.presentation === "stereo" ? "stereo" : "lanes",
  });
}

export function getProjectedNoteAccessibleName(note) {
  const arrangement = note.clipId === null
    ? "pattern preview"
    : `arrangement step ${note.arrangementStepIndex + 1}`;
  return `${note.trackName}, ${note.noteLabel}, ${note.timingState}, `
    + `pattern step ${note.patternStepIndex + 1}, ${arrangement}`;
}

export function buildProjectionSummary(projection, { maximumUpcoming = 12 } = {}) {
  const active = projection.notes.filter((note) => note.active);
  const upcoming = projection.notes
    .filter((note) => note.timingState === "upcoming")
    .slice(0, maximumUpcoming);
  const position = `${projection.mode === "pattern" ? "Pattern" : "Arrangement"} `
    + `step ${projection.stepIndex + 1}, ${projection.status}.`;
  const activeText = active.length === 0
    ? " No active notes."
    : ` Active: ${active.map((note) => `${note.trackName} ${note.noteLabel}`).join(", ")}.`;
  const groups = new Map();
  for (const note of upcoming) {
    if (!groups.has(note.trackName)) groups.set(note.trackName, []);
    groups.get(note.trackName).push(`${note.noteLabel} in ${Math.max(0, note.stepsUntilStart).toFixed(2)} steps`);
  }
  const upcomingText = groups.size === 0
    ? " No upcoming notes in view."
    : ` Upcoming: ${[...groups].map(([track, notes]) => `${track}: ${notes.join(", ")}`).join("; ")}.`;
  return `${position}${activeText}${upcomingText}`;
}

export function getProjectedNoteDetails(note) {
  const pan = note.pan === 0
    ? "Centre"
    : `${Math.round(Math.abs(note.pan) * 100)}% ${note.pan < 0 ? "left" : "right"}`;
  return Object.freeze({
    arrangement: note.clipId === null ? "Pattern preview" : `Step ${note.arrangementStepIndex + 1}`,
    gate: `${Math.round(note.gate * 100)}% of a step`,
    note: note.noteLabel,
    pan,
    pattern: note.patternId,
    patternStep: String(note.patternStepIndex + 1),
    track: note.trackName,
    velocity: `${Math.round(note.velocity * 100)}%`,
    voice: getVoiceLabel(note.voiceType),
  });
}

export function resolveProjectedNoteSource(project, note) {
  const track = project.tracks.find((candidate) => candidate.id === note.trackId);
  const pattern = project.patterns.find((candidate) => candidate.id === note.patternId);
  const clip = note.clipId === null
    ? null
    : track?.clips.find((candidate) => candidate.id === note.clipId);
  if (!track || !pattern || (note.clipId !== null && !clip)) return null;
  if (note.patternStepIndex < 0 || note.patternStepIndex >= pattern.steps.length) return null;
  if (clip && clip.patternId !== pattern.id) return null;
  if (pattern.steps[note.patternStepIndex] === null) return null;
  return Object.freeze({
    activeDockPanel: "sequencer",
    detailPanelCollapsed: false,
    selectedClipId: clip?.id ?? null,
    selectedPatternId: pattern.id,
    selectedStepIndex: note.patternStepIndex,
    selectedTrackId: track.id,
  });
}

export function createClipContour(pattern, { maximumMarks = 32 } = {}) {
  const notes = pattern.steps
    .map((step, stepIndex) => step === null ? null : {
      gate: step.gate,
      note: step.note,
      stepIndex,
      velocity: step.volume,
    })
    .filter(Boolean);
  if (notes.length === 0) return Object.freeze([]);
  const minimumPitch = Math.min(...notes.map(({ note }) => note));
  const maximumPitch = Math.max(...notes.map(({ note }) => note));
  const pitchSpan = Math.max(1, maximumPitch - minimumPitch);
  const stride = Math.max(1, Math.ceil(notes.length / maximumMarks));
  return Object.freeze(notes.filter((_, index) => index % stride === 0).map((note) => Object.freeze({
    emphasis: clamp(note.velocity, 0, 1),
    gate: clamp(note.gate, 0.25, 1),
    pitch: (note.note - minimumPitch) / pitchSpan,
    step: note.stepIndex / pattern.steps.length,
    stepIndex: note.stepIndex,
    width: note.gate / pattern.steps.length,
  })));
}
