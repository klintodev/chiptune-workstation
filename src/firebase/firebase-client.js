import {
  createCloudConflictError,
  createCloudProjectRecord,
  normalizeCloudProjectRecord,
  summarizeCloudProjectRecord,
} from "./cloud-project.js?v=20260722-1";
import { FIREBASE_CONFIG, isFirebaseConfigured } from "./firebase-config.js";
import {
  createPublicationRecord,
  LEGACY_PUBLICATION_VERSION,
  normalizePublicationRecord,
  PUBLICATION_SLOTS,
} from "./publication.js?v=20260722-1";
import { FIREBASE_APP_CHECK_CONFIG } from "./firebase-config.js";

const FIREBASE_SDK_VERSION = "12.16.0";
const FIREBASE_SDK_ROOT = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

async function loadFirebaseSdk({ includeAppCheck = false } = {}) {
  const [app, auth, firestore, appCheck] = await Promise.all([
    import(`${FIREBASE_SDK_ROOT}/firebase-app.js`),
    import(`${FIREBASE_SDK_ROOT}/firebase-auth.js`),
    import(`${FIREBASE_SDK_ROOT}/firebase-firestore.js`),
    includeAppCheck ? import(`${FIREBASE_SDK_ROOT}/firebase-app-check.js`) : null,
  ]);
  return Object.freeze({ app, appCheck, auth, firestore });
}

function toAccount(user) {
  if (!user) return null;
  return Object.freeze({
    displayName: user.displayName || "",
    email: user.email || "",
    emailVerified: user.emailVerified === true,
    photoURL: user.photoURL || "",
    providerIds: Object.freeze((user.providerData ?? []).map(({ providerId }) => providerId)),
    uid: user.uid,
  });
}

