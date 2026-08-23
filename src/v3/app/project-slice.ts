import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { z } from "zod";

import { createProject, type Project } from "../project";

interface ProjectState {
  document: Project;
}

interface ProjectNameCommit {
  name: string;
  committedAt: string;
}

const strictTimestampSchema = z.string().datetime({ offset: true });

function createProjectState(document: Project = createProject()): ProjectState {
  return { document };
}

const projectSlice = createSlice({
  name: "project",
  initialState: createProjectState,
  reducers: {
    projectRenamed(state, action: PayloadAction<ProjectNameCommit>) {
      const name = action.payload.name.trim();

      if (!name || name === state.document.name) return;

      const timestampResult = strictTimestampSchema.safeParse(action.payload.committedAt);
      if (!timestampResult.success) return;

      const committedAtMilliseconds = Date.parse(timestampResult.data);
      const createdAtMilliseconds = Date.parse(state.document.createdAt);
      const updatedAtMilliseconds = Date.parse(state.document.updatedAt);
      if (
        !Number.isFinite(committedAtMilliseconds) ||
        !Number.isFinite(createdAtMilliseconds) ||
        !Number.isFinite(updatedAtMilliseconds) ||
        committedAtMilliseconds < createdAtMilliseconds ||
        committedAtMilliseconds < updatedAtMilliseconds
      ) {
        return;
      }

      state.document.name = name;
      state.document.revision += 1;
      state.document.updatedAt = timestampResult.data;
    },
  },
});

export const { projectRenamed } = projectSlice.actions;
export const projectReducer = projectSlice.reducer;
