import assert from "node:assert/strict";
import test from "node:test";

import { createFirebaseClient } from "../src/firebase/firebase-client.js";

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
  assert.equal(firebase.calls.profileWrites, 1);

  await client.sendVerificationEmail();
  assert.equal(firebase.calls.verificationEmails, 2);
});

test("App Check initialises before Auth and Firestore when configured", async () => {
  const order = [];
  const app = { name: "[DEFAULT]" };
  let loadOptions = null;
  await createFirebaseClient({
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
        firestore: { getFirestore: () => { order.push("firestore"); return {}; } },
      };
    },
  });

  assert.deepEqual(loadOptions, { includeAppCheck: true });
  assert.deepEqual(order, ["app-check", "auth", "firestore"]);
});
