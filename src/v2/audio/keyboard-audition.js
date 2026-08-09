import { createInputController } from "../../features/keyboard/input-controller.js";
import { getEffectiveMidiNote, midiNoteToFrequency } from "../../audio/pitch-policy.js";
import { MAX_DELAY_TAIL_SECONDS } from "./effect-tail.js";
import { VOICE_RETIRE_RAMP_SECONDS } from "./klinto-chip-synth.js";

export const V2_KEYBOARD_AUDITION_HOLD_SECONDS = 30;
export const V2_KEYBOARD_AUDITION_HEARTBEAT_SECONDS = MAX_DELAY_TAIL_SECONDS / 2;
export const V2_PIANO_PREVIEW_SECONDS = 0.14;
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
  let previewVoice = null;
  let disposed = false;

  function stopHeartbeat() {
    if (heartbeatId === null) return false;
    clearIntervalLike?.(heartbeatId);
    heartbeatId = null;
    return true;
  }

  function heldVoiceRecords() {
    return activeVoices.filter((record) => record.held && record.inputMarked !== true);
  }

  function heartbeat() {
    if (disposed) {
      stopHeartbeat();
      return;
    }
    const records = heldVoiceRecords();
    if (records.length === 0) {
      stopHeartbeat();
      return;
    }
    const inputTime = audioEngine.getCurrentTime();
    for (const record of records) {
      markInput(record.trackId, inputTime, {
        inputId: record.inputId,
        phase: "active",
      });
    }
  }

  function syncHeartbeat() {
    if (disposed || heldVoiceRecords().length === 0) {
      stopHeartbeat();
      return;
    }
    if (heartbeatId !== null || typeof setIntervalLike !== "function") return;
    heartbeatId = setIntervalLike(
      heartbeat,
      V2_KEYBOARD_AUDITION_HEARTBEAT_SECONDS * 1000,
    );
  }

  function resolveTrack(explicitTrackId = getTrackId()) {
    const project = getProject();
    const track = project?.tracks?.find(({ id }) => id === explicitTrackId);
    if (!track) throw new RangeError(`Unknown audition Track: ${explicitTrackId}.`);
    return { project, track };
  }

  function removeRecord(record) {
    const index = activeVoices.indexOf(record);
    if (index >= 0) activeVoices.splice(index, 1);
    record?.detachEnded?.();
    if (record) record.detachEnded = null;
    syncHeartbeat();
  }

  function markInput(trackId, releaseEndTime, lifecycle) {
    onTrackInput(trackId, Object.freeze({ releaseEndTime }), Object.freeze(lifecycle));
  }

  function createVoiceEngine(explicitTrackId) {
    const { track } = resolveTrack(explicitTrackId);
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
        const held = event.durationSeconds === undefined;
        const durationSeconds = event.durationSeconds ?? V2_KEYBOARD_AUDITION_HOLD_SECONDS;
        const releaseEndTime = startTime
          + durationSeconds
          + event.releaseSeconds
          + VOICE_DISCONNECT_GRACE_SECONDS;
        const voiceId = nextVoiceId;
        nextVoiceId += 1;
        const inputId = `${event.inputKind ?? "keyboard-audition"}:${voiceId}`;
        const voice = runtime.trigger(Object.freeze({
          attackSeconds: event.attackSeconds,
          durationSeconds,
          frequencyHz: event.frequency,
          ownership: Object.freeze({
            clipId: null,
            mode: "audition",
            noteId: event.noteId ?? null,
            occurrenceId: inputId,
            patternId: event.patternId ?? null,
            projectId: getProject().id ?? null,
            trackId: track.id,
          }),
          releaseEndTime,
          releaseSeconds: event.releaseSeconds,
          startTime,
          trackId: track.id,
          velocity: event.velocity ?? 1,
          waveform: event.type,
        }));
        let record;

        function markFinalInputEnd(inputEndTime) {
          if (record.inputMarked) return false;
          record.inputMarked = true;
          markInput(track.id, inputEndTime, {
            inputId,
            phase: "end",
          });
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
          held,
          inputId,
          inputEndTime: releaseEndTime,
          inputMarked: false,
          trackId: track.id,
          wrapper,
        };
        activeVoices.push(record);
        markInput(track.id, held ? startTime : releaseEndTime, {
          inputId,
          phase: "start",
        });
        record.detachEnded = voice.addEndedListener?.(() => {
          markFinalInputEnd(record.inputEndTime);
          removeRecord(record);
        }) ?? null;
        syncHeartbeat();
        return wrapper;
      },
    });
  }

  function stopPreview() {
    const current = previewVoice;
    previewVoice = null;
    return current?.retire() ?? false;
  }

  function previewNote({
    noteId = null,
    patternId = null,
    pitch,
    trackId,
    velocity = 1,
  } = {}) {
    stopPreview();
    if (velocity === 0) return false;
    if (!Number.isFinite(velocity) || velocity < 0 || velocity > 1) {
      throw new RangeError("Piano preview velocity must be between 0 and 1.");
    }
    const { track } = resolveTrack(trackId);
    const params = track.instrument.params;
    try {
      const voice = createVoiceEngine(track.id).trigger({
        attackSeconds: params.attackSeconds,
        durationSeconds: V2_PIANO_PREVIEW_SECONDS,
        frequency: midiNoteToFrequency(getEffectiveMidiNote(pitch, params.octave)),
        inputKind: "piano-preview",
        noteId,
        patternId,
        releaseSeconds: params.releaseSeconds,
        type: params.waveform,
        velocity,
      });
      previewVoice = voice;
      voice.addEndedListener?.(() => {
        if (previewVoice === voice) previewVoice = null;
      });
      return true;
    } catch (error) {
      if (error?.code === "not-ready") return false;
      throw error;
    }
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

  function stopAllAuditionVoices() {
    const hadActiveVoices = activeVoices.some(({ inputMarked }) => !inputMarked);
    inputController.stopAll();
    stopPreview();
    const now = audioEngine.getCurrentTime();
    for (const record of [...activeVoices]) {
      if (!record.inputMarked) record.wrapper.retire(now);
    }
    return hadActiveVoices;
  }

  return Object.freeze({
    dispose() {
      if (disposed) return false;
      documentLike.removeEventListener("keydown", handleKeyDown);
      documentLike.removeEventListener("keyup", handleKeyUp);
      if (keyupTarget !== documentLike) keyupTarget?.removeEventListener?.("keyup", handleKeyUp);
      stopAllAuditionVoices();
      disposed = true;
      stopHeartbeat();
      inputController.dispose();
      for (const record of activeVoices) record.detachEnded?.();
      activeVoices.length = 0;
      previewVoice = null;
      return true;
    },
    getActiveVoiceCount: () => activeVoices.length,
    previewNote,
    /**
     * Drain computer-key ownership that targets a Track absent from the next
     * Project. Call this after Project state changes but before graph sync, so
     * final input-end markers still reach the retiring route exactly once.
     */
    reconcileProject(project = getProject()) {
      if (!Array.isArray(project?.tracks)) {
        throw new TypeError("Audition Project reconciliation requires Tracks.");
      }
      const validTrackIds = new Set(project.tracks.map(({ id }) => id));
      const ownsInvalidTrack = activeVoices.some((record) => (
        record.inputMarked !== true && !validTrackIds.has(record.trackId)
      ));
      if (!ownsInvalidTrack) return false;
      stopAllAuditionVoices();
      return true;
    },
    stopAll: stopAllAuditionVoices,
    stopPreview,
  });
}
