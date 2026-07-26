import { queryRequired } from "../../shared/query-required.js";

const THEMES = new Set(["dark", "light"]);

export function createThemeFeature({ root = document, sessionState }) {
  const lifecycle = new AbortController();
  const crtToggle = queryRequired(root, "#crt-toggle");
  const toggle = queryRequired(root, "#theme-toggle");
  const themeRoot = root.documentElement ?? root;

  function render() {
    const themeState = sessionState.getState().theme;
    const requested = themeState.value;
    const theme = THEMES.has(requested) ? requested : "dark";
    const crt = themeState.crt !== false;
    themeRoot.dataset.theme = theme;
    themeRoot.dataset.crt = crt ? "on" : "off";
    toggle.setAttribute("aria-pressed", String(theme === "light"));
    toggle.setAttribute("aria-label", `Use ${theme === "dark" ? "light" : "dark"} theme`);
    toggle.title = `Use ${theme === "dark" ? "light" : "dark"} theme`;
    toggle.querySelector("[data-theme-icon]").textContent = theme === "dark" ? "☾" : "☀";
    toggle.querySelector("[data-theme-label]").textContent = theme === "dark" ? "Dark" : "Light";
    crtToggle.setAttribute("aria-pressed", String(crt));
    crtToggle.setAttribute("aria-label", `Turn CRT texture ${crt ? "off" : "on"}`);
    crtToggle.title = `Turn CRT texture ${crt ? "off" : "on"}`;
    crtToggle.querySelector(".visually-hidden").textContent = `CRT texture ${crt ? "on" : "off"}`;
  }

  toggle.addEventListener("click", () => {
    const current = sessionState.getState().theme.value;
    sessionState.setTheme({ value: current === "dark" ? "light" : "dark" });
  }, { signal: lifecycle.signal });
  crtToggle.addEventListener("click", () => {
    sessionState.setTheme({ crt: sessionState.getState().theme.crt === false });
  }, { signal: lifecycle.signal });
  sessionState.addEventListener("change", (event) => {
    if (event.detail.slice === "theme") render();
  }, { signal: lifecycle.signal });

  render();
  return Object.freeze({ dispose: () => lifecycle.abort(), render });
}
