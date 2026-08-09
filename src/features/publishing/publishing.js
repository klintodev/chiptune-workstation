import { publicErrorMessage } from "../../shared/public-error.js";

export function createPublishingFeature({
  accountService,
  persistence,
  publicationService,
  provenanceRepository,
  root = document,
} = {}) {
  if (!accountService || !persistence || !publicationService || !provenanceRepository) {
    throw new TypeError("Publishing requires account, project, and publication services.");
  }
  const lifecycle = new AbortController();
  let currentPublication = null;
  let currentProvenance = null;
  let pendingCreatorName = "";
  let publicationContextReady = false;
  let busy = false;

  const open = root.createElement("button");
  open.id = "project-publish";
  open.type = "button";
  open.textContent = "Share";
  (root.querySelector("#project-share-render-actions")
    ?? root.querySelector(".project-dialog-actions"))?.append(open);
  const quickOpen = root.createElement("button");
  quickOpen.id = "project-publish-quick";
  quickOpen.type = "button";
  quickOpen.textContent = "Share";
  quickOpen.setAttribute("aria-label", "Share project");
  quickOpen.title = "Share project";
  (root.querySelector("#v2-project-share-slot")
    ?? root.querySelector("#global-tools"))?.append(quickOpen);

  const template = root.createElement("template");
  template.innerHTML = `
    <dialog class="publishing-dialog" aria-labelledby="publishing-title">
      <div class="publishing-panel">
        <header><div><span class="panel-context">Unlisted playback page</span><h2 id="publishing-title">Share project</h2></div><button type="button" data-close aria-label="Close sharing">&times;</button></header>
        <p data-intro>Publishing creates a read-only snapshot. Your private working project remains private.</p>
        <div class="publishing-project"><span>Project</span><strong data-title></strong><span data-account></span></div>
        <section class="publishing-provenance" data-provenance hidden>
          <span class="panel-context">Remixed from</span>
          <strong data-source-title></strong>
          <span data-source-meta></span>
          <p>This retained source context will be shown again before you confirm publication.</p>
        </section>
        <label><span>Creator name</span><input data-creator type="text" maxlength="48" autocomplete="name" /><small>Shown publicly with the project title.</small></label>
        <div class="publishing-actions"><button class="safe-action" type="button" data-publish>Publish snapshot</button></div>
        <section class="publishing-link" data-link-section hidden>
          <span class="panel-context">Public link</span>
          <div><input data-url type="url" readonly /><button type="button" data-copy>Copy</button><a data-open target="_blank" rel="noopener">Open</a></div>
          <p>Republishing updates this same URL. Visitors do not need an account.</p>
          <label class="publishing-remix"><input data-remix type="checkbox" /><span><strong>Allow remixing</strong><small>Visitors can import this exact public snapshot as a new local project. Your private project and account stay private.</small></span></label>
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
    </dialog>
    <dialog class="publishing-derivative-dialog" aria-labelledby="publishing-derivative-title">
      <div class="publishing-derivative-panel">
        <span class="panel-context">Confirm derivative publication</span>
        <h2 id="publishing-derivative-title">Publish this remix?</h2>
        <p>This project retains source attribution:</p>
        <div class="publishing-derivative-source"><strong data-derivative-title></strong><span data-derivative-meta></span></div>
        <p>Klinto Studio remix permission does not guarantee rights to external samples, trademarks, or material the source creator did not own.</p>
        <div><button type="button" data-derivative-cancel>Review project</button><button class="safe-action" type="button" data-derivative-confirm>Confirm and publish</button></div>
      </div>
    </dialog>`;
  const dialog = template.content.querySelector(".publishing-dialog");
  const confirmDialog = template.content.querySelector(".publishing-delete-dialog");
  const derivativeDialog = template.content.querySelector(".publishing-derivative-dialog");
  root.body.append(dialog, confirmDialog, derivativeDialog);
  const elements = {
    account: dialog.querySelector("[data-account]"),
    close: dialog.querySelector("[data-close]"),
    confirm: confirmDialog.querySelector("[data-confirm]"),
    copy: dialog.querySelector("[data-copy]"),
    creator: dialog.querySelector("[data-creator]"),
    derivativeCancel: derivativeDialog.querySelector("[data-derivative-cancel]"),
    derivativeConfirm: derivativeDialog.querySelector("[data-derivative-confirm]"),
    derivativeMeta: derivativeDialog.querySelector("[data-derivative-meta]"),
    derivativeTitle: derivativeDialog.querySelector("[data-derivative-title]"),
    keep: confirmDialog.querySelector("[data-keep]"),
    linkSection: dialog.querySelector("[data-link-section]"),
    message: dialog.querySelector("[data-message]"),
    openLink: dialog.querySelector("[data-open]"),
    publish: dialog.querySelector("[data-publish]"),
    remix: dialog.querySelector("[data-remix]"),
    provenance: dialog.querySelector("[data-provenance]"),
    sourceMeta: dialog.querySelector("[data-source-meta]"),
    sourceTitle: dialog.querySelector("[data-source-title]"),
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
    elements.publish.disabled = !verified || busy || !publicationContextReady;
    elements.publish.textContent = currentPublication ? "Update snapshot" : "Publish snapshot";
    elements.provenance.hidden = !currentProvenance;
    if (currentProvenance) {
      elements.sourceTitle.textContent = currentProvenance.sourceTitle;
      elements.sourceMeta.textContent = `by ${currentProvenance.creatorName} · public revision ${currentProvenance.publicationRevision} · publication ${currentProvenance.publicationId}`;
    }
    elements.linkSection.hidden = !currentPublication;
    if (currentPublication) {
      elements.url.value = currentPublication.url;
      elements.openLink.href = currentPublication.url;
      elements.creator.value = currentPublication.creatorName;
      elements.remix.checked = currentPublication.allowRemix === true;
    } else if (verified && !elements.creator.value) {
      elements.creator.value = account.displayName || "";
    }
  }

  async function refresh() {
    publicationContextReady = false;
    currentPublication = null;
    currentProvenance = null;
    setBusy(true);
    try {
      [currentPublication, currentProvenance] = await Promise.all([
        publicationService.getCurrentPublication(),
        provenanceRepository.get(persistence.getActiveDocument().id),
      ]);
      publicationContextReady = true;
    } catch (error) {
      showMessage(publicErrorMessage(error, {
        context: "Publication status failed.",
        fallback: "Sharing status could not be loaded.",
      }), { error: true });
    } finally {
      setBusy(false);
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
      showMessage(publicErrorMessage(error, {
        context: "Publishing action failed.",
        fallback: "The publishing action could not be completed.",
        messages: {
          "publication/quota-exceeded": "This account already has 20 published projects. Unpublish one before sharing another.",
          "publication/revision-conflict": "This public page changed elsewhere. Reopen sharing and try again.",
        },
      }), { error: true });
    } finally {
      setBusy(false);
      render();
    }
  }

  function openPublishing() {
    root.querySelector("#project-library-dialog")?.close();
    showMessage("");
    publicationContextReady = false;
    render();
    void refresh();
    if (!dialog.open) dialog.showModal();
    elements.close.focus();
  }
  open.addEventListener("click", openPublishing, { signal: lifecycle.signal });
  quickOpen.addEventListener("click", openPublishing, { signal: lifecycle.signal });
  elements.close.addEventListener("click", () => dialog.close(), { signal: lifecycle.signal });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dialog.close();
  }, { signal: lifecycle.signal });
  elements.publish.addEventListener("click", () => {
    const creatorName = elements.creator.value.trim();
    if (!creatorName) {
      showMessage("Enter the creator name visitors should see.", { error: true });
      elements.creator.focus();
      return;
    }
    if (currentProvenance) {
      pendingCreatorName = creatorName;
      elements.derivativeTitle.textContent = currentProvenance.sourceTitle;
      elements.derivativeMeta.textContent = `by ${currentProvenance.creatorName} · public revision ${currentProvenance.publicationRevision} · publication ${currentProvenance.publicationId}`;
      dialog.close();
      derivativeDialog.showModal();
      elements.derivativeCancel.focus();
      return;
    }
    void run(async () => {
      currentPublication = await publicationService.publish(creatorName);
    }, currentPublication ? "Public snapshot updated." : "Public playback page created.");
  }, { signal: lifecycle.signal });
  elements.copy.addEventListener("click", () => {
    if (!currentPublication) return;
    if (!globalThis.navigator?.clipboard?.writeText) {
      showMessage("Copy is unavailable. Select and copy the link manually.", { error: true });
      return;
    }
    void run(
      () => globalThis.navigator.clipboard.writeText(currentPublication.url),
      "Share link copied.",
    );
  }, { signal: lifecycle.signal });
  elements.remix.addEventListener("change", () => {
    const allowRemix = elements.remix.checked;
    void run(async () => {
      currentPublication = await publicationService.setRemixPermission(allowRemix);
    }, allowRemix
      ? "Visitors may now create local remixes from this snapshot."
      : "Future in-product remix imports are disabled.");
  }, { signal: lifecycle.signal });
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
  elements.derivativeCancel.addEventListener("click", () => {
    pendingCreatorName = "";
    derivativeDialog.close();
    dialog.showModal();
    elements.publish.focus();
  }, { signal: lifecycle.signal });
  derivativeDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    elements.derivativeCancel.click();
  }, { signal: lifecycle.signal });
  elements.derivativeConfirm.addEventListener("click", () => {
    const creatorName = pendingCreatorName;
    pendingCreatorName = "";
    derivativeDialog.close();
    dialog.showModal();
    void run(async () => {
      currentPublication = await publicationService.publish(creatorName);
    }, currentPublication ? "Derivative snapshot updated after source review." : "Derivative playback page created after source review.");
  }, { signal: lifecycle.signal });
  accountService.addEventListener("change", () => {
    currentPublication = null;
    publicationContextReady = false;
    if (dialog.open) void refresh(); else render();
  }, { signal: lifecycle.signal });
  persistence.addEventListener("change", (event) => {
    if (event.detail.type !== "project") return;
    currentPublication = null;
    currentProvenance = null;
    publicationContextReady = false;
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
      derivativeDialog.remove();
    },
  });
}
