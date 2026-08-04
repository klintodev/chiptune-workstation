const THEME_KEY = "chiptune-workstation:theme";

function readTheme(storage) {
  try {
    const value = storage?.getItem(THEME_KEY);
    return value === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function createV2ThemeController({
  document: documentLike = document,
  storage = globalThis.localStorage,
} = {}) {
  let theme = readTheme(storage);

  function render() {
    documentLike.documentElement.dataset.theme = theme;
    const button = documentLike.querySelector("#theme-toggle");
    if (button) {
      button.setAttribute("aria-pressed", String(theme === "light"));
      button.setAttribute("aria-label", `Use ${theme === "light" ? "dark" : "light"} theme`);
      button.textContent = `${theme === "light" ? "Dark" : "Light"} theme`;
    }
  }

  function toggle() {
    theme = theme === "dark" ? "light" : "dark";
    try {
      storage?.setItem(THEME_KEY, theme);
    } catch {
      // Theme choice remains session-local if storage is unavailable.
    }
    render();
    return theme;
  }

  render();
  return Object.freeze({ getTheme: () => theme, render, toggle });
}
