import { parseRemixIntent } from "./remix-intent.js";

function clearRemixIntent(history, location) {
  const url = new URL(location.href);
  url.searchParams.delete("remix");
  url.searchParams.delete("revision");
  history.replaceState({}, "", url.href);
}

export function createRemixImportFeature({
  history = globalThis.history,
  location = globalThis.location,
  onBeforeProjectChange = () => {},
  persistence,
  remixService,
  root = document,
} = {}) {
  if (!persistence || !remixService) {
    throw new TypeError("Remix import requires project persistence and a remix service.");
  }
  let intent;
  try {
    intent = parseRemixIntent(location.href);
  } catch (error) {
    intent = Object.freeze({ error });
  }
  if (!intent) return Object.freeze({ dispose() {} });

  const dialog = root.createElement("dialog");
  dialog.className = "remix-import-dialog";
  dialog.setAttribute("aria-labelledby", "remix-import-title");
  dialog.innerHTML = `
    <div>
      <span class="panel-context">Local remix</span>
      <h2 id="remix-import-title">Create a separate local project?</h2>
      <p data-message role="status">This will recheck publication revision <output data-revision></output> and the creator’s current permission before saving anything. The public source stays unchanged.</p>
      <div data-source hidden></div>
      <p data-rights>It will not upload or publish the remix. In-product permission does not guarantee rights to external material.</p>
      <div data-actions><button type="button" data-cancel>Cancel</button><button class="safe-action" type="button" data-action>Create local remix</button></div>
    </div>`;
  root.body.append(dialog);
  const action = dialog.querySelector("[data-action]");
  const cancel = dialog.querySelector("[data-cancel]");
  const message = dialog.querySelector("[data-message]");
  dialog.querySelector("[data-revision]").textContent = String(intent.publicationRevision ?? "—");
  const source = dialog.querySelector("[data-source]");
  let importing = false;
  let complete = false;
  dialog.showModal();

  function cancelIntent() {
    clearRemixIntent(history, location);
    dialog.close();
  }

  cancel.addEventListener("click", cancelIntent);
  dialog.addEventListener("cancel", (event) => {
    if (importing) event.preventDefault();
    else cancelIntent();
  });

  async function importRemix() {
    if (complete) {
      dialog.close();
      return;
    }
    if (importing) return;
    importing = true;
    action.disabled = true;
    cancel.disabled = true;
    action.textContent = "Creating…";
    dialog.querySelector("h2").textContent = "Creating your local copy…";
    message.textContent = "Checking the exact public revision and the creator’s current remix permission.";
    try {
      if (intent.error) throw intent.error;
      const imported = await remixService.importPublication(
        intent.publicationId,
        intent.publicationRevision,
      );
      onBeforeProjectChange();
      await persistence.openProject(imported.document.id);
      clearRemixIntent(history, location);
      dialog.querySelector("h2").textContent = "Local remix created";
      message.textContent = "The source is unchanged. This project is saved only in this browser and has not been uploaded or published.";
      source.hidden = false;
      source.innerHTML = `<strong></strong><span></span>`;
      source.querySelector("strong").textContent = imported.provenance.sourceTitle;
      source.querySelector("span").textContent = `by ${imported.provenance.creatorName} · public revision ${imported.provenance.publicationRevision} · publication ${imported.provenance.publicationId}`;
      action.textContent = "Continue in studio";
    } catch (error) {
      clearRemixIntent(history, location);
      dialog.querySelector("h2").textContent = "Remix could not be created";
      message.textContent = error.message || "The publication is unavailable, changed, or no longer allows remixing.";
      message.classList.add("error");
      action.textContent = "Return to studio";
    } finally {
      importing = false;
      complete = true;
      action.disabled = false;
      cancel.hidden = true;
      action.focus();
    }
  }

  action.addEventListener("click", () => void importRemix());
  if (intent.error) void importRemix();

  return Object.freeze({
    dispose() {
      dialog.remove();
    },
  });
}
