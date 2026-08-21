import assert from "node:assert/strict";
import test from "node:test";

import { createCloudProjectRecord } from "../src/firebase/cloud-project.js";
import { createFirebaseClient } from "../src/firebase/firebase-client.js";
import { createProjectDocument } from "../src/persistence/project-document.js";
import { createDefaultProject } from "../src/state/project-state.js";
import { createDefaultV2Project } from "../src/v2/domain/schema.js";

function createSdkDouble() {
  const calls = {
    forceTokenRefresh: 0,
    passwordResetEmails: 0,
    profileWrites: 0,
    reloads: 0,
    verificationEmails: 0,
    passwordValidations: 0,
  };
  const user = {
    displayName: "",
    email: "chip@example.com",
    emailVerified: false,
    photoURL: "",
    uid: "email-user",
  };
  const auth = { currentUser: user };
  return {
    calls,
    sdk: {
      app: {
        getApps: () => [],
        initializeApp: () => ({ name: "[DEFAULT]" }),
      },
      auth: {
        createUserWithEmailAndPassword: async () => ({ user }),
        getAuth: () => auth,
        async getIdToken(candidate, forceRefresh) {
          assert.equal(candidate, user);
          assert.equal(forceRefresh, true);
          calls.forceTokenRefresh += 1;
          return "fresh-token";
        },
        async reload(candidate) {
          assert.equal(candidate, user);
          calls.reloads += 1;
          user.emailVerified = true;
        },
        async sendPasswordResetEmail(candidateAuth, email) {
          assert.equal(candidateAuth, auth);
          calls.passwordResetEmails += 1;
          if (email === "missing@example.com") {
            const error = new Error("No matching account.");
            error.code = "auth/user-not-found";
            throw error;
          }
        },
        async sendEmailVerification(candidate) {
          assert.equal(candidate, user);
          calls.verificationEmails += 1;
        },
        async validatePassword(candidateAuth, password) {
          assert.equal(candidateAuth, auth);
          assert.equal(password, "a-secure-password");
          calls.passwordValidations += 1;
          return { isValid: true };
        },
      },
      firestore: {
        doc: (_database, ...segments) => segments.join("/"),
        getDoc: async () => ({ exists: () => false }),
        getFirestore: () => ({ name: "database" }),
        serverTimestamp: () => "server-time",
        async setDoc(reference, data) {
          assert.equal(reference, "users/email-user");
          assert.equal(data.email, user.email);
          calls.profileWrites += 1;
        },
      },
    },
  };
}

test("email account verification and private password recovery use Firebase Auth", async () => {
  const firebase = createSdkDouble();
  const client = await createFirebaseClient({
    config: {
      apiKey: "public-key",
      appId: "web-app",
      authDomain: "example.firebaseapp.com",
      projectId: "example",
    },
    loadSdk: async () => firebase.sdk,
  });

  await client.requestPasswordReset("chip@example.com");
  await client.requestPasswordReset("missing@example.com");
  assert.equal(firebase.calls.passwordResetEmails, 2);

  const created = await client.createEmailAccount("chip@example.com", "a-secure-password");
  assert.equal(created.emailVerified, false);
  assert.equal(firebase.calls.verificationEmails, 1);
  assert.equal(firebase.calls.profileWrites, 0);
  assert.equal(firebase.calls.passwordValidations, 1);

  await client.sendVerificationEmail();
  assert.equal(firebase.calls.verificationEmails, 2);

  const refreshed = await client.refreshAccount();
  assert.equal(refreshed.emailVerified, true);
  assert.equal(firebase.calls.reloads, 1);
  assert.equal(firebase.calls.forceTokenRefresh, 1);
  assert.equal(firebase.calls.profileWrites, 0);

  assert.equal(await client.getProject("email-user", "project-one"), null);
  assert.equal(firebase.calls.profileWrites, 1);

  await client.sendVerificationEmail();
  assert.equal(firebase.calls.verificationEmails, 2);
});

