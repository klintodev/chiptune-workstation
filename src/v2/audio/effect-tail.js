/**
 * Pure export-tail policy shared by live, public and offline audio adapters.
 *
 * Keep this module free of Web Audio references: callers must be able to run
 * the allocation guard before creating an OfflineAudioContext or any buffers.
 */

export const DELAY_DIVISION_RATIOS = Object.freeze({
  "1/32": 0.125,
  "1/16": 0.25,
  "1/8": 0.5,
  "1/4": 1,
  "1/2": 2,
});

export const MAX_DELAY_TAIL_SECONDS = 10;
export const DELAY_TAIL_FADE_SECONDS = 0.02;
export const ZERO_FEEDBACK_SETTLE_SECONDS = 0.25;

function assertFiniteRange(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

export function getEqualPowerGains(mix) {
  assertFiniteRange(mix, 0, 1, "Delay mix");
  const angle = mix * Math.PI / 2;
  return Object.freeze({
    dryGain: Math.cos(angle),
    wetGain: Math.sin(angle),
  });
}

export const calculateEqualPowerGains = getEqualPowerGains;

export function getDelayTimeSeconds(bpm, timeDivision) {
  assertFiniteRange(bpm, 40, 240, "Tempo");
  const ratio = DELAY_DIVISION_RATIOS[timeDivision];
  if (ratio === undefined) {
    throw new RangeError(`Unsupported Delay time division: ${timeDivision}`);
  }
  return (60 / bpm) * ratio;
}

export const calculateDelayTimeSeconds = getDelayTimeSeconds;

function unwrapEffect(effect) {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
    throw new TypeError("Effect state must be an object.");
  }
  return {
    bypassed: effect.bypassed === true,
    params: effect.params ?? effect,
    type: effect.type ?? "klinto-delay",
  };
}

/**
 * Implements PRD 30's allocation rule exactly. In particular, any audible
 * feedback above zero reserves the complete ten-second cap; raw `mix` is never
 * used as a proxy for wet audibility.
 */
export function getDelayTailSeconds(effect, bpm) {
  const { bypassed, params } = unwrapEffect(effect);
  const { feedback, mix, timeDivision } = params;
  assertFiniteRange(feedback, 0, 0.85, "Delay feedback");
  const { wetGain } = getEqualPowerGains(mix);
  if (bypassed || wetGain === 0) return 0;
  const delaySeconds = getDelayTimeSeconds(bpm, timeDivision);
  if (feedback === 0) {
    return Math.min(
      MAX_DELAY_TAIL_SECONDS,
      delaySeconds + ZERO_FEEDBACK_SETTLE_SECONDS,
    );
  }
  return MAX_DELAY_TAIL_SECONDS;
}

export const calculateDelayTailSeconds = getDelayTailSeconds;

export function getEffectTailSeconds(effect, bpm) {
  const { bypassed, type } = unwrapEffect(effect);
  if (bypassed) return 0;
  if (type === "klinto-filter") return 0;
  if (type === "klinto-delay") return getDelayTailSeconds(effect, bpm);
  throw new RangeError(`Unsupported Effect type: ${type}`);
}

export function sumSerialEffectTails(effects, bpm) {
  if (!Array.isArray(effects)) throw new TypeError("Effect chain must be an array.");
  return effects.reduce((tail, effect) => tail + getEffectTailSeconds(effect, bpm), 0);
}

export function calculateSerialRouteTailSeconds({
  bpm,
  instrumentReleaseSeconds,
  masterEffects = [],
  trackEffects = [],
}) {
  assertFiniteRange(instrumentReleaseSeconds, 0, 3, "Instrument release");
  return instrumentReleaseSeconds
    + sumSerialEffectTails(trackEffects, bpm)
    + sumSerialEffectTails(masterEffects, bpm);
}

/**
 * The Project tail is the longest Track route followed by the one serial
 * Master route. Master effects are deliberately added once after the maximum,
 * rather than once for every Track.
 */
export function calculateProjectExportTailSeconds(project, { trackIds } = {}) {
  if (!project || typeof project !== "object" || !Array.isArray(project.tracks)) {
    throw new TypeError("A Project with Tracks is required.");
  }
  const bpm = project.transport?.bpm;
  const includedIds = trackIds === undefined ? null : new Set(trackIds);
  const includedTracks = includedIds === null
    ? project.tracks
    : project.tracks.filter((track) => includedIds.has(track.id));
  const longestTrackTail = includedTracks.reduce((longest, track) => {
    const release = track.instrument?.params?.releaseSeconds;
    assertFiniteRange(release, 0.01, 3, `Instrument release for Track ${track.id}`);
    const trackTail = release + sumSerialEffectTails(track.mixer?.effects ?? [], bpm);
    return Math.max(longest, trackTail);
  }, 0);
  return longestTrackTail
    + sumSerialEffectTails(project.mixer?.master?.effects ?? [], bpm);
}

export const getProjectExportTailSeconds = calculateProjectExportTailSeconds;
