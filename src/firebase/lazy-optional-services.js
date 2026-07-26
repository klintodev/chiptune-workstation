function requireVerifiedAccount(accountService) {
  const account = accountService.getState().account;
  if (!account) throw new Error("Sign in before using cloud services.");
  if (account.emailVerified !== true) throw new Error("Verify your email before using cloud services.");
  return account;
}

export function createLazyCloudProjectService({
  accountService,
  createService,
} = {}) {
  if (!accountService || typeof createService !== "function") {
    throw new TypeError("Lazy cloud projects require an account service and service factory.");
  }
  const events = new EventTarget();
  const lifecycle = new AbortController();
  let activeUid = "";
  let disposed = false;
  let generation = 0;
  let service = null;
  let servicePromise = null;
  let started = false;

  function forwardChange(event) {
    events.dispatchEvent(new CustomEvent("change", { detail: event.detail }));
  }

  function releaseService() {
    generation += 1;
    if (service) {
      service.removeEventListener("change", forwardChange);
      service.dispose();
    }
    service = null;
    servicePromise = null;
    activeUid = "";
  }

  async function getService() {
    const account = requireVerifiedAccount(accountService);
    if (service && activeUid === account.uid) return service;
    if (activeUid && activeUid !== account.uid) releaseService();
    if (servicePromise) return servicePromise;
    const expectedUid = account.uid;
    const expectedGeneration = generation;
    activeUid = expectedUid;
    servicePromise = Promise.resolve()
      .then(createService)
      .then((candidate) => {
        const current = accountService.getState().account;
        if (
          disposed
          || generation !== expectedGeneration
          || current?.uid !== expectedUid
          || current.emailVerified !== true
        ) {
          candidate.dispose();
          throw new Error("The authenticated cloud session changed.");
        }
        service = candidate;
        service.addEventListener("change", forwardChange);
        service.start();
        return service;
      })
      .catch((error) => {
        if (generation === expectedGeneration) {
          servicePromise = null;
          if (!service) activeUid = "";
        }
        throw error;
      });
    return servicePromise;
  }

  function handleAccountChange() {
    const account = accountService.getState().account;
    if (account?.emailVerified === true) {
      if (activeUid && activeUid !== account.uid) releaseService();
      void getService().catch(() => {});
    } else {
      releaseService();
    }
  }

  function start() {
    if (started || disposed) return;
    started = true;
    accountService.addEventListener("change", handleAccountChange, { signal: lifecycle.signal });
    handleAccountChange();
  }

  async function use(method, ...args) {
    const candidate = await getService();
    return candidate[method](...args);
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    deleteProject: (...args) => use("deleteProject", ...args),
    dispose() {
      if (disposed) return;
      disposed = true;
      lifecycle.abort();
      releaseService();
    },
    enableCurrentProject: (...args) => use("enableCurrentProject", ...args),
    async getProjectStatus(...args) {
      if (accountService.getState().account?.emailVerified !== true) {
        return Object.freeze({ status: "local-only", link: null });
      }
      return use("getProjectStatus", ...args);
    },
    listProjects: (...args) => use("listProjects", ...args),
    openProject: (...args) => use("openProject", ...args),
    overwriteConflictWithLocal: (...args) => use("overwriteConflictWithLocal", ...args),
    async queueProject(...args) {
      if (accountService.getState().account?.emailVerified !== true) return null;
      return use("queueProject", ...args);
    },
    removeEventListener: events.removeEventListener.bind(events),
    async retryAll(...args) {
      if (accountService.getState().account?.emailVerified !== true) return;
      return use("retryAll", ...args);
    },
    retryProject: (...args) => use("retryProject", ...args),
    start,
  });
}

export function createLazyPublicationService({
  accountService,
  createService,
} = {}) {
  if (!accountService || typeof createService !== "function") {
    throw new TypeError("Lazy publishing requires an account service and service factory.");
  }
  let activeUid = "";
  let service = null;
  let servicePromise = null;

  accountService.addEventListener("change", () => {
    const account = accountService.getState().account;
    if (account?.uid === activeUid && account.emailVerified === true) return;
    activeUid = "";
    service = null;
    servicePromise = null;
  });

  async function getService() {
    const account = requireVerifiedAccount(accountService);
    if (service && activeUid === account.uid) return service;
    if (!servicePromise || activeUid !== account.uid) {
      activeUid = account.uid;
      servicePromise = Promise.resolve()
        .then(createService)
        .then((candidate) => {
          service = candidate;
          return candidate;
        })
        .catch((error) => {
          servicePromise = null;
          throw error;
        });
    }
    return servicePromise;
  }

  return Object.freeze({
    async getCurrentPublication() {
      if (accountService.getState().account?.emailVerified !== true) return null;
      return (await getService()).getCurrentPublication();
    },
    async publish(...args) {
      return (await getService()).publish(...args);
    },
    async unpublish(...args) {
      return (await getService()).unpublish(...args);
    },
  });
}
