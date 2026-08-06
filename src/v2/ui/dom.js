export function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    const isNode = (typeof globalThis.Node === "function" && child instanceof globalThis.Node)
      || (typeof child === "object" && Number.isInteger(child?.nodeType));
    node.append(isNode ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function createElement(tagName, attributes = {}, children = []) {
  const node = document.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === "className") {
      node.className = value;
    } else if (name === "textContent") {
      node.textContent = value;
    } else if (name === "dataset") {
      Object.assign(node.dataset, value);
    } else if (name === "style") {
      Object.assign(node.style, value);
    } else if (name.startsWith("on") && typeof value === "function") {
      node.addEventListener(name.slice(2).toLowerCase(), value);
    } else if (name in node && !name.startsWith("aria-") && name !== "role") {
      try {
        node[name] = value;
      } catch {
        node.setAttribute(name, String(value));
      }
    } else {
      node.setAttribute(name, value === true ? "" : String(value));
    }
  }
  return appendChildren(node, children);
}

export function clearElement(node) {
  node.replaceChildren();
  return node;
}

export function isConnectedFocusable(node) {
  if (!node?.isConnected || node.disabled || node.hidden) return false;
  if (node.getAttribute?.("aria-hidden") === "true") return false;
  const style = globalThis.getComputedStyle?.(node);
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  return typeof node.focus === "function";
}

export function focusFirst(...candidates) {
  const target = candidates.flat(Infinity).find(isConnectedFocusable);
  target?.focus({ preventScroll: true });
  return target ?? null;
}

export function createLabeledRange({
  label,
  max,
  min,
  onChange,
  onCommit,
  step,
  unit = "",
  value,
}) {
  const output = createElement("output", { textContent: `${value}${unit}` });
  const input = createElement("input", {
    "aria-label": label,
    max,
    min,
    step,
    type: "range",
    value,
  });
  input.addEventListener("input", () => {
    output.value = `${input.value}${unit}`;
    onChange?.(Number(input.value), input);
  });
  input.addEventListener("change", () => onCommit?.(Number(input.value), input));
  return {
    input,
    node: createElement("label", { className: "v2-parameter" }, [
      createElement("span", { textContent: label }),
      input,
      output,
    ]),
    output,
  };
}

export function setPressed(button, pressed) {
  button.setAttribute("aria-pressed", String(Boolean(pressed)));
  button.classList.toggle("is-active", Boolean(pressed));
}
