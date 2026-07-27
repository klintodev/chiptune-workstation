import { createPatternEditor } from "../../features/pattern-editor/pattern-editor.js";
import { getNoteName } from "../../music/note.js";
import { createPatternState } from "../../state/pattern-state.js";
import { defineStory } from "../story-registry.js";
import { createStoryRoot, disposeAll, queryStory } from "../story-helpers.js";

const MELODY = Object.freeze([
  { note: 60, gate: 0.75, volume: 0.72 },
  null,
  { note: 64, gate: 0.5, volume: 0.82 },
  null,
  { note: 67, gate: 1, volume: 0.92 },
  null,
  { note: 72, gate: 0.25, volume: 0.68 },
  null,
  { note: 67, gate: 0.75, volume: 0.78 },
  null,
  { note: 64, gate: 0.5, volume: 0.74 },
  null,
  { note: 62, gate: 0.75, volume: 0.8 },
  null,
  { note: 59, gate: 1, volume: 0.7 },
  null,
]);

const DENSE = Object.freeze(Array.from({ length: 16 }, (_, index) => ({
  note: [48, 55, 60, 63][index % 4] + (index >= 8 ? 12 : 0),
  gate: [0.25, 0.5, 0.75, 1][index % 4],
  volume: 0.55 + ((index % 5) * 0.1),
})));

