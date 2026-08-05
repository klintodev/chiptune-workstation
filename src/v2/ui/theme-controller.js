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
      const nextTheme = theme === "light" ? "dark" : "light";
      button.dataset.theme = theme;
      button.setAttribute("aria-pressed", String(theme === "light"));
      button.setAttribute("aria-label", `Use ${nextTheme} theme`);
      button.title = `Use ${nextTheme} theme`;
      const icon = button.querySelector?.("[data-theme-icon]");
      const label = button.querySelector?.("[data-theme-label]");
      if (icon && label) {
        icon.textContent = theme === "dark" ? "\u263e" : "\u2600";
        label.textContent = theme === "dark" ? "Dark" : "Light";
      } else {
        button.textContent = `Theme: ${theme === "light" ? "Light" : "Dark"}`;
      }
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
