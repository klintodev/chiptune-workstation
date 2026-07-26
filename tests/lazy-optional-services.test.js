import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createLazyCloudProjectService,
  createLazyPublicationService,
} from "../src/firebase/lazy-optional-services.js";

function createAccountHarness(initialAccount = null) {
  const events = new EventTarget();
  let account = initialAccount;
  return {
    service: {
      addEventListener: events.addEventListener.bind(events),
      getState: () => ({ account }),
    },
    setAccount(nextAccount) {
      account = nextAccount;
      events.dispatchEvent(new Event("change"));
    },
  };
}

test("cloud services are not constructed until a verified account exists", async () => {
  const account = createAccountHarness();
  const innerEvents = new EventTarget();
  let creations = 0;
  let disposals = 0;
  let starts = 0;
  const facade = createLazyCloudProjectService({
    accountService: account.service,
    createService() {
      creations += 1;
      return {
        addEventListener: innerEvents.addEventListener.bind(innerEvents),
        dispose: () => { disposals += 1; },
        getProjectStatus: async () => ({ status: "synced", link: {} }),
        removeEventListener: innerEvents.removeEventListener.bind(innerEvents),
        retryAll: async () => {},
        start: () => { starts += 1; },
      };
    },
  });

  facade.start();
  assert.equal(creations, 0);
  assert.deepEqual(await facade.getProjectStatus(), { status: "local-only", link: null });
  account.setAccount({ uid: "user-one", emailVerified: false });
  assert.equal(creations, 0);
  account.setAccount({ uid: "user-one", emailVerified: true });
  assert.equal((await facade.getProjectStatus()).status, "synced");
  assert.equal(creations, 1);
  assert.equal(starts, 1);
  account.setAccount(null);
  assert.equal(disposals, 1);
  facade.dispose();
});

test("publishing remains unconstructed for guests and unverified accounts", async () => {
  const account = createAccountHarness();
  let creations = 0;
  const facade = createLazyPublicationService({
    accountService: account.service,
    createService() {
      creations += 1;
      return {
        getCurrentPublication: async () => null,
        publish: async () => "published",
        unpublish: async () => true,
      };
    },
  });

  assert.equal(await facade.getCurrentPublication(), null);
  assert.equal(creations, 0);
  account.setAccount({ uid: "user-one", emailVerified: false });
  assert.equal(await facade.getCurrentPublication(), null);
  assert.equal(creations, 0);
  account.setAccount({ uid: "user-one", emailVerified: true });
  assert.equal(await facade.publish("Chip"), "published");
  assert.equal(creations, 1);
});

test("the guest application graph loads the Firebase client dynamically", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import .*firebase-client/m);
  assert.match(source, /await import\("\.\/firebase\/firebase-client\.js/);
});
