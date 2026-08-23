import { describe, expect, it } from "vitest";

import { projectReducer, projectRenamed } from "./project-slice";
import {
  browserViewChanged,
  editorViewChanged,
  workspaceReducer,
  workspaceSelectionChanged,
} from "./workspace-slice";

describe("V3 application state", () => {
  it("commits a project rename as one semantic revision", () => {
    const initialState = projectReducer(undefined, { type: "test/initial" });
    const committedAt = "2026-08-23T12:30:00.000Z";

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
    const committedAt = "2026-08-23T12:30:00.000Z";

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
