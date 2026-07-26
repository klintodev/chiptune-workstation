import { createProjectDocument } from "../../persistence/project-document.js";
import {
  createStarterPreview,
  getStarterRecipe,
} from "../../music/starter-recipe.js";

export function createStarterService({
  checkpointService,
  onBeforeProjectChange = () => {},
  persistence,
  projectState,
} = {}) {
  if (
    !checkpointService?.protectAndReplace
    || !persistence?.createProjectFromTemplate
    || !projectState?.applyProjectTransform
  ) throw new TypeError("Starter recipes require project, persistence, and checkpoint services.");

  function preview(recipeId, destination) {
    return createStarterPreview({
      currentProject: projectState.getState(),
      destination,
      recipe: getStarterRecipe(recipeId),
    });
  }

  async function apply(candidate) {
    if (!candidate?.recipe?.id || !candidate.destination) {
      throw new TypeError("Preview a starter recipe before applying it.");
    }
    const current = projectState.getState();
    if (
      candidate.destination !== "new"
      && JSON.stringify(current) !== candidate.sourceSignature
    ) throw new Error("This project changed after the starter preview. Preview it again.");
    const refreshed = createStarterPreview({
      currentProject: current,
      destination: candidate.destination,
      recipe: getStarterRecipe(candidate.recipe.id),
    });
    onBeforeProjectChange();
    if (refreshed.destination === "new") {
      const document = await persistence.createProjectFromTemplate(refreshed.targetProject);
      return Object.freeze({ destination: "new", document, preview: refreshed });
    }
    if (refreshed.destination === "add") {
      projectState.applyProjectTransform(refreshed.targetProject, {
        operation: "add-starter-recipe",
        starterRecipeId: refreshed.recipe.id,
        starterRecipeVersion: refreshed.recipe.recipeVersion,
      });
      return Object.freeze({ destination: "add", preview: refreshed });
    }
    const active = persistence.getActiveDocument();
    const target = createProjectDocument(refreshed.targetProject, {
      id: active.id,
      now: active.updatedAt,
    });
    const result = await checkpointService.protectAndReplace(target, {
      label: `Before replacing with ${refreshed.recipe.name}`,
      operation: "starter",
    });
    return Object.freeze({ destination: "replace", preview: refreshed, result });
  }

  return Object.freeze({ apply, preview });
}
