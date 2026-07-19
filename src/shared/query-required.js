export function queryRequired(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Required interface element is missing: ${selector}`);
  return element;
}
