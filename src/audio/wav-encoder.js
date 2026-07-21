function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

export function encodePcm16Wave(audioBuffer) {
  const channelCount = Math.min(2, audioBuffer.numberOfChannels);
  if (channelCount < 1) throw new RangeError("Audio export requires at least one channel.");
  const frameCount = audioBuffer.length;
  const outputChannels = 2;
  const bytesPerSample = 2;
  const dataBytes = frameCount * outputChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, outputChannels, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * outputChannels * bytesPerSample, true);
  view.setUint16(32, outputChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  const left = audioBuffer.getChannelData(0);
  const right = channelCount > 1 ? audioBuffer.getChannelData(1) : left;
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (const sample of [left[frame], right[frame]]) {
      const clamped = clampSample(sample);
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return buffer;
}
