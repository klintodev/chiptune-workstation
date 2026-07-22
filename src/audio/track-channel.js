const RAMP_SECONDS = 0.015;

export function createTrackChannel({
  getAudioTime,
  getMasterOutputNode,
  initialMuted = false,
  initialPan = 0,
  initialVolume = 1,
  trackId,
}) {
  let analyser = null;
  let channel = null;
  let muted = initialMuted;
  let pan = initialPan;
  let panner = null;
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
    panner = masterOutput.context.createStereoPanner?.() ?? null;
    panner?.pan.setValueAtTime(pan, masterOutput.context.currentTime);
    channel.connect(analyser);
    analyser.connect(panner ?? masterOutput);
    panner?.connect(masterOutput);
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

  function updatePan() {
    if (!panner) return;
    const now = getAudioTime();
    panner.pan.cancelScheduledValues(now);
    panner.pan.setValueAtTime(panner.pan.value, now);
    panner.pan.linearRampToValueAtTime(pan, now + RAMP_SECONDS);
  }

  function setMuted(nextMuted) {
    if (typeof nextMuted !== "boolean") throw new TypeError("Muted must be a boolean.");
    if (muted === nextMuted) return false;
    muted = nextMuted;
    updateGain();
    return true;
  }

  function setPan(nextPan) {
    if (!Number.isFinite(nextPan) || nextPan < -1 || nextPan > 1) {
      throw new RangeError("Track pan must be between minus one and one.");
    }
    if (pan === nextPan) return false;
    pan = nextPan;
    updatePan();
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
    panner?.disconnect();
    channel = null;
    analyser = null;
    panner = null;
  }

  return Object.freeze({
    dispose,
    getInputNode,
    getObservationNode,
    getState: () => Object.freeze({ muted, pan, trackId, volume }),
    setMuted,
    setPan,
    setVolume,
  });
}
