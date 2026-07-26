import {
  createCheckpointIdentifier,
  createCheckpointRecord,
  normalizeCheckpointRecord,
} from "./checkpoint-repository.js";
import { normalizeProjectDocument } from "./project-document.js";

export function createCheckpointService({
  createId = createCheckpointIdentifier,
  now = () => new Date().toISOString(),
  persistence,
  replaceProject,
  repository,
} = {}) {
  if (!persistence?.saveNow || !replaceProject || !repository?.save) {
    throw new TypeError("Checkpointing requires persistence, replacement, and checkpoint storage.");
  }

  async function createCheckpoint(label = "", operation = "manual") {
    const document = await persistence.saveNow();
    const record = createCheckpointRecord({
      checkpointId: createId(),
      createdAt: now(),
      document,
      label,
      operation,
    });
    return repository.save(record);
  }

  async function protectAndReplace(target, {
    label = "Before replacement",
    operation = "starter",
  } = {}) {
    const normalizedTarget = normalizeProjectDocument(target);
    const recovery = await createCheckpoint(label, operation);
    await replaceProject(normalizedTarget, {
      operation,
      recoveryCheckpointId: recovery.checkpointId,
    });
    return Object.freeze({ recovery, target: normalizedTarget });
  }

  async function restore(checkpointId) {
    const target = await repository.get(checkpointId);
    if (!target) throw new RangeError("That checkpoint no longer exists.");
    const normalized = normalizeCheckpointRecord(target);
    const current = await persistence.saveNow();
    if (current.id !== normalized.projectId) {
      throw new RangeError("That checkpoint belongs to another local project.");
    }
    const recovery = await createCheckpoint("Before checkpoint restore", "restore");
    await replaceProject(normalized.document, {
      operation: "restore",
      recoveryCheckpointId: recovery.checkpointId,
      sourceCheckpointId: normalized.checkpointId,
    });
    return Object.freeze({ recovery, restored: normalized });
  }

  return Object.freeze({
    createCheckpoint,
    list: (projectId = persistence.getActiveDocument?.().id) => repository.list(projectId),
    protectAndReplace,
    restore,
  });
}
