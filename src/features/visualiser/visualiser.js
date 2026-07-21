import { createAudioAnalyserReader } from "../../visualiser/audio-features.js";
import { fitCanvas, renderVisualFrame } from "../../visualiser/canvas-renderer.js?v=20260721-3";
import {
  MAX_VISUALISER_LAYERS,
  createLayersFromPreset,
  createVisualiserLayer,
  nextVisualiserLayerId,
} from "../../visualiser/visualiser-config.js?v=20260721-3";

const STYLESHEET_ID = "visualiser-styles";

function sliderValue(value, scale = 100) {
  return Math.round(value * scale);
}

function layerTypeLabel(type) {
  return { bars: "Bars", waveform: "Waveform", pulse: "Pulse" }[type] ?? type;
}

export function createVisualiserFeature({
  audioEngine,
  projectState,
  root = document,
} = {}) {
  if (!audioEngine || !projectState) throw new TypeError("Visualiser requires audio and project state.");
  const lifecycle = new AbortController();
  const reader = createAudioAnalyserReader(audioEngine);
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  let animationFrame = 0;
  let selectedLayerId = null;

  if (!root.getElementById(STYLESHEET_ID)) {
    const stylesheet = root.createElement("link");
    stylesheet.id = STYLESHEET_ID;
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./src/features/visualiser/visualiser.css?v=20260721-6";
    root.head.append(stylesheet);
  }

  const open = root.createElement("button");
  open.id = "visualiser-open";
  open.type = "button";
  open.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15v4M5 5v6M12 12v7M12 5v3M19 16v3M19 5v7"/><circle cx="5" cy="13" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="19" cy="14" r="2"/></svg><span class="visually-hidden">Open visualiser</span>`;
  open.setAttribute("aria-label", "Open visualiser");
  open.title = "Open visualiser";
  (root.querySelector("#global-tools") ?? root.querySelector(".global-status"))?.append(open);

  const template = root.createElement("template");
  template.innerHTML = `
    <dialog class="visualiser-dialog" aria-labelledby="visualiser-title">
      <div class="visualiser-panel">
        <header><div><span class="panel-context">Master visualiser</span><h2 id="visualiser-title">Visuals</h2></div><button type="button" data-close aria-label="Close visualiser">&times;</button></header>
        <div class="visualiser-stage"><canvas aria-label="Audio reactive visualiser"></canvas><p data-fallback hidden>Canvas visuals are not supported in this browser. Music playback is unaffected.</p></div>
        <div class="visualiser-controls">
          <label><span>Mode</span><select data-mode><option value="preset">Preset</option><option value="custom">Custom layers</option></select></label>
          <label><span>Preset</span><select data-preset><option value="spectrum">Spectrum</option><option value="scope">Oscilloscope</option><option value="pixel-pulse">Pixel pulse</option></select></label>
          <label><span>Palette</span><select data-palette><option value="arcade">Arcade</option><option value="ice">Ice</option><option value="sunset">Sunset</option></select></label>
          <label class="visualiser-enable"><input data-enabled type="checkbox" /> Enabled</label>
          <label><span>Intensity <output data-intensity-output></output></span><input data-intensity type="range" min="0" max="100" step="1" /></label>
          <label><span>Sensitivity <output data-sensitivity-output></output></span><input data-sensitivity type="range" min="25" max="200" step="1" /></label>
          <label><span>Motion <output data-motion-output></output></span><input data-motion type="range" min="0" max="200" step="1" /></label>
        </div>
        <section class="visualiser-editor" data-editor hidden aria-label="Custom visualiser layers">
          <header>
            <div><span class="panel-context">Custom layers</span><strong><output data-layer-count>0</output> / ${MAX_VISUALISER_LAYERS}</strong></div>
            <div><select data-add-type aria-label="New layer type"><option value="bars">Bars</option><option value="waveform">Waveform</option><option value="pulse">Pulse</option></select><button type="button" data-add-layer>Add layer</button><button type="button" data-build>Build from preset</button></div>
          </header>
          <div class="visualiser-editor-grid">
            <div class="visualiser-layer-list" data-layer-list aria-label="Visualiser layers"></div>
            <div class="visualiser-layer-inspector" data-layer-inspector hidden>
              <div class="visualiser-inspector-heading"><div><span class="panel-context">Selected layer</span><strong data-layer-type></strong></div><button type="button" data-reset-layer>Reset layer</button></div>
              <label><span>Name</span><input data-layer-name type="text" maxlength="32" /></label>
              <label><span>Colour</span><select data-layer-colour><option value="primary">Primary</option><option value="secondary">Secondary</option></select></label>
              <label><span>Opacity <output data-layer-opacity-output></output></span><input data-layer-opacity type="range" min="10" max="100" step="1" /></label>
              <label><span>Size <output data-layer-size-output></output></span><input data-layer-size type="range" min="25" max="200" step="1" /></label>
              <div class="visualiser-mapping-title"><span class="panel-context">Audio mapping</span><span>Maps one safe signal to this layer's energy.</span></div>
              <label><span>React to</span><select data-layer-signal><option value="amplitude">Amplitude</option><option value="bass">Bass</option><option value="mid">Mid</option><option value="treble">Treble</option></select></label>
              <label><span>Drive <output data-layer-amount-output></output></span><input data-layer-amount type="range" min="0" max="200" step="1" /></label>
              <label><span>Direction</span><select data-layer-direction><option value="1">Expand</option><option value="-1">Contract</option></select></label>
            </div>
          </div>
        </section>
        <p class="visualiser-note" data-note></p>
        <p class="visualiser-error" data-error role="alert" hidden></p>
      </div>
    </dialog>`;
  const dialog = template.content.querySelector(".visualiser-dialog");
  root.body.append(dialog);

  const canvas = dialog.querySelector("canvas");
  let context = null;
  try {
    context = canvas.getContext?.("2d") ?? null;
  } catch {
    context = null;
  }
  const controls = {
    addLayer: dialog.querySelector("[data-add-layer]"),
    addType: dialog.querySelector("[data-add-type]"),
    amount: dialog.querySelector("[data-layer-amount]"),
    amountOutput: dialog.querySelector("[data-layer-amount-output]"),
    build: dialog.querySelector("[data-build]"),
    colour: dialog.querySelector("[data-layer-colour]"),
    direction: dialog.querySelector("[data-layer-direction]"),
    editor: dialog.querySelector("[data-editor]"),
    enabled: dialog.querySelector("[data-enabled]"),
    error: dialog.querySelector("[data-error]"),
    inspector: dialog.querySelector("[data-layer-inspector]"),
    intensity: dialog.querySelector("[data-intensity]"),
    intensityOutput: dialog.querySelector("[data-intensity-output]"),
    layerCount: dialog.querySelector("[data-layer-count]"),
    layerList: dialog.querySelector("[data-layer-list]"),
    layerType: dialog.querySelector("[data-layer-type]"),
    mode: dialog.querySelector("[data-mode]"),
    motion: dialog.querySelector("[data-motion]"),
    motionOutput: dialog.querySelector("[data-motion-output]"),
    name: dialog.querySelector("[data-layer-name]"),
    opacity: dialog.querySelector("[data-layer-opacity]"),
    opacityOutput: dialog.querySelector("[data-layer-opacity-output]"),
    palette: dialog.querySelector("[data-palette]"),
    preset: dialog.querySelector("[data-preset]"),
    resetLayer: dialog.querySelector("[data-reset-layer]"),
    sensitivity: dialog.querySelector("[data-sensitivity]"),
    sensitivityOutput: dialog.querySelector("[data-sensitivity-output]"),
    signal: dialog.querySelector("[data-layer-signal]"),
    size: dialog.querySelector("[data-layer-size]"),
    sizeOutput: dialog.querySelector("[data-layer-size-output]"),
  };

  function showError(message = "") {
    controls.error.textContent = message;
    controls.error.hidden = !message;
  }

  function getConfig() {
    return projectState.getState().visualiser;
  }

  function getSelectedLayer() {
    return getConfig().layers.find((layer) => layer.id === selectedLayerId) ?? null;
  }

  function updateLayers(update) {
    setConfig({ layers: update(getConfig().layers) });
  }

  function updateSelectedLayer(values) {
    const selected = getSelectedLayer();
    if (!selected) return;
    updateLayers((layers) => layers.map((layer) => layer.id === selected.id
      ? {
        ...layer,
        ...values,
        mapping: values.mapping ? { ...layer.mapping, ...values.mapping } : layer.mapping,
      }
      : layer));
  }

  function renderLayerList() {
    const { layers } = getConfig();
    if (!layers.some((layer) => layer.id === selectedLayerId)) selectedLayerId = layers[0]?.id ?? null;
    controls.layerCount.textContent = String(layers.length);
    controls.addLayer.disabled = layers.length >= MAX_VISUALISER_LAYERS;
    controls.layerList.replaceChildren();
    layers.forEach((layer, index) => {
      const row = root.createElement("div");
      row.className = "visualiser-layer-row";
      row.classList.toggle("selected", layer.id === selectedLayerId);
      row.dataset.layerId = layer.id;
      const select = root.createElement("button");
      select.type = "button";
      select.dataset.action = "select";
      select.className = "visualiser-layer-select";
      select.innerHTML = `<span></span><small>${layerTypeLabel(layer.type)}</small>`;
      select.querySelector("span").textContent = layer.name;
      const visible = root.createElement("button");
      visible.type = "button";
      visible.dataset.action = "visible";
      visible.setAttribute("aria-label", `${layer.visible ? "Hide" : "Show"} ${layer.name}`);
      visible.setAttribute("aria-pressed", String(layer.visible));
      visible.innerHTML = layer.visible ? "&#9679;" : "&#9675;";
      const up = root.createElement("button");
      up.type = "button";
      up.dataset.action = "up";
      up.disabled = index === 0;
      up.setAttribute("aria-label", `Move ${layer.name} up`);
      up.innerHTML = "&uarr;";
      const down = root.createElement("button");
      down.type = "button";
      down.dataset.action = "down";
      down.disabled = index === layers.length - 1;
      down.setAttribute("aria-label", `Move ${layer.name} down`);
      down.innerHTML = "&darr;";
      const duplicate = root.createElement("button");
      duplicate.type = "button";
      duplicate.dataset.action = "duplicate";
      duplicate.disabled = layers.length >= MAX_VISUALISER_LAYERS;
      duplicate.setAttribute("aria-label", `Duplicate ${layer.name}`);
      duplicate.textContent = "2x";
      const remove = root.createElement("button");
      remove.type = "button";
      remove.dataset.action = "remove";
      remove.setAttribute("aria-label", `Remove ${layer.name}`);
      remove.innerHTML = "&times;";
      row.append(select, visible, up, down, duplicate, remove);
      controls.layerList.append(row);
    });
  }

  function renderInspector() {
    const layer = getSelectedLayer();
    controls.inspector.hidden = !layer;
    if (!layer) return;
    controls.layerType.textContent = layerTypeLabel(layer.type);
    controls.name.value = layer.name;
    controls.colour.value = layer.colour;
    controls.opacity.value = sliderValue(layer.opacity);
    controls.opacityOutput.textContent = `${controls.opacity.value}%`;
    controls.size.value = sliderValue(layer.size);
    controls.sizeOutput.textContent = `${controls.size.value}%`;
    controls.signal.value = layer.mapping.signal;
    controls.amount.value = sliderValue(layer.mapping.amount);
    controls.amountOutput.textContent = `${controls.amount.value}%`;
    controls.direction.value = String(layer.mapping.direction);
  }

  function syncControls() {
    const config = getConfig();
    controls.enabled.checked = config.enabled;
    controls.mode.value = config.mode;
    controls.preset.value = config.preset;
    controls.palette.value = config.palette;
    controls.intensity.value = sliderValue(config.intensity);
    controls.sensitivity.value = sliderValue(config.sensitivity);
    controls.motion.value = sliderValue(config.motion);
    controls.intensityOutput.textContent = `${controls.intensity.value}%`;
    controls.sensitivityOutput.textContent = `${controls.sensitivity.value}%`;
    controls.motionOutput.textContent = `${controls.motion.value}%`;
    controls.editor.hidden = config.mode !== "custom";
    controls.build.hidden = config.mode !== "custom";
    renderLayerList();
    renderInspector();
    dialog.querySelector("[data-note]").textContent = reducedMotion?.matches
      ? "Reduced motion is active. Rotation and high-motion animation are limited."
      : config.mode === "custom"
        ? "Layer order runs top to bottom. Every change is saved with the project and can be undone."
        : "Responds to the complete master mix. Changes save with this project.";
  }

  function draw(time = 0) {
    animationFrame = 0;
    if (!context || !dialog.open || root.visibilityState === "hidden") return;
    const config = getConfig();
    const { height, width } = fitCanvas(canvas);
    const features = reader.read(config.sensitivity);
    renderVisualFrame(context, features, config, {
      height,
      reducedMotion: reducedMotion?.matches === true,
      time,
      width,
    });
    if (config.enabled && audioEngine.isReady()) animationFrame = requestAnimationFrame(draw);
  }

  function scheduleDraw() {
    if (!animationFrame) animationFrame = requestAnimationFrame(draw);
  }

  function setConfig(values) {
    showError("");
    try {
      projectState.setVisualiser(values);
      syncControls();
      scheduleDraw();
    } catch (error) {
      showError(error.message || "The visualiser change could not be applied.");
    }
  }

  function addLayer(type) {
    const layers = getConfig().layers;
    const layer = createVisualiserLayer(type, nextVisualiserLayerId(layers));
    selectedLayerId = layer.id;
    setConfig({ mode: "custom", layers: [...layers, layer] });
  }

  function buildFromPreset() {
    const layers = createLayersFromPreset(getConfig().preset);
    selectedLayerId = layers[0]?.id ?? null;
    setConfig({ layers, mode: "custom" });
  }

  open.addEventListener("click", () => {
    syncControls();
    if (!dialog.open) dialog.showModal();
    scheduleDraw();
  }, { signal: lifecycle.signal });
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close(), { signal: lifecycle.signal });
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }, { signal: lifecycle.signal });
  controls.enabled.addEventListener("change", () => setConfig({ enabled: controls.enabled.checked }), { signal: lifecycle.signal });
  controls.mode.addEventListener("change", () => {
    if (controls.mode.value === "custom" && getConfig().layers.length === 0) buildFromPreset();
    else setConfig({ mode: controls.mode.value });
  }, { signal: lifecycle.signal });
  controls.preset.addEventListener("change", () => setConfig({ preset: controls.preset.value }), { signal: lifecycle.signal });
  controls.palette.addEventListener("change", () => setConfig({ palette: controls.palette.value }), { signal: lifecycle.signal });
  controls.addLayer.addEventListener("click", () => addLayer(controls.addType.value), { signal: lifecycle.signal });
  controls.build.addEventListener("click", buildFromPreset, { signal: lifecycle.signal });

  for (const [input, output, field] of [
    [controls.intensity, controls.intensityOutput, "intensity"],
    [controls.sensitivity, controls.sensitivityOutput, "sensitivity"],
    [controls.motion, controls.motionOutput, "motion"],
  ]) {
    input.addEventListener("input", () => {
      output.textContent = `${input.value}%`;
      setConfig({ [field]: Number(input.value) / 100 });
    }, { signal: lifecycle.signal });
  }

  controls.layerList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    const row = button?.closest("[data-layer-id]");
    if (!button || !row) return;
    const layers = getConfig().layers;
    const index = layers.findIndex((layer) => layer.id === row.dataset.layerId);
    if (index === -1) return;
    const layer = layers[index];
    const action = button.dataset.action;
    if (action === "select") {
      selectedLayerId = layer.id;
      syncControls();
      return;
    }
    if (action === "visible") {
      selectedLayerId = layer.id;
      updateSelectedLayer({ visible: !layer.visible });
    } else if (action === "remove") {
      const next = layers.filter((candidate) => candidate.id !== layer.id);
      selectedLayerId = next[Math.min(index, next.length - 1)]?.id ?? null;
      setConfig({ layers: next });
    } else if (action === "duplicate") {
      const copy = {
        ...layer,
        id: nextVisualiserLayerId(layers),
        name: `${layer.name} copy`.slice(0, 32),
        mapping: { ...layer.mapping },
      };
      selectedLayerId = copy.id;
      setConfig({ layers: [...layers.slice(0, index + 1), copy, ...layers.slice(index + 1)] });
    } else if (action === "up" || action === "down") {
      const destination = index + (action === "up" ? -1 : 1);
      if (destination < 0 || destination >= layers.length) return;
      const reordered = [...layers];
      [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
      selectedLayerId = layer.id;
      setConfig({ layers: reordered });
    }
  }, { signal: lifecycle.signal });

  controls.name.addEventListener("change", () => updateSelectedLayer({ name: controls.name.value.trim() }), { signal: lifecycle.signal });
  controls.colour.addEventListener("change", () => updateSelectedLayer({ colour: controls.colour.value }), { signal: lifecycle.signal });
  controls.signal.addEventListener("change", () => updateSelectedLayer({ mapping: { signal: controls.signal.value } }), { signal: lifecycle.signal });
  controls.direction.addEventListener("change", () => updateSelectedLayer({ mapping: { direction: Number(controls.direction.value) } }), { signal: lifecycle.signal });
  for (const [input, output, field, nested] of [
    [controls.opacity, controls.opacityOutput, "opacity", false],
    [controls.size, controls.sizeOutput, "size", false],
    [controls.amount, controls.amountOutput, "amount", true],
  ]) {
    input.addEventListener("input", () => {
      output.textContent = `${input.value}%`;
      const value = Number(input.value) / 100;
      updateSelectedLayer(nested ? { mapping: { [field]: value } } : { [field]: value });
      scheduleDraw();
    }, { signal: lifecycle.signal });
  }
  controls.resetLayer.addEventListener("click", () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    const reset = createVisualiserLayer(layer.type, layer.id);
    updateSelectedLayer({ ...reset, name: layer.name });
  }, { signal: lifecycle.signal });

  projectState.addEventListener("change", syncControls, { signal: lifecycle.signal });
  reducedMotion?.addEventListener?.("change", scheduleDraw, { signal: lifecycle.signal });
  root.addEventListener("visibilitychange", scheduleDraw, { signal: lifecycle.signal });

  if (!context) {
    canvas.hidden = true;
    dialog.querySelector("[data-fallback]").hidden = false;
  }
  syncControls();

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      cancelAnimationFrame(animationFrame);
      dialog.remove();
      open.remove();
      root.getElementById(STYLESHEET_ID)?.remove();
    },
    open: () => open.click(),
  });
}
