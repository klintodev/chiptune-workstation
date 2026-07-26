export function createHelpFeature({ root = document } = {}) {
  const lifecycle = new AbortController();
  let returnFocus = null;

  const open = root.createElement("button");
  open.id = "help-open";
  open.type = "button";
  open.textContent = "?";
  open.setAttribute("aria-label", "Open music and workstation help");
  open.setAttribute("aria-controls", "help-dialog");
  open.setAttribute("aria-haspopup", "dialog");
  open.title = "Help";
  root.querySelector("#global-tools")?.append(open);

  const template = root.createElement("template");
  template.innerHTML = `
    <dialog id="help-dialog" class="help-dialog" aria-labelledby="help-title">
      <div class="help-panel">
        <header>
          <div><span class="panel-context">Learn as you create</span><h2 id="help-title">Music and workstation help</h2></div>
          <button type="button" data-close aria-label="Close help">&times;</button>
        </header>
        <section aria-labelledby="help-first-loop">
          <h3 id="help-first-loop">Make your first loop</h3>
          <ol>
            <li>Choose <strong>Pattern</strong>, then tap an empty step to add its default note.</li>
            <li>Add a few notes and choose <strong>Pattern</strong> in the Play menu to preview the repeating loop.</li>
            <li>Choose <strong>Add loop to song</strong> to create a clip at the song playhead.</li>
            <li>Choose <strong>Song</strong> in the Play menu, then press Play.</li>
          </ol>
        </section>
        <section aria-labelledby="help-glossary">
          <h3 id="help-glossary">Plain-language glossary</h3>
          <dl>
            <div id="help-pattern" tabindex="-1"><dt>Pattern</dt><dd>A short repeating loop of note steps.</dd></div>
            <div id="help-clip" tabindex="-1"><dt>Clip</dt><dd>One occurrence of a pattern placed in the song.</dd></div>
            <div id="help-gate" tabindex="-1"><dt>Gate</dt><dd>How much of the step the note is held: its note length.</dd></div>
            <div id="help-velocity" tabindex="-1"><dt>Velocity</dt><dd>The note's loudness or strength.</dd></div>
            <div id="help-voice" tabindex="-1"><dt>Voice or oscillator</dt><dd>The basic sound shape used by an instrument.</dd></div>
            <div id="help-attack" tabindex="-1"><dt>Attack</dt><dd>How quickly the note fades in.</dd></div>
            <div id="help-release" tabindex="-1"><dt>Release</dt><dd>How long the note's tail takes to fade out.</dd></div>
          </dl>
        </section>
        <p class="help-shortcuts"><strong>Keyboard:</strong> Arrow keys move around steps. Enter adds a note. Delete or Backspace clears it. A focused clip moves with Arrow keys; hold Shift for four steps. Space controls playback only when no control is focused.</p>
        <button class="safe-action" type="button" data-done>Back to my music</button>
      </div>
    </dialog>`;
  const dialog = template.content.querySelector("#help-dialog");
  root.body.append(dialog);
  const close = dialog.querySelector("[data-close]");
  const done = dialog.querySelector("[data-done]");
  for (const trigger of root.querySelectorAll("[data-help-term]")) {
    trigger.setAttribute("aria-controls", "help-dialog");
    trigger.setAttribute("aria-details", `help-${trigger.dataset.helpTerm}`);
    trigger.setAttribute("aria-haspopup", "dialog");
  }

  function closeHelp() {
    if (dialog.open) dialog.close();
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }

  function openHelp(term, invoker = root.activeElement) {
    returnFocus = invoker;
    if (!dialog.open) dialog.showModal();
    const definition = term ? dialog.querySelector(`#help-${term}`) : null;
    (definition ?? close).focus();
  }

  open.addEventListener("click", () => openHelp(null, open), { signal: lifecycle.signal });
  close.addEventListener("click", closeHelp, { signal: lifecycle.signal });
  done.addEventListener("click", closeHelp, { signal: lifecycle.signal });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeHelp();
  }, { signal: lifecycle.signal });
  root.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-help-term]");
    if (!trigger) return;
    event.preventDefault();
    openHelp(trigger.dataset.helpTerm, trigger);
  }, { signal: lifecycle.signal });

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      dialog.remove();
      open.remove();
    },
    open: openHelp,
  });
}
