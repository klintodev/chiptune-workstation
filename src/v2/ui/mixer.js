import { clearElement, createElement, createLabeledRange, setPressed } from "./dom.js";
import { formatPercent } from "./music-format.js";

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

function ownerForChannel(channelId) {
  return channelId === "master" ? { kind: "master" } : { kind: "track", trackId: channelId };
}

function effectsForChannel(project, channelId) {
  return channelId === "master"
    ? project.mixer.master.effects
    : project.tracks.find(({ id }) => id === channelId)?.mixer.effects ?? [];
}

function effectLabel(effect) {
  return effect.type === "klinto-filter" ? "Klinto Filter" : "Klinto Delay";
}

function channelLabel(project, channelId) {
  if (channelId === "master") return "Master";
  return project.tracks.find(({ id }) => id === channelId)?.name ?? "Track";
}

function effectControlContext(project, channelId, effect, index) {
  return `${channelLabel(project, channelId)} ${effectLabel(effect)} in effect slot ${index + 1}`;
}

function formatPan(value) {
  if (value === 0) return "Centre";
  return `${Math.round(Math.abs(value) * 100)}% ${value < 0 ? "left" : "right"}`;
}

function structureIdentity(project) {
  return JSON.stringify({
    masterEffects: project.mixer.master.effects.map(({ instanceId, type }) => [instanceId, type]),
    tracks: project.tracks.map((track) => ({
      effects: track.mixer.effects.map(({ instanceId, type }) => [instanceId, type]),
      id: track.id,
      instrumentInstanceId: track.instrument.instanceId,
      name: track.name,
    })),
  });
}

function setOutputValue(output, value) {
  output.value = value;
  output.textContent = value;
}

