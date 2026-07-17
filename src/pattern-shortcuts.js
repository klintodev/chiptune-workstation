function isEditableControl(target) {
  return Boolean(target?.closest?.("input, select, textarea, [contenteditable='true']"));
}

export function createPatternHistoryShortcut({ undo, redo }) {
  return function handlePatternHistoryShortcut(event) {
    if (
      event.repeat ||
      event.altKey ||
      (!event.ctrlKey && !event.metaKey) ||
      isEditableControl(event.target)
    ) {
      return false;
    }

    const key = event.key.toLowerCase();
    const isUndo = key === "z" && !event.shiftKey;
    const isRedo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
    if (!isUndo && !isRedo) return false;

    event.preventDefault();
    event.stopImmediatePropagation();
    return isUndo ? undo() : redo();
  };
}
