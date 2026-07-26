import { createAudioExportFeature } from "./features/audio-export/audio-export.js";
import { createAccountFeature } from "./features/account/account.js";
import { createVisualiserFeature } from "./features/visualiser/visualiser.js";
import { createPublishingFeature } from "./features/publishing/publishing.js";
import { createAccountService } from "./firebase/account-service.js";
import { createIndexedDbCloudLinkRepository } from "./firebase/cloud-link-repository.js";
import { createCloudProjectService } from "./firebase/cloud-project-service.js";
import { createFirebaseClient } from "./firebase/firebase-client.js";
import { createLocalPublicationLinkRepository } from "./firebase/publication-link-repository.js";
import { createPublicationService } from "./firebase/publication-service.js";
import {
  createIndexedDbProjectRepository,
  createProjectPreferences,
} from "./persistence/project-repository.js";
import {
  projectPersistence,
  projectState,
  scheduler,
  sessionState,
} from "./workstation-app.js";

const audioExportFeature = createAudioExportFeature({
  persistence: projectPersistence,
  projectState,
});
const visualiserFeature = createVisualiserFeature({
  projectState,
  scheduler,
  sessionState,
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