export function createMixerSurface({
  announce = () => {},
  getMeterLevel = () => 0,
  onOpenEffect = () => {},
  onOpenInstrument = () => {},
  projectState,
  requestAnimationFrameFn = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelAnimationFrameFn = globalThis.cancelAnimationFrame?.bind(globalThis),
  workspaceState,
}) {
  const lifecycle = new AbortController();
  const meterElements = new Map();
  const channelControls = new Map();
  let addTrackControl = null;
  let channelSelector = null;
  let disposed = false;
  let frame = null;
  let historyOwner = null;
  let pendingFocus = null;
  let renderedStructure = "";

  const title = createElement("h2", {
    id: "v2-mixer-title",
    className: "v2-surface-title",
    textContent: "Mixer",
    tabIndex: -1,
    dataset: { mixerControl: "title" },
  });
  const header = createElement("div", { className: "v2-surface-header v2-mixer-header" });
  const channelArea = createElement("div", { className: "v2-mixer-channels", "aria-label": "Mixer channels" });
  const node = createElement("section", {
    className: "v2-primary-surface v2-mixer",
    "aria-labelledby": title.id,
    dataset: { primarySurface: "mixer" },
  }, [header, channelArea]);

  function project() {
    return projectState.getState();
  }

  function selectedChannelId() {
    const state = workspaceState.getState();
    const candidate = state.mixer?.channelId ?? state.mixer?.selectedChannelId ?? state.selectedMixerChannelId;
    return candidate === "master" || project().tracks.some(({ id }) => id === candidate)
      ? candidate
      : project().tracks[0].id;
  }

  function selectChannel(id) {
    if (selectedChannelId() === id) return false;
    if (workspaceState.selectMixerChannel) workspaceState.selectMixerChannel(id);
    else if (workspaceState.setMixer) workspaceState.setMixer({ channelId: id });
    else workspaceState.updateMixer?.({ selectedChannelId: id });
    return true;
  }

  function setTrackMixer(trackId, values) {
    projectState.setTrackMixer(trackId, values);
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

  function bindContinuousHistory(input) {
    input.addEventListener("pointerdown", () => beginHistory(input), { signal: lifecycle.signal });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture", "change", "blur"]) {
      input.addEventListener(type, () => endHistory(input), { signal: lifecycle.signal });
    }
    input.addEventListener("keydown", (event) => {
      if (RANGE_EDIT_KEYS.has(event.key)) beginHistory(input);
    }, { signal: lifecycle.signal });
    input.addEventListener("keyup", (event) => {
      if (RANGE_EDIT_KEYS.has(event.key)) endHistory(input);
    }, { signal: lifecycle.signal });
  }

  function createRangeControl({ channelId, control, format, label, max, min, onChange, step, value }) {
    const range = createLabeledRange({ label, max, min, onChange, step, value });
    Object.assign(range.input.dataset, { channelId, mixerControl: control });
    const synchronize = (next) => {
      range.input.value = String(next);
      setOutputValue(range.output, format(next));
    };
    range.input.addEventListener("input", () => synchronize(Number(range.input.value)), {
      signal: lifecycle.signal,
    });
    bindContinuousHistory(range.input);
    synchronize(value);
    return { ...range, synchronize };
  }

  function makeVolumeControl(channelId, value) {
    const label = channelId === "master"
      ? "Master channel volume"
      : `${projectState.getTrack(channelId).name} Mixer channel volume`;
    return createRangeControl({
      channelId,
      control: "volume",
      format: formatPercent,
      label,
      min: 0,
      max: 1,
      step: 0.01,
      value,
      onChange(next) {
        if (channelId === "master") projectState.setMasterVolume(next);
        else setTrackMixer(channelId, { volume: next });
      },
    });
  }

  function makePanControl(track) {
    return createRangeControl({
      channelId: track.id,
      control: "pan",
      format: formatPan,
      label: `${track.name} Mixer pan`,
      min: -1,
      max: 1,
      step: 0.01,
      value: track.mixer.pan,
      onChange: (next) => setTrackMixer(track.id, { pan: next }),
    });
  }

  function withMutationFocus(descriptor, mutation) {
    pendingFocus = descriptor;
    try {
      return mutation();
    } finally {
      if (pendingFocus === descriptor) pendingFocus = null;
    }
  }

  function createInsert(owner, effect, index) {
    const channelId = owner.trackId ?? "master";
    const label = effectLabel(effect);
    const controlContext = effectControlContext(project(), channelId, effect, index);
    const row = createElement("div", {
      className: `v2-insert${effect.bypassed ? " is-bypassed" : ""}`,
      dataset: { channelId, effectId: effect.instanceId, effectIndex: String(index) },
    });
    const buttonData = (effectAction) => ({ channelId, effectAction, effectId: effect.instanceId });
    const open = createElement("button", {
      "aria-label": `Open ${controlContext}`,
      dataset: buttonData("open"),
      textContent: `${index + 1}. ${label}`,
      type: "button",
      onClick: (event) => onOpenEffect(owner, effect.instanceId, event.currentTarget),
    });
    const bypass = createElement("button", {
      "aria-label": `${effect.bypassed ? "Enable" : "Bypass"} ${controlContext}`,
      dataset: buttonData("bypass"),
      textContent: effect.bypassed ? "Enable" : "Bypass",
      type: "button",
    });
    bypass.addEventListener("click", () => {
      const current = effectsForChannel(project(), channelId)
        .find(({ instanceId }) => instanceId === effect.instanceId);
      if (current) projectState.setEffectBypassed(current.instanceId, !current.bypassed);
    }, { signal: lifecycle.signal });
    const earlier = createElement("button", {
      "aria-label": `Move ${controlContext} earlier`,
      dataset: buttonData("earlier"),
      disabled: index === 0,
      textContent: "↑",
      type: "button",
      onClick: () => withMutationFocus({
        action: "earlier",
        channelId,
        effectId: effect.instanceId,
        kind: "effect",
      }, () => projectState.moveEffect(effect.instanceId, -1)),
    });
    const later = createElement("button", {
      "aria-label": `Move ${controlContext} later`,
      dataset: buttonData("later"),
      disabled: index === effectsForChannel(project(), channelId).length - 1,
      textContent: "↓",
      type: "button",
      onClick: () => withMutationFocus({
        action: "later",
        channelId,
        effectId: effect.instanceId,
        kind: "effect",
      }, () => projectState.moveEffect(effect.instanceId, 1)),
    });
    const remove = createElement("button", {
      className: "v2-danger-button",
      "aria-label": `Remove ${controlContext}`,
      dataset: buttonData("remove"),
      textContent: "Remove",
      type: "button",
      onClick: () => {
        withMutationFocus({ channelId, kind: "empty-slot" }, () => (
          projectState.removeEffect(effect.instanceId)
        ));
        announce(`${label} removed.`);
      },
    });
    row.append(open, bypass, earlier, later, remove);
    return { bypass, earlier, label, later, open, remove, row };
  }

  function createEmptyInsert(owner, index) {
    const channelId = owner.trackId ?? "master";
    const label = channelLabel(project(), channelId);
    const row = createElement("div", {
      className: "v2-insert is-empty",
      dataset: { channelId, emptySlot: "true", slotIndex: String(index) },
    });
    const picker = createElement("select", {
      "aria-label": `Insert ${index + 1} Effect type for ${label}`,
      dataset: { channelId, emptyAction: "picker", slotIndex: String(index) },
    }, [
      createElement("option", { textContent: "Klinto Filter", value: "klinto-filter" }),
      createElement("option", { textContent: "Klinto Delay", value: "klinto-delay" }),
    ]);
    const add = createElement("button", {
      "aria-label": `Add Effect in slot ${index + 1} for ${label}`,
      dataset: { channelId, emptyAction: "add", slotIndex: String(index) },
      textContent: `Add Effect in slot ${index + 1}`,
      type: "button",
      onClick: () => {
        const selectedType = picker.value;
        withMutationFocus({ action: "open", channelId, index, kind: "effect-slot" }, () => (
          projectState.addEffect(owner.kind === "master" ? "master" : owner.trackId, selectedType)
        ));
        announce(`${selectedType === "klinto-filter" ? "Klinto Filter" : "Klinto Delay"} added. Open it separately to edit.`);
      },
    });
    row.append(picker, add);
    return { add, picker, row };
  }

  function createChannel(channelId) {
    const state = project();
    const isMaster = channelId === "master";
    const track = isMaster ? null : state.tracks.find(({ id }) => id === channelId);
    const mixer = isMaster ? state.mixer.master : track.mixer;
    const owner = ownerForChannel(channelId);
    const controls = { effects: new Map(), empty: null, pan: null };
    const channel = createElement("article", {
      className: `v2-mixer-channel${selectedChannelId() === channelId ? " is-selected" : ""}`,
      dataset: { channelId },
      "aria-label": isMaster ? "Master Mixer channel" : `${track.name} Mixer channel`,
    });
    const heading = createElement("h3", {
      dataset: { channelId, mixerControl: "heading" },
      textContent: isMaster ? "Master" : track.name,
      tabIndex: -1,
    });
    controls.channel = channel;
    controls.heading = heading;
    channel.append(heading);
    if (!isMaster) {
      const instrument = createElement("button", {
        "aria-label": `Open ${track.name} Klinto Chip instrument`,
        className: "v2-instrument-slot",
        dataset: { channelId, mixerControl: "instrument" },
        textContent: "Klinto Chip",
        type: "button",
        onClick: (event) => onOpenInstrument(track.id, event.currentTarget),
      });
      controls.instrument = instrument;
      channel.append(instrument);
    }
    controls.volume = makeVolumeControl(channelId, mixer.volume);
    channel.append(controls.volume.node);
    if (!isMaster) {
      controls.pan = makePanControl(track);
      channel.append(controls.pan.node);
      const mute = createElement("button", {
        "aria-label": `Mute ${track.name} Mixer channel`,
        dataset: { channelId, mixerControl: "mute" },
        textContent: "Mute",
        type: "button",
      });
      const solo = createElement("button", {
        "aria-label": `Solo ${track.name} Mixer channel`,
        dataset: { channelId, mixerControl: "solo" },
        textContent: "Solo",
        type: "button",
      });
      setPressed(mute, track.mixer.muted);
      setPressed(solo, track.mixer.solo);
      mute.addEventListener("click", () => {
        const current = projectState.getTrack(track.id);
        setTrackMixer(track.id, { muted: !current.mixer.muted });
      }, { signal: lifecycle.signal });
      solo.addEventListener("click", () => {
        const current = projectState.getTrack(track.id);
        setTrackMixer(track.id, { solo: !current.mixer.solo });
      }, { signal: lifecycle.signal });
      controls.mute = mute;
      controls.solo = solo;
      channel.append(createElement("div", { className: "v2-mixer-toggles" }, [mute, solo]));
    }

    const meter = createElement("meter", {
      className: "v2-channel-meter",
      max: 1,
      min: 0,
      value: 0,
      "aria-label": `${isMaster ? "Master" : track.name} post-fader level`,
      "aria-hidden": "true",
    });
    meterElements.set(channelId, meter);
    controls.meter = meter;
    channel.append(meter);

    const effects = mixer.effects;
    const inserts = createElement("div", {
      className: "v2-insert-chain",
      "aria-label": `${isMaster ? "Master" : track.name} Effects`,
    });
    effects.forEach((effect, index) => {
      const insert = createInsert(owner, effect, index);
      controls.effects.set(effect.instanceId, insert);
      inserts.append(insert.row);
    });
    if (effects.length < 4) {
      controls.empty = createEmptyInsert(owner, effects.length);
      inserts.append(controls.empty.row);
    }
    controls.inserts = inserts;
    channel.append(inserts);
    channel.addEventListener("focusin", () => selectChannel(channelId), { signal: lifecycle.signal });
    channelControls.set(channelId, controls);
    return channel;
  }

  function renderHeader() {
    clearElement(header);
    header.append(title);
    const selector = createElement("select", {
      "aria-label": "Mixer channel",
      dataset: { mixerControl: "channel-selector" },
    });
    for (const track of project().tracks) {
      selector.append(createElement("option", { textContent: track.name, value: track.id }));
    }
    selector.append(createElement("option", { textContent: "Master", value: "master" }));
    selector.value = selectedChannelId();
    selector.addEventListener("change", () => {
      selectChannel(selector.value);
      focusDescriptor({ channelId: selector.value, control: "heading", kind: "channel" });
    }, { signal: lifecycle.signal });
    const addTrack = createElement("button", {
      className: "v2-primary-action v2-mixer-add-instrument",
      dataset: { mixerControl: "add-track" },
      disabled: project().tracks.length >= 8,
      textContent: "+ Add Instrument",
      title: project().tracks.length >= 8
        ? "A Project supports at most eight Instruments"
        : "Create a Track with a Klinto Chip instrument",
      type: "button",
      onClick: () => {
        const id = projectState.addTrack();
        selectChannel(id);
        focusDescriptor({ channelId: id, control: "heading", kind: "channel" });
      },
    });
    channelSelector = selector;
    addTrackControl = addTrack;
    header.append(createElement("label", { className: "v2-mixer-channel-selector" }, ["Channel", selector]), addTrack);
  }

  function captureFocus() {
    const active = globalThis.document?.activeElement;
    if (!active || !node.contains(active)) return null;
    if (active === title) return { kind: "control", control: "title" };
    const data = active.dataset ?? {};
    if (data.effectId) {
      return {
        action: data.effectAction,
        channelId: data.channelId,
        effectId: data.effectId,
        kind: "effect",
      };
    }
    if (data.emptyAction) {
      return {
        action: data.emptyAction,
        channelId: data.channelId,
        index: Number(data.slotIndex),
        kind: "empty-slot",
      };
    }
    if (data.channelId && data.mixerControl) {
      return { channelId: data.channelId, control: data.mixerControl, kind: "channel" };
    }
    if (data.mixerControl) return { control: data.mixerControl, kind: "control" };
    return null;
  }

  function canFocus(element) {
    return Boolean(element)
      && element.disabled !== true
      && element.isConnected !== false
      && typeof element.focus === "function";
  }

  function channelFocusTarget(channelId, control = "heading") {
    const controls = channelControls.get(channelId) ?? channelControls.get(selectedChannelId());
    if (!controls) return title;
    if (control === "heading") return controls.heading;
    if (control === "volume" || control === "pan") return controls[control]?.input ?? controls.heading;
    return controls[control] ?? controls.heading;
  }

  function resolveFocusTarget(descriptor) {
    if (!descriptor) return null;
    if (descriptor.kind === "control") {
      if (descriptor.control === "title") return title;
      if (descriptor.control === "channel-selector") return channelSelector;
      if (descriptor.control === "add-track") return addTrackControl?.disabled ? title : addTrackControl;
    }
    if (descriptor.kind === "channel") {
      return channelFocusTarget(descriptor.channelId, descriptor.control);
    }
    if (descriptor.kind === "effect-slot") {
      const effect = effectsForChannel(project(), descriptor.channelId)[descriptor.index];
      const controls = effect ? channelControls.get(descriptor.channelId)?.effects.get(effect.instanceId) : null;
      return controls?.open ?? channelFocusTarget(descriptor.channelId);
    }
    if (descriptor.kind === "effect") {
      const channel = channelControls.get(descriptor.channelId);
      const controls = channel?.effects.get(descriptor.effectId);
      if (controls) {
        const preferred = controls[descriptor.action];
        return canFocus(preferred) ? preferred : controls.open;
      }
      return channel?.empty?.add ?? channel?.heading ?? channelFocusTarget(descriptor.channelId);
    }
    if (descriptor.kind === "empty-slot") {
      const channel = channelControls.get(descriptor.channelId);
      const control = descriptor.action === "picker" ? channel?.empty?.picker : channel?.empty?.add;
      return control ?? channel?.heading ?? channelFocusTarget(descriptor.channelId);
    }
    return title;
  }

  function focusDescriptor(descriptor) {
    let target = resolveFocusTarget(descriptor);
    if (!canFocus(target)) target = channelFocusTarget(selectedChannelId());
    if (!canFocus(target)) target = title;
    if (!canFocus(target)) return false;
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
    return true;
  }

  function synchronizeControls() {
    const state = project();
    const channelIds = [...state.tracks.map(({ id }) => id), "master"];
    if (channelIds.length !== channelControls.size) return false;
    for (const channelId of channelIds) {
      const controls = channelControls.get(channelId);
      if (!controls) return false;
      const isMaster = channelId === "master";
      const track = isMaster ? null : state.tracks.find(({ id }) => id === channelId);
      const mixer = isMaster ? state.mixer.master : track.mixer;
      controls.volume.synchronize(mixer.volume);
      if (!isMaster) {
        controls.pan.synchronize(mixer.pan);
        setPressed(controls.mute, mixer.muted);
        setPressed(controls.solo, mixer.solo);
      }
      if (mixer.effects.length !== controls.effects.size) return false;
      for (let index = 0; index < mixer.effects.length; index += 1) {
        const effect = mixer.effects[index];
        const insert = controls.effects.get(effect.instanceId);
        if (!insert) return false;
        const controlContext = effectControlContext(state, channelId, effect, index);
        insert.row.classList.toggle("is-bypassed", effect.bypassed);
        insert.bypass.textContent = effect.bypassed ? "Enable" : "Bypass";
        insert.open.setAttribute("aria-label", `Open ${controlContext}`);
        insert.bypass.setAttribute("aria-label", `${effect.bypassed ? "Enable" : "Bypass"} ${controlContext}`);
        insert.earlier.setAttribute("aria-label", `Move ${controlContext} earlier`);
        insert.later.setAttribute("aria-label", `Move ${controlContext} later`);
        insert.remove.setAttribute("aria-label", `Remove ${controlContext}`);
        insert.earlier.disabled = index === 0;
        insert.later.disabled = index === mixer.effects.length - 1;
      }
    }
    refreshSelectedChannel();
    return true;
  }

  function render({ restoreFocus = null } = {}) {
    if (disposed) return;
    endHistory();
    meterElements.clear();
    channelControls.clear();
    renderHeader();
    clearElement(channelArea);
    for (const track of project().tracks) channelArea.append(createChannel(track.id));
    channelArea.append(createChannel("master"));
    renderedStructure = structureIdentity(project());
    if (restoreFocus) focusDescriptor(restoreFocus);
  }

  function refreshSelectedChannel() {
    const selected = selectedChannelId();
    if (channelSelector) channelSelector.value = selected;
    for (const [channelId, controls] of channelControls) {
      controls.channel.classList.toggle("is-selected", channelId === selected);
    }
  }

  function updateMeters() {
    if (disposed) return;
    for (const [channelId, meter] of meterElements) {
      const level = Math.max(0, Math.min(1, Number(getMeterLevel(channelId)) || 0));
      meter.value = level;
      meter.classList.toggle("is-clipping", level >= 0.99);
    }
    frame = requestAnimationFrameFn?.(updateMeters) ?? null;
  }

  function handleProjectChange() {
    const descriptor = pendingFocus ?? captureFocus();
    pendingFocus = null;
    if (structureIdentity(project()) === renderedStructure && synchronizeControls()) return;
    render({ restoreFocus: descriptor });
  }

  const handleWorkspaceChange = (event) => {
    if (event.detail?.action?.type.startsWith("mixer/")) refreshSelectedChannel();
  };
  projectState.addEventListener("change", handleProjectChange);
  workspaceState.addEventListener?.("change", handleWorkspaceChange);
  render();
  frame = requestAnimationFrameFn?.(updateMeters) ?? null;

  return Object.freeze({
    dispose() {
      if (disposed) return;
      disposed = true;
      endHistory();
      lifecycle.abort();
      if (frame !== null) cancelAnimationFrameFn?.(frame);
      frame = null;
      projectState.removeEventListener("change", handleProjectChange);
      workspaceState.removeEventListener?.("change", handleWorkspaceChange);
      meterElements.clear();
      channelControls.clear();
      node.remove();
    },
    focus: () => title.focus({ preventScroll: true }),
    node,
    render,
    synchronize: synchronizeControls,
  });
}
