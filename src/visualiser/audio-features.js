function averageBand(values, start, end) {
  if (end <= start) return 0;
  let total = 0;
  for (let index = start; index < end; index += 1) total += values[index];
  return total / ((end - start) * 255);
}

export function analyseAudioFrame(timeDomain, frequencyDomain, sensitivity = 1) {
  let energy = 0;
  for (const sample of timeDomain) {
    const centered = (sample - 128) / 128;
    energy += centered * centered;
  }
  const amplitude = timeDomain.length === 0 ? 0 : Math.sqrt(energy / timeDomain.length);
  const third = Math.floor(frequencyDomain.length / 3);
  const scale = (value) => Math.min(1, value * sensitivity);
  return Object.freeze({
    amplitude: scale(amplitude * 2.2),
    bass: scale(averageBand(frequencyDomain, 0, third)),
    mid: scale(averageBand(frequencyDomain, third, third * 2)),
    treble: scale(averageBand(frequencyDomain, third * 2, frequencyDomain.length)),
    frequencies: frequencyDomain,
    waveform: timeDomain,
  });
}

export function createAudioAnalyserReader(audioEngine) {
  let analyser = null;
  let waveform = new Uint8Array(0);
  let frequencies = new Uint8Array(0);

  function ensureBuffers() {
    if (!audioEngine.isReady()) return false;
    const nextAnalyser = audioEngine.getObservationNode();
    if (nextAnalyser !== analyser || waveform.length !== nextAnalyser.fftSize) {
      analyser = nextAnalyser;
      waveform = new Uint8Array(analyser.fftSize);
      frequencies = new Uint8Array(analyser.frequencyBinCount);
    }
    return true;
  }

  function read(sensitivity = 1) {
    if (!ensureBuffers()) return analyseAudioFrame(new Uint8Array(0), new Uint8Array(0), sensitivity);
    analyser.getByteTimeDomainData(waveform);
    analyser.getByteFrequencyData(frequencies);
    return analyseAudioFrame(waveform, frequencies, sensitivity);
  }

  return Object.freeze({ read });
}
