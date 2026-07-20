import { queryRequired } from "../../shared/query-required.js";

export function createInstrumentFeature({
  getTrackName = () => "Selected track",
  inputController,
  instrumentState,
  onRenderKeyboard,
  projectState,
  root = document,
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
    trackName: queryRequired(root, "#instrument-track-name"),
    voiceType: queryRequired(root, "#voice-type"),
    volume: queryRequired(root, "#volume"),
    volumeValue: queryRequired(root, "#volume-value"),
    voiceOptions: [...root.querySelectorAll("#voice-options [data-voice]")],
  };

  function render() {
    const config = instrumentState.getState();
    elements.trackName.textContent = getTrackName();
    elements.voiceType.value = config.voiceType;
    for (const button of elements.voiceOptions) {
      const selected = button.dataset.voice === config.voiceType;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    elements.octaveValue.textContent = config.octaveOffset > 0 ? `+${config.octaveOffset}` : String(config.octaveOffset);
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

  function selectVoice(voiceType) {
    instrumentState.setVoiceType(voiceType);
    elements.voiceType.value = voiceType;
  }

  elements.voiceType.addEventListener("change", () => {
    selectVoice(elements.voiceType.value);
    elements.voiceType.blur();
  }, { signal: lifecycle.signal });
  for (const button of elements.voiceOptions) {
    button.addEventListener("click", () => selectVoice(button.dataset.voice), { signal: lifecycle.signal });
  }
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

  const groupedInputs = [elements.volume, elements.attack, elements.release];
  const beginGroup = () => projectState?.beginHistoryGroup();
  const endGroup = () => projectState?.endHistoryGroup();
  for (const input of groupedInputs) {
    input.addEventListener("pointerdown", beginGroup, { signal: lifecycle.signal });
    input.addEventListener("pointerup", endGroup, { signal: lifecycle.signal });
    input.addEventListener("pointercancel", endGroup, { signal: lifecycle.signal });
    input.addEventListener("change", endGroup, { signal: lifecycle.signal });
  }

  let previousConfig = instrumentState.getState();
  const handleStateChange = () => {
    const config = instrumentState.getState();
    if (config.voiceType !== previousConfig.voiceType || config.octaveOffset !== previousConfig.octaveOffset) {
      inputController.refreshActiveVoices();
    }
    previousConfig = config;
    render();
  };
  instrumentState.addEventListener("change", handleStateChange, { signal: lifecycle.signal });

  return Object.freeze({ dispose: () => lifecycle.abort(), render });
}
