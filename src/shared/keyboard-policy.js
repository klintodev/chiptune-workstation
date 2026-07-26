const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "details",
  "dialog",
  "input",
  "select",
  "summary",
  "textarea",
  "[contenteditable='true']",
  "[role='button']",
  "[role='checkbox']",
  "[role='dialog']",
  "[role='link']",
  "[role='menu']",
  "[role='menuitem']",
  "[role='radio']",
  "[role='slider']",
  "[role='switch']",
  "[role='tab']",
].join(", ");

export function isInteractiveShortcutTarget(target) {
  return Boolean(target?.closest?.(INTERACTIVE_SELECTOR));
}

export function hasOpenShortcutBlockingSurface(root) {
  return Boolean(root?.querySelector?.(
    "dialog[open], details[open], [role='menu']:not([hidden])",
  ));
}

export function isGlobalShortcutEligible(event, root) {
  return !event.defaultPrevented
    && !event.repeat
    && !isInteractiveShortcutTarget(event.target)
    && !hasOpenShortcutBlockingSurface(root);
}
