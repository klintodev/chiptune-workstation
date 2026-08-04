import { createInputController } from "../../features/keyboard/input-controller.js";
import { MAX_DELAY_TAIL_SECONDS } from "./effect-tail.js";
import { VOICE_RETIRE_RAMP_SECONDS } from "./klinto-chip-synth.js";

export const V2_KEYBOARD_AUDITION_HOLD_SECONDS = 30;
export const V2_KEYBOARD_AUDITION_HEARTBEAT_SECONDS = MAX_DELAY_TAIL_SECONDS / 2;
const V2_KEYBOARD_AUDITION_VOICE_LIMIT = 16;
const VOICE_DISCONNECT_GRACE_SECONDS = 0.01;

function createNotReadyError() {
  const error = new Error("Enable audio before auditioning the Instrument.");
  error.code = "not-ready";
  return error;
}

/**
 * Adapts the existing computer-keyboard ownership and key map to the V2 synth.
 * Audition voices bypass transport ownership but use the selected Track's full
 * Instrument -> Track effects -> Master route.
 */
export function createV2KeyboardAudition({
  audioEngine,
  clearIntervalLike = globalThis.clearInterval?.bind(globalThis),
  documentLike = document,
  ensureAudioGraph = () => true,
  getProject,
  getSynthRuntime,
  getTrackId,
  keyupTarget = documentLike?.defaultView ?? globalThis,
  maxVoices = V2_KEYBOARD_AUDITION_VOICE_LIMIT,
  onTrackInput = () => {},
  setIntervalLike = globalThis.setInterval?.bind(globalThis),
} = {}) {
  if (!audioEngine?.isReady || !audioEngine?.getCurrentTime) {
    throw new TypeError("V2 keyboard audition requires the shared audio engine.");
  }
  if (typeof getProject !== "function" || typeof getTrackId !== "function") {
    throw new TypeError("V2 keyboard audition requires Project and Track providers.");
  }
  if (typeof getSynthRuntime !== "function") {
    throw new TypeError("V2 keyboard audition requires a synth runtime provider.");
  }
  if (!Number.isInteger(maxVoices) || maxVoices < 1 || maxVoices > 16) {
    throw new RangeError("V2 keyboard audition supports between 1 and 16 voices.");
  }

  const activeVoices = [];
  let heartbeatId = null;
  let nextVoiceId = 1;
  let disposed = false;

  function stopHeartbeat() {
    if (heartbeatId === null) return false;
    clearIntervalLike?.(heartbeatId);
    heartbeatId = null;
    return true;
  }

  function heldTrackIds() {
    return new Set(activeVoices
      .filter((record) => record.inputMarked !== true)
      .map((record) => record.trackId));
  }

  function heartbeat() {
    if (disposed) {
      stopHeartbeat();
      return;
    }
    const trackIds = heldTrackIds();
    if (trackIds.size === 0) {
      stopHeartbeat();
      return;
    }
    const inputTime = audioEngine.getCurrentTime();
    for (const trackId of trackIds) markInput(trackId, inputTime);
  }

  function syncHeartbeat() {
    if (disposed || heldTrackIds().size === 0) {
      stopHeartbeat();
      return;
    }
    if (heartbeatId !== null || typeof setIntervalLike !== "function") return;
    heartbeatId = setIntervalLike(
      heartbeat,
      V2_KEYBOARD_AUDITION_HEARTBEAT_SECONDS * 1000,
    );
  }

  function resolveTrack() {
    const project = getProject();
    const trackId = getTrackId();
    const track = project?.tracks?.find(({ id }) => id === trackId);
    if (!track) throw new RangeError(`Unknown audition Track: ${trackId}.`);
    return { project, track };
  }

  function removeRecord(record) {
    const index = activeVoices.indexOf(record);
    if (index >= 0) activeVoices.splice(index, 1);
    record?.detachEnded?.();
    if (record) record.detachEnded = null;
    syncHeartbeat();
  }

  function markInput(trackId, releaseEndTime) {
    onTrackInput(trackId, Object.freeze({ releaseEndTime }));
  }

  function createVoiceEngine() {
    const { track } = resolveTrack();
    return Object.freeze({
      trigger(event) {
        if (disposed || !audioEngine.isReady()) throw createNotReadyError();
        ensureAudioGraph();
        const runtime = getSynthRuntime();
        if (!runtime?.trigger) throw createNotReadyError();
        const startTime = audioEngine.getCurrentTime();
        while (activeVoices.length >= maxVoices) {
          activeVoices[0].wrapper.retire(startTime);
        }
        const durationSeconds = V2_KEYBOARD_AUDITION_HOLD_SECONDS;
        const releaseEndTime = startTime
          + durationSeconds
          + event.releaseSeconds
          + VOICE_DISCONNECT_GRACE_SECONDS;
        const voiceId = nextVoiceId;
        nextVoiceId += 1;
        const voice = runtime.trigger(Object.freeze({
          attackSeconds: event.attackSeconds,
          durationSeconds,
          frequencyHz: event.frequency,
          ownership: Object.freeze({
            clipId: null,
            mode: "audition",
            noteId: null,
            occurrenceId: `keyboard-audition:${voiceId}`,
            patternId: null,
            projectId: getProject().id ?? null,
            trackId: track.id,
          }),
          releaseEndTime,
          releaseSeconds: event.releaseSeconds,
          startTime,
          trackId: track.id,
          velocity: 1,
          waveform: event.type,
        }));
        let record;

        function markFinalInputEnd(inputEndTime) {
          if (record.inputMarked) return false;
          record.inputMarked = true;
          markInput(track.id, inputEndTime);
          syncHeartbeat();
          return true;
        }

        const wrapper = Object.freeze({
          addEndedListener: (listener) => voice.addEndedListener?.(listener) ?? (() => {}),
          get ended() { return voice.ended === true; },
          retire(time = audioEngine.getCurrentTime()) {
            const previousInputEndTime = record.inputEndTime;
            const hasRetire = typeof voice.retire === "function";
            record.inputEndTime = hasRetire
              ? Math.max(audioEngine.getCurrentTime(), time) + VOICE_RETIRE_RAMP_SECONDS
              : Math.max(startTime, time)
                + event.releaseSeconds
                + VOICE_DISCONNECT_GRACE_SECONDS;
            const retired = hasRetire ? voice.retire(time) : voice.stop(time);
            if (retired) markFinalInputEnd(record.inputEndTime);
            else if (!record.inputMarked) record.inputEndTime = previousInputEndTime;
            removeRecord(record);
            return retired;
          },
          stop(time = audioEngine.getCurrentTime()) {
            const previousInputEndTime = record.inputEndTime;
            record.inputEndTime = Math.min(
              previousInputEndTime,
              Math.max(startTime, time)
                + event.releaseSeconds
                + VOICE_DISCONNECT_GRACE_SECONDS,
            );
            const stopped = voice.stop(time);
            if (stopped) markFinalInputEnd(record.inputEndTime);
            else if (!record.inputMarked) record.inputEndTime = previousInputEndTime;
            return stopped;
          },
        });
        record = {
          detachEnded: null,
          inputEndTime: releaseEndTime,
          inputMarked: false,
          trackId: track.id,
          wrapper,
        };
        activeVoices.push(record);
        markInput(track.id, startTime);
        record.detachEnded = voice.addEndedListener?.(() => {
          markFinalInputEnd(record.inputEndTime);
          removeRecord(record);
        }) ?? null;
        syncHeartbeat();
        return wrapper;
      },
    });
  }

  const inputController = createInputController({
    getInstrumentConfig() {
      const { track } = resolveTrack();
      const params = track.instrument.params;
      return Object.freeze({
        attackSeconds: params.attackSeconds,
        octaveOffset: params.octave,
        releaseSeconds: params.releaseSeconds,
        voiceType: params.waveform,
      });
    },
    getVoiceEngine: createVoiceEngine,
    root: documentLike,
  });
  const handleKeyDown = (event) => inputController.handleKeyDown(event);
  const handleKeyUp = (event) => inputController.handleKeyUp(event);
  documentLike.addEventListener("keydown", handleKeyDown);
  documentLike.addEventListener("keyup", handleKeyUp);
  if (keyupTarget !== documentLike) keyupTarget?.addEventListener?.("keyup", handleKeyUp);

  return Object.freeze({
    dispose() {
      if (disposed) return false;
      disposed = true;
      documentLike.removeEventListener("keydown", handleKeyDown);
      documentLike.removeEventListener("keyup", handleKeyUp);
      if (keyupTarget !== documentLike) keyupTarget?.removeEventListener?.("keyup", handleKeyUp);
      stopHeartbeat();
      inputController.dispose();
      activeVoices.length = 0;
      return true;
    },
    getActiveVoiceCount: () => activeVoices.length,
    stopAll: inputController.stopAll,
  });
}
