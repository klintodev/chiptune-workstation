function validateScenario(storyId, scenario) {
  if (!scenario?.id || !scenario?.title) {
    throw new TypeError(`Story "${storyId}" has a scenario without an id and title.`);
  }
}

export function defineStory(definition) {
  const { id, title, group, description, source, scenarios, mount } = definition;
  if (!id || !title || !group || !description || !source || typeof mount !== "function") {
    throw new TypeError("Stories require id, title, group, description, source, and mount.");
  }
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new TypeError(`Story "${id}" requires at least one scenario.`);
  }
  scenarios.forEach((scenario) => validateScenario(id, scenario));
  return Object.freeze({
    ...definition,
    scenarios: Object.freeze(scenarios.map((scenario) => Object.freeze({ ...scenario }))),
  });
}

export function createStoryRegistry(stories) {
  const byId = new Map();
  for (const story of stories) {
    if (byId.has(story.id)) throw new Error(`Duplicate story id: ${story.id}`);
    byId.set(story.id, story);
  }

  function resolve(storyId, scenarioId) {
    const story = byId.get(storyId) ?? stories[0];
    const scenario = story.scenarios.find(({ id }) => id === scenarioId) ?? story.scenarios[0];
    return Object.freeze({ story, scenario });
  }

  return Object.freeze({
    all: () => [...stories],
    resolve,
  });
}
