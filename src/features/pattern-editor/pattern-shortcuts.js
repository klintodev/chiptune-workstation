import { isGlobalShortcutEligible } from "../../shared/keyboard-policy.js";

export function createPatternHistoryShortcut({ undo, redo, root = globalThis.document }) {
  return function handlePatternHistoryShortcut(event) {
    if (
      event.altKey ||
      (!event.ctrlKey && !event.metaKey) ||
      !isGlobalShortcutEligible(event, root)
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
