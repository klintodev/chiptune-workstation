import { createAudioExportFeature } from "./features/audio-export/audio-export.js?v=20260721-3";
import { createAccountFeature } from "./features/account/account.js?v=20260721-5";
import { createVisualiserFeature } from "./features/visualiser/visualiser.js?v=20260722-1";
import { createPublishingFeature } from "./features/publishing/publishing.js?v=20260721-4";
import {
  createAccountService,
  createAccountSessionPreference,
} from "./firebase/account-service.js?v=20260721-3";
import {
  createFallbackCloudLinkRepository,
  createIndexedDbCloudLinkRepository,
  createMemoryCloudLinkRepository,
} from "./firebase/cloud-link-repository.js?v=20260722-1";
import { createCloudProjectService } from "./firebase/cloud-project-service.js?v=20260722-1";
import {
  createLazyCloudProjectService,
  createLazyPublicationService,
} from "./firebase/lazy-optional-services.js";
import {
  createLocalPublicationLinkRepository,
  createMemoryPublicationLinkRepository,
} from "./firebase/publication-link-repository.js";
import { createPublicationService } from "./firebase/publication-service.js?v=20260722-1";
import {
  projectPersistence,
  projectPreferences,
  projectRepository,
  projectState,
  scheduler,
  sessionState,
} from "./workstation-app.js?v=20260722-1";

const audioExportFeature = createAudioExportFeature({
  persistence: projectPersistence,
  projectState,
});
const visualiserFeature = createVisualiserFeature({
  projectState,
  scheduler,
  sessionState,
});
const accountSessionPreference = createAccountSessionPreference();
const accountService = createAccountService({
  async loadClient() {
    const { createFirebaseClient } = await import("./firebase/firebase-client.js?v=20260722-1");
    return createFirebaseClient();
  },
  sessionPreference: accountSessionPreference,
});
const cloudProjectService = createLazyCloudProjectService({
  accountService,
  createService() {
    let linkRepository;
    try {
      linkRepository = createFallbackCloudLinkRepository({
        fallback: createMemoryCloudLinkRepository(),
        primary: createIndexedDbCloudLinkRepository(),
      });
    } catch {
      linkRepository = createMemoryCloudLinkRepository();
    }
    return createCloudProjectService({
      accountService,
      linkRepository,
      localRepository: projectRepository,
      persistence: projectPersistence,
      preferences: projectPreferences,
    });
  },
});
const accountFeature = createAccountFeature({
  accountService,
  cloudProjectService,
});
const publicationService = createLazyPublicationService({
  accountService,
  createService() {
    let linkRepository;
    try {
      linkRepository = createLocalPublicationLinkRepository();
    } catch {
      linkRepository = createMemoryPublicationLinkRepository();
    }
    return createPublicationService({
      accountService,
      linkRepository,
      persistence: projectPersistence,
    });
  },
});
const publishingFeature = createPublishingFeature({
  accountService,
  persistence: projectPersistence,
  publicationService,
});

cloudProjectService.start();
if (accountSessionPreference.isEnabled()) void accountService.start({ remember: false });

window.addEventListener("unload", () => {
  publishingFeature.dispose();
  visualiserFeature.dispose();
  audioExportFeature.dispose();
  accountFeature.dispose();
  cloudProjectService.dispose();
  accountService.dispose();
}, { once: true });
