import { createRecipePreview } from "../../music/recipe.js";
import {
  SCALE_IDS,
  SCALE_NAMES,
} from "../../music/scale.js";
import { listStarterRecipes } from "../../music/starter-recipe.js";
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

function createRecipe(tool, pattern, controls) {
  if (tool === "arpeggio") {
    return {
      version: 1,
      id: "guided-major-rise",
      name: "Major chord rise",
      type: "arpeggio",
      scaleDegree: 1,
      quality: "major",
      direction: controls.arpeggioDirection.value,
      octaveSpan: Number(controls.arpeggioOctaves.value),
      rate: Number(controls.arpeggioRate.value),
      rootMidi: firstPatternNote(pattern, 60),
      gate: Number(controls.recipeGate.value),
      volume: Number(controls.recipeVelocity.value) / 100,
    };
  }
  return {
    version: 1,
    id: "guided-steady-pulse",
    name: "Steady pulse",
    type: "rhythm",
    note: firstPatternNote(pattern, 48),
    density: Number(controls.rhythmDensity.value) / 100,
    accentEvery: Number(controls.rhythmAccent.value),
    gate: Number(controls.recipeGate.value),
    volume: Number(controls.recipeVelocity.value) / 100,
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
  starterService,
} = {}) {
  if (
    !checkpointService
    || !entryController
    || !getSelectedPatternId
    || !projectState
    || !sessionState
    || !starterService
  ) {
    throw new TypeError("Guided creation requires project, selection, scale-entry, and checkpoint services.");
  }
  const lifecycle = new AbortController();
  let busy = false;
  let checkpointGeneration = 0;
  let pendingCheckpointId = null;
  let preview = null;
  let secondaryDialogOpen = false;
  let starterPreview = null;

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
          <details class="guided-recipe-controls" data-recipe-controls open>
            <summary>Recipe boundaries</summary>
            <div>
              <label>First affected step<input data-recipe-start type="number" min="1" value="1" /></label>
              <label>Last affected step<input data-recipe-end type="number" min="1" value="16" /></label>
              <label data-arpeggio-control>Rate<select data-arpeggio-rate><option value="1">Every step</option><option value="2" selected>Every 2 steps</option><option value="4">Every 4 steps</option></select></label>
              <label data-arpeggio-control>Direction<select data-arpeggio-direction><option value="up">Up</option><option value="down">Down</option><option value="up-down" selected>Up then down</option></select></label>
              <label data-arpeggio-control>Octave span<select data-arpeggio-octaves><option value="1">1 octave</option><option value="2">2 octaves</option><option value="3">3 octaves</option></select></label>
              <label data-rhythm-control hidden>Note density<input data-rhythm-density type="range" min="0" max="100" value="50" /><output data-rhythm-density-output>50%</output></label>
              <label data-rhythm-control hidden>Accent every<input data-rhythm-accent type="number" min="1" max="16" value="4" /></label>
              <label>Gate<select data-recipe-gate><option value="0.25">¼ step</option><option value="0.5" selected>½ step</option><option value="0.75">¾ step</option><option value="1">Full step</option></select></label>
              <label>Velocity<input data-recipe-velocity type="range" min="0" max="100" value="75" /><output data-recipe-velocity-output>75%</output></label>
            </div>
          </details>
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
        <section aria-labelledby="starter-title">
          <div class="guided-section-heading"><div><span class="panel-context">Reusable versioned structures</span><h3 id="starter-title">Style starters</h3></div><output>Library v1</output></div>
          <p class="guided-help">These are editable musical building blocks, not another tutorial. Preview everything before choosing where it goes.</p>
          <div class="guided-starter-controls">
            <label><span>Starter</span><select data-starter-recipe></select></label>
            <fieldset data-starter-destination><legend>Destination</legend>
              <label><input type="radio" name="starter-destination" value="new" checked /> New project</label>
              <label><input type="radio" name="starter-destination" value="add" /> Add compatible content</label>
              <label><input type="radio" name="starter-destination" value="replace" /> Replace current project</label>
            </fieldset>
            <button class="safe-action" type="button" data-starter-preview>Preview starter</button>
          </div>
          <div class="guided-starter-preview" data-starter-panel hidden>
            <div class="guided-starter-summary"><span class="panel-context">Proposal only — project unchanged</span><strong data-starter-title></strong><p data-starter-description></p><p data-starter-destination-summary></p></div>
            <dl data-starter-facts></dl>
            <div class="guided-starter-sections" data-starter-sections aria-label="Proposed arrangement sections"></div>
            <div class="guided-starter-actions"><button type="button" data-starter-cancel>Cancel</button><button class="safe-action" type="button" data-starter-apply>Apply starter</button></div>
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
    </dialog>
    <dialog class="guided-starter-replace-dialog" aria-labelledby="guided-starter-replace-title">
      <div class="guided-restore-panel">
        <span class="panel-context">Protected replacement</span>
        <h2 id="guided-starter-replace-title">Replace this working project?</h2>
        <p data-starter-replace-copy></p>
        <div><button type="button" data-starter-replace-cancel>Keep current project</button><button class="safe-action" type="button" data-starter-replace-confirm>Save recovery and replace</button></div>
      </div>
    </dialog>`;
  const dialog = template.content.querySelector(".guided-dialog");
  const restoreDialog = template.content.querySelector(".guided-restore-dialog");
  const starterReplaceDialog = template.content.querySelector(".guided-starter-replace-dialog");
  root.body.append(dialog, restoreDialog, starterReplaceDialog);
  const elements = {
    another: dialog.querySelector("[data-another]"),
    apply: dialog.querySelector("[data-apply]"),
    arpeggioControls: [...dialog.querySelectorAll("[data-arpeggio-control]")],
    arpeggioDirection: dialog.querySelector("[data-arpeggio-direction]"),
    arpeggioOctaves: dialog.querySelector("[data-arpeggio-octaves]"),
    arpeggioRate: dialog.querySelector("[data-arpeggio-rate]"),
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
    recipeControls: dialog.querySelector("[data-recipe-controls]"),
    recipeEnd: dialog.querySelector("[data-recipe-end]"),
    recipeGate: dialog.querySelector("[data-recipe-gate]"),
    recipeStart: dialog.querySelector("[data-recipe-start]"),
    recipeVelocity: dialog.querySelector("[data-recipe-velocity]"),
    recipeVelocityOutput: dialog.querySelector("[data-recipe-velocity-output]"),
    restoreCancel: restoreDialog.querySelector("[data-restore-cancel]"),
    restoreConfirm: restoreDialog.querySelector("[data-restore-confirm]"),
    rhythmAccent: dialog.querySelector("[data-rhythm-accent]"),
    rhythmControls: [...dialog.querySelectorAll("[data-rhythm-control]")],
    rhythmDensity: dialog.querySelector("[data-rhythm-density]"),
    rhythmDensityOutput: dialog.querySelector("[data-rhythm-density-output]"),
    scale: dialog.querySelector("[data-scale]"),
    scaleSummary: dialog.querySelector("[data-scale-summary]"),
    scopes: dialog.querySelector("[data-scopes]"),
    stayInScale: dialog.querySelector("[data-stay-scale]"),
    starterApply: dialog.querySelector("[data-starter-apply]"),
    starterCancel: dialog.querySelector("[data-starter-cancel]"),
    starterDescription: dialog.querySelector("[data-starter-description]"),
    starterDestination: dialog.querySelector("[data-starter-destination]"),
    starterDestinationSummary: dialog.querySelector("[data-starter-destination-summary]"),
    starterFacts: dialog.querySelector("[data-starter-facts]"),
    starterPanel: dialog.querySelector("[data-starter-panel]"),
    starterPreview: dialog.querySelector("[data-starter-preview]"),
    starterRecipe: dialog.querySelector("[data-starter-recipe]"),
    starterReplaceCancel: starterReplaceDialog.querySelector("[data-starter-replace-cancel]"),
    starterReplaceConfirm: starterReplaceDialog.querySelector("[data-starter-replace-confirm]"),
    starterReplaceCopy: starterReplaceDialog.querySelector("[data-starter-replace-copy]"),
    starterSections: dialog.querySelector("[data-starter-sections]"),
    starterTitle: dialog.querySelector("[data-starter-title]"),
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
  elements.starterRecipe.append(...listStarterRecipes().map((recipe) => {
    const option = root.createElement("option");
    option.value = recipe.id;
    option.textContent = `${recipe.name} · v${recipe.recipeVersion}`;
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

  function clearStarterPreview() {
    starterPreview = null;
    elements.starterPanel.hidden = true;
  }

  function renderPreview() {
    elements.previewPanel.hidden = !preview;
    if (!preview) return;
    const changed = countChanged(preview.sourceSteps, preview.candidate.steps);
    const startStep = preview.candidate.startStep + 1;
    const endStep = preview.candidate.endStep;
    const notesToReplace = preview.candidate.replaced
      ? preview.candidate.replaced.filter(Boolean).length
      : preview.sourceSteps.slice(preview.candidate.startStep, preview.candidate.endStep).filter(Boolean).length;
    elements.previewTitle.textContent = preview.title;
    elements.previewSummary.textContent = `${changed} steps change in “${preview.patternName}” across steps ${startStep}–${endStep}. ${notesToReplace} existing note${notesToReplace === 1 ? "" : "s"} will be replaced; resulting length ${preview.candidate.resultingLength ?? preview.candidate.steps.length} steps.${preview.seed === undefined ? "" : ` Seed ${preview.seed}.`}`;
    elements.another.hidden = preview.kind !== "variation";
  }

  function renderStarterPreview() {
    elements.starterPanel.hidden = !starterPreview;
    if (!starterPreview) return;
    const { proposal, recipe } = starterPreview;
    const destinationCopy = {
      new: "Creates and opens a separate local project. Your current project stays in the library.",
      add: "Adds these tracks and patterns to the current project as one undoable change. Current tempo and scale stay unchanged.",
      replace: "Replaces the working document only after a recovery checkpoint is saved successfully.",
    };
    elements.starterTitle.textContent = `${recipe.name} · recipe v${recipe.recipeVersion}`;
    elements.starterDescription.textContent = recipe.description;
    elements.starterDestinationSummary.textContent = destinationCopy[starterPreview.destination];
    const facts = [
      ["Tracks", proposal.tracks.map(({ name, instrument }) => `${name} (${instrument})`).join(", ")],
      ["Patterns", proposal.patterns.map(({ name, length }) => `${name} (${length} steps)`).join(", ")],
      ["Tempo", `${proposal.tempo} BPM${starterPreview.destination === "add" ? " proposed; current tempo retained" : ""}`],
      ["Scale", `${TONIC_NAMES[proposal.scaleGuide.tonic]} ${SCALE_NAMES[proposal.scaleGuide.scale]}${proposal.scaleGuide.lock ? " with Scale lock" : ""}${starterPreview.destination === "add" ? " proposed; current guide retained" : ""}`],
    ];
    elements.starterFacts.replaceChildren(...facts.flatMap(([term, description]) => {
      const dt = root.createElement("dt");
      const dd = root.createElement("dd");
      dt.textContent = term;
      dd.textContent = description;
      return [dt, dd];
    }));
    elements.starterSections.replaceChildren(...proposal.sections.map((section) => {
      const item = root.createElement("span");
      item.textContent = `${section.name} · steps ${section.startStep + 1}–${section.endStep}`;
      return item;
    }));
    elements.starterApply.textContent = starterPreview.destination === "replace"
      ? "Review protected replacement"
      : starterPreview.destination === "add"
        ? "Add as one undo step"
        : "Create separate project";
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
    const variation = elements.tool.value === "variation";
    const rhythm = elements.tool.value === "rhythm";
    elements.scopes.hidden = !variation;
    elements.bounds.hidden = !variation;
    elements.recipeControls.hidden = variation;
    for (const control of elements.arpeggioControls) control.hidden = variation || rhythm;
    for (const control of elements.rhythmControls) control.hidden = variation || !rhythm;
    elements.recipeStart.max = String(pattern.steps.length);
    elements.recipeEnd.max = String(pattern.steps.length);
    elements.recipeStart.value = String(Math.min(Number(elements.recipeStart.value), pattern.steps.length));
    elements.recipeEnd.value = String(Math.max(
      Number(elements.recipeStart.value),
      Math.min(Number(elements.recipeEnd.value), pattern.steps.length),
    ));
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
        const recipe = createRecipe(elements.tool.value, pattern, elements);
        const candidate = createRecipePreview({
          endStep: Number(elements.recipeEnd.value),
          guide,
          pattern,
          recipe,
          startStep: Number(elements.recipeStart.value) - 1,
        });
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

  function createStarterCandidate() {
    try {
      const destination = elements.starterDestination.querySelector("input:checked")?.value;
      starterPreview = starterService.preview(elements.starterRecipe.value, destination);
      showMessage("Starter preview ready. Your project has not changed.");
      renderStarterPreview();
    } catch (error) {
      clearStarterPreview();
      showMessage(error.message, { error: true });
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
    clearStarterPreview();
    renderGuide();
    renderPattern();
    void renderCheckpoints();
    dialog.showModal();
    elements.close.focus();
  }, { signal: lifecycle.signal });
  elements.close.addEventListener("click", () => dialog.close(), { signal: lifecycle.signal });
  dialog.addEventListener("cancel", () => dialog.close(), { signal: lifecycle.signal });
  dialog.addEventListener("close", () => {
    if (!secondaryDialogOpen) open.focus();
  }, { signal: lifecycle.signal });
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
  elements.rhythmDensity.addEventListener("input", () => {
    elements.rhythmDensityOutput.value = `${elements.rhythmDensity.value}%`;
  }, { signal: lifecycle.signal });
  elements.recipeVelocity.addEventListener("input", () => {
    elements.recipeVelocityOutput.value = `${elements.recipeVelocity.value}%`;
  }, { signal: lifecycle.signal });
  const discardChangedVariationPreview = () => {
    if (!preview) return;
    clearPreview();
    showMessage("Idea settings changed. Preview a new candidate before applying.");
  };
  elements.scopes.addEventListener("change", discardChangedVariationPreview, { signal: lifecycle.signal });
  elements.bounds.addEventListener("change", discardChangedVariationPreview, { signal: lifecycle.signal });
  elements.recipeControls.addEventListener("change", discardChangedVariationPreview, { signal: lifecycle.signal });
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
  const discardStarterPreview = () => {
    if (!starterPreview) return;
    clearStarterPreview();
    showMessage("Starter choice changed. Preview it again before applying.");
  };
  elements.starterRecipe.addEventListener("change", discardStarterPreview, { signal: lifecycle.signal });
  elements.starterDestination.addEventListener("change", discardStarterPreview, { signal: lifecycle.signal });
  elements.starterPreview.addEventListener("click", createStarterCandidate, { signal: lifecycle.signal });
  elements.starterCancel.addEventListener("click", () => {
    clearStarterPreview();
    showMessage("Starter preview discarded. Your project was not changed.");
  }, { signal: lifecycle.signal });

  async function applyStarterCandidate() {
    if (!starterPreview) return;
    const candidate = starterPreview;
    const success = {
      add: "Starter content added as one undoable project change.",
      new: "Starter created as a separate local project. Your previous project remains in the library.",
      replace: "Starter applied after saving a recovery checkpoint.",
    }[candidate.destination];
    await run(async () => {
      await starterService.apply(candidate);
      clearStarterPreview();
      clearPreview();
    }, success);
  }

  elements.starterApply.addEventListener("click", () => {
    if (!starterPreview) return;
    if (starterPreview.destination !== "replace") {
      void applyStarterCandidate();
      return;
    }
    elements.starterReplaceCopy.textContent = `“${starterPreview.recipe.name}” will replace the active working document. Klinto Studio must save a local recovery checkpoint first; if that fails, replacement is blocked.`;
    secondaryDialogOpen = true;
    dialog.close();
    starterReplaceDialog.showModal();
    elements.starterReplaceCancel.focus();
  }, { signal: lifecycle.signal });
  elements.starterReplaceCancel.addEventListener("click", () => {
    starterReplaceDialog.close();
    secondaryDialogOpen = false;
    dialog.showModal();
    elements.starterApply.focus();
  }, { signal: lifecycle.signal });
  starterReplaceDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    elements.starterReplaceCancel.click();
  }, { signal: lifecycle.signal });
  elements.starterReplaceConfirm.addEventListener("click", () => {
    starterReplaceDialog.close();
    secondaryDialogOpen = false;
    dialog.showModal();
    void applyStarterCandidate();
  }, { signal: lifecycle.signal });
  elements.checkpointCreate.addEventListener("click", () => void run(async () => {
    await checkpointService.createCheckpoint(elements.checkpointLabel.value, "manual");
    elements.checkpointLabel.value = "";
  }, "Checkpoint saved on this device."), { signal: lifecycle.signal });
  elements.checkpointList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-checkpoint-id]");
    if (!button || busy) return;
    pendingCheckpointId = button.dataset.checkpointId;
    secondaryDialogOpen = true;
    dialog.close();
    restoreDialog.showModal();
    elements.restoreCancel.focus();
  }, { signal: lifecycle.signal });
  elements.restoreCancel.addEventListener("click", () => {
    const checkpointId = pendingCheckpointId;
    pendingCheckpointId = null;
    restoreDialog.close();
    secondaryDialogOpen = false;
    dialog.showModal();
    [...elements.checkpointList.querySelectorAll("button[data-checkpoint-id]")]
      .find((button) => button.dataset.checkpointId === checkpointId)
      ?.focus();
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
    secondaryDialogOpen = false;
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
      starterReplaceDialog.remove();
    },
  });
}
