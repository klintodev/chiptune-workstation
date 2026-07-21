import { createVoiceEngine, midiNoteToFrequency } from "./voice-engine.js";
import {
  createProjectState,
  getArrangementEnd,
  isTrackAudible,
} from "../state/project-state.js?v=20260721-3";
import { getSixteenthNoteDuration } from "../transport/step-scheduler.js";

export const EXPORT_SAMPLE_RATE = 44_100;
export const EXPORT_CHANNELS = 2;
export const MAX_EXPORT_SECONDS = 10 * 60;

export function createArrangementRenderPlan(project, {
  maxDurationSeconds = MAX_EXPORT_SECONDS,
  sampleRate = EXPORT_SAMPLE_RATE,
} = {}) {
  const normalized = createProjectState(project).getState();
  const endStep = getArrangementEnd(normalized);
  if (endStep === 0) throw new RangeError("Place at least one pattern before exporting audio.");
  const stepDurationSeconds = getSixteenthNoteDuration(normalized.transport.bpm);
  const patterns = new Map(normalized.patterns.map((pattern) => [pattern.id, pattern]));
  const tracks = [];
  let longestReleaseSeconds = 0;

  for (const track of normalized.tracks) {
    if (!isTrackAudible(normalized, track.id)) continue;
    longestReleaseSeconds = Math.max(longestReleaseSeconds, track.instrument.releaseSeconds);
    const notes = [];
    for (const clip of track.clips) {
      const pattern = patterns.get(clip.patternId);
      for (let index = 0; index < pattern.steps.length; index += 1) {
        const step = pattern.steps[index];
        if (step === null || step.volume === 0) continue;
        notes.push(Object.freeze({
          attackSeconds: track.instrument.attackSeconds,
          durationSeconds: stepDurationSeconds * step.gate,
          frequency: midiNoteToFrequency(step.note + track.instrument.octaveOffset * 12),
          intensity: step.volume,
          releaseSeconds: track.instrument.releaseSeconds,
          startTime: (clip.startStep + index) * stepDurationSeconds,
          type: track.instrument.voiceType,
        }));
      }
    }
    tracks.push(Object.freeze({
      id: track.id,
      instrumentVolume: track.instrument.volume,
      notes: Object.freeze(notes),
      trackVolume: track.mixer.volume,
    }));
  }

  const tailSeconds = longestReleaseSeconds + 0.05;
  const durationSeconds = endStep * stepDurationSeconds + tailSeconds;
  if (durationSeconds > maxDurationSeconds) {
    throw new RangeError(`Audio export is limited to ${Math.floor(maxDurationSeconds / 60)} minutes.`);
  }
  return Object.freeze({
    channels: EXPORT_CHANNELS,
    durationSeconds,
    endStep,
    frameCount: Math.ceil(durationSeconds * sampleRate),
    masterVolume: normalized.transport.masterVolume,
    sampleRate,
    stepDurationSeconds,
    tailSeconds,
    tracks: Object.freeze(tracks),
  });
}

function createOfflineContext(Context, plan) {
  try {
    return new Context(plan.channels, plan.frameCount, plan.sampleRate);
  } catch {
    return new Context({
      length: plan.frameCount,
      numberOfChannels: plan.channels,
      sampleRate: plan.sampleRate,
    });
  }
}

export async function renderArrangementOffline(project, {
  OfflineContext = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext,
  maxDurationSeconds,
  sampleRate,
} = {}) {
  if (!OfflineContext) throw new Error("This browser does not support offline audio rendering.");
  const plan = createArrangementRenderPlan(project, { maxDurationSeconds, sampleRate });
  let context;
  try {
    context = createOfflineContext(OfflineContext, plan);
  } catch (error) {
    throw new Error("The browser could not allocate enough memory for this audio export.", { cause: error });
  }
  const master = context.createGain();
  master.gain.setValueAtTime(plan.masterVolume, 0);
  master.connect(context.destination);

  for (const track of plan.tracks) {
    const channel = context.createGain();
    channel.gain.setValueAtTime(track.trackVolume, 0);
    channel.connect(master);
    const voiceEngine = createVoiceEngine({
      getAudioTime: () => 0,
      getOutputNode: () => channel,
    });
    voiceEngine.setVolume(track.instrumentVolume);
    for (const note of track.notes) voiceEngine.trigger(note);
  }

  try {
    return await context.startRendering();
  } catch (error) {
    throw new Error("The browser could not finish rendering this WAV file.", { cause: error });
  }
}
