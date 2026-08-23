import { describe, expect, it } from "vitest";

import { projectReducer, projectRenamed } from "./project-slice";
import { createAppStore } from "./store";
import {
  browserViewChanged,
  editorViewChanged,
  workspaceReducer,
  workspaceSelectionChanged,
} from "./workspace-slice";

describe("V3 application state", () => {
  it("creates a fresh project document for each store", () => {
    const firstStore = createAppStore();
    const secondStore = createAppStore();

    const firstDocument = firstStore.getState().project.document;
    const secondDocument = secondStore.getState().project.document;

    expect(firstDocument).not.toBe(secondDocument);
    expect(firstDocument.id).not.toBe(secondDocument.id);
  });

  it("commits a project rename as one semantic revision", () => {
    const initialState = projectReducer(undefined, { type: "test/initial" });
    const committedAt = timestampRelativeTo(initialState.document.updatedAt, 1_000);

    const renamedState = projectReducer(
      initialState,
      projectRenamed({ committedAt, name: "  Night Circuit  " }),
    );

    expect(renamedState.document).toMatchObject({
      name: "Night Circuit",
      revision: initialState.document.revision + 1,
      updatedAt: committedAt,
    });
    expect(initialState.document.name).toBe("Untitled chiptune");
  });

  it("does not create a revision for an empty or unchanged project name", () => {
    const initialState = projectReducer(undefined, { type: "test/initial" });
    const committedAt = timestampRelativeTo(initialState.document.updatedAt, 1_000);

    const emptyNameState = projectReducer(
      initialState,
      projectRenamed({ committedAt, name: "   " }),
    );
    const unchangedNameState = projectReducer(
      initialState,
      projectRenamed({ committedAt, name: ` ${initialState.document.name} ` }),
    );

    expect(emptyNameState).toBe(initialState);
    expect(unchangedNameState).toBe(initialState);
  });

  it("rejects rename commits without a strict ISO timestamp", () => {
    const initialState = projectReducer(undefined, { type: "test/initial" });

    for (const committedAt of [
      "not-a-timestamp",
      "2026-08-23 12:30:00Z",
      "2026-02-30T12:30:00.000Z",
    ]) {
      const candidate = projectReducer(
        initialState,
        projectRenamed({ committedAt, name: "Night Circuit" }),
      );

      expect(candidate).toBe(initialState);
    }
  });

  it("rejects rename commits older than the project or its latest revision", () => {
    const initialState = projectReducer(undefined, { type: "test/initial" });
    const beforeCreation = timestampRelativeTo(initialState.document.createdAt, -1_000);
    const currentCommit = timestampRelativeTo(initialState.document.updatedAt, 2_000);
    const staleCommit = timestampRelativeTo(initialState.document.updatedAt, 1_000);
    const currentState = projectReducer(
      initialState,
      projectRenamed({ committedAt: currentCommit, name: "Current name" }),
    );

    expect(
      projectReducer(
        initialState,
        projectRenamed({ committedAt: beforeCreation, name: "Before creation" }),
      ),
    ).toBe(initialState);
    expect(
      projectReducer(
        currentState,
        projectRenamed({ committedAt: staleCommit, name: "Stale name" }),
      ),
    ).toBe(currentState);
  });

  it("keeps editor-only choices in the workspace slice", () => {
    const initialState = workspaceReducer(undefined, { type: "test/initial" });
    const selectedState = workspaceReducer(
      workspaceReducer(
        workspaceReducer(initialState, browserViewChanged("instruments")),
        editorViewChanged("arrangement"),
      ),
      workspaceSelectionChanged({ id: "track-1", kind: "track" }),
    );

    expect(selectedState).toEqual({
      browserView: "instruments",
      editorView: "arrangement",
      selection: { id: "track-1", kind: "track" },
    });
  });
});

function timestampRelativeTo(timestamp: string, offsetMilliseconds: number): string {
  return new Date(Date.parse(timestamp) + offsetMilliseconds).toISOString();
}
