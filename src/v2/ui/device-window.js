import { DEVICE_REGISTRY } from "../audio/device-registry.js";
import { createElement, clearElement, setPressed } from "./dom.js";

const RANGE_EDIT_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

function findEffect(project, instanceId) {
  for (const track of project.tracks) {
    const effect = track.mixer.effects.find((candidate) => candidate.instanceId === instanceId);
    if (effect) return { effect, owner: { kind: "track", trackId: track.id }, ownerName: track.name };
  }
  const effect = project.mixer.master.effects.find((candidate) => candidate.instanceId === instanceId);
  return effect ? { effect, owner: { kind: "master" }, ownerName: "Master" } : null;
}

function createParameter({
  label,
  max,
  min,
  onChange,
  options,
  signal,
  step,
  type = "range",
  value,
  valueText = (next) => String(next),
}) {
  const output = createElement("output", { textContent: valueText(value) });
  const input = options
    ? createElement("select", { "aria-label": label })
    : createElement("input", { "aria-label": label, max, min, step, type, value });
  if (options) {
    for (const [optionValue, text] of options) {
      input.append(createElement("option", { textContent: text, value: optionValue }));
    }
    input.value = String(value);
  }
  const synchronizeValueText = (next) => {
    const formatted = String(valueText(next));
    output.value = formatted;
    output.textContent = formatted;
    if (!options && input.type === "range") input.setAttribute("aria-valuetext", formatted);
  };
  synchronizeValueText(value);
  const read = () => type === "number" || type === "range" ? Number(input.value) : input.value;
  input.addEventListener("input", () => {
    synchronizeValueText(read());
    if (!options) onChange(read(), { transient: true });
  }, { signal });
  input.addEventListener("change", () => {
    synchronizeValueText(read());
    onChange(read(), { transient: false });
  }, { signal });
  return {
    input,
    node: createElement("label", { className: "v2-device-parameter" }, [
      createElement("span", { textContent: label }),
      input,
      output,
    ]),
    output,
    setValue(next) {
      input.value = String(next);
      synchronizeValueText(next);
    },
  };
}