export async function createFirebaseClient({
  appCheckConfig = FIREBASE_APP_CHECK_CONFIG,
  config = FIREBASE_CONFIG,
  loadSdk = loadFirebaseSdk,
} = {}) {
  if (!isFirebaseConfigured(config)) {
    throw new Error("Firebase web app configuration has not been completed yet.");
  }

  const appCheckEnabled = typeof appCheckConfig?.siteKey === "string" && appCheckConfig.siteKey.trim() !== "";
  const sdk = await loadSdk({ includeAppCheck: appCheckEnabled });
  const existingApp = sdk.app.getApps().find(({ name }) => name === "[DEFAULT]");
  const app = existingApp ?? sdk.app.initializeApp(config);
  if (appCheckEnabled) {
    if (!sdk.appCheck) throw new Error("Firebase App Check could not be loaded.");
    sdk.appCheck.initializeAppCheck(app, {
      provider: new sdk.appCheck.ReCaptchaEnterpriseProvider(appCheckConfig.siteKey.trim()),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const auth = sdk.auth.getAuth(app);
  const database = sdk.firestore.getFirestore(app);

  function userDocument(uid) {
    return sdk.firestore.doc(database, "users", uid);
  }

  function projectsCollection(uid) {
    return sdk.firestore.collection(database, "users", uid, "projects");
  }

  function projectDocument(uid, projectId) {
    return sdk.firestore.doc(database, "users", uid, "projects", projectId);
  }

  function publicationDocument(publicationId) {
    return sdk.firestore.doc(database, "publications", publicationId);
  }

  function publicationSlotsCollection(uid) {
    return sdk.firestore.collection(database, "users", uid, "publicationSlots");
  }

  function publicationSlotDocument(uid, slotId) {
    return sdk.firestore.doc(database, "users", uid, "publicationSlots", slotId);
  }

  async function updateProfile(user) {
    const account = toAccount(user);
    if (!account?.emailVerified) return;
    await sdk.firestore.setDoc(userDocument(account.uid), {
      uid: account.uid,
      email: account.email,
      displayName: account.displayName,
      lastSeenAt: sdk.firestore.serverTimestamp(),
    });
  }

  async function findPublicationSlot(uid, publicationId) {
    const snapshot = await sdk.firestore.getDocs(publicationSlotsCollection(uid));
    const occupied = new Map(snapshot.docs.map((entry) => [entry.id, entry.data().publicationId]));
    const existing = [...occupied].find(([, candidate]) => candidate === publicationId)?.[0];
    if (existing) return existing;
    const available = PUBLICATION_SLOTS.find((slotId) => !occupied.has(slotId));
    if (available) return available;
    const error = new Error("This account has reached its limit of 20 published projects. Unpublish one before sharing another.");
    error.code = "publication/quota-exceeded";
    throw error;
  }

  async function listLegacyPublications(uid) {
    const documents = [];
    let cursor = null;
    do {
      const constraints = [
        sdk.firestore.where("ownerId", "==", uid),
        sdk.firestore.where("publicationVersion", "==", LEGACY_PUBLICATION_VERSION),
        sdk.firestore.limit(100),
      ];
      if (cursor) constraints.push(sdk.firestore.startAfter(cursor));
      const snapshot = await sdk.firestore.getDocs(sdk.firestore.query(
        sdk.firestore.collection(database, "publications"),
        ...constraints,
      ));
      documents.push(...snapshot.docs);
      cursor = snapshot.docs.length === 100 ? snapshot.docs.at(-1) : null;
    } while (cursor);
    return documents;
  }

  async function deleteReferenceGroups(groups) {
    for (const group of groups) {
      for (let index = 0; index < group.length; index += 400) {
        const batch = sdk.firestore.writeBatch(database);
        for (const reference of group.slice(index, index + 400)) batch.delete(reference);
        await batch.commit();
      }
    }
  }

  async function reauthenticateForDeletion(user, password) {
    const providers = new Set((user.providerData ?? []).map(({ providerId }) => providerId));
    if (providers.has("password")) {
      if (typeof password !== "string" || password === "") {
        const error = new Error("Enter your password to delete this account.");
        error.code = "auth/missing-password";
        throw error;
      }
      const credential = sdk.auth.EmailAuthProvider.credential(user.email, password);
      await sdk.auth.reauthenticateWithCredential(user, credential);
      return;
    }
    if (providers.has("google.com")) {
      await sdk.auth.reauthenticateWithPopup(user, new sdk.auth.GoogleAuthProvider());
      return;
    }
    const error = new Error("This account provider cannot be reauthenticated in the browser.");
    error.code = "auth/unsupported-provider";
    throw error;
  }

  return Object.freeze({
    async createEmailAccount(email, password) {
      const passwordStatus = await sdk.auth.validatePassword(auth, password);
      if (!passwordStatus.isValid) {
        const error = new Error("The password does not meet the account security policy.");
        error.code = "auth/weak-password";
        throw error;
      }
      const credential = await sdk.auth.createUserWithEmailAndPassword(auth, email, password);
      await sdk.auth.sendEmailVerification(credential.user);
      return toAccount(credential.user);
    },
    async deleteProject(uid, projectId) {
      await sdk.firestore.deleteDoc(projectDocument(uid, projectId));
    },
    async deletePublication(uid, publicationId) {
      const reference = publicationDocument(publicationId);
      const snapshot = await sdk.firestore.getDoc(reference);
      if (!snapshot.exists()) return false;
      const publication = normalizePublicationRecord(snapshot.data(), { ownerId: uid });
      if (publication.publicationVersion === LEGACY_PUBLICATION_VERSION) {
        await sdk.firestore.deleteDoc(reference);
        return true;
      }
      const slotReference = publicationSlotDocument(uid, publication.ownerSlot);
      await sdk.firestore.runTransaction(database, async (transaction) => {
        const [current, slot] = await Promise.all([
          transaction.get(reference),
          transaction.get(slotReference),
        ]);
        if (!current.exists()) return;
        const normalized = normalizePublicationRecord(current.data());
        if (!slot.exists() || slot.data().publicationId !== normalized.publicationId) {
          throw new Error("The publication ownership record is missing.");
        }
        transaction.delete(reference);
        transaction.delete(slotReference);
      });
      return true;
    },
    async deleteAccount(password = "") {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in before deleting an account.");
      await reauthenticateForDeletion(user, password);
      const [projects, slots, legacyPublications] = await Promise.all([
        sdk.firestore.getDocs(projectsCollection(user.uid)),
        sdk.firestore.getDocs(publicationSlotsCollection(user.uid)),
        listLegacyPublications(user.uid),
      ]);
      const publicationReferences = [];
      for (const slot of slots.docs) {
        const publicationId = slot.data().publicationId;
        if (typeof publicationId === "string" && publicationId !== "") {
          publicationReferences.push(publicationDocument(publicationId));
        }
        publicationReferences.push(slot.ref);
      }
      publicationReferences.push(...legacyPublications.map(({ ref }) => ref));
      await deleteReferenceGroups([
        publicationReferences,
        projects.docs.map(({ ref }) => ref),
        [userDocument(user.uid)],
      ]);
      await sdk.auth.deleteUser(user);
      return null;
    },
    async getPublication(publicationId) {
      const snapshot = await sdk.firestore.getDoc(publicationDocument(publicationId));
      return snapshot.exists() ? normalizePublicationRecord(snapshot.data()) : null;
    },
    async getProject(uid, projectId) {
      const snapshot = await sdk.firestore.getDoc(projectDocument(uid, projectId));
      return snapshot.exists()
        ? normalizeCloudProjectRecord(snapshot.data(), { ownerId: uid })
        : null;
    },
    async listProjects(uid) {
      const request = sdk.firestore.query(
        projectsCollection(uid),
        sdk.firestore.orderBy("updatedAt", "desc"),
      );
      const snapshot = await sdk.firestore.getDocs(request);
      return snapshot.docs.flatMap((entry) => {
        try {
          return [summarizeCloudProjectRecord(entry.data(), { ownerId: uid })];
        } catch {
          return [];
        }
      });
    },
    onAuthStateChanged(listener, onError) {
      return sdk.auth.onAuthStateChanged(auth, (user) => {
        if (user?.emailVerified) void updateProfile(user).catch(() => {});
        listener(toAccount(user));
      }, onError);
    },
    async refreshAccount() {
      const user = auth.currentUser;
      if (!user) return null;
      await sdk.auth.reload(user);
      if (user.emailVerified) {
        await sdk.auth.getIdToken(user, true);
        await updateProfile(user);
      }
      return toAccount(user);
    },
    async requestPasswordReset(email) {
      try {
        await sdk.auth.sendPasswordResetEmail(auth, email);
      } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
      }
    },
    async sendVerificationEmail() {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in before requesting a verification email.");
      if (!user.emailVerified) await sdk.auth.sendEmailVerification(user);
      return toAccount(user);
    },
    async saveProject(uid, document, expectedCloudRevision = 0) {
      const reference = projectDocument(uid, document.id);
      return sdk.firestore.runTransaction(database, async (transaction) => {
        const snapshot = await transaction.get(reference);
        const remote = snapshot.exists()
          ? normalizeCloudProjectRecord(snapshot.data(), { ownerId: uid })
          : null;
        const currentRevision = remote?.cloudRevision ?? 0;
        if (currentRevision !== expectedCloudRevision) {
          throw createCloudConflictError(remote);
        }
        const record = createCloudProjectRecord(uid, document, currentRevision + 1);
        transaction.set(reference, {
          ...record,
          serverUpdatedAt: sdk.firestore.serverTimestamp(),
        });
        return record;
      });
    },
    async savePublication({
      creatorName,
      document,
      expectedRevision = 0,
      ownerId,
      publicationId,
      publishedAt,
      updatedAt,
    }) {
      const reference = publicationDocument(publicationId);
      const ownerSlot = await findPublicationSlot(ownerId, publicationId);
      const slotReference = publicationSlotDocument(ownerId, ownerSlot);
      return sdk.firestore.runTransaction(database, async (transaction) => {
        const [snapshot, slotSnapshot] = await Promise.all([
          transaction.get(reference),
          transaction.get(slotReference),
        ]);
        const remote = snapshot.exists() ? normalizePublicationRecord(snapshot.data()) : null;
        const currentRevision = remote?.publicationRevision ?? 0;
        if (remote?.ownerId && remote.ownerId !== ownerId) throw new Error("That publication belongs to another account.");
        if (remote?.ownerSlot && remote.ownerSlot !== ownerSlot) throw new Error("That publication uses another account slot.");
        if (slotSnapshot.exists() && slotSnapshot.data().publicationId !== publicationId) {
          const error = new Error("This account has reached its publication limit.");
          error.code = "publication/quota-exceeded";
          throw error;
        }
        if (currentRevision !== expectedRevision) {
          const error = new Error("This publication changed elsewhere. Reload its status before publishing again.");
          error.code = "publication/revision-conflict";
          throw error;
        }
        const record = createPublicationRecord({
          creatorName,
          document,
          ownerSlot,
          publicationId,
          publicationRevision: currentRevision + 1,
          publishedAt: remote?.publishedAt ?? publishedAt,
          updatedAt,
        });
        transaction.set(reference, {
          ...record,
          serverUpdatedAt: sdk.firestore.serverTimestamp(),
        });
        transaction.set(slotReference, {
          publicationId,
          sourceProjectId: record.sourceProjectId,
          createdAt: slotSnapshot.exists() ? slotSnapshot.data().createdAt : record.publishedAt,
          updatedAt: record.updatedAt,
        });
        return record;
      });
    },
    async signInWithEmail(email, password) {
      const credential = await sdk.auth.signInWithEmailAndPassword(auth, email, password);
      if (credential.user.emailVerified) await updateProfile(credential.user);
      return toAccount(credential.user);
    },
    async signInWithGoogle() {
      const provider = new sdk.auth.GoogleAuthProvider();
      const credential = await sdk.auth.signInWithPopup(auth, provider);
      if (credential.user.emailVerified) await updateProfile(credential.user);
      return toAccount(credential.user);
    },
    async signOut() {
      await sdk.auth.signOut(auth);
    },
  });
}
