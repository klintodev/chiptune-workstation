import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

import { App } from "./app/App";
import { store } from "./app/store";
import "./app/tokens.css";

const rootElement = document.getElementById("v3-root");

if (!(rootElement instanceof HTMLElement)) {
  throw new Error("V3 requires a #v3-root mount element.");
}

createRoot(rootElement).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
