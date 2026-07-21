import { createAudioExportFeature } from "./features/audio-export/audio-export.js?v=20260721-2";
import { createAccountFeature } from "./features/account/account.js?v=20260721-5";
import { createVisualiserFeature } from "./features/visualiser/visualiser.js?v=20260721-6";
import { createPublishingFeature } from "./features/publishing/publishing.js?v=20260721-3";
import { createAccountService } from "./firebase/account-service.js?v=20260721-3";
import { createIndexedDbCloudLinkRepository } from "./firebase/cloud-link-repository.js";
import { createCloudProjectService } from "./firebase/cloud-project-service.js?v=20260721-2";
import { createFirebaseClient } from "./firebase/firebase-client.js?v=20260721-3";
import { createLocalPublicationLinkRepository } from "./firebase/publication-link-repository.js";
import { createPublicationService } from "./firebase/publication-service.js?v=20260721-2";
import {
  createIndexedDbProjectRepository,
  createProjectPreferences,
} from "./persistence/project-repository.js";
import { audioEngine, projectPersistence, projectState } from "./workstation-app.js?v=20260721-6";

const audioExportFeature = createAudioExportFeature({
  persistence: projectPersistence,
  projectState,
});
const visualiserFeature = createVisualiserFeature({
  audioEngine,
  projectState,
});
const accountService = createAccountService({
  loadClient: createFirebaseClient,
});
const cloudProjectService = createCloudProjectService({
  accountService,
  linkRepository: createIndexedDbCloudLinkRepository(),
  localRepository: createIndexedDbProjectRepository(),
  persistence: projectPersistence,
  preferences: createProjectPreferences(),
});
const accountFeature = createAccountFeature({
  accountService,
  cloudProjectService,
});
const publicationService = createPublicationService({
  accountService,
  linkRepository: createLocalPublicationLinkRepository(),
  persistence: projectPersistence,
});
const publishingFeature = createPublishingFeature({
  accountService,
  persistence: projectPersistence,
  publicationService,
});

cloudProjectService.start();
void accountService.start();

window.addEventListener("unload", () => {
  publishingFeature.dispose();
  visualiserFeature.dispose();
  audioExportFeature.dispose();
  accountFeature.dispose();
  cloudProjectService.dispose();
  accountService.dispose();
}, { once: true });
