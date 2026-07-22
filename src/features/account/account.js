import { publicErrorMessage } from "../../shared/public-error.js";

const SYNC_LABELS = Object.freeze({
  "local-only": "Local only",
  pending: "Waiting to sync",
  syncing: "Syncing...",
  synced: "Synced",
  offline: "Offline - retrying",
  conflict: "Conflict - both versions preserved",
  failed: "Cloud backup failed",
});

function formatUpdatedAt(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function createInterface(root) {
  const template = root.createElement("template");
  template.innerHTML = `
    <button id="account-open" class="account-summary" type="button" aria-haspopup="dialog">
      <span class="account-avatar" aria-hidden="true">@</span>
      <span id="account-summary-label">Sign in</span>
    </button>
    <dialog id="account-dialog" class="account-dialog" aria-labelledby="account-title">
      <div class="account-dialog-panel">
        <header>
          <div><span class="panel-context">Optional account</span><h2 id="account-title">Cloud account</h2></div>
          <button id="account-close" type="button" aria-label="Close account">&times;</button>
        </header>
        <section id="account-signed-out" class="account-signed-out">
          <p>Keep creating locally without an account. Sign in only when you want private cloud projects and sharing.</p>
          <form id="account-email-form" class="account-email-form">
            <label><span>Email</span><input id="account-email" type="email" autocomplete="email" required /></label>
            <label><span>Password</span><input id="account-password" type="password" autocomplete="current-password" minlength="12" required /><small>New accounts require at least 12 characters.</small></label>
            <button id="account-password-reset" class="account-password-reset" type="button">Forgot password?</button>
            <div><button class="safe-action" type="submit">Sign in</button><button id="account-email-create" type="button">Create account</button></div>
          </form>
          <div class="account-divider"><span>or</span></div>
          <button id="account-google-sign-in" class="account-google-action" type="button">Continue with Google</button>
        </section>
        <section id="account-signed-in" class="account-signed-in" hidden>
          <div class="account-identity"><span class="account-identity-avatar" aria-hidden="true">@</span><div><strong id="account-name">Signed in</strong><span id="account-email-label"></span></div></div>
          <div id="account-verification" class="account-verification" hidden>
            <span class="panel-context">Email verification required</span>
            <strong>Check your inbox</strong>
            <p>Firebase sent a verification link to <strong id="account-verification-email"></strong>. Local projects remain fully available while cloud backup and sharing are locked.</p>
            <div class="account-verification-actions">
              <button id="account-verification-check" class="safe-action" type="button">I've verified</button>
              <button id="account-verification-resend" type="button">Resend email</button>
            </div>
          </div>
          <div id="account-cloud-content" class="account-cloud-content">
          <div class="account-current-project">
            <div><span class="panel-context">Current project</span><strong id="account-current-title">Local project</strong><span id="account-sync-status" class="account-sync-status" data-status="local-only">Local only</span></div>
            <div class="account-sync-actions">
              <button id="account-backup" class="safe-action" type="button">Enable cloud backup</button>
              <button id="account-retry" type="button" hidden>Retry now</button>
              <button id="account-resolve" type="button" hidden>Use local version</button>
            </div>
          </div>
          <div class="account-cloud-heading"><div><span class="panel-context">Cloud projects</span><p>Open a private project from this account. Cloud removal never removes the local copy.</p></div><button id="account-refresh" type="button">Refresh</button></div>
          <div id="account-cloud-list" class="account-cloud-list" aria-label="Cloud projects"></div>
          </div>
          <div class="account-signed-in-actions"><button id="account-delete-account" class="neutral-action" type="button">Delete account</button><button id="account-sign-out" type="button">Sign out</button></div>
        </section>
        <p id="account-message" class="account-message" role="status"></p>
      </div>
    </dialog>
    <dialog id="account-cloud-delete-dialog" class="account-delete-dialog" aria-labelledby="account-delete-title">
      <div class="account-delete-panel">
        <span class="panel-context">Confirm cloud removal</span>
        <h2 id="account-delete-title">Remove cloud copy?</h2>
        <p id="account-delete-message"></p>
        <div><button id="account-delete-cancel" class="safe-action" type="button">Keep cloud copy</button><button id="account-delete-confirm" class="neutral-action" type="button">Remove cloud copy</button></div>
      </div>
    </dialog>
    <dialog id="account-erasure-dialog" class="account-delete-dialog" aria-labelledby="account-erasure-title">
      <div class="account-delete-panel account-erasure-panel">
        <span class="panel-context">Permanent account deletion</span>
        <h2 id="account-erasure-title">Delete cloud account?</h2>
        <p>Your Firebase account, private cloud projects and public share pages will be permanently removed. Projects stored in this browser will remain local.</p>
        <label><span>Type DELETE to confirm</span><input id="account-erasure-confirmation" type="text" autocomplete="off" spellcheck="false" /></label>
        <label id="account-erasure-password-field"><span>Current password</span><input id="account-erasure-password" type="password" autocomplete="current-password" /></label>
        <p id="account-erasure-message" class="account-message" role="status"></p>
        <div><button id="account-erasure-cancel" class="safe-action" type="button">Keep account</button><button id="account-erasure-confirm" class="neutral-action" type="button" disabled>Delete account</button></div>
      </div>
    </dialog>
  `;
  const fragment = template.content;
  const open = fragment.querySelector("#account-open");
  (root.querySelector("#account-slot") ?? root.querySelector(".global-status"))?.append(open);
  root.body.append(
    fragment.querySelector("#account-dialog"),
    fragment.querySelector("#account-cloud-delete-dialog"),
    fragment.querySelector("#account-erasure-dialog"),
  );

  const dialog = root.querySelector("#account-dialog");
  const deleteDialog = root.querySelector("#account-cloud-delete-dialog");
  const erasureDialog = root.querySelector("#account-erasure-dialog");
  return Object.freeze({
    backup: dialog.querySelector("#account-backup"),
    close: dialog.querySelector("#account-close"),
    cloudList: dialog.querySelector("#account-cloud-list"),
    cloudContent: dialog.querySelector("#account-cloud-content"),
    createEmail: dialog.querySelector("#account-email-create"),
    currentTitle: dialog.querySelector("#account-current-title"),
    deleteCancel: deleteDialog.querySelector("#account-delete-cancel"),
    deleteConfirm: deleteDialog.querySelector("#account-delete-confirm"),
    deleteDialog,
    deleteMessage: deleteDialog.querySelector("#account-delete-message"),
    deleteAccount: dialog.querySelector("#account-delete-account"),
    dialog,
    email: dialog.querySelector("#account-email"),
    emailForm: dialog.querySelector("#account-email-form"),
    emailLabel: dialog.querySelector("#account-email-label"),
    erasureCancel: erasureDialog.querySelector("#account-erasure-cancel"),
    erasureConfirm: erasureDialog.querySelector("#account-erasure-confirm"),
    erasureConfirmation: erasureDialog.querySelector("#account-erasure-confirmation"),
    erasureDialog,
    erasureMessage: erasureDialog.querySelector("#account-erasure-message"),
    erasurePassword: erasureDialog.querySelector("#account-erasure-password"),
    erasurePasswordField: erasureDialog.querySelector("#account-erasure-password-field"),
    google: dialog.querySelector("#account-google-sign-in"),
    message: dialog.querySelector("#account-message"),
    name: dialog.querySelector("#account-name"),
    open,
    password: dialog.querySelector("#account-password"),
    passwordReset: dialog.querySelector("#account-password-reset"),
    refresh: dialog.querySelector("#account-refresh"),
    resolve: dialog.querySelector("#account-resolve"),
    retry: dialog.querySelector("#account-retry"),
    signedIn: dialog.querySelector("#account-signed-in"),
    signedOut: dialog.querySelector("#account-signed-out"),
    signOut: dialog.querySelector("#account-sign-out"),
    summaryLabel: open.querySelector("#account-summary-label"),
    syncStatus: dialog.querySelector("#account-sync-status"),
    verification: dialog.querySelector("#account-verification"),
    verificationCheck: dialog.querySelector("#account-verification-check"),
    verificationEmail: dialog.querySelector("#account-verification-email"),
    verificationResend: dialog.querySelector("#account-verification-resend"),
  });
}

export function createAccountFeature({
  accountService,
  cloudProjectService,
  root = document,
} = {}) {
  if (!accountService || !cloudProjectService) {
    throw new TypeError("Account feature requires account and cloud project services.");
  }
  const lifecycle = new AbortController();
  const elements = createInterface(root);
  let busy = false;
  let cloudGeneration = 0;
  let pendingDelete = null;
  let currentCloudState = Object.freeze({ status: "local-only", link: null });

  function showMessage(message = "", { error = false } = {}) {
    elements.message.textContent = message;
    elements.message.classList.toggle("error", error);
  }

  function setBusy(value) {
    busy = value;
    for (const control of elements.dialog.querySelectorAll("button, input")) control.disabled = value;
    elements.close.disabled = false;
    elements.deleteCancel.disabled = value;
    elements.deleteConfirm.disabled = value;
  }

  function setErasureBusy(value) {
    for (const control of elements.erasureDialog.querySelectorAll("button, input")) control.disabled = value;
    elements.erasureCancel.disabled = value;
    elements.erasureConfirm.disabled = value || elements.erasureConfirmation.value !== "DELETE";
  }

  function createCloudRow(summary) {
    const row = root.createElement("div");
    row.className = "account-cloud-project";
    const open = root.createElement("button");
    open.type = "button";
    open.className = "account-cloud-open";
    open.dataset.action = "open";
    open.dataset.projectId = summary.id;
    const title = root.createElement("strong");
    title.textContent = summary.title;
    const details = root.createElement("span");
    details.textContent = `${formatUpdatedAt(summary.updatedAt)} / cloud revision ${summary.cloudRevision}`;
    open.append(title, details);
    const remove = root.createElement("button");
    remove.type = "button";
    remove.className = "account-cloud-delete";
    remove.dataset.action = "delete";
    remove.dataset.projectId = summary.id;
    remove.dataset.projectTitle = summary.title;
    remove.setAttribute("aria-label", `Remove ${summary.title} from cloud`);
    remove.title = "Remove cloud copy";
    remove.innerHTML = "&times;";
    row.append(open, remove);
    return row;
  }

  function renderCloudStatus() {
    const status = currentCloudState.status;
    elements.syncStatus.textContent = SYNC_LABELS[status] ?? status;
    elements.syncStatus.dataset.status = status;
    elements.backup.hidden = status !== "local-only";
    elements.retry.hidden = !["offline", "failed"].includes(status);
    elements.resolve.hidden = status !== "conflict";
    if (currentCloudState.link?.error && ["offline", "failed", "conflict"].includes(status)) {
      showMessage(currentCloudState.link.error, { error: status !== "offline" });
    }
  }

  async function loadCurrentCloudStatus() {
    const title = root.querySelector("#project-title")?.value;
    elements.currentTitle.textContent = title || "Current local project";
    try {
      currentCloudState = await cloudProjectService.getProjectStatus();
    } catch (error) {
      currentCloudState = Object.freeze({
        status: "failed",
        link: { error: publicErrorMessage(error, {
          context: "Cloud project status failed.",
          fallback: "Cloud project status is temporarily unavailable.",
        }) },
      });
    }
    renderCloudStatus();
  }

  async function loadCloudProjects() {
    const generation = ++cloudGeneration;
    const { account } = accountService.getState();
    if (account?.emailVerified !== true) {
      elements.cloudList.replaceChildren();
      return;
    }
    elements.cloudList.replaceChildren();
    const loading = root.createElement("p");
    loading.textContent = "Loading cloud projects...";
    elements.cloudList.append(loading);
    try {
      const projects = await cloudProjectService.listProjects();
      if (generation !== cloudGeneration) return;
      if (projects.length === 0) {
        const empty = root.createElement("p");
        empty.textContent = "No cloud projects yet.";
        elements.cloudList.replaceChildren(empty);
      } else {
        elements.cloudList.replaceChildren(...projects.map(createCloudRow));
      }
    } catch (error) {
      if (generation !== cloudGeneration) return;
      elements.cloudList.replaceChildren();
      showMessage(publicErrorMessage(error, {
        context: "Cloud project listing failed.",
        fallback: "Cloud projects could not be loaded. Local projects remain available.",
      }), { error: true });
    }
  }

  function render() {
    const state = accountService.getState();
    const account = state.account;
    const authenticated = Boolean(account);
    const verified = account?.emailVerified === true;
    elements.signedIn.hidden = !authenticated;
    elements.signedOut.hidden = authenticated;
    elements.verification.hidden = !authenticated || verified;
    elements.cloudContent.hidden = !authenticated || !verified;
    elements.summaryLabel.textContent = authenticated
      ? verified ? account.displayName || account.email || "Account" : "Verify email"
      : state.status === "checking" ? "Checking..." : "Sign in";
    elements.open.classList.toggle("signed-in", authenticated);
    elements.open.classList.toggle("verification-needed", authenticated && !verified);
    elements.name.textContent = account?.displayName || "Signed in";
    elements.emailLabel.textContent = account?.email || "";
    elements.verificationEmail.textContent = account?.email || "your email address";
    if (state.error) showMessage(state.error, { error: true });
    if (!state.error && state.status === "unavailable") {
      showMessage("Cloud accounts are unavailable. Local projects are unaffected.", { error: true });
    }
    if (state.status === "checking") showMessage("Connecting to Firebase...");
    setBusy(state.status === "busy");
    if (authenticated && verified) renderCloudStatus();
  }

  async function run(action, successMessage = "") {
    if (busy) return;
    setBusy(true);
    showMessage("");
    try {
      await action();
      if (successMessage) showMessage(successMessage);
    } catch (error) {
      const serviceError = accountService.getState().error;
      showMessage(serviceError || publicErrorMessage(error, {
        context: "Cloud account action failed.",
        fallback: "The cloud action could not be completed. Local projects remain available.",
      }), { error: true });
    } finally {
      setBusy(false);
      render();
      if (accountService.getState().account?.emailVerified === true) await loadCurrentCloudStatus();
    }
  }

  function openAccount() {
    render();
    if (!elements.dialog.open) elements.dialog.showModal();
    if (accountService.getState().account?.emailVerified === true) {
      void Promise.all([loadCurrentCloudStatus(), loadCloudProjects()]);
    }
  }

  function requestCloudDelete(projectId, title) {
    pendingDelete = { id: projectId, title };
    elements.deleteMessage.textContent = `Remove "${title}" from your cloud account? The local copy will remain in this browser.`;
    if (elements.dialog.open) elements.dialog.close();
    elements.deleteDialog.showModal();
    elements.deleteCancel.focus();
  }

  function closeDeleteDialog({ reopen = true } = {}) {
    if (elements.deleteDialog.open) elements.deleteDialog.close();
    pendingDelete = null;
    if (reopen) openAccount();
  }

  function openErasureDialog() {
    const account = accountService.getState().account;
    if (!account) return;
    const passwordRequired = account.providerIds?.includes("password") ?? true;
    elements.erasureConfirmation.value = "";
    elements.erasurePassword.value = "";
    elements.erasurePassword.required = passwordRequired;
    elements.erasurePasswordField.hidden = !passwordRequired;
    elements.erasureMessage.textContent = passwordRequired
      ? "Re-enter your password, then type DELETE."
      : "Google will ask you to confirm your identity, then the deletion will begin.";
    elements.erasureMessage.classList.remove("error");
    setErasureBusy(false);
    if (elements.dialog.open) elements.dialog.close();
    elements.erasureDialog.showModal();
    elements.erasureConfirmation.focus();
  }

  function closeErasureDialog({ reopen = true } = {}) {
    if (elements.erasureDialog.open) elements.erasureDialog.close();
    if (reopen) openAccount();
  }

  elements.open.addEventListener("click", openAccount, { signal: lifecycle.signal });
  elements.close.addEventListener("click", () => elements.dialog.close(), { signal: lifecycle.signal });
  elements.dialog.addEventListener("cancel", () => elements.dialog.close(), { signal: lifecycle.signal });
  elements.emailForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void run(() => accountService.signInWithEmail(elements.email.value, elements.password.value));
  }, { signal: lifecycle.signal });
  elements.createEmail.addEventListener("click", () => {
    if (!elements.emailForm.reportValidity()) return;
    void run(
      () => accountService.createEmailAccount(elements.email.value, elements.password.value),
      "Verification email sent. Check your inbox to enable cloud backup and sharing.",
    );
  }, { signal: lifecycle.signal });
  elements.passwordReset.addEventListener("click", () => {
    if (!elements.email.reportValidity()) return;
    void run(
      () => accountService.requestPasswordReset(elements.email.value),
      "If an account exists for that email, a password reset link has been sent.",
    );
  }, { signal: lifecycle.signal });
  elements.google.addEventListener("click", () => void run(accountService.signInWithGoogle), { signal: lifecycle.signal });
  elements.deleteAccount.addEventListener("click", openErasureDialog, { signal: lifecycle.signal });
  elements.erasureConfirmation.addEventListener("input", () => {
    elements.erasureConfirm.disabled = busy || elements.erasureConfirmation.value !== "DELETE";
  }, { signal: lifecycle.signal });
  elements.erasureCancel.addEventListener("click", () => closeErasureDialog(), { signal: lifecycle.signal });
  elements.erasureDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (!busy) closeErasureDialog();
  }, { signal: lifecycle.signal });
  elements.erasureConfirm.addEventListener("click", () => {
    if (busy || elements.erasureConfirmation.value !== "DELETE") return;
    busy = true;
    setErasureBusy(true);
    elements.erasureMessage.textContent = "Removing cloud data and account...";
    elements.erasureMessage.classList.remove("error");
    void accountService.deleteAccount(elements.erasurePassword.value).then(() => {
      closeErasureDialog({ reopen: false });
      openAccount();
      showMessage("Cloud account and remote data removed. Local browser projects remain available.");
    }).catch(() => {
      elements.erasureMessage.textContent = accountService.getState().error || "The account could not be deleted.";
      elements.erasureMessage.classList.add("error");
    }).finally(() => {
      busy = false;
      setErasureBusy(false);
    });
  }, { signal: lifecycle.signal });
  elements.verificationResend.addEventListener("click", () => {
    void run(
      accountService.sendVerificationEmail,
      "Verification email sent. Check your inbox.",
    );
  }, { signal: lifecycle.signal });
  elements.verificationCheck.addEventListener("click", () => {
    void run(async () => {
      const account = await accountService.refreshAccount();
      if (account?.emailVerified !== true) {
        throw new Error("That address is not verified yet. Open the link in the email, then check again.");
      }
    }, "Email verified. Cloud backup and sharing are now available.");
  }, { signal: lifecycle.signal });
  elements.signOut.addEventListener("click", () => void run(accountService.signOut, "Signed out. Local projects remain available."), { signal: lifecycle.signal });
  elements.backup.addEventListener("click", () => void run(async () => {
    await cloudProjectService.enableCurrentProject();
    await loadCloudProjects();
  }, "Cloud backup enabled for this project."), { signal: lifecycle.signal });
  elements.retry.addEventListener("click", () => {
    const projectId = currentCloudState.link?.projectId;
    if (projectId) void run(() => cloudProjectService.retryProject(projectId), "Cloud backup retried.");
  }, { signal: lifecycle.signal });
  elements.resolve.addEventListener("click", () => {
    const projectId = currentCloudState.link?.projectId;
    if (projectId) void run(async () => {
      await cloudProjectService.overwriteConflictWithLocal(projectId);
      await loadCloudProjects();
    }, "Local version saved to cloud. The conflict copy remains local.");
  }, { signal: lifecycle.signal });
  elements.refresh.addEventListener("click", () => void Promise.all([loadCurrentCloudStatus(), loadCloudProjects()]), { signal: lifecycle.signal });
  elements.cloudList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || busy) return;
    if (button.dataset.action === "delete") {
      requestCloudDelete(button.dataset.projectId, button.dataset.projectTitle);
      return;
    }
    const localStatus = root.querySelector("#project-save-status")?.dataset.state;
    if (localStatus === "unsaved" || localStatus === "saving") {
      showMessage("Wait for the current local project to finish saving before opening a cloud project.", { error: true });
      return;
    }
    void run(() => cloudProjectService.openProject(button.dataset.projectId));
  }, { signal: lifecycle.signal });
  elements.deleteCancel.addEventListener("click", () => closeDeleteDialog(), { signal: lifecycle.signal });
  elements.deleteDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDeleteDialog();
  }, { signal: lifecycle.signal });
  elements.deleteConfirm.addEventListener("click", () => {
    if (!pendingDelete || busy) return;
    const projectId = pendingDelete.id;
    setBusy(true);
    void cloudProjectService.deleteProject(projectId).then(() => {
      closeDeleteDialog();
      showMessage("Cloud copy removed. Local projects were not changed.");
    }).catch((error) => {
      closeDeleteDialog();
      showMessage(publicErrorMessage(error, {
        context: "Cloud project deletion failed.",
        fallback: "The cloud copy could not be removed.",
      }), { error: true });
    }).finally(() => setBusy(false));
  }, { signal: lifecycle.signal });

  const handleAccountChange = () => {
    render();
    if (elements.dialog.open && accountService.getState().account?.emailVerified === true) {
      void Promise.all([loadCurrentCloudStatus(), loadCloudProjects()]);
    }
  };
  const handleCloudChange = () => {
    if (accountService.getState().account?.emailVerified !== true) return;
    void loadCurrentCloudStatus();
    if (elements.dialog.open) void loadCloudProjects();
  };
  accountService.addEventListener("change", handleAccountChange, { signal: lifecycle.signal });
  cloudProjectService.addEventListener("change", handleCloudChange, { signal: lifecycle.signal });
  render();

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      elements.deleteDialog.remove();
      elements.erasureDialog.remove();
      elements.dialog.remove();
      elements.open.remove();
    },
    render,
  });
}
