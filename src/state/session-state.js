const DEFAULT_SESSION = Object.freeze({
  activeNotes: Object.freeze([]),
  audio: Object.freeze({ error: null, status: "idle" }),
  editor: Object.freeze({ clearPatternArmed: false, selectedStepIndex: null }),
  transport: Object.freeze({ retainedStepIndex: 0, status: "stopped" }),
});

function freezeSession(session) {
  Object.freeze(session.activeNotes);
  Object.freeze(session.audio);
  Object.freeze(session.editor);
  Object.freeze(session.transport);
  return Object.freeze(session);
}

function normalizeSession(session) {
  return freezeSession({
    ...session,
    activeNotes: [...session.activeNotes],
    audio: { ...session.audio },
    editor: { ...session.editor },
    transport: { ...session.transport },
  });
}

export function createSessionState(initial = DEFAULT_SESSION) {
  const events = new EventTarget();
  let state = normalizeSession(initial);

  function getState() {
    return state;
  }

  function update(slice, values) {
    const nextSlice = { ...state[slice], ...values };
    const changed = Object.entries(values).some(([key, value]) => state[slice][key] !== value);
    if (!changed) return false;
    state = normalizeSession({ ...state, [slice]: nextSlice });
    events.dispatchEvent(new CustomEvent("change", {
      detail: Object.freeze({ slice, state }),
    }));
    return true;
  }

  function setActiveNotes(notes) {
    const nextNotes = [...notes].sort((left, right) => left - right);
    if (
      nextNotes.length === state.activeNotes.length &&
      nextNotes.every((note, index) => note === state.activeNotes[index])
    ) return false;
    state = normalizeSession({ ...state, activeNotes: nextNotes });
    events.dispatchEvent(new CustomEvent("change", {
      detail: Object.freeze({ slice: "activeNotes", state }),
    }));
    return true;
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    getState,
    removeEventListener: events.removeEventListener.bind(events),
    setActiveNotes,
    setAudio: (values) => update("audio", values),
    setEditor: (values) => update("editor", values),
    setTransport: (values) => update("transport", values),
  });
}
