const releaseVariant = globalThis.__KLINTO_STUDIO_RELEASE_VARIANT__;
const workstation = releaseVariant === "v1-recovery"
  ? await import("./workstation-app-v1.js")
  : await import("./v2/studio-app.js").then(({ createV2StudioApp }) => createV2StudioApp());

export const audioEngine = workstation.audioEngine;
export const projectPersistence = workstation.projectPersistence;
export const projectPreferences = workstation.projectPreferences;
export const projectRepository = workstation.projectRepository;
export const projectState = workstation.projectState;
export const remixProvenanceRepository = workstation.remixProvenanceRepository;
export const scheduler = workstation.scheduler;
export const sessionState = workstation.sessionState;
export const stopAllSound = workstation.stopAllSound;
export const workspaceState = workstation.workspaceState ?? null;

export function disposeWorkstation() {
  return typeof workstation.dispose === "function"
    ? workstation.dispose()
    : workstation.disposeWorkstation?.();
}
