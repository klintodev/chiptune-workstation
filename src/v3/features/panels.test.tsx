import { fireEvent, screen } from "@testing-library/dom";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it } from "vitest";

import { createAppStore, type AppStore } from "../app/store";
import { BrowserPanel } from "./browser/BrowserPanel";
import { EditorPanel } from "./editor/EditorPanel";
import { InspectorPanel } from "./inspector/InspectorPanel";
import { TransportBar } from "./transport/TransportBar";

afterEach(cleanup);

function renderWithStore(element: ReactElement) {
  const store: AppStore = createAppStore();
  return render(<Provider store={store}>{element}</Provider>);
}

describe("when V3 panels render", () => {
  it("then the project browser should render and switch views", () => {
    renderWithStore(<BrowserPanel />);

    expect(screen.getByRole("button", { name: /Pattern 1/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Instruments" }));

    expect(screen.getByText("Pulse")).toBeTruthy();
  });

  it("then the editor surface should render and switch views", () => {
    renderWithStore(<EditorPanel />);

    expect(screen.getByText("Editing pattern")).toBeTruthy();
    expect(screen.getByText("Pattern 1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));

    expect(screen.getByText("Arrangement")).toBeTruthy();
  });

  it("then the inspector should render project-backed values", () => {
    renderWithStore(<InspectorPanel />);

    expect(screen.getByText("Pulse 1")).toBeTruthy();
    expect(screen.getByText("Instrument")).toBeTruthy();
    expect(screen.getByText("Channel")).toBeTruthy();
    expect(screen.getByText("Project")).toBeTruthy();
  });

  it("then the transport should render project tempo without fake runtime state", () => {
    render(<TransportBar bpm={128} />);

    expect(screen.getByText("128")).toBeTruthy();
    expect(screen.getByText("BPM")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
