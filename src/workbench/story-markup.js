export function projectLibraryMarkup({ open = true } = {}) {
  return `
    <div class="story-project-header">
      <button id="project-library-open" class="project-summary" type="button" aria-haspopup="dialog">
        <span class="project-summary-copy"><span>Project</span><output id="project-title">Neon Overpass</output></span>
        <span class="project-save-pill"><span aria-hidden="true"></span><output id="project-save-status">Saved</output></span>
      </button>
      <div id="global-tools" class="global-tools"></div>
    </div>
    <dialog id="project-library-dialog" class="project-dialog" aria-labelledby="project-library-title"${open ? " open" : ""}>
      <div class="project-dialog-panel">
        <header>
          <div><span class="panel-context">Local library</span><h2 id="project-library-title">Projects</h2></div>
          <button id="project-library-close" type="button" aria-label="Close project library">×</button>
        </header>
        <div class="project-library-current">
          <label class="project-title-field"><span>Project name</span><input id="project-name-input" type="text" maxlength="100" /></label>
          <div class="project-library-current-status"><span>Status</span><output id="project-library-save-status">Saved</output></div>
        </div>
        <div class="project-dialog-actions">
          <button id="project-new" type="button">New</button>
          <button id="project-duplicate" type="button">Duplicate</button>
          <button id="project-import" type="button">Import</button>
          <button id="project-export" type="button">Download</button>
          <input id="project-import-file" type="file" accept=".chipwork.json,.json,application/json" hidden />
        </div>
        <div class="project-library-heading"><span>Saved in this browser</span><output id="project-library-count">0 projects</output></div>
        <div id="project-list" class="project-list" aria-label="Saved projects"></div>
        <section class="project-share-render">
          <div><span class="panel-context">Share or render</span><p>Create a public snapshot or render the arrangement locally.</p></div>
          <div id="project-share-render-actions"></div>
        </section>
        <p id="project-storage-message" class="project-storage-message" role="status"></p>
        <div id="project-storage-recovery" class="project-storage-recovery" hidden>
          <strong>Storage needs attention</strong>
          <button id="project-recovery-download" type="button">Download recovery copy</button>
        </div>
        <p id="project-library-error" class="project-library-error" role="alert" hidden></p>
      </div>
    </dialog>
    <dialog id="project-delete-dialog" class="project-delete-dialog" aria-labelledby="project-delete-title">
      <div>
        <span class="panel-context">Confirm deletion</span>
        <h2 id="project-delete-title">Delete project?</h2>
        <p id="project-delete-message"></p>
        <button id="project-delete-confirm" type="button">Delete project</button>
        <button id="project-delete-cancel" class="safe-action" type="button">Keep project</button>
      </div>
    </dialog>
  `;
}
