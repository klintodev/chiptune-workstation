import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { createProject, type Project } from "../project";

interface ProjectState {
  document: Project;
}

interface ProjectNameCommit {
  name: string;
  committedAt: string;
}

function createProjectState(document: Project = createProject()): ProjectState {
  return { document };
}

const projectSlice = createSlice({
  name: "project",
  initialState: createProjectState(),
  reducers: {
    projectRenamed(state, action: PayloadAction<ProjectNameCommit>) {
      const name = action.payload.name.trim();

      if (!name || name === state.document.name) return;

      state.document.name = name;
      state.document.revision += 1;
      state.document.updatedAt = action.payload.committedAt;
    },
  },
});

export const { projectRenamed } = projectSlice.actions;
export const projectReducer = projectSlice.reducer;
