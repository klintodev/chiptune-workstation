const STYLESHEET_ID = "publishing-styles";

export function createPublishingFeature({
  accountService,
  persistence,
  publicationService,
  root = document,
} = {}) {
  if (!accountService || !persistence || !publicationService) {
    throw new TypeError("Publishing requires account, project, and publication services.");
  }
  const lifecycle = new AbortController();
  let currentPublication = null;
  let busy = false;

  if (!root.getElementById(STYLESHEET_ID)) {
    const stylesheet = root.createElement("link");
    stylesheet.id = STYLESHEET_ID;
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./src/features/publishing/publishing.css?v=20260721-2";
    root.head.append(stylesheet);
  }

  const open = root.createElement("button");
  open.id = "project-publish";
  open.type = "button";
  open.textContent = "Share";
  (root.querySelector("#project-share-render-actions")
    ?? root.querySelector(".project-dialog-actions"))?.append(open);
  const quickOpen = root.createElement("button");
  quickOpen.id = "project-publish-quick";
  quickOpen.type = "button";
  quickOpen.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></svg><span class="visually-hidden">Share project</span>`;
  quickOpen.setAttribute("aria-label", "Share project");
  quickOpen.title = "Share project";
  root.querySelector("#global-tools")?.append(quickOpen);

  const template = root.createElement("template");
  template.innerHTML = `
    <dialog class="publishing-dialog" aria-labelledby="publishing-title">
      <div class="publishing-panel">
        <header><div><span class="panel-context">Unlisted playback page</span><h2 id="publishing-title">Share project</h2></div><button type="button" data-close aria-label="Close sharing">&times;</button></header>
        <p data-intro>Publishing creates a read-only snapshot. Your private working project remains private.</p>
        <div class="publishing-project"><span>Project</span><strong data-title></strong><span data-account></span></div>
        <label><span>Creator name</span><input data-creator type="text" maxlength="48" autocomplete="name" /><small>Shown publicly with the project title.</small></label>
        <div class="publishing-actions"><button class="safe-action" type="button" data-publish>Publish snapshot</button></div>
        <section class="publishing-link" data-link-section hidden>
          <span class="panel-context">Public link</span>
          <div><input data-url type="url" readonly /><button type="button" data-copy>Copy</button><a data-open target="_blank" rel="noopener">Open</a></div>
          <p>Republishing updates this same URL. Visitors do not need an account.</p>
          <button class="neutral-action" type="button" data-unpublish>Unpublish</button>
        </section>
        <p class="publishing-message" data-message role="status"></p>
      </div>
    </dialog>
    <dialog class="publishing-delete-dialog" aria-labelledby="publishing-delete-title">
      <div class="publishing-delete-panel">
        <span class="panel-context">Confirm unpublish</span>
        <h2 id="publishing-delete-title">Remove public page?</h2>
        <p>The share link will stop working. Your local and private cloud projects will not be removed.</p>
        <div><button class="safe-action" type="button" data-keep>Keep published</button><button class="neutral-action" type="button" data-confirm>Unpublish</button></div>
      </div>
    </dialog>`;
  const dialog = template.content.querySelector(".publishing-dialog");
  const confirmDialog = template.content.querySelector(".publishing-delete-dialog");
  root.body.append(dialog, confirmDialog);
  const elements = {
    account: dialog.querySelector("[data-account]"),
    close: dialog.querySelector("[data-close]"),
    confirm: confirmDialog.querySelector("[data-confirm]"),
    copy: dialog.querySelector("[data-copy]"),
    creator: dialog.querySelector("[data-creator]"),
    keep: confirmDialog.querySelector("[data-keep]"),
    linkSection: dialog.querySelector("[data-link-section]"),
    message: dialog.querySelector("[data-message]"),
    openLink: dialog.querySelector("[data-open]"),
    publish: dialog.querySelector("[data-publish]"),
    title: dialog.querySelector("[data-title]"),
    unpublish: dialog.querySelector("[data-unpublish]"),
    url: dialog.querySelector("[data-url]"),
  };

  function showMessage(message = "", { error = false } = {}) {
    elements.message.textContent = message;
    elements.message.classList.toggle("error", error);
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    for (const control of dialog.querySelectorAll("button, input")) control.disabled = nextBusy;
    elements.close.disabled = false;
  }

  function render() {
    const account = accountService.getState().account;
    const verified = account?.emailVerified === true;
    const title = persistence.getActiveDocument().project.metadata.title;
    elements.title.textContent = title;
    elements.account.textContent = verified
      ? `Signed in as ${account.displayName || account.email || "account"}`
      : account
        ? "Verify your email from the account menu before publishing."
        : "Sign in from the account menu before publishing.";
    elements.creator.disabled = !verified || busy;
    elements.publish.disabled = !verified || busy;
    elements.publish.textContent = currentPublication ? "Update snapshot" : "Publish snapshot";
    elements.linkSection.hidden = !currentPublication;
    if (currentPublication) {
      elements.url.value = currentPublication.url;
      elements.openLink.href = currentPublication.url;
      elements.creator.value = currentPublication.creatorName;
    } else if (verified && !elements.creator.value) {
      elements.creator.value = account.displayName || "";
    }
  }

  async function refresh() {
    try {
      currentPublication = await publicationService.getCurrentPublication();
    } catch (error) {
      showMessage(error.message, { error: true });
    }
    render();
  }

  async function run(action, success) {
    if (busy) return;
    setBusy(true);
    showMessage("");
    try {
      await action();
      if (success) showMessage(success);
    } catch (error) {
      showMessage(error.message || "The publishing action failed.", { error: true });
    } finally {
      setBusy(false);
      render();
    }
  }

  function openPublishing() {
    root.querySelector("#project-library-dialog")?.close();
    showMessage("");
    void refresh();
    if (!dialog.open) dialog.showModal();
  }
  open.addEventListener("click", openPublishing, { signal: lifecycle.signal });
  quickOpen.addEventListener("click", openPublishing, { signal: lifecycle.signal });
  elements.close.addEventListener("click", () => dialog.close(), { signal: lifecycle.signal });
  elements.publish.addEventListener("click", () => {
    const creatorName = elements.creator.value.trim();
    if (!creatorName) {
      showMessage("Enter the creator name visitors should see.", { error: true });
      elements.creator.focus();
      return;
    }
    void run(async () => {
      currentPublication = await publicationService.publish(creatorName);
    }, currentPublication ? "Public snapshot updated." : "Public playback page created.");
  }, { signal: lifecycle.signal });
  elements.copy.addEventListener("click", () => void run(async () => {
    if (!currentPublication) return;
    if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Copy is unavailable. Select and copy the link manually.");
    await globalThis.navigator.clipboard.writeText(currentPublication.url);
  }, "Share link copied."), { signal: lifecycle.signal });
  elements.unpublish.addEventListener("click", () => {
    dialog.close();
    confirmDialog.showModal();
    elements.keep.focus();
  }, { signal: lifecycle.signal });
  elements.keep.addEventListener("click", () => {
    confirmDialog.close();
    dialog.showModal();
  }, { signal: lifecycle.signal });
  elements.confirm.addEventListener("click", () => {
    if (busy) return;
    confirmDialog.close();
    dialog.showModal();
    void run(async () => {
      await publicationService.unpublish();
      currentPublication = null;
    }, "Public playback page removed. Private projects are unchanged.");
  }, { signal: lifecycle.signal });
  confirmDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    elements.keep.click();
  }, { signal: lifecycle.signal });
  accountService.addEventListener("change", () => {
    currentPublication = null;
    if (dialog.open) void refresh(); else render();
  }, { signal: lifecycle.signal });
  render();

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      open.remove();
      quickOpen.remove();
      dialog.remove();
      confirmDialog.remove();
      root.getElementById(STYLESHEET_ID)?.remove();
    },
  });
}
