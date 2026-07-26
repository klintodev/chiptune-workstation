export function setTextIfChanged(element, value) {
  const text = String(value);
  if (element.textContent === text) return false;
  element.textContent = text;
  return true;
}

export function announceStatus(root, value) {
  const status = root?.querySelector?.("#workstation-status");
  return status ? setTextIfChanged(status, value) : false;
}
