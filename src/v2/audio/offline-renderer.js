import { normalizeV2Project } from "../domain/index.js";
import { createKlintoChipSynthRuntime } from "./klinto-chip-synth.js";
import { createRenderPlan } from "./render-plan.js";
import { createDeviceRuntimeRegistry } from "./runtime-registry.js";

export const V2_EXPORT_SAMPLE_RATE = 44_100;
export const MAX_V2_RENDER_SECONDS = 10 * 60;
export const V2_EXPORT_CHANNELS = 2;

export function createV2ArrangementRenderPlan(project, {
  maxDurationSeconds = MAX_V2_RENDER_SECONDS,
  sampleRate = V2_EXPORT_SAMPLE_RATE,
} = {}) {
  if (!Number.isFinite(maxDurationSeconds) || maxDurationSeconds <= 0) {
    throw new RangeError("Maximum render duration must be positive.");
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError("Export sample rate must be a positive integer.");
  }
  const sharedPlan = createRenderPlan(project, { mode: "song" });
  if (sharedPlan.events.length === 0) {
    throw new RangeError("Add at least one audible Playlist note before exporting audio.");
  }
  if (sharedPlan.totalDurationSeconds > maxDurationSeconds) {
    throw new RangeError("Arrangement plus its bounded Effect tail exceeds the render limit.");
  }
  const frameCount = Math.ceil(sharedPlan.totalDurationSeconds * sampleRate);
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
    throw new RangeError("Render allocation is outside the safe frame range.");
  }
  return Object.freeze({
    ...sharedPlan,
    channelCount: V2_EXPORT_CHANNELS,
    frameCount,
    maxDurationSeconds,
    sampleRate,
  });
}

function constructOfflineContext(Context, plan) {
  try {
    return new Context({
      length: plan.frameCount,
      numberOfChannels: plan.channelCount,
      sampleRate: plan.sampleRate,
    });
  } catch {
    return new Context(plan.channelCount, plan.frameCount, plan.sampleRate);
  }
}

/**
 * Render the one-shot Song plan through the exact first-party graph factories.
 * Plan validation and the ten-minute guard run before the context constructor.
 */
export async function renderV2ArrangementOffline(projectCandidate, {
  OfflineAudioContextClass = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext,
  createOfflineAudioContext,
  maxDurationSeconds = MAX_V2_RENDER_SECONDS,
  sampleRate = V2_EXPORT_SAMPLE_RATE,
} = {}) {
  const project = normalizeV2Project(projectCandidate);
  const plan = createV2ArrangementRenderPlan(project, { maxDurationSeconds, sampleRate });
  if (!createOfflineAudioContext && !OfflineAudioContextClass) {
    throw new Error("Offline Web Audio rendering is not supported in this environment.");
  }
  const context = createOfflineAudioContext
    ? createOfflineAudioContext(Object.freeze({
        length: plan.frameCount,
        numberOfChannels: plan.channelCount,
        sampleRate: plan.sampleRate,
      }))
    : constructOfflineContext(OfflineAudioContextClass, plan);
  const noWallClockTransitions = () => () => {};
  const registry = createDeviceRuntimeRegistry({
    context,
    destination: context.destination,
    scheduleTransition: noWallClockTransitions,
  });
  const synth = createKlintoChipSynthRuntime({
    context,
    getOutputNode: (trackId) => registry.getTrackInputNode(trackId),
  });
  const voices = new Map();
  try {
    registry.sync(project);
    for (const event of plan.events) {
      for (const occurrenceId of event.retireOccurrenceIds) {
        voices.get(occurrenceId)?.retire(event.startSeconds);
        voices.delete(occurrenceId);
      }
      const voice = synth.trigger(Object.freeze({ ...event, startTime: event.startSeconds }));
      voices.set(event.occurrenceId, voice);
      registry.markTrackInput(event.trackId, event.releaseEndSeconds);
    }
    const audioBuffer = await context.startRendering();
    return Object.freeze({ audioBuffer, plan });
  } finally {
    synth.dispose();
    registry.dispose();
  }
}

export const createV2OfflineRenderPlan = createV2ArrangementRenderPlan;
