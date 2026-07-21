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

  const created = await client.createEmailAccount("chip@example.com", "password");
  assert.equal(created.emailVerified, false);
  assert.equal(firebase.calls.verificationEmails, 1);
  assert.equal(firebase.calls.profileWrites, 0);

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
