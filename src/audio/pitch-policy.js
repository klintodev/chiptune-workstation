export const MIN_PLAYABLE_MIDI_NOTE = 12;
export const MAX_PLAYABLE_MIDI_NOTE = 136;
export const MIN_SUPPORTED_AUDIO_SAMPLE_RATE = 44_100;

function assertPlayableMidiNote(note) {
  if (
    !Number.isInteger(note)
    || note < MIN_PLAYABLE_MIDI_NOTE
    || note > MAX_PLAYABLE_MIDI_NOTE
  ) {
    throw new RangeError(
      `Effective MIDI note must be an integer between ${MIN_PLAYABLE_MIDI_NOTE} and ${MAX_PLAYABLE_MIDI_NOTE}.`,
    );
  }
  return note;
}

export function getEffectiveMidiNote(patternNote, octaveOffset = 0) {
  if (!Number.isInteger(patternNote) || !Number.isInteger(octaveOffset)) {
    throw new TypeError("Pattern note and octave offset must be integers.");
  }
  return assertPlayableMidiNote(patternNote + octaveOffset * 12);
}

export function midiNoteToFrequency(note) {
  return 440 * 2 ** ((assertPlayableMidiNote(note) - 69) / 12);
}

export const MIN_PLAYABLE_FREQUENCY = midiNoteToFrequency(MIN_PLAYABLE_MIDI_NOTE);
export const MAX_PLAYABLE_FREQUENCY = midiNoteToFrequency(MAX_PLAYABLE_MIDI_NOTE);

export function validatePlayableFrequency(frequency) {
  if (
    !Number.isFinite(frequency)
    || frequency < MIN_PLAYABLE_FREQUENCY
    || frequency > MAX_PLAYABLE_FREQUENCY
  ) {
    throw new RangeError(
      `Frequency must be between ${MIN_PLAYABLE_FREQUENCY.toFixed(2)} and ${MAX_PLAYABLE_FREQUENCY.toFixed(2)} Hz.`,
    );
  }
  return frequency;
}

export function validateAudioSampleRate(sampleRate) {
  if (!Number.isFinite(sampleRate) || sampleRate < MIN_SUPPORTED_AUDIO_SAMPLE_RATE) {
    throw new RangeError(
      `Audio sample rate must be at least ${MIN_SUPPORTED_AUDIO_SAMPLE_RATE} Hz.`,
    );
  }
  return sampleRate;
}
