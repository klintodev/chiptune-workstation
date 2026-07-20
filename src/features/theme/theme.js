import { queryRequired } from "../../shared/query-required.js";

const THEMES = new Set(["dark", "light"]);

export function createThemeFeature({ root = document, sessionState }) {
  const lifecycle = new AbortController();
  const toggle = queryRequired(root, "#theme-toggle");
  const themeRoot = root.documentElement ?? root;

  function render() {
    const requested = sessionState.getState().theme.value;
    const theme = THEMES.has(requested) ? requested : "dark";
    themeRoot.dataset.theme = theme;
    toggle.setAttribute("aria-pressed", String(theme === "light"));
    toggle.setAttribute("aria-label", `Use ${theme === "dark" ? "light" : "dark"} theme`);
    toggle.title = `Use ${theme === "dark" ? "light" : "dark"} theme`;
    toggle.querySelector("[data-theme-icon]").textContent = theme === "dark" ? "☾" : "☀";
    toggle.querySelector("[data-theme-label]").textContent = theme === "dark" ? "Dark" : "Light";
  }

  toggle.addEventListener("click", () => {
    const current = sessionState.getState().theme.value;
    sessionState.setTheme({ value: current === "dark" ? "light" : "dark" });
  }, { signal: lifecycle.signal });
  sessionState.addEventListener("change", (event) => {
    if (event.detail.slice === "theme") render();
  }, { signal: lifecycle.signal });

  render();
  return Object.freeze({ dispose: () => lifecycle.abort(), render });
}
