import {
  createCloudConflictError,
  createCloudProjectRecord,
  normalizeCloudProjectRecord,
  summarizeCloudProjectRecord,
} from "./cloud-project.js";
import { FIREBASE_CONFIG, isFirebaseConfigured } from "./firebase-config.js";
import {
  createPublicationRecord,
  normalizePublicationRecord,
} from "./publication.js?v=20260721-3";

const FIREBASE_SDK_VERSION = "12.16.0";
const FIREBASE_SDK_ROOT = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

async function loadFirebaseSdk() {
  const [app, auth, firestore] = await Promise.all([
    import(`${FIREBASE_SDK_ROOT}/firebase-app.js`),
    import(`${FIREBASE_SDK_ROOT}/firebase-auth.js`),
    import(`${FIREBASE_SDK_ROOT}/firebase-firestore.js`),
  ]);
  return Object.freeze({ app, auth, firestore });
}

function toAccount(user) {
  if (!user) return null;
  return Object.freeze({
    displayName: user.displayName || "",
    email: user.email || "",
    emailVerified: user.emailVerified === true,
    photoURL: user.photoURL || "",
    uid: user.uid,
  });
}

export async function createFirebaseClient({
  config = FIREBASE_CONFIG,
  loadSdk = loadFirebaseSdk,
} = {}) {
  if (!isFirebaseConfigured(config)) {
    throw new Error("Firebase web app configuration has not been completed yet.");
  }

  const sdk = await loadSdk();
  const existingApp = sdk.app.getApps().find(({ name }) => name === "[DEFAULT]");
  const app = existingApp ?? sdk.app.initializeApp(config);
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

  async function updateProfile(user) {
    const account = toAccount(user);
    if (!account?.emailVerified) return;
    await sdk.firestore.setDoc(userDocument(account.uid), {
      uid: account.uid,
      email: account.email,
      displayName: account.displayName,
      photoURL: account.photoURL,
      lastSeenAt: sdk.firestore.serverTimestamp(),
    }, { merge: true });
  }

  return Object.freeze({
    async createEmailAccount(email, password) {
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
      normalizePublicationRecord(snapshot.data(), { ownerId: uid });
      await sdk.firestore.deleteDoc(reference);
      return true;
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
      return sdk.firestore.runTransaction(database, async (transaction) => {
        const snapshot = await transaction.get(reference);
        const remote = snapshot.exists() ? normalizePublicationRecord(snapshot.data()) : null;
        const currentRevision = remote?.publicationRevision ?? 0;
        if (remote && remote.ownerId !== ownerId) throw new Error("That publication belongs to another account.");
        if (currentRevision !== expectedRevision) {
          const error = new Error("This publication changed elsewhere. Reload its status before publishing again.");
          error.code = "publication/revision-conflict";
          throw error;
        }
        const record = createPublicationRecord({
          creatorName,
          document,
          ownerId,
          publicationId,
          publicationRevision: currentRevision + 1,
          publishedAt: remote?.publishedAt ?? publishedAt,
          updatedAt,
        });
        transaction.set(reference, {
          ...record,
          serverUpdatedAt: sdk.firestore.serverTimestamp(),
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