export function createDeviceWindow({
  device,
  mobile = false,
  onClose,
  onInvalid = onClose,
  projectState,
}) {
  const lifecycle = new AbortController();
  let controlLifecycle = new AbortController();
  const controls = new Map();
  let bypassControl = null;
  let disposed = false;
  let historyOwner = null;
  let mountedDefinition = null;
  let mountedEditor = null;
  let resolvedOwner = device.owner ?? null;
  const node = createElement("section", {
    className: "v2-device-window-content",
    role: "region",
    dataset: { deviceId: device.instanceId, deviceKind: device.kind },
  });
  const title = createElement("h2", { className: "v2-device-title", tabIndex: -1 });
  const close = createElement("button", {
    className: "v2-device-close",
    textContent: mobile ? "Back" : "Close",
    type: "button",
    onClick: onClose,
  });
  const reset = createElement("button", {
    dataset: { deviceAction: "reset" },
    textContent: "Reset",
    type: "button",
  });
  const body = createElement("div", { className: "v2-device-body" });
  const header = createElement("header", { className: "v2-device-header" }, [title, reset, close]);
  node.append(header, body);

  function project() {
    return projectState.getState();
  }

  function instrumentRecord() {
    const track = project().tracks.find(({ instrument }) => instrument.instanceId === device.instanceId)
      ?? project().tracks.find(({ id }) => id === device.trackId);
    return track ? { instrument: track.instrument, track } : null;
  }

  function effectRecord() {
    return findEffect(project(), device.instanceId);
  }

  function beginHistory(input) {
    if (historyOwner === input) return;
    if (historyOwner) projectState.endHistoryGroup?.();
    historyOwner?.removeAttribute?.("data-history-owner");
    projectState.beginHistoryGroup?.();
    historyOwner = input;
    input.setAttribute("data-history-owner", "true");
  }

  function endHistory(input = historyOwner) {
    if (!historyOwner || (input && input !== historyOwner)) return false;
    historyOwner.removeAttribute?.("data-history-owner");
    historyOwner = null;
    projectState.endHistoryGroup?.();
    return true;
  }

  function bindHistory(input) {
    if (input.tagName !== "INPUT" || input.type !== "range") return;
    const signal = controlLifecycle.signal;
    input.addEventListener("pointerdown", () => beginHistory(input), { signal });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture", "change", "blur"]) {
      input.addEventListener(type, () => endHistory(input), { signal });
    }
    input.addEventListener("keydown", (event) => {
      if (RANGE_EDIT_KEYS.has(event.key)) beginHistory(input);
    }, { signal });
    input.addEventListener("keyup", (event) => {
      if (RANGE_EDIT_KEYS.has(event.key)) endHistory(input);
    }, { signal });
  }

  function addControl(key, config, container) {
    const control = createParameter({ ...config, signal: controlLifecycle.signal });
    control.input.dataset.deviceParam = key;
    controls.set(key, control);
    container.append(control.node);
    bindHistory(control.input);
    return control;
  }

  function createRegisteredEditor({ definition, instance, onParamChange, ownerName }) {
    let editorDisposed = false;
    for (const section of definition.ui.sections) {
      const sectionId = `device-${instance.instanceId}-${section.id}`;
      const sectionNode = createElement("section", {
        className: "v2-device-section",
        "aria-labelledby": sectionId,
      });
      sectionNode.append(createElement("h3", {
        className: "v2-device-section-title",
        id: sectionId,
        textContent: section.label,
      }));
      for (const key of section.params) {
        const parameter = definition.parameters[key];
        const ui = definition.ui.parameters[key];
        addControl(key, {
          label: `${ownerName}, ${definition.name}, ${ui.label}`,
          max: parameter.maximum,
          min: parameter.minimum,
          onChange: (value) => onParamChange(key, value),
          options: ui.options,
          step: ui.step,
          type: ui.type ?? "range",
          value: instance.params[key],
          valueText: ui.valueText,
        }, sectionNode);
      }
      body.append(sectionNode);
    }
    return Object.freeze({
      dispose() {
        if (editorDisposed) return false;
        editorDisposed = true;
        return true;
      },
    });
  }

  function unmountDefinition() {
    if (mountedDefinition && mountedEditor) mountedDefinition.disposeUI(mountedEditor);
    mountedDefinition = null;
    mountedEditor = null;
  }

  function mountDefinition(definition, instance, ownerName, onParamChange) {
    mountedDefinition = definition;
    mountedEditor = definition.createUI({
      createEditor: createRegisteredEditor,
      instance,
      onParamChange,
      ownerName,
    });
  }

  function buildInstrument(record) {
    const { instrument, track } = record;
    const definition = DEVICE_REGISTRY.instruments.require(instrument.type, instrument.version);
    title.textContent = `${track.name}, ${definition.name}`;
    node.setAttribute("aria-label", title.textContent);
    resolvedOwner = { kind: "track", trackId: track.id };
    mountDefinition(
      definition,
      instrument,
      track.name,
      (key, value) => projectState.setInstrumentParam(track.id, key, value),
    );
  }

  function buildEffect(record) {
    const { effect, owner, ownerName } = record;
    const definition = DEVICE_REGISTRY.effects.require(effect.type, effect.version);
    title.textContent = `${ownerName}, ${definition.name}`;
    node.setAttribute("aria-label", title.textContent);
    resolvedOwner = owner;
    mountDefinition(
      definition,
      effect,
      ownerName,
      (key, value) => projectState.setEffectParam(effect.instanceId, key, value),
    );
    bypassControl = createElement("button", {
      "aria-label": `${ownerName} ${definition.name} bypass`,
      dataset: { deviceAction: "bypass" },
      textContent: effect.bypassed ? "Enable Effect" : "Bypass Effect",
      type: "button",
    });
    setPressed(bypassControl, effect.bypassed);
    bypassControl.addEventListener("click", () => {
      const current = effectRecord()?.effect;
      if (current) projectState.setEffectBypassed(current.instanceId, !current.bypassed);
    }, { signal: controlLifecycle.signal });
    body.append(bypassControl);
  }

  function build() {
    endHistory();
    controlLifecycle.abort();
    unmountDefinition();
    controlLifecycle = new AbortController();
    bypassControl = null;
    clearElement(body);
    controls.clear();
    if (device.kind === "instrument") {
      const record = instrumentRecord();
      if (!record) return onInvalid();
      buildInstrument(record);
    } else {
      const record = effectRecord();
      if (!record) return onInvalid();
      buildEffect(record);
    }
  }

  function synchronize() {
    if (disposed) return;
    const record = device.kind === "instrument" ? instrumentRecord() : effectRecord();
    if (!record) {
      onInvalid();
      return;
    }
    const params = device.kind === "instrument" ? record.instrument.params : record.effect.params;
    if (device.kind === "effect" && bypassControl) {
      bypassControl.textContent = record.effect.bypassed ? "Enable Effect" : "Bypass Effect";
      setPressed(bypassControl, record.effect.bypassed);
    }
    for (const [key, control] of controls) control.setValue(params[key]);
  }

  reset.addEventListener("click", () => {
    if (device.kind === "instrument") {
      const record = instrumentRecord();
      if (record) projectState.resetInstrument(record.track.id);
    } else {
      const record = effectRecord();
      if (record) projectState.resetEffect(record.effect.instanceId);
    }
  }, { signal: lifecycle.signal });

  const handleProjectChange = (event) => {
    const operation = event.detail?.operation;
    const current = device.kind === "instrument" ? instrumentRecord() : effectRecord();
    if (!current) {
      onInvalid();
      return;
    }
    if (["replace", "open-project"].includes(operation)) build();
    else synchronize();
  };
  projectState.addEventListener("change", handleProjectChange);
  build();

  return Object.freeze({
    device: Object.freeze({ ...device, owner: resolvedOwner }),
    dispose() {
      if (disposed) return false;
      disposed = true;
      endHistory();
      controlLifecycle.abort();
      unmountDefinition();
      lifecycle.abort();
      projectState.removeEventListener("change", handleProjectChange);
      node.remove();
      return true;
    },
    focus: () => title.focus({ preventScroll: true }),
    node,
    synchronize,
  });
}
