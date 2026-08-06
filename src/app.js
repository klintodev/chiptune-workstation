import { createAudioExportFeature } from "./features/audio-export/audio-export.js";
import { createAccountFeature } from "./features/account/account.js";
import { createPublishingFeature } from "./features/publishing/publishing.js";
import { createRemixImportFeature } from "./features/remixing/remix-import-feature.js";
import { createRemixService } from "./firebase/remix-service.js";
import {
  createAccountService,
  createAccountSessionPreference,
} from "./firebase/account-service.js";
import {
  createFallbackCloudLinkRepository,
  createIndexedDbCloudLinkRepository,
  createMemoryCloudLinkRepository,
} from "./firebase/cloud-link-repository.js";
import { createCloudProjectService } from "./firebase/cloud-project-service.js";
import {
  createLazyCloudProjectService,
  createLazyPublicationService,
} from "./firebase/lazy-optional-services.js";
import {
  createLocalPublicationLinkRepository,
  createMemoryPublicationLinkRepository,
} from "./firebase/publication-link-repository.js";
import { createPublicationService } from "./firebase/publication-service.js";
import { createV2UpgradeDisclosurePreference } from "./v2/persistence/upgrade-disclosure.js";
import {
  projectPersistence,
  projectPreferences,
  projectRepository,
  projectState,
  remixProvenanceRepository,
  stopAllSound,
} from "./workstation-app.js";

const audioExportFeature = createAudioExportFeature({
  persistence: projectPersistence,
  projectState,
});
const upgradeDisclosurePreference = createV2UpgradeDisclosurePreference();
const accountSessionPreference = createAccountSessionPreference();
const accountService = createAccountService({
  async loadClient() {
    const { createFirebaseClient } = await import("./firebase/firebase-client.js");
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
      onProjectUpgrade: upgradeDisclosurePreference.queue,
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
  provenanceRepository: remixProvenanceRepository,
});
let publicClientPromise;
const remixService = createRemixService({
  loadPublication: async (publicationId) => {
    publicClientPromise ??= import("./firebase/firebase-client.js")
      .then(({ createFirebaseClient }) => createFirebaseClient());
    return (await publicClientPromise).getPublication(publicationId);
  },
  projectRepository,
  provenanceRepository: remixProvenanceRepository,
});
const remixImportFeature = createRemixImportFeature({
  onBeforeProjectChange: stopAllSound,
  persistence: projectPersistence,
  remixService,
});

cloudProjectService.start();
if (accountSessionPreference.isEnabled()) void accountService.start({ remember: false });

window.addEventListener("unload", () => {
  publishingFeature.dispose();
  remixImportFeature.dispose();
  audioExportFeature.dispose();
  accountFeature.dispose();
  cloudProjectService.dispose();
  accountService.dispose();
}, { once: true });
