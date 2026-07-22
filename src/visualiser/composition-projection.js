import { getArrangementEnd, isTrackAudible } from "../state/project-state.js";
import { getNoteName } from "../music/note.js";

export const DEFAULT_PROJECTION_HORIZON_STEPS = 16;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getArrangementStep(project, stepIndex) {
  if (!project.transport.loop.enabled) return stepIndex;
  const { endStep, startStep } = project.transport.loop;
  if (stepIndex < endStep) return stepIndex;
  return startStep + ((stepIndex - startStep) % (endStep - startStep));
}

function findArrangementNote(project, patterns, track, stepIndex) {
  const clip = track.clips.find((candidate) => {
    const pattern = patterns.get(candidate.patternId);
    return candidate.startStep <= stepIndex && stepIndex < candidate.startStep + pattern.steps.length;
  });
  if (!clip) return null;
  const pattern = patterns.get(clip.patternId);
  return Object.freeze({
    clipId: clip.id,
    pattern,
    patternStepIndex: stepIndex - clip.startStep,
    step: pattern.steps[stepIndex - clip.startStep],
  });
}

function createProjectedNote({
  clipId,
  horizonSteps,
  occurrence,
  pattern,
  patternStepIndex,
  step,
  stepProgress,
  timelineStep,
  track,
  trackIndex,
}) {
  if (step === null || step.volume === 0) return null;
  const stepsUntilStart = occurrence - stepProgress;
  const active = occurrence === 0 && stepProgress >= 0 && stepProgress <= step.gate;
  if (occurrence === 0 && stepProgress > step.gate) return null;
  const depth = active ? 0 : clamp(Math.max(0, stepsUntilStart) / horizonSteps);
  const producedNote = step.note + track.instrument.octaveOffset * 12;
  return Object.freeze({
    active,
    clipId,
    depth,
    gate: step.gate,
    id: `${track.id}:${clipId ?? pattern.id}:${timelineStep}:${occurrence}`,
    life: active ? clamp(1 - stepProgress / step.gate) : 1,
    note: producedNote,
    noteLabel: getNoteName(producedNote),
    pan: track.mixer.pan,
    patternId: pattern.id,
    patternStepIndex,
    pitch: clamp((producedNote - 36) / 76),
    stepsUntilStart,
    trackId: track.id,
    trackIndex,
    trackName: track.name,
    velocity: step.volume,
    voiceType: track.instrument.voiceType,
  });
}

function projectArrangement(project, timeline, horizonSteps) {
  const patterns = new Map(project.patterns.map((pattern) => [pattern.id, pattern]));
  const arrangementEnd = getArrangementEnd(project);
  const notes = [];
  for (let occurrence = 0; occurrence <= horizonSteps; occurrence += 1) {
    const rawStep = timeline.stepIndex + occurrence;
    if (!project.transport.loop.enabled && rawStep >= arrangementEnd) break;
    const timelineStep = getArrangementStep(project, rawStep);
    project.tracks.forEach((track, trackIndex) => {
      if (!isTrackAudible(project, track.id)) return;
      const found = findArrangementNote(project, patterns, track, timelineStep);
      if (!found) return;
      const note = createProjectedNote({
        ...found,
        horizonSteps,
        occurrence,
        stepProgress: timeline.stepProgress,
        timelineStep,
        track,
        trackIndex,
      });
      if (note) notes.push(note);
    });
  }
  return notes;
}

function projectPattern(project, timeline, horizonSteps, selectedPatternId, selectedTrackId) {
  const patternId = timeline.patternId ?? selectedPatternId;
  const trackId = timeline.trackId ?? selectedTrackId;
  const pattern = project.patterns.find((candidate) => candidate.id === patternId) ?? project.patterns[0];
  const trackIndex = Math.max(0, project.tracks.findIndex((candidate) => candidate.id === trackId));
  const track = project.tracks[trackIndex] ?? project.tracks[0];
  if (!isTrackAudible(project, track.id)) return [];
  const notes = [];
  for (let occurrence = 0; occurrence <= horizonSteps; occurrence += 1) {
    const patternStepIndex = (timeline.stepIndex + occurrence) % pattern.steps.length;
    const note = createProjectedNote({
      clipId: null,
      horizonSteps,
      occurrence,
      pattern,
      patternStepIndex,
      step: pattern.steps[patternStepIndex],
      stepProgress: timeline.stepProgress,
      timelineStep: patternStepIndex,
      track,
      trackIndex,
    });
    if (note) notes.push(note);
  }
  return notes;
}

export function buildCompositionProjection(project, timeline, {
  horizonSteps = DEFAULT_PROJECTION_HORIZON_STEPS,
  selectedPatternId,
  selectedTrackId,
} = {}) {
  if (!Number.isInteger(horizonSteps) || horizonSteps < 1 || horizonSteps > 64) {
    throw new RangeError("Projection horizon must be between one and 64 steps.");
  }
  const notes = timeline.mode === "pattern"
    ? projectPattern(project, timeline, horizonSteps, selectedPatternId, selectedTrackId)
    : projectArrangement(project, timeline, horizonSteps);
  return Object.freeze({
    horizonSteps,
    mode: timeline.mode,
    notes: Object.freeze(notes),
    status: timeline.status,
    stepIndex: timeline.stepIndex,
    stepProgress: timeline.stepProgress,
  });
}
