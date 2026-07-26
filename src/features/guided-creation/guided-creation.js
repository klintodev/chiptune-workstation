import { createRecipePreview } from "../../music/recipe.js";
import {
  SCALE_IDS,
  SCALE_NAMES,
} from "../../music/scale.js";
import { createVariationPreview } from "../../music/variation.js";

const TONIC_NAMES = Object.freeze([
  "C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B",
]);

function randomSeed() {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(values);
  return values[0] || Math.floor(Math.random() * 0x1_0000_0000);
}

function firstPatternNote(pattern, fallback) {
  return pattern.steps.find((step) => step !== null)?.note ?? fallback;
}

function countChanged(before, after) {
  return before.reduce((count, step, index) => (
    JSON.stringify(step) === JSON.stringify(after[index]) ? count : count + 1
  ), 0);
}

function createRecipe(tool, pattern) {
  if (tool === "arpeggio") {
    return {
      version: 1,
      id: "guided-major-rise",
      name: "Major chord rise",
      type: "arpeggio",
      scaleDegree: 1,
      quality: "major",
      direction: "up-down",
      octaveSpan: 1,
      rate: 2,
      rootMidi: firstPatternNote(pattern, 60),
      gate: 0.5,
      volume: 0.75,
    };
  }
  return {
    version: 1,
    id: "guided-steady-pulse",
    name: "Steady pulse",
    type: "rhythm",
    note: firstPatternNote(pattern, 48),
    density: 0.5,
    accentEvery: 4,
    gate: 0.5,
    volume: 0.7,
  };
}

