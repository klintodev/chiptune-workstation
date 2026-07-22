const INITIAL_STATE = Object.freeze({
  account: null,
  error: null,
  status: "idle",
});

function friendlyError(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential")) return "The email or password is incorrect.";
  if (code.includes("email-already-in-use")) return "If this address is new, check your inbox. Otherwise, sign in or reset your password.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("weak-password")) return "Use at least 12 characters and meet the password requirements shown by Firebase.";
  if (code.includes("missing-password")) return "Enter your password to continue.";
  if (code.includes("requires-recent-login")) return "Confirm your sign-in again before deleting the account.";
  if (code.includes("publication/quota-exceeded")) return "This account already has 20 published projects. Unpublish one before sharing another.";
  if (code.includes("popup-closed-by-user")) return "Google sign-in was cancelled.";
  if (code.includes("popup-blocked")) return "The browser blocked the Google sign-in window.";
  if (code.includes("too-many-requests")) return "Too many account requests were made. Wait a moment before trying again.";
  if (code.includes("network-request-failed")) return "Firebase is currently unreachable. Local projects still work.";
  console.error("Unexpected Firebase account error.", error);
  return "The account action could not be completed. Local projects remain available.";
}

export function createAccountService({ loadClient } = {}) {
  if (typeof loadClient !== "function") throw new TypeError("Account service requires a Firebase client loader.");
  const events = new EventTarget();
  let client = null;
  let clientPromise = null;
  let disposed = false;
  let state = INITIAL_STATE;
  let unsubscribe = null;

  function emit() {
    events.dispatchEvent(new CustomEvent("change", { detail: state }));
  }

  function setState(patch) {
    state = Object.freeze({ ...state, ...patch });
    emit();
  }

  async function getClient() {
    if (client) return client;
    if (!clientPromise) clientPromise = Promise.resolve().then(loadClient);
    try {
      client = await clientPromise;
      return client;
    } catch (error) {
      clientPromise = null;
      throw error;
    }
  }

  async function start() {
    if (disposed || unsubscribe || state.status === "checking") return;
    setState({ error: null, status: "checking" });
    try {
      const firebase = await getClient();
      if (disposed) return;
      unsubscribe = firebase.onAuthStateChanged((account) => {
        if (disposed) return;
        setState({ account, error: null, status: account ? "authenticated" : "anonymous" });
      }, (error) => {
        if (disposed) return;
        setState({ account: null, error: friendlyError(error), status: "unavailable" });
      });
    } catch (error) {
      if (disposed) return;
      setState({ account: null, error: friendlyError(error), status: "unavailable" });
    }
  }

  async function run(action) {
    if (disposed || state.status === "busy") return null;
    setState({ error: null, status: "busy" });
    try {
      const firebase = await getClient();
      const account = await action(firebase);
      if (!disposed) {
        setState({
          account: account ?? state.account,
          error: null,
          status: account || state.account ? "authenticated" : "anonymous",
        });
      }
      return account;
    } catch (error) {
      if (!disposed) {
        setState({
          account: state.account,
          error: friendlyError(error),
          status: state.account ? "authenticated" : "anonymous",
        });
      }
      throw error;
    }
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    createEmailAccount: (email, password) => run((firebase) => firebase.createEmailAccount(email, password)),
    async deleteAccount(password = "") {
      if (disposed || state.status === "busy") return;
      setState({ error: null, status: "busy" });
      try {
        const firebase = await getClient();
        await firebase.deleteAccount(password);
        if (!disposed) setState({ account: null, error: null, status: "anonymous" });
      } catch (error) {
        if (!disposed) setState({
          account: state.account,
          error: friendlyError(error),
          status: state.account ? "authenticated" : "anonymous",
        });
        throw error;
      }
    },
    dispose() {
      disposed = true;
      unsubscribe?.();
      unsubscribe = null;
    },
    getClient,
    getState: () => state,
    refreshAccount: () => run((firebase) => firebase.refreshAccount()),
    requestPasswordReset: (email) => run((firebase) => firebase.requestPasswordReset(email)),
    removeEventListener: events.removeEventListener.bind(events),
    signInWithEmail: (email, password) => run((firebase) => firebase.signInWithEmail(email, password)),
    signInWithGoogle: () => run((firebase) => firebase.signInWithGoogle()),
    sendVerificationEmail: () => run((firebase) => firebase.sendVerificationEmail()),
    async signOut() {
      if (disposed || state.status === "busy") return;
      setState({ error: null, status: "busy" });
      try {
        const firebase = await getClient();
        await firebase.signOut();
        if (!disposed) setState({ account: null, error: null, status: "anonymous" });
      } catch (error) {
        if (!disposed) setState({ error: friendlyError(error), status: "authenticated" });
        throw error;
      }
    },
    start,
  });
}
