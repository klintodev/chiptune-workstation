import { queryRequired } from "../../shared/query-required.js";
export function createInstrumentFeature({
  inputController,
  instrumentState,
  onRenderKeyboard,
  root = document,
  voiceEngine,
}) {
  const lifecycle = new AbortController();
  const elements = {
    attack: queryRequired(root, "#attack"),
    attackValue: queryRequired(root, "#attack-value"),
    octaveDown: queryRequired(root, "#octave-down"),
    octaveUp: queryRequired(root, "#octave-up"),
    octaveValue: queryRequired(root, "#octave-value"),
    release: queryRequired(root, "#release"),
    releaseValue: queryRequired(root, "#release-value"),
    reset: queryRequired(root, "#reset-instrument"),
    voiceType: queryRequired(root, "#voice-type"),
    volume: queryRequired(root, "#volume"),
    volumeValue: queryRequired(root, "#volume-value"),
  };

  function render() {
    const config = instrumentState.getState();
    elements.voiceType.value = config.voiceType;
    elements.octaveValue.textContent = config.octaveOffset > 0
      ? `+${config.octaveOffset}`
      : String(config.octaveOffset);
    elements.octaveDown.disabled = config.octaveOffset <= -2;
    elements.octaveUp.disabled = config.octaveOffset >= 2;
    elements.volume.value = String(config.volume * 100);
    elements.volumeValue.value = `${Math.round(config.volume * 100)}%`;
    elements.attack.value = String(config.attackSeconds * 1000);
    elements.attackValue.value = `${Math.round(config.attackSeconds * 1000)} ms`;
    elements.release.value = String(config.releaseSeconds * 1000);
    elements.releaseValue.value = `${Math.round(config.releaseSeconds * 1000)} ms`;
    onRenderKeyboard?.();
  }

  elements.voiceType.addEventListener("change", () => {
    instrumentState.setVoiceType(elements.voiceType.value);
    elements.voiceType.blur();
  }, { signal: lifecycle.signal });
  elements.octaveDown.addEventListener("click", () => {
    instrumentState.setOctaveOffset(instrumentState.getState().octaveOffset - 1);
  }, { signal: lifecycle.signal });
  elements.octaveUp.addEventListener("click", () => {
    instrumentState.setOctaveOffset(instrumentState.getState().octaveOffset + 1);
  }, { signal: lifecycle.signal });
  elements.volume.addEventListener("input", () => {
    instrumentState.setVolume(Number(elements.volume.value) / 100);
  }, { signal: lifecycle.signal });
  elements.attack.addEventListener("input", () => {
    instrumentState.setAttackSeconds(Number(elements.attack.value) / 1000);
  }, { signal: lifecycle.signal });
  elements.release.addEventListener("input", () => {
    instrumentState.setReleaseSeconds(Number(elements.release.value) / 1000);
  }, { signal: lifecycle.signal });
  elements.reset.addEventListener("click", instrumentState.reset, { signal: lifecycle.signal });

  let previousConfig = instrumentState.getState();
  const handleStateChange = () => {
    const config = instrumentState.getState();
    voiceEngine.setVolume(config.volume);
    if (
      config.voiceType !== previousConfig.voiceType ||
      config.octaveOffset !== previousConfig.octaveOffset
    ) inputController.refreshActiveVoices();
    previousConfig = config;
    render();
  };
  instrumentState.addEventListener("change", handleStateChange, { signal: lifecycle.signal });

  voiceEngine.setVolume(instrumentState.getState().volume);

  return Object.freeze({
    dispose: () => lifecycle.abort(),
    render,
  });
}
