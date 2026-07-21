const RAMP_SECONDS = 0.015;

export function createTrackChannel({
  getAudioTime,
  getMasterOutputNode,
  initialMuted = false,
  initialVolume = 1,
  trackId,
}) {
  let analyser = null;
  let channel = null;
  let muted = initialMuted;
  let volume = initialVolume;

  function getTargetVolume() {
    return muted ? 0 : volume;
  }

  function getInputNode() {
    if (channel) return channel;
    const masterOutput = getMasterOutputNode();
    channel = masterOutput.context.createGain();
    analyser = masterOutput.context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.68;
    channel.gain.setValueAtTime(getTargetVolume(), masterOutput.context.currentTime);
    channel.connect(analyser);
    analyser.connect(masterOutput);
    return channel;
  }

  function getObservationNode() {
    getInputNode();
    return analyser;
  }

  function updateGain() {
    if (!channel) return;
    const now = getAudioTime();
    channel.gain.cancelScheduledValues(now);
    channel.gain.setValueAtTime(channel.gain.value, now);
    channel.gain.linearRampToValueAtTime(getTargetVolume(), now + RAMP_SECONDS);
  }

  function setMuted(nextMuted) {
    if (typeof nextMuted !== "boolean") throw new TypeError("Muted must be a boolean.");
    if (muted === nextMuted) return false;
    muted = nextMuted;
    updateGain();
    return true;
  }

  function setVolume(nextVolume) {
    if (!Number.isFinite(nextVolume) || nextVolume < 0 || nextVolume > 1) {
      throw new RangeError("Track volume must be between zero and one.");
    }
    if (volume === nextVolume) return false;
    volume = nextVolume;
    updateGain();
    return true;
  }

  function dispose() {
    channel?.disconnect();
    analyser?.disconnect();
    channel = null;
    analyser = null;
  }

  return Object.freeze({
    dispose,
    getInputNode,
    getObservationNode,
    getState: () => Object.freeze({ muted, trackId, volume }),
    setMuted,
    setVolume,
  });
}
