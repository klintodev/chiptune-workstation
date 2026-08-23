import { combineReducers, configureStore } from "@reduxjs/toolkit";

import { projectReducer } from "./project-slice";
import { workspaceReducer } from "./workspace-slice";

const rootReducer = combineReducers({
  project: projectReducer,
  workspace: workspaceReducer,
});

export function createAppStore() {
  return configureStore({
    reducer: rootReducer,
  });
}

export const store = createAppStore();

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore["dispatch"];
