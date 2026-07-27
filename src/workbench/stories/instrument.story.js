import { createInstrumentFeature } from "../../features/instrument/instrument.js";
import { createInstrumentState } from "../../state/instrument-state.js";
import { createProjectState } from "../../state/project-state.js";
import { defineStory } from "../story-registry.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";

function mountInstrument({ canvas, scenario }) {
  const root = createStoryRoot(canvas);
  root.innerHTML = `
    <p class="story-note">Production oscillator, envelope, octave, and output controls backed by local instrument state.</p>
    <section class="voice-lab story-feature-panel" aria-label="Instrument controls">
      <div class="device-rack-header">
        <span class="device-color" aria-hidden="true"></span>
        <span class="panel-context">Instrument</span>
        <h2><strong id="instrument-track-name">Pulse lead</strong></h2>
      </div>
      <div class="device-rack">
        <fieldset class="device device-oscillator">
          <legend>Sound shape (voice)</legend>
          <select id="voice-type" class="visually-hidden" aria-label="Voice">
            <option value="pulse12">Pulse 12.5%</option>
            <option value="pulse25">Pulse 25%</option>
            <option value="square">Pulse 50%</option>
            <option value="triangle">Triangle</option>
            <option value="sawtooth">Saw</option>
            <option value="noise">Noise</option>
          </select>
          <div id="voice-options" class="voice-options" role="radiogroup" aria-label="Voice">
            <button type="button" data-voice="pulse12">Pulse 12.5%</button>
            <button type="button" data-voice="pulse25">Pulse 25%</button>
            <button type="button" data-voice="square">Pulse 50%</button>
            <button type="button" data-voice="triangle">Triangle</button>
            <button type="button" data-voice="sawtooth">Saw</button>
            <button type="button" data-voice="noise">Noise</button>
          </div>
          <div class="octave-control">
            <span>Octave</span>
            <button id="octave-down" type="button" aria-label="Octave down">−</button>
            <strong id="octave-value">0</strong>
            <button id="octave-up" type="button" aria-label="Octave up">+</button>
          </div>
        </fieldset>
        <fieldset class="device device-envelope">
          <legend>Note shape</legend>
          <label>Fade-in (attack) <output id="attack-value" for="attack">8 ms</output><input id="attack" type="range" min="1" max="2000" step="1" /></label>
          <label>Tail (release) <output id="release-value" for="release">30 ms</output><input id="release" type="range" min="10" max="3000" step="10" /></label>
        </fieldset>
        <fieldset class="device device-output">
          <legend>Output</legend>
          <label>Volume <output id="volume-value" for="volume">35%</output><input id="volume" type="range" min="0" max="100" step="1" /></label>
          <button id="reset-instrument" type="button">Reset device</button>
        </fieldset>
      </div>
    </section>
  `;
  const instrumentState = createInstrumentState({
    attackSeconds: scenario.attackSeconds,
    octaveOffset: scenario.octaveOffset,
    releaseSeconds: scenario.releaseSeconds,
    voiceType: scenario.voiceType,
    volume: scenario.volume,
  });
  const projectState = createProjectState();
  const feature = createInstrumentFeature({
    getTrackName: () => scenario.trackName,
    inputController: { refreshActiveVoices() {} },
    instrumentState,
    projectState,
    root,
  });
  feature.render();
  return disposeAll(feature, instrumentState);
}

export const instrumentStory = defineStory({
  id: "instrument",
  title: "Instrument controls",
  group: "Instrument",
  description: "Inspect oscillator selection, envelope timing, octave boundaries, and output level with real controls.",
  source: "src/features/instrument/instrument.js",
  scenarios: [
    { id: "pulse-lead", title: "Pulse lead", trackName: "Pulse lead", voiceType: "pulse12", octaveOffset: 0, volume: 0.42, attackSeconds: 0.008, releaseSeconds: 0.08 },
    { id: "triangle-bass", title: "Triangle bass", trackName: "Triangle bass", voiceType: "triangle", octaveOffset: -1, volume: 0.58, attackSeconds: 0.02, releaseSeconds: 0.3 },
    { id: "noise-hit", title: "Noise hit", trackName: "Noise percussion", voiceType: "noise", octaveOffset: 0, volume: 0.32, attackSeconds: 0.001, releaseSeconds: 0.04 },
    { id: "upper-limit", title: "Upper octave limit", trackName: "Tiny sparkle", voiceType: "square", octaveOffset: 2, volume: 0.25, attackSeconds: 0.005, releaseSeconds: 0.12 },
  ],
  mount: mountInstrument,
});
