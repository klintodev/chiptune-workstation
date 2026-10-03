import assert from "node:assert/strict";
import test from "node:test";
import { createProjectLibraryFeature } from "../src/features/project-library/project-library.js";
import { createDefaultV2Project } from "../src/v2/domain/schema.js";
import { createV2ProjectState } from "../src/v2/domain/project-state.js";
import { createV2ProjectDocument } from "../src/v2/persistence/project-document.js";
import { createV2ProjectPersistence } from "../src/v2/persistence/project-persistence.js";
import { createV2MemoryProjectRepository } from "../src/v2/persistence/project-repository.js";
import { getGlobalHistoryAction, isGlobalTransportShortcut, isModalKeyboardEvent } from "../src/v2/ui/studio-shell.js";

// Minimal DOM event surface; storage, switching, history and autosave are real.
class Element extends EventTarget {
  constructor(root, tag = "div") {
    super();
    Object.assign(this, { root, tag, children: [], dataset: {}, attributes: {}, disabled: false, value: "", textContent: "", open: false });
    this.classList = { toggle() {} };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  querySelectorAll(tag) { return this.children.flatMap(child => [...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag)]); }
  closest() { return this.tag === "button" ? this : null; }
  focus() { if (!this.disabled) this.root.activeElement = this; }
  select() { this.selected = true; }
  blur() { this.root.activeElement = null; this.dispatchEvent(new Event("blur")); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  click() { if (!this.disabled) this.dispatchEvent(new Event("click")); }
}

function createRoot() {
  const elements = new Map();
  const root = {
    activeElement: null,
    createElement: tag => new Element(root, tag),
    querySelector: selector => elements.get(selector) ?? null,
  };
  for (const id of ["project-delete-cancel", "project-library-close", "project-delete-confirm", "project-library-count", "project-delete-dialog", "project-delete-message", "project-library-dialog", "project-duplicate", "project-library-error", "project-library-save-status", "project-list", "project-name-input", "project-new", "project-library-open", "project-save-status", "project-storage-recovery", "project-recovery-download", "project-storage-message", "project-title", "workstation-status"]) {
    elements.set(`#${id}`, new Element(root));
  }
  return root;
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function fixture(t, { beforeOpen = async () => {}, failSave = () => false } = {}) {
  const documents = ["Alpha", "Beta"].map(title => {
    const project = structuredClone(createDefaultV2Project());
    project.metadata.title = title;
    return createV2ProjectDocument(project, { id: title.toLowerCase(), now: "2026-10-03T12:00:00.000Z" });
  });
  const repository = createV2MemoryProjectRepository(documents);
  const projectState = createV2ProjectState(documents[0].project);
  const persistence = createV2ProjectPersistence({
    initialDocument: documents[0], projectState, autosaveDelay: 60_000,
    repository: { ...repository, async save(document) { if (failSave()) throw new Error("Storage is full"); return repository.save(document); } },
  });
  const root = createRoot();
  const calls = [];
  const feature = createProjectLibraryFeature({
    root, projectState,
    onBeforeProjectChange: () => calls.push("stop playback"),
    persistence: { ...persistence, async openProject(id) { calls.push(id); await beforeOpen(); return persistence.openProject(id); } },
  });
  t.after(async () => { feature.dispose(); await persistence.dispose().catch(() => {}); });
  root.querySelector("#project-library-open").click();
  await settle();
  function action(kind, id) {
    const list = root.querySelector("#project-list");
    const button = list.querySelectorAll("button").find(node => node.dataset.action === kind && node.dataset.projectId === id);
    assert.ok(button, `${kind} for ${id} exists`);
    const event = new Event("click");
    Object.defineProperty(event, "target", { value: button });
    list.dispatchEvent(event);
  }
  return { action, calls, documents, persistence, projectState, repository, root };
}

test("shelf rename saves current notes before opening another song and focuses its name", async t => {
  const f = await fixture(t);
  f.projectState.addNote("pattern-1", { pitch: 60, startTick: 0, durationTicks: 24, velocity: 0.7 });
  await settle();
  f.action("rename-project", "beta");
  await settle();
  assert.deepEqual(f.calls, ["stop playback", "beta"]);
  assert.equal(f.persistence.getActiveDocument().id, "beta");
  assert.equal((await f.repository.get("alpha")).project.patterns[0].notes.length, 1);
  const name = f.root.querySelector("#project-name-input");
  assert.equal(f.root.activeElement, name);
  assert.equal(name.selected, true);
  assert.equal(f.root.querySelector("#project-library-dialog").open, true);
  name.value = "Tea by the window";
  name.dispatchEvent(new Event("input"));
  await f.persistence.saveNow();
  assert.equal((await f.repository.get("beta")).project.metadata.title, "Tea by the window");
  assert.equal((await f.repository.list()).length, 2);
});

test("repeated rename while switching runs once, and Escape does not reopen the shelf or steal focus", async t => {
  const gate = deferred();
  const f = await fixture(t, { beforeOpen: () => gate.promise });
  f.action("rename-project", "beta");
  f.action("rename-project", "beta");
  f.projectState.renameProject("Alpha pending");
  await settle();
  assert.ok(f.root.querySelector("#project-list").querySelectorAll("button").every(button => button.disabled));
  f.root.querySelector("#project-library-dialog").dispatchEvent(new Event("cancel", { cancelable: true }));
  const focus = f.root.activeElement;
  gate.resolve();
  await settle();
  assert.deepEqual(f.calls, ["stop playback", "beta"]);
  assert.equal(f.root.querySelector("#project-library-dialog").open, false);
  assert.equal(f.root.activeElement, focus);
  assert.equal(f.root.querySelector("#project-name-input").selected, undefined);
  assert.equal((await f.repository.get("alpha")).project.metadata.title, "Alpha pending");
  assert.equal((await f.repository.list()).length, 2);
});

test("failed save prevents rename from switching songs and leaves edits available for recovery", async t => {
  let fail = false;
  const f = await fixture(t, { failSave: () => fail });
  f.projectState.renameProject("Unsaved melody");
  await settle();
  fail = true;
  f.action("rename-project", "beta");
  await settle();
  assert.equal(f.persistence.getActiveDocument().id, "alpha");
  assert.equal(f.projectState.getState().metadata.title, "Unsaved melody");
  assert.match(f.root.querySelector("#project-library-error").textContent, /Storage is full/);
  assert.equal(f.root.querySelector("#project-storage-recovery").hidden, false);
  assert.equal(f.root.querySelector("#project-library-dialog").open, true);
  assert.equal((await f.repository.get("beta")).project.metadata.title, "Beta");
  fail = false;
});

test("renaming the current song neither opens it again nor interrupts playback", async t => {
  const f = await fixture(t);
  f.action("rename-project", "alpha");
  await settle();
  assert.deepEqual(f.calls, []);
  assert.equal(f.root.querySelector("#project-name-input").selected, true);
  assert.equal(f.persistence.getActiveDocument().id, "alpha");
});

test("studio shortcuts defer to dialog buttons while retaining workspace transport and history shortcuts", () => {
  const dialogButton = { closest: selector => selector === "dialog[open]" ? {} : null };
  const workspaceButton = { closest: () => null };
  const bodyDuringSave = { closest: () => null, ownerDocument: { querySelector: selector => selector === "dialog[open]" ? {} : null } };
  assert.equal(isModalKeyboardEvent({ key: "Escape", target: dialogButton }), true);
  assert.equal(isModalKeyboardEvent({ key: "Escape", target: workspaceButton }), false);
  assert.equal(isModalKeyboardEvent({ key: "Escape", target: bodyDuringSave }), true);
  assert.equal(isGlobalTransportShortcut({ key: " ", target: bodyDuringSave }), false);
  assert.equal(isGlobalTransportShortcut({ key: " ", target: dialogButton }), false);
  assert.equal(isGlobalTransportShortcut({ key: " ", target: workspaceButton }), true);
  assert.equal(getGlobalHistoryAction({ key: "z", ctrlKey: true, target: dialogButton }), null);
  assert.equal(getGlobalHistoryAction({ key: "z", ctrlKey: true, target: workspaceButton }), "undo");
});
