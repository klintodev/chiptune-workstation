import {
  VISUALISER_PALETTE_DEFINITIONS,
  getVisualiserPalette,
} from "../../visualiser/visualiser-palette.js";

function paletteCardsMarkup() {
  return VISUALISER_PALETTE_DEFINITIONS.map((palette) => `
    <label class="visualiser-palette-card" data-palette-card="${palette.id}">
      <input type="radio" name="visualiser-palette" value="${palette.id}" />
      <span class="visualiser-palette-card-body">
        <span class="visualiser-palette-swatches" aria-hidden="true">
          <span style="--swatch: ${palette.background}"></span>
          ${palette.tracks.slice(0, 4).map((colour) => `<span style="--swatch: ${colour}"></span>`).join("")}
        </span>
        <strong>${palette.name}</strong>
        <small>${palette.description}</small>
      </span>
    </label>`).join("");
}

function paletteDialogMarkup() {
  return `
    <dialog class="visualiser-palette-dialog" aria-labelledby="visualiser-palette-title" aria-describedby="visualiser-palette-description">
      <section class="visualiser-palette-panel">
        <header>
          <div>
            <span class="panel-context">Visual identity</span>
            <h2 id="visualiser-palette-title">Choose a colour palette</h2>
            <p id="visualiser-palette-description">Preview a mood, then apply it to this project. The music itself will not change.</p>
          </div>
          <button type="button" data-palette-close aria-label="Close colour palette picker">&times;</button>
        </header>
        <div class="visualiser-palette-preview" data-palette-preview aria-hidden="true">
          <span></span><span></span><span></span><span></span>
          <strong data-palette-preview-name></strong>
        </div>
        <fieldset>
          <legend>Palette presets</legend>
          <div class="visualiser-palette-grid">${paletteCardsMarkup()}</div>
        </fieldset>
        <footer>
          <p><strong data-palette-choice></strong><span>Undo remains available after applying.</span></p>
          <div>
            <button type="button" data-palette-cancel>Cancel</button>
            <button type="button" class="primary" data-palette-apply>Use this palette</button>
          </div>
        </footer>
      </section>
    </dialog>`;
}

export function createVisualiserPalettePicker({
  getPaletteId,
  onApply,
  onPreview,
  root = document,
} = {}) {
  if (typeof getPaletteId !== "function" || typeof onApply !== "function" || typeof onPreview !== "function") {
    throw new TypeError("Visualiser palette picker requires palette state, preview, and apply operations.");
  }
  const lifecycle = new AbortController();
  const template = root.createElement("template");
  template.innerHTML = paletteDialogMarkup();
  const dialog = template.content.querySelector(".visualiser-palette-dialog");
  root.body.append(dialog);
  let previewPaletteId = null;
  let returnFocus = null;

  function updatePreview(paletteId) {
    const palette = getVisualiserPalette(paletteId);
    previewPaletteId = palette.id;
    const preview = dialog.querySelector("[data-palette-preview]");
    preview.style.setProperty("--palette-background", palette.background);
    preview.style.setProperty("--palette-grid", palette.grid);
    preview.style.setProperty("--palette-ink", palette.ink);
    palette.tracks.slice(0, 4).forEach((colour, index) => {
      preview.style.setProperty(`--palette-track-${index + 1}`, colour);
    });
    dialog.querySelector("[data-palette-preview-name]").textContent = palette.name;
    dialog.querySelector("[data-palette-choice]").textContent = palette.name;
    onPreview(palette.id);
  }

  dialog.addEventListener("change", (event) => {
    const option = event.target.closest('input[name="visualiser-palette"]');
    if (option) updatePreview(option.value);
  }, { signal: lifecycle.signal });
  dialog.querySelector("[data-palette-apply]").addEventListener("click", () => {
    onApply(previewPaletteId);
    dialog.close("apply");
  }, { signal: lifecycle.signal });
  for (const close of dialog.querySelectorAll("[data-palette-close], [data-palette-cancel]")) {
    close.addEventListener("click", () => dialog.close("cancel"), { signal: lifecycle.signal });
  }
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dialog.close("cancel");
  }, { signal: lifecycle.signal });
  dialog.addEventListener("close", () => {
    previewPaletteId = null;
    onPreview(null);
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }, { signal: lifecycle.signal });

  return Object.freeze({
    dialog,
    dispose() {
      lifecycle.abort();
      dialog.remove();
    },
    open(trigger) {
      returnFocus = trigger;
      const paletteId = getPaletteId();
      const option = dialog.querySelector(`input[value="${paletteId}"]`);
      option.checked = true;
      updatePreview(paletteId);
      if (!dialog.open) dialog.showModal();
      option.focus();
    },
  });
}