export function createGuidedCreationFeature({
  checkpointService,
  entryController,
  getSelectedPatternId,
  onBeforeProjectReplace = () => {},
  projectState,
  root = document,
  sessionState,
} = {}) {
  if (!checkpointService || !entryController || !getSelectedPatternId || !projectState || !sessionState) {
    throw new TypeError("Guided creation requires project, selection, scale-entry, and checkpoint services.");
  }
  const lifecycle = new AbortController();
  let busy = false;
  let checkpointGeneration = 0;
  let pendingCheckpointId = null;
  let preview = null;

  const open = root.createElement("button");
  open.id = "guided-creation-open";
  open.type = "button";
  open.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 19 10-10M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3ZM6 13l.7 2.3L9 16l-2.3.7L6 19l-.7-2.3L3 16l2.3-.7L6 13Z"/></svg><span class="visually-hidden">Open guided creation</span>`;
  open.setAttribute("aria-label", "Open guided creation");
  open.title = "Scale guide, recipes, variations, and checkpoints";
  root.querySelector("#global-tools")?.append(open);

  const template = root.createElement("template");
  template.innerHTML = `
    <dialog class="guided-dialog" aria-labelledby="guided-title">
      <div class="guided-panel">
        <header>
          <div><span class="panel-context">Optional composition tools</span><h2 id="guided-title">Guided creation</h2></div>
          <button type="button" data-close aria-label="Close guided creation">&times;</button>
        </header>
        <p class="guided-intro">Use a scale as a guide, try a reversible pattern idea, or save a local checkpoint before experimenting.</p>
        <section aria-labelledby="scale-guide-title">
          <div class="guided-section-heading"><div><span class="panel-context">Harmonic guide</span><h3 id="scale-guide-title">Key and scale</h3></div><output data-scale-summary></output></div>
          <div class="guided-scale-controls">
            <label><span>Tonic</span><select data-tonic></select></label>
            <label><span>Scale</span><select data-scale></select></label>
            <label class="guided-check"><input data-lock type="checkbox" /><span><strong>Scale lock</strong><small>Snap only new notes to the nearest scale tone.</small></span></label>
            <button type="button" data-bypass>Bypass next note</button>
          </div>
          <p class="guided-help">Tonic notes are marked <strong>T</strong>; other scale tones have a dot. Existing outside notes stay unchanged and are marked <strong>△</strong>.</p>
        </section>
        <section aria-labelledby="pattern-ideas-title">
          <div class="guided-section-heading"><div><span class="panel-context">Preview before apply</span><h3 id="pattern-ideas-title">Pattern ideas</h3></div><output data-pattern-name></output></div>
          <div class="guided-idea-controls">
            <label><span>Idea</span><select data-tool><option value="arpeggio">Major chord rise</option><option value="rhythm">Steady pulse</option><option value="variation">Constrained variation</option></select></label>
            <fieldset data-scopes hidden><legend>Variation can change</legend>
              <label><input type="checkbox" value="pitch" checked /> Pitch</label>
              <label><input type="checkbox" value="octave" /> Octave</label>
              <label><input type="checkbox" value="rhythm" /> Rhythm</label>
              <label><input type="checkbox" value="velocity" checked /> Velocity</label>
              <label><input type="checkbox" value="gate" /> Gate</label>
            </fieldset>
            <label class="guided-check"><input data-duplicate type="checkbox" /><span><strong>Apply to a copy</strong><small>Keep this pattern and create a new variation.</small></span></label>
            <button class="safe-action" type="button" data-preview>Preview idea</button>
          </div>
          <details class="guided-variation-bounds" data-bounds hidden>
            <summary>Variation boundaries</summary>
            <div>
              <label>Lowest note (48 = C3)<input data-min-note type="number" min="36" max="112" value="48" /></label>
              <label>Highest note (84 = C6)<input data-max-note type="number" min="36" max="112" value="84" /></label>
              <label>Maximum leap<input data-max-leap type="number" min="0" max="24" value="7" /></label>
              <label>Note density<input data-density type="range" min="0" max="100" value="65" /><output data-density-output>65%</output></label>
              <label>Minimum velocity<input data-min-velocity type="range" min="0" max="100" value="50" /></label>
              <label>Maximum velocity<input data-max-velocity type="range" min="0" max="100" value="90" /></label>
              <fieldset data-gates><legend>Allowed gates</legend><label><input type="checkbox" value="0.25" /> ¼</label><label><input type="checkbox" value="0.5" checked /> ½</label><label><input type="checkbox" value="0.75" checked /> ¾</label><label><input type="checkbox" value="1" /> Full</label></fieldset>
              <label class="guided-check"><input data-stay-scale type="checkbox" checked /><span><strong>Stay in scale</strong><small>Use the project guide for varied pitches.</small></span></label>
            </div>
          </details>
          <div class="guided-preview" data-preview-panel hidden>
            <div><span class="panel-context">Candidate only — project unchanged</span><strong data-preview-title></strong><p data-preview-summary></p></div>
            <div><button type="button" data-cancel>Cancel</button><button type="button" data-another hidden>Try another</button><button class="safe-action" type="button" data-apply>Apply as one undo step</button></div>
          </div>
        </section>
        <section aria-labelledby="checkpoint-title">
          <div class="guided-section-heading"><div><span class="panel-context">Stored on this device</span><h3 id="checkpoint-title">Checkpoints</h3></div><output data-checkpoint-count></output></div>
          <p class="guided-help">A checkpoint is an immutable copy of this project version. It is separate from project downloads and cloud sync.</p>
          <div class="guided-checkpoint-create"><label><span>Optional name</span><input data-checkpoint-label maxlength="64" placeholder="Before changing the bass" /></label><button type="button" data-checkpoint-create>Save checkpoint</button></div>
          <div class="guided-checkpoint-list" data-checkpoint-list></div>
        </section>
        <p class="guided-message" data-message role="status" aria-live="polite"></p>
      </div>
    </dialog>
    <dialog class="guided-restore-dialog" aria-labelledby="guided-restore-title">
      <div class="guided-restore-panel">
        <span class="panel-context">Restore safely</span>
        <h2 id="guided-restore-title">Restore this checkpoint as new work?</h2>
        <p>Your current version will first be saved as a recovery checkpoint. The historical checkpoint will remain unchanged.</p>
        <div><button type="button" data-restore-cancel>Keep current work</button><button class="safe-action" type="button" data-restore-confirm>Save recovery and restore</button></div>
      </div>
    </dialog>`;
  const dialog = template.content.querySelector(".guided-dialog");
  const restoreDialog = template.content.querySelector(".guided-restore-dialog");
  root.body.append(dialog, restoreDialog);
  const elements = {
    another: dialog.querySelector("[data-another]"),
    apply: dialog.querySelector("[data-apply]"),
    bounds: dialog.querySelector("[data-bounds]"),
    bypass: dialog.querySelector("[data-bypass]"),
    cancel: dialog.querySelector("[data-cancel]"),
    checkpointCount: dialog.querySelector("[data-checkpoint-count]"),
    checkpointCreate: dialog.querySelector("[data-checkpoint-create]"),
    checkpointLabel: dialog.querySelector("[data-checkpoint-label]"),
    checkpointList: dialog.querySelector("[data-checkpoint-list]"),
    close: dialog.querySelector("[data-close]"),
    density: dialog.querySelector("[data-density]"),
    densityOutput: dialog.querySelector("[data-density-output]"),
    duplicate: dialog.querySelector("[data-duplicate]"),
    gates: dialog.querySelector("[data-gates]"),
    lock: dialog.querySelector("[data-lock]"),
    maximumLeap: dialog.querySelector("[data-max-leap]"),
    maximumNote: dialog.querySelector("[data-max-note]"),
    maximumVelocity: dialog.querySelector("[data-max-velocity]"),
    message: dialog.querySelector("[data-message]"),
    minimumNote: dialog.querySelector("[data-min-note]"),
    minimumVelocity: dialog.querySelector("[data-min-velocity]"),
    patternName: dialog.querySelector("[data-pattern-name]"),
    preview: dialog.querySelector("[data-preview]"),
    previewPanel: dialog.querySelector("[data-preview-panel]"),
    previewSummary: dialog.querySelector("[data-preview-summary]"),
    previewTitle: dialog.querySelector("[data-preview-title]"),
    restoreCancel: restoreDialog.querySelector("[data-restore-cancel]"),
    restoreConfirm: restoreDialog.querySelector("[data-restore-confirm]"),
    scale: dialog.querySelector("[data-scale]"),
    scaleSummary: dialog.querySelector("[data-scale-summary]"),
    scopes: dialog.querySelector("[data-scopes]"),
    stayInScale: dialog.querySelector("[data-stay-scale]"),
    tonic: dialog.querySelector("[data-tonic]"),
    tool: dialog.querySelector("[data-tool]"),
  };

  elements.tonic.append(...TONIC_NAMES.map((name, tonic) => {
    const option = root.createElement("option");
    option.value = String(tonic);
    option.textContent = name;
    return option;
  }));
  elements.scale.append(...SCALE_IDS.map((scale) => {
    const option = root.createElement("option");
    option.value = scale;
    option.textContent = SCALE_NAMES[scale];
    return option;
  }));

  function showMessage(message = "", { error = false } = {}) {
    elements.message.textContent = message;
    elements.message.classList.toggle("error", error);
  }

  function getPattern() {
    return projectState.getPattern(getSelectedPatternId());
  }

  function clearPreview() {
    preview = null;
    elements.previewPanel.hidden = true;
  }

  function renderPreview() {
    elements.previewPanel.hidden = !preview;
    if (!preview) return;
    const changed = countChanged(preview.sourceSteps, preview.candidate.steps);
    elements.previewTitle.textContent = preview.title;
    elements.previewSummary.textContent = `${changed} of ${preview.sourceSteps.length} steps change in “${preview.patternName}” (steps 1–${preview.sourceSteps.length}). Result stays ${preview.candidate.steps.length} steps.${preview.seed === undefined ? "" : ` Seed ${preview.seed}.`}`;
    elements.another.hidden = preview.kind !== "variation";
  }

  function renderGuide() {
    const guide = projectState.getState().scaleGuide;
    const bypass = entryController.getState().bypassArmed;
    elements.tonic.value = String(guide.tonic);
    elements.scale.value = guide.scale;
    elements.lock.checked = guide.lock;
    elements.bypass.disabled = !guide.lock;
    elements.bypass.textContent = bypass ? "Next note can be outside scale" : "Bypass next note";
    elements.bypass.setAttribute("aria-pressed", String(bypass));
    open.dataset.bypassArmed = String(bypass);
    open.title = bypass
      ? "Scale lock bypass is armed for the next new note"
      : "Scale guide, recipes, variations, and checkpoints";
    elements.scaleSummary.value = `${TONIC_NAMES[guide.tonic]} ${SCALE_NAMES[guide.scale]}${guide.lock ? " · locked" : ""}`;
  }

  function renderPattern() {
    const pattern = getPattern();
    elements.patternName.value = `${pattern.name} · ${pattern.steps.length} steps`;
    elements.scopes.hidden = elements.tool.value !== "variation";
    elements.bounds.hidden = elements.tool.value !== "variation";
    renderPreview();
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    for (const control of dialog.querySelectorAll("button, input, select")) control.disabled = nextBusy;
    elements.close.disabled = false;
    if (!nextBusy) renderGuide();
  }

  async function renderCheckpoints() {
    const generation = ++checkpointGeneration;
    try {
      const records = await checkpointService.list();
      if (generation !== checkpointGeneration) return;
      elements.checkpointCount.value = `${records.length} of 20 saved`;
      if (records.length === 0) {
        const empty = root.createElement("p");
        empty.className = "guided-checkpoint-empty";
        empty.textContent = "No checkpoints yet.";
        elements.checkpointList.replaceChildren(empty);
        return;
      }
      elements.checkpointList.replaceChildren(...records.map((record) => {
        const row = root.createElement("div");
        const description = root.createElement("div");
        const title = root.createElement("strong");
        const meta = root.createElement("span");
        const restore = root.createElement("button");
        row.className = "guided-checkpoint-row";
        title.textContent = record.label || `${record.operation[0].toUpperCase()}${record.operation.slice(1)} checkpoint`;
        meta.textContent = `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(record.createdAt))} · revision ${record.sourceProjectRevision}`;
        description.append(title, meta);
        restore.type = "button";
        restore.dataset.checkpointId = record.checkpointId;
        restore.textContent = "Restore";
        restore.setAttribute("aria-label", `Restore ${title.textContent}`);
        row.append(description, restore);
        return row;
      }));
    } catch (error) {
      showMessage(`Checkpoints could not be loaded. ${error.message}`, { error: true });
    }
  }

  function createCandidate({ another = false } = {}) {
    try {
      const pattern = getPattern();
      const guide = projectState.getState().scaleGuide;
      const sourceSteps = structuredClone(pattern.steps);
      if (elements.tool.value === "variation") {
        const scopes = [...elements.scopes.querySelectorAll("input:checked")].map(({ value }) => value);
        if (pattern.steps.every((step) => step === null) && !scopes.includes("rhythm")) {
          throw new Error("This pattern is empty. Include Rhythm so the variation can create notes.");
        }
        const selectedGates = [...elements.gates.querySelectorAll("input:checked")]
          .map(({ value }) => Number(value));
        const seed = another || preview?.kind !== "variation" ? randomSeed() : preview.seed;
        const candidate = createVariationPreview({
          guide: elements.stayInScale.checked ? guide : undefined,
          options: {
            scopes,
            minimumNote: Number(elements.minimumNote.value),
            maximumNote: Number(elements.maximumNote.value),
            maximumLeap: Number(elements.maximumLeap.value),
            density: Number(elements.density.value) / 100,
            minimumVelocity: Number(elements.minimumVelocity.value) / 100,
            maximumVelocity: Number(elements.maximumVelocity.value) / 100,
            gates: scopes.includes("gate") ? selectedGates : undefined,
            octaveShifts: [-1, 0, 1],
            stayInScale: elements.stayInScale.checked,
          },
          pattern,
          seed,
        });
        preview = {
          candidate,
          kind: "variation",
          patternId: pattern.id,
          patternName: pattern.name,
          seed,
          sourceSteps,
          sourceSignature: JSON.stringify(pattern.steps),
          title: "Constrained variation",
        };
      } else {
        const recipe = createRecipe(elements.tool.value, pattern);
        const candidate = createRecipePreview({ guide, pattern, recipe });
        preview = {
          candidate,
          kind: "recipe",
          patternId: pattern.id,
          patternName: pattern.name,
          sourceSteps,
          sourceSignature: JSON.stringify(pattern.steps),
          title: recipe.name,
        };
      }
      showMessage("Preview ready. Your project has not changed.");
      renderPreview();
    } catch (error) {
      clearPreview();
      showMessage(error.message, { error: true });
    }
  }

  async function run(action, success) {
    if (busy) return;
    setBusy(true);
    showMessage("");
    try {
      await action();
      showMessage(success);
      await renderCheckpoints();
    } catch (error) {
      showMessage(error.message || "The guided action could not be completed.", { error: true });
    } finally {
      setBusy(false);
      renderPattern();
    }
  }

  function updateGuide(values) {
    try {
      projectState.setScaleGuide(values);
      entryController.cancelBypass();
      clearPreview();
      showMessage("Scale guide updated. Existing notes were not changed.");
      renderGuide();
      renderPattern();
    } catch (error) {
      showMessage(error.message, { error: true });
      renderGuide();
    }
  }

  open.addEventListener("click", () => {
    showMessage("");
    clearPreview();
    renderGuide();
    renderPattern();
    void renderCheckpoints();
    dialog.showModal();
  }, { signal: lifecycle.signal });
  elements.close.addEventListener("click", () => dialog.close(), { signal: lifecycle.signal });
  dialog.addEventListener("cancel", () => dialog.close(), { signal: lifecycle.signal });
  elements.tonic.addEventListener("change", () => updateGuide({ tonic: Number(elements.tonic.value) }), { signal: lifecycle.signal });
  elements.scale.addEventListener("change", () => updateGuide({ scale: elements.scale.value }), { signal: lifecycle.signal });
  elements.lock.addEventListener("change", () => updateGuide({ lock: elements.lock.checked }), { signal: lifecycle.signal });
  elements.bypass.addEventListener("click", () => {
    if (entryController.getState().bypassArmed) entryController.cancelBypass();
    else entryController.armBypass();
    showMessage(entryController.getState().bypassArmed
      ? "Scale lock will be bypassed for the next new note only."
      : "One-note bypass cancelled.");
    renderGuide();
  }, { signal: lifecycle.signal });
  elements.tool.addEventListener("change", () => {
    clearPreview();
    renderPattern();
  }, { signal: lifecycle.signal });
  elements.density.addEventListener("input", () => {
    elements.densityOutput.value = `${elements.density.value}%`;
  }, { signal: lifecycle.signal });
  const discardChangedVariationPreview = () => {
    if (!preview) return;
    clearPreview();
    showMessage("Variation settings changed. Preview a new candidate before applying.");
  };
  elements.scopes.addEventListener("change", discardChangedVariationPreview, { signal: lifecycle.signal });
  elements.bounds.addEventListener("change", discardChangedVariationPreview, { signal: lifecycle.signal });
  elements.preview.addEventListener("click", () => createCandidate(), { signal: lifecycle.signal });
  elements.another.addEventListener("click", () => createCandidate({ another: true }), { signal: lifecycle.signal });
  elements.cancel.addEventListener("click", () => {
    clearPreview();
    showMessage("Preview discarded. Your project was not changed.");
  }, { signal: lifecycle.signal });
  elements.apply.addEventListener("click", () => {
    if (!preview) return;
    try {
      const current = projectState.getPattern(preview.patternId);
      if (JSON.stringify(current.steps) !== preview.sourceSignature) {
        throw new Error("This pattern changed after the preview. Preview the idea again.");
      }
      const patternId = projectState.applyPatternTransform(
        preview.patternId,
        preview.candidate.steps,
        {
          duplicate: elements.duplicate.checked,
          operation: preview.kind === "variation" ? "apply-random-variation" : "apply-recipe",
        },
      );
      if (elements.duplicate.checked) sessionState.setWorkspace({ selectedPatternId: patternId });
      clearPreview();
      showMessage("Idea applied as one undoable project change.");
      renderPattern();
    } catch (error) {
      showMessage(error.message, { error: true });
    }
  }, { signal: lifecycle.signal });
  elements.checkpointCreate.addEventListener("click", () => void run(async () => {
    await checkpointService.createCheckpoint(elements.checkpointLabel.value, "manual");
    elements.checkpointLabel.value = "";
  }, "Checkpoint saved on this device."), { signal: lifecycle.signal });
  elements.checkpointList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-checkpoint-id]");
    if (!button || busy) return;
    pendingCheckpointId = button.dataset.checkpointId;
    dialog.close();
    restoreDialog.showModal();
    elements.restoreCancel.focus();
  }, { signal: lifecycle.signal });
  elements.restoreCancel.addEventListener("click", () => {
    pendingCheckpointId = null;
    restoreDialog.close();
    dialog.showModal();
  }, { signal: lifecycle.signal });
  restoreDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    elements.restoreCancel.click();
  }, { signal: lifecycle.signal });
  elements.restoreConfirm.addEventListener("click", () => {
    if (!pendingCheckpointId || busy) return;
    const checkpointId = pendingCheckpointId;
    pendingCheckpointId = null;
    restoreDialog.close();
    dialog.showModal();
    void run(async () => {
      onBeforeProjectReplace();
      await checkpointService.restore(checkpointId);
      clearPreview();
    }, "Checkpoint restored as a new working revision. A recovery checkpoint was saved first.");
  }, { signal: lifecycle.signal });

  const handleProjectChange = (event) => {
    if (event.detail.field === "scaleGuide" || event.detail.projectId) {
      entryController.cancelBypass();
      renderGuide();
    }
    if (dialog.open) renderPattern();
  };
  projectState.addEventListener("change", handleProjectChange, { signal: lifecycle.signal });
  entryController.addEventListener("change", renderGuide, { signal: lifecycle.signal });

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      open.remove();
      dialog.remove();
      restoreDialog.remove();
    },
  });
}
