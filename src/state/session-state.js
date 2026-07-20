const DEFAULT_SESSION = Object.freeze({
  activeNotes: Object.freeze([]),
  audio: Object.freeze({ error: null, status: "idle" }),
  editor: Object.freeze({ clearPatternArmed: false, selectedStepIndex: null }),
  transport: Object.freeze({ retainedStepIndex: 0, status: "stopped" }),
  theme: Object.freeze({ value: "dark" }),
  workspace: Object.freeze({
    activeDockPanel: "sequencer",
    arrangementStartStep: 0,
    detailPanelCollapsed: false,
    playbackMode: "arrangement",
    selectedClipId: null,
    selectedPatternId: "pattern-1",
    selectedTrackId: "track-1",
  }),
});

function freezeSession(session) {
  Object.freeze(session.activeNotes);
  Object.freeze(session.audio);
  Object.freeze(session.editor);
  Object.freeze(session.transport);
  Object.freeze(session.theme);
  Object.freeze(session.workspace);
  return Object.freeze(session);
}

function normalizeSession(session) {
  return freezeSession({
    ...session,
    activeNotes: [...session.activeNotes],
    audio: { ...session.audio },
    editor: { ...session.editor },
    transport: { ...session.transport },
    theme: { ...session.theme },
    workspace: { ...session.workspace },
  });
}

export function createSessionState(initial = DEFAULT_SESSION) {
  const events = new EventTarget();
  let state = normalizeSession({
    ...DEFAULT_SESSION,
    ...initial,
    audio: { ...DEFAULT_SESSION.audio, ...initial.audio },
    editor: { ...DEFAULT_SESSION.editor, ...initial.editor },
    transport: { ...DEFAULT_SESSION.transport, ...initial.transport },
    theme: { ...DEFAULT_SESSION.theme, ...initial.theme },
    workspace: { ...DEFAULT_SESSION.workspace, ...initial.workspace },
  });

  function getState() {
    return state;
  }

  function emitChange(slice) {
    events.dispatchEvent(new CustomEvent("change", {
      detail: Object.freeze({ slice, state }),
    }));
  }

  function update(slice, values) {
    const nextSlice = { ...state[slice], ...values };
    const changed = Object.entries(values).some(([key, value]) => state[slice][key] !== value);
    if (!changed) return false;
    state = normalizeSession({ ...state, [slice]: nextSlice });
    emitChange(slice);
    return true;
  }

  function setActiveNotes(notes) {
    const nextNotes = [...notes].sort((left, right) => left - right);
    if (
      nextNotes.length === state.activeNotes.length &&
      nextNotes.every((note, index) => note === state.activeNotes[index])
    ) return false;
    state = normalizeSession({ ...state, activeNotes: nextNotes });
    emitChange("activeNotes");
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
    setTheme: (values) => update("theme", values),
    setWorkspace: (values) => update("workspace", values),
  });
}