test("App Check initialises before Auth while Firestore remains lazy", async () => {
  const order = [];
  const app = { name: "[DEFAULT]" };
  let loadOptions = null;
  const client = await createFirebaseClient({
    appCheckConfig: { siteKey: "public-enterprise-site-key" },
    config: {
      apiKey: "public-key",
      appId: "web-app",
      authDomain: "example.firebaseapp.com",
      projectId: "example",
    },
    loadSdk: async (options) => {
      loadOptions = options;
      return {
        app: { getApps: () => [], initializeApp: () => app },
        appCheck: {
          initializeAppCheck(candidate, options) {
            assert.equal(candidate, app);
            assert.equal(options.isTokenAutoRefreshEnabled, true);
            order.push("app-check");
          },
          ReCaptchaEnterpriseProvider: class {
            constructor(siteKey) { assert.equal(siteKey, "public-enterprise-site-key"); }
          },
        },
        auth: { getAuth: () => { order.push("auth"); return {}; } },
        firestore: {
          doc: () => "project",
          getDoc: async () => ({ exists: () => false }),
          getFirestore: () => { order.push("firestore"); return {}; },
        },
      };
    },
  });

  assert.deepEqual(loadOptions, { includeAppCheck: true });
  assert.deepEqual(order, ["app-check", "auth"]);
  await client.getProject("user-one", "project-one");
  assert.deepEqual(order, ["app-check", "auth", "firestore"]);
});

test("cloud listing classifies raw records for the requested runtime without normalizing raw reads", async () => {
  const document = createProjectDocument(createDefaultProject(), {
    id: "project-one",
    now: "2026-08-04T12:00:00.000Z",
  });
  const ready = createCloudProjectRecord("user-one", document, 1);
  const future = structuredClone(ready);
  future.document.id = "future-payload-id";
  future.projectId = "future-payload-id";
  future.document.project.schemaVersion = 99;
  future.title = "Future cloud tune";
  delete future.updatedAt;
  const malformed = {
    cloudFormat: "broken",
    title: "Malformed cloud tune",
    nested: { exact: ["raw", 17] },
  };
  const v8Project = structuredClone(createDefaultV2Project());
  const v7Project = structuredClone(v8Project);
  v7Project.schemaVersion = 7;
  const nativeV7 = createCloudProjectRecord("user-one", createProjectDocument(v7Project, {
    id: "native-v7",
    now: "2026-08-04T12:00:00.000Z",
  }), 2);
  const nativeV8 = createCloudProjectRecord("user-one", createProjectDocument(v8Project, {
    id: "native-v8",
    now: "2026-08-04T12:00:00.000Z",
  }), 3);
  const records = new Map([
    ["ready-key", ready],
    ["native-v7-key", nativeV7],
    ["native-v8-key", nativeV8],
    ["future-key", future],
    ["malformed-key", malformed],
  ]);
  const database = { name: "database" };
  let listedCollection = null;
  const client = await createFirebaseClient({
    config: {
      apiKey: "public-key",
      appId: "web-app",
      authDomain: "example.firebaseapp.com",
      projectId: "example",
    },
    loadSdk: async () => ({
      app: {
        getApps: () => [],
        initializeApp: () => ({ name: "[DEFAULT]" }),
      },
      auth: {
        getAuth: () => ({ currentUser: null }),
      },
      firestore: {
        collection: (_database, ...segments) => segments.join("/"),
        doc: (_database, ...segments) => segments.join("/"),
        getFirestore: () => database,
        async getDocs(reference) {
          listedCollection = reference;
          return {
            docs: [...records].map(([id, value]) => ({
              data: () => structuredClone(value),
              id,
            })),
          };
        },
        async getDoc(reference) {
          const key = reference.split("/").at(-1);
          return {
            data: () => structuredClone(records.get(key)),
            exists: () => records.has(key),
          };
        },
      },
    }),
  });

  const recoverySummaries = await client.listProjects("user-one", { targetSchemaVersion: 6 });
  const currentSummaries = await client.listProjects("user-one", { targetSchemaVersion: 8 });

  assert.equal(listedCollection, "users/user-one/projects");
  assert.equal(recoverySummaries.length, 5);
  assert.equal(recoverySummaries.find(({ recoveryKey }) => recoveryKey === "ready-key").availability, "ready");
  assert.equal(recoverySummaries.find(({ recoveryKey }) => recoveryKey === "native-v7-key").availability, "unavailable");
  assert.equal(recoverySummaries.find(({ recoveryKey }) => recoveryKey === "native-v8-key").availability, "unavailable");
  assert.equal(recoverySummaries.find(({ recoveryKey }) => recoveryKey === "future-key").availability, "unavailable");
  assert.equal(recoverySummaries.find(({ recoveryKey }) => recoveryKey === "malformed-key").availability, "unavailable");
  assert.equal(currentSummaries.find(({ recoveryKey }) => recoveryKey === "native-v7-key").availability, "ready");
  assert.equal(currentSummaries.find(({ recoveryKey }) => recoveryKey === "native-v8-key").availability, "ready");
  assert.deepEqual(await client.getRawProject("user-one", "malformed-key"), malformed);
  assert.deepEqual(await client.getRawProject("user-one", "native-v8-key"), nativeV8);
  assert.equal(records.get("malformed-key").nested.exact[0], "raw");
});
