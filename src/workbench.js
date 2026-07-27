import { createStoryRegistry } from "./workbench/story-registry.js";
import { stories } from "./workbench/story-catalog.js";

const registry = createStoryRegistry(stories);
const elements = {
  canvas: document.querySelector("#story-canvas"),
  description: document.querySelector("#story-description"),
  group: document.querySelector("#story-group"),
  navigation: document.querySelector("#story-navigation"),
  scenario: document.querySelector("#scenario-select"),
  search: document.querySelector("#story-search"),
  source: document.querySelector("#story-source"),
  theme: document.querySelector("#theme-toggle"),
  title: document.querySelector("#story-title"),
  viewport: document.querySelector("#story-viewport"),
  viewportSelect: document.querySelector("#viewport-select"),
};
let disposeStory = null;

function selectionFromHash() {
  const [storyId, scenarioId] = location.hash.slice(1).split("--");
  return registry.resolve(storyId, scenarioId);
}

function storyHash(storyId, scenarioId) {
  return `#${storyId}--${scenarioId}`;
}

function renderNavigation(filter = "") {
  const current = selectionFromHash();
  const normalizedFilter = filter.trim().toLowerCase();
  const matching = registry.all().filter((story) => (
    `${story.group} ${story.title} ${story.description}`.toLowerCase().includes(normalizedFilter)
  ));
  const grouped = new Map();
  for (const story of matching) {
    const groupStories = grouped.get(story.group) ?? [];
    groupStories.push(story);
    grouped.set(story.group, groupStories);
  }
  const fragment = document.createDocumentFragment();

  for (const [group, groupStories] of grouped) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    section.className = "story-group";
    heading.textContent = group;
    section.append(heading);
    for (const story of groupStories) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = story.title;
      if (story.id === current.story.id) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => {
        location.hash = storyHash(story.id, story.scenarios[0].id);
      });
      section.append(button);
    }
    fragment.append(section);
  }

  if (matching.length === 0) {
    const empty = document.createElement("p");
    empty.className = "story-navigation-empty";
    empty.textContent = "No matching features.";
    fragment.append(empty);
  }
  elements.navigation.replaceChildren(fragment);
}

function renderStory() {
  const { story, scenario } = selectionFromHash();
  const canonicalHash = storyHash(story.id, scenario.id);
  if (location.hash !== canonicalHash) {
    history.replaceState(null, "", canonicalHash);
  }

  disposeStory?.();
  disposeStory = null;
  elements.group.textContent = story.group;
  elements.title.textContent = story.title;
  elements.description.textContent = story.description;
  elements.source.textContent = story.source;
  elements.scenario.replaceChildren(...story.scenarios.map((candidate) => {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = candidate.title;
    option.selected = candidate.id === scenario.id;
    return option;
  }));
  disposeStory = story.mount({ canvas: elements.canvas, scenario });
  renderNavigation(elements.search.value);
}

elements.search.addEventListener("input", () => renderNavigation(elements.search.value));
elements.scenario.addEventListener("change", () => {
  const { story } = selectionFromHash();
  location.hash = storyHash(story.id, elements.scenario.value);
});
elements.viewportSelect.addEventListener("change", () => {
  elements.viewport.dataset.viewport = elements.viewportSelect.value;
});
elements.theme.addEventListener("click", () => {
  const light = document.documentElement.dataset.theme !== "light";
  document.documentElement.dataset.theme = light ? "light" : "dark";
  elements.theme.textContent = light ? "Dark theme" : "Light theme";
  elements.theme.setAttribute("aria-pressed", String(light));
});
window.addEventListener("hashchange", renderStory);
window.addEventListener("beforeunload", () => disposeStory?.());

renderStory();
