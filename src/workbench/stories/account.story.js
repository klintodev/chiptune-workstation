import { createAccountFeature } from "../../features/account/account.js";
import { defineStory } from "../story-registry.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";
import { createStoryEventSource, displayStoryDialog } from "../story-utilities.js";

function createAccountServices(scenario) {
  const accountEvents = createStoryEventSource({
    account: scenario.account,
    error: scenario.error ?? null,
    status: scenario.status,
  });
  const cloudEvents = createStoryEventSource(null);
  const resolve = async () => true;
  const accountService = Object.freeze({
    addEventListener: accountEvents.addEventListener,
    createEmailAccount: resolve,
    deleteAccount: resolve,
    getState: accountEvents.getState,
    refreshAccount: async () => scenario.account,
    requestPasswordReset: resolve,
    sendVerificationEmail: resolve,
    signInWithEmail: resolve,
    signInWithGoogle: resolve,
    signOut: resolve,
    start: resolve,
  });
  const cloudProjectService = Object.freeze({
    addEventListener: cloudEvents.addEventListener,
    deleteProject: resolve,
    enableCurrentProject: resolve,
    getProjectStatus: async () => ({
      link: scenario.cloudStatus === "local-only" ? null : {
        error: scenario.cloudError ?? null,
        projectId: "workbench-project",
      },
      status: scenario.cloudStatus,
    }),
    listProjects: async () => [
      { id: "cloud-neon", title: "Neon Overpass", updatedAt: "2026-07-27T12:00:00.000Z", cloudRevision: 7 },
      { id: "cloud-pocket", title: "Pocket Skyline", updatedAt: "2026-07-25T17:20:00.000Z", cloudRevision: 3 },
    ],
    openProject: resolve,
    overwriteConflictWithLocal: resolve,
    retryProject: resolve,
  });
  return { accountService, cloudProjectService };
}

function mountAccount({ canvas, scenario }) {
  const root = createStoryRoot(canvas);
  root.innerHTML = `
    <div class="story-feature-toolbar">
      <div><span class="panel-context">Header projection</span><p>Optional cloud account</p></div>
      <div id="account-slot" class="account-slot"></div>
    </div>
    <output id="project-title">Neon Overpass</output>
    <output id="project-save-status" data-state="saved">Saved</output>
  `;
  const services = createAccountServices(scenario);
  const feature = createAccountFeature({
    ...services,
    root: root.ownerDocument,
  });
  root.querySelector("#account-open").click();
  const dialog = root.ownerDocument.querySelector("#account-dialog");
  displayStoryDialog(root, dialog);
  return disposeAll(feature);
}

export const accountStory = defineStory({
  id: "account",
  title: "Cloud account",
  group: "Cloud",
  description: "Inspect signed-out, verification, cloud-sync, offline, and conflict states with deterministic service fakes.",
  source: "src/features/account/account.js",
  scenarios: [
    { id: "signed-out", title: "Signed out", status: "idle", account: null, cloudStatus: "local-only" },
    { id: "verification", title: "Verification required", status: "idle", account: { displayName: "Chip Pilot", email: "pilot@example.test", emailVerified: false, providerIds: ["password"] }, cloudStatus: "local-only" },
    { id: "synced", title: "Signed in and synced", status: "idle", account: { displayName: "Chip Pilot", email: "pilot@example.test", emailVerified: true, providerIds: ["password"] }, cloudStatus: "synced" },
    { id: "offline", title: "Offline retry", status: "idle", account: { displayName: "Chip Pilot", email: "pilot@example.test", emailVerified: true, providerIds: ["password"] }, cloudStatus: "offline", cloudError: "The network is unavailable. Local edits remain safe." },
    { id: "conflict", title: "Cloud conflict", status: "idle", account: { displayName: "Chip Pilot", email: "pilot@example.test", emailVerified: true, providerIds: ["password"] }, cloudStatus: "conflict", cloudError: "Both versions were preserved." },
    { id: "unavailable", title: "Service unavailable", status: "unavailable", account: null, cloudStatus: "local-only" },
  ],
  mount: mountAccount,
});
