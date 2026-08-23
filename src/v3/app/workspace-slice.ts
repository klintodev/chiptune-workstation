import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type BrowserView = "patterns" | "instruments";
type EditorView = "pattern" | "arrangement";

type WorkspaceSelection =
  | { kind: "instrument"; id: string }
  | { kind: "pattern"; id: string }
  | { kind: "track"; id: string }
  | null;

interface WorkspaceState {
  browserView: BrowserView;
  editorView: EditorView;
  selection: WorkspaceSelection;
}

const initialWorkspaceState: WorkspaceState = {
  browserView: "patterns",
  editorView: "pattern",
  selection: null,
};

const workspaceSlice = createSlice({
  name: "workspace",
  initialState: initialWorkspaceState,
  reducers: {
    browserViewChanged(state, action: PayloadAction<BrowserView>) {
      state.browserView = action.payload;
    },
    editorViewChanged(state, action: PayloadAction<EditorView>) {
      state.editorView = action.payload;
    },
    workspaceSelectionChanged(state, action: PayloadAction<WorkspaceSelection>) {
      state.selection = action.payload;
    },
  },
});

export const { browserViewChanged, editorViewChanged, workspaceSelectionChanged } =
  workspaceSlice.actions;
export const workspaceReducer = workspaceSlice.reducer;
