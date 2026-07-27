export function displayStoryDialog(root, dialog) {
  if (dialog.open) dialog.close();
  dialog.setAttribute("open", "");
  root.append(dialog);
  return dialog;
}

export function createStoryEventSource(initialState) {
  const events = new EventTarget();
  let state = initialState;
  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    emit(type = "change", detail = {}) {
      events.dispatchEvent(new CustomEvent(type, { detail }));
    },
    getState: () => state,
    removeEventListener: events.removeEventListener.bind(events),
    setState(nextState, type = "change", detail = {}) {
      state = nextState;
      events.dispatchEvent(new CustomEvent(type, { detail }));
    },
  });
}
