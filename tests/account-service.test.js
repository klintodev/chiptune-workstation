import assert from "node:assert/strict";
import test from "node:test";

import { createAccountService } from "../src/firebase/account-service.js";

function createFirebaseDouble() {
  let authListener = null;
  let passwordResetCount = 0;
  let unsubscribeCount = 0;
  let verificationEmailCount = 0;
  return {
    client: {
      async createEmailAccount(email) {
        return { uid: "email-user", email, emailVerified: false, displayName: "" };
      },
      onAuthStateChanged(listener) {
        authListener = listener;
        return () => { unsubscribeCount += 1; };
      },
      async signInWithEmail() {
        const error = new Error("Firebase rejected the credential");
        error.code = "auth/invalid-credential";
        throw error;
      },
      async refreshAccount() {
        return { uid: "email-user", email: "chip@example.com", emailVerified: true, displayName: "" };
      },
      async requestPasswordReset() {
        passwordResetCount += 1;
      },
      async sendVerificationEmail() {
        verificationEmailCount += 1;
        return { uid: "email-user", email: "chip@example.com", emailVerified: false, displayName: "" };
      },
      async signInWithGoogle() {
        return { uid: "google-user", email: "chip@example.com", emailVerified: true, displayName: "Chip" };
      },
      async signOut() {},
    },
    emitAccount(account) {
      authListener(account);
    },
    getPasswordResetCount: () => passwordResetCount,
    getUnsubscribeCount: () => unsubscribeCount,
    getVerificationEmailCount: () => verificationEmailCount,
  };
}

test("account service reflects optional auth state without changing local state", async () => {
  const firebase = createFirebaseDouble();
  const service = createAccountService({ loadClient: async () => firebase.client });

  await service.start();
  assert.equal(service.getState().status, "checking");

  firebase.emitAccount(null);
  assert.equal(service.getState().status, "anonymous");
  assert.equal(service.getState().account, null);

  await service.signInWithGoogle();
  assert.equal(service.getState().status, "authenticated");
  assert.equal(service.getState().account.uid, "google-user");

  await service.signOut();
  assert.equal(service.getState().status, "anonymous");
  service.dispose();
  assert.equal(firebase.getUnsubscribeCount(), 1);
});

test("account service exposes pending and refreshed email verification state", async () => {
  const firebase = createFirebaseDouble();
  const service = createAccountService({ loadClient: async () => firebase.client });

  const created = await service.createEmailAccount("chip@example.com", "password");
  assert.equal(created.emailVerified, false);
  assert.equal(service.getState().account.emailVerified, false);

  await service.sendVerificationEmail();
  assert.equal(firebase.getVerificationEmailCount(), 1);

  const refreshed = await service.refreshAccount();
  assert.equal(refreshed.emailVerified, true);
  assert.equal(service.getState().account.emailVerified, true);
  service.dispose();
});

test("password recovery returns an anonymous account service to its idle state", async () => {
  const firebase = createFirebaseDouble();
  const service = createAccountService({ loadClient: async () => firebase.client });

  await service.requestPasswordReset("chip@example.com");
  assert.equal(firebase.getPasswordResetCount(), 1);
  assert.equal(service.getState().status, "anonymous");
  assert.equal(service.getState().account, null);
  service.dispose();
});

test("account service converts Firebase credential errors into useful UI state", async () => {
  const firebase = createFirebaseDouble();
  const service = createAccountService({ loadClient: async () => firebase.client });

  await assert.rejects(service.signInWithEmail("chip@example.com", "wrong"));
  assert.equal(service.getState().status, "anonymous");
  assert.equal(service.getState().error, "The email or password is incorrect.");
  service.dispose();
});

test("a missing Firebase configuration degrades only the account feature", async () => {
  const service = createAccountService({
    loadClient: async () => { throw new Error("Firebase web app configuration has not been completed yet."); },
  });

  await service.start();
  assert.equal(service.getState().status, "unavailable");
  assert.match(service.getState().error, /configuration has not been completed/);
  service.dispose();
});
