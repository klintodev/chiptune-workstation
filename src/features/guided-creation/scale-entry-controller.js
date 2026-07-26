import { snapMidiNoteToScale } from "../../music/scale.js";

export function createScaleEntryController({
  getScaleGuide,
  maximum = 112,
  minimum = 36,
} = {}) {
  if (typeof getScaleGuide !== "function") {
    throw new TypeError("Scale entry requires the current project guide.");
  }
  const events = new EventTarget();
  let bypassArmed = false;

  function emitChange() {
    events.dispatchEvent(new CustomEvent("change", {
      detail: Object.freeze({ bypassArmed }),
    }));
  }

  function setBypassArmed(armed) {
    if (typeof armed !== "boolean") throw new TypeError("Scale-lock bypass must be enabled or disabled.");
    if (bypassArmed === armed) return false;
    bypassArmed = armed;
    emitChange();
    return true;
  }

  function resolve(note, {
    consumeBypass = true,
    maximum: upper = maximum,
    minimum: lower = minimum,
  } = {}) {
    const bypass = bypassArmed;
    const resolved = snapMidiNoteToScale(note, getScaleGuide(), {
      bypass,
      maximum: upper,
      minimum: lower,
    });
    if (bypass && consumeBypass) setBypassArmed(false);
    return resolved;
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    armBypass: () => setBypassArmed(true),
    cancelBypass: () => setBypassArmed(false),
    getState: () => Object.freeze({ bypassArmed }),
    preview: (note, bounds) => resolve(note, { ...bounds, consumeBypass: false }),
    removeEventListener: events.removeEventListener.bind(events),
    resolve,
  });
}
