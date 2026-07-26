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

const MUSICAL_INPUT_SELECTOR = [
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[role='combobox']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='textbox']",
].join(", ");

function isInsideInactiveSurface(element) {
  return Boolean(element?.closest?.(
    "dialog:not([open]), [hidden], [aria-hidden='true']",
  ));
}

function hasVisibleMatchingSurface(root, selector) {
  const candidates = root?.querySelectorAll?.(selector);
  if (candidates) {
    return [...candidates].some((candidate) => !isInsideInactiveSurface(candidate));
  }
  const candidate = root?.querySelector?.(selector);
  return Boolean(candidate && !isInsideInactiveSurface(candidate));
}

export function isInteractiveShortcutTarget(target) {
  return Boolean(target?.closest?.(INTERACTIVE_SELECTOR));
}

export function hasOpenShortcutBlockingSurface(root) {
  return hasVisibleMatchingSurface(
    root,
    "dialog[open], details[open], [role='menu']:not([hidden])",
  );
}

export function isMusicalKeyboardEligible(event, root) {
  return !event.defaultPrevented
    && !event.repeat
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.target?.closest?.(MUSICAL_INPUT_SELECTOR)
    && !hasVisibleMatchingSurface(root, "dialog[open], [role='menu']:not([hidden])");
}

export function isGlobalShortcutEligible(event, root) {
  return !event.defaultPrevented
    && !event.repeat
    && !isInteractiveShortcutTarget(event.target)
    && !hasOpenShortcutBlockingSurface(root);
}
