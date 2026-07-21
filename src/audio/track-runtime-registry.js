import { isTrackAudible, MAX_TRACK_VOICES } from "../state/project-state.js";
import { createTrackChannel } from "./track-channel.js";
import { createVoiceEngine } from "./voice-engine.js?v=20260721-1";

export function createTrackRuntimeRegistry({ audioEngine, projectState }) {
  const runtimes = new Map();

  function createRuntime(track) {
    const channel = createTrackChannel({
      getAudioTime: audioEngine.getCurrentTime,
      getMasterOutputNode: audioEngine.getInputNode,
      initialMuted: track.mixer.muted,
      initialVolume: track.mixer.volume,
      trackId: track.id,
    });
    const voiceEngine = createVoiceEngine({
      getAudioTime: audioEngine.getCurrentTime,
      getOutputNode: channel.getInputNode,
      maxVoices: MAX_TRACK_VOICES,
    });
    voiceEngine.setVolume(track.instrument.volume);
    return Object.freeze({
      channel,
      dispose() {
        voiceEngine.dispose();
        channel.dispose();
      },
      voiceEngine,
    });
  }

  function ensureRuntime(trackId) {
    const existing = runtimes.get(trackId);
    if (existing) return existing;
    const track = projectState.getTrack(trackId);
    const runtime = createRuntime(track);
    runtimes.set(trackId, runtime);
    return runtime;
  }

  function sync() {
    const project = projectState.getState();
    const trackIds = new Set(project.tracks.map((track) => track.id));
    audioEngine.setMasterVolume(project.transport.masterVolume);

    for (const track of project.tracks) {
      const runtime = ensureRuntime(track.id);
      const audible = isTrackAudible(project, track.id);
      runtime.channel.setMuted(!audible);
      runtime.channel.setVolume(track.mixer.volume);
      runtime.voiceEngine.setVolume(track.instrument.volume);
    }

    for (const [trackId, runtime] of runtimes) {
      if (trackIds.has(trackId)) continue;
      runtime.dispose();
      runtimes.delete(trackId);
    }
  }

  function getVoiceEngine(trackId) {
    return ensureRuntime(trackId).voiceEngine;
  }

  function stopTrack(trackId, time) {
    const runtime = runtimes.get(trackId);
    return runtime?.voiceEngine.stopAll(time) ?? false;
  }

  function stopAll(time) {
    for (const runtime of runtimes.values()) runtime.voiceEngine.stopAll(time);
  }

  function handleProjectChange() {
    sync();
  }

  projectState.addEventListener("change", handleProjectChange);
  sync();

  function dispose() {
    projectState.removeEventListener("change", handleProjectChange);
    for (const runtime of runtimes.values()) runtime.dispose();
    runtimes.clear();
  }

  return Object.freeze({ dispose, getVoiceEngine, stopAll, stopTrack, sync });
}
