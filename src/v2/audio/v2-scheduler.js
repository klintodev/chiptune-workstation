import {
  createOccurrenceScheduler,
  DEFAULT_V2_LOOK_AHEAD_SECONDS,
  DEFAULT_V2_SCHEDULER_INTERVAL_MS,
  DEFAULT_V2_START_LEAD_SECONDS,
} from "./occurrence-scheduler.js";

function defaultAudioTime() {
  if (globalThis.performance?.now) return globalThis.performance.now() / 1000;
  return Date.now() / 1000;
}

/**
 * Integration-friendly scheduler entry point. `scheduleVoice(event)` receives
 * the complete immutable shape documented by render-plan and returns a
 * cancellable `{ stop, retire?, addEndedListener?, ended? }` voice handle.
 */
export function createV2Scheduler({
  getAudioTime = defaultAudioTime,
  getAuditionTrackId,
  getRuntime,
  getSynthRuntime,
  getTrackId,
  scheduleVoice,
  ...options
} = {}) {
  const resolvedTrackProvider = getTrackId ?? getAuditionTrackId ?? (() => null);
  let resolvedRuntimeProvider = getSynthRuntime ?? getRuntime;
  if (scheduleVoice) {
    resolvedRuntimeProvider = () => Object.freeze({ trigger: scheduleVoice });
  }
  return createOccurrenceScheduler({
    ...options,
    getAudioTime,
    getSynthRuntime: resolvedRuntimeProvider,
    getTrackId: resolvedTrackProvider,
  });
}

export {
  createOccurrenceScheduler,
  DEFAULT_V2_LOOK_AHEAD_SECONDS,
  DEFAULT_V2_SCHEDULER_INTERVAL_MS,
  DEFAULT_V2_START_LEAD_SECONDS,
};