function patternFixture() {
  return `
    <p class="story-note">This is the production pattern editor mounted against disposable in-memory state.</p>
    <section class="sequencer-section" aria-label="Pattern editor">
      <div class="pattern-toolbar">
        <span class="panel-context">Pattern</span>
        <label><span>Pattern</span><select><option>Workbench pattern</option></select></label>
        <label><span>Length</span><select><option>16</option></select></label>
        <output>1 local fixture</output>
      </div>
      <div class="pattern-commandbar">
        <span>Isolated feature</span>
        <div class="pattern-bank-controls" aria-label="Visible pattern steps">
          <button id="pattern-bank-previous" type="button" aria-label="Previous step bank">◀</button>
          <output id="pattern-bank-range">Steps 1–8 of 16</output>
          <button id="pattern-bank-next" type="button" aria-label="Next step bank">▶</button>
        </div>
        <span class="place-target">No project, transport, or audio dependencies</span>
      </div>
      <div class="pattern-workspace">
        <div class="pattern-grid-scroll"><div id="pattern-grid" class="pattern-grid"></div></div>
        <dialog id="selected-step-inspector" class="selected-step-inspector">
          <div class="selected-step-title">
            <span>Edit step</span>
            <strong id="selected-step-number">--</strong>
            <output id="selected-step-summary">Select a step</output>
            <button id="selected-step-close" type="button" aria-label="Close step editor">×</button>
          </div>
          <div class="pattern-note-picker">
            <span>Note</span>
            <button id="selected-note-down" type="button" aria-label="Lower note">◀</button>
            <output id="selected-pattern-note">C4</output>
            <button id="selected-note-up" type="button" aria-label="Raise note">▶</button>
            <button id="selected-step-add" type="button">Add C4</button>
            <label class="visually-hidden">
              <span>Pitch</span>
              <select id="pattern-pitch">
                <option value="0">C</option><option value="1">C♯</option>
                <option value="2">D</option><option value="3">D♯</option>
                <option value="4">E</option><option value="5">F</option>
                <option value="6">F♯</option><option value="7">G</option>
                <option value="8">G♯</option><option value="9">A</option>
                <option value="10">A♯</option><option value="11">B</option>
              </select>
            </label>
            <label class="visually-hidden">
              <span>Octave</span>
              <select id="pattern-octave">
                <option value="2">2</option><option value="3">3</option>
                <option value="4" selected>4</option><option value="5">5</option>
                <option value="6">6</option><option value="7">7</option>
                <option value="8">8</option>
              </select>
            </label>
            <label class="pattern-toggle"><input id="pattern-preview" type="checkbox" /> Preview</label>
          </div>
          <div id="selected-step-gate" class="selected-step-gate" role="radiogroup" aria-label="Gate length">
            <div class="selected-step-gate-heading"><span>Gate length</span><output>75%</output></div>
            <div class="selected-step-gate-options">
              <button type="button" role="radio" data-gate="0.25"><span>1/4</span><small>25%</small></button>
              <button type="button" role="radio" data-gate="0.5"><span>1/2</span><small>50%</small></button>
              <button type="button" role="radio" data-gate="0.75"><span>3/4</span><small>75%</small></button>
              <button type="button" role="radio" data-gate="1"><span>Full</span><small>100%</small></button>
            </div>
          </div>
          <label class="selected-step-volume">
            <span>Velocity</span>
            <input id="selected-step-volume" type="range" min="0" max="100" value="70" />
            <output id="selected-step-volume-value">70%</output>
          </label>
          <div class="selected-step-actions">
            <button id="selected-step-clear" type="button" disabled>Clear note</button>
            <button id="selected-step-done" type="button">Done</button>
          </div>
        </dialog>
        <div class="pattern-footer">
          <p id="pattern-selection-empty">Select a step to inspect it. Press Enter to add the chosen note.</p>
          <div id="pattern-selection-summary" hidden>
            <span><small>Selected</small><strong>Step <output id="pattern-summary-step">--</output></strong></span>
            <span><small>Note</small><output id="pattern-summary-note">Rest</output></span>
            <span><small>Gate</small><output id="pattern-summary-gate">--</output></span>
            <span><small>Vel</small><output id="pattern-summary-volume">--</output></span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function mountPatternEditor({ canvas, scenario }) {
  const root = createStoryRoot(canvas, { layout: "fill" });
  root.innerHTML = patternFixture();
  const patternState = createPatternState(scenario.steps);
  const editor = createPatternEditor({
    addButton: queryStory(root, "#selected-step-add"),
    bankNext: queryStory(root, "#pattern-bank-next"),
    bankPrevious: queryStory(root, "#pattern-bank-previous"),
    bankRange: queryStory(root, "#pattern-bank-range"),
    clearButton: queryStory(root, "#selected-step-clear"),
    closeButton: queryStory(root, "#selected-step-close"),
    doneButton: queryStory(root, "#selected-step-done"),
    gateControl: queryStory(root, "#selected-step-gate"),
    getNoteName,
    grid: queryStory(root, "#pattern-grid"),
    noteDownButton: queryStory(root, "#selected-note-down"),
    noteUpButton: queryStory(root, "#selected-note-up"),
    octaveSelect: queryStory(root, "#pattern-octave"),
    patternState,
    pitchSelect: queryStory(root, "#pattern-pitch"),
    previewInput: queryStory(root, "#pattern-preview"),
    selectedNoteOutput: queryStory(root, "#selected-pattern-note"),
    selectionEmpty: queryStory(root, "#pattern-selection-empty"),
    selectionSummary: queryStory(root, "#pattern-selection-summary"),
    stepNumberOutput: queryStory(root, "#selected-step-number"),
    stepSummaryOutput: queryStory(root, "#selected-step-summary"),
    summaryGate: queryStory(root, "#pattern-summary-gate"),
    summaryNote: queryStory(root, "#pattern-summary-note"),
    summaryStep: queryStory(root, "#pattern-summary-step"),
    summaryVolume: queryStory(root, "#pattern-summary-volume"),
    volumeInput: queryStory(root, "#selected-step-volume"),
    volumeOutput: queryStory(root, "#selected-step-volume-value"),
  });
  return disposeAll(editor, patternState);
}

export const patternEditorStory = defineStory({
  id: "pattern-editor",
  title: "Pattern editor",
  group: "Composition",
  description: "Inspect note, gate, velocity, selection, and keyboard behaviour without constructing the workstation.",
  source: "src/features/pattern-editor/pattern-editor.js",
  scenarios: [
    { id: "melody", title: "Melody", steps: MELODY },
    { id: "empty", title: "Empty", steps: Array(16).fill(null) },
    { id: "dense", title: "Dense sequence", steps: DENSE },
  ],
  mount: mountPatternEditor,
});
