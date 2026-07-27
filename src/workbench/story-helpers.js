export function createStoryRoot(canvas, { layout = "center" } = {}) {
  const root = canvas.ownerDocument.createElement("section");
  root.className = "story-frame";
  root.dataset.layout = layout;
  canvas.replaceChildren(root);
  return root;
}

export function queryStory(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Story fixture is missing ${selector}.`);
  return element;
}

export function disposeAll(...disposables) {
  return () => {
    for (const disposable of disposables.reverse()) disposable?.dispose?.();
  };
}
