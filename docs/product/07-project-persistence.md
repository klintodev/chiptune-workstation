# PRD 7: Project Persistence

## Description

Allow users to preserve, recover, and move their work. A project must capture all information required to reproduce the composition, while using a versioned format that can evolve as later visualiser and sharing features are added.

The initial persistence experience is local-first and does not require accounts or a backend.

## Requirements

- The application must define a documented, versioned project data format.
- A saved project must contain all composition, transport, track, pattern, instrument, mixer, and arrangement data available at the time of saving.
- The user must be able to create a new project.
- The user must be able to name and rename a project.
- The user must be able to save a project locally.
- The user must be able to view and reopen locally saved projects.
- The user must be able to duplicate and delete a local project.
- Deleting a project must require a clear confirmation and explain whether recovery is possible.
- The application must protect users from accidentally losing unsaved changes during ordinary navigation or project switching.
- The application should automatically preserve recent edits locally where browser capabilities allow.
- The user must be able to export a project as a portable data file.
- The user must be able to import a supported project data file.
- Imported data must be validated before it affects the active project.
- Invalid, corrupted, or unsupported files must produce an actionable error without damaging existing projects.
- The loader must recognize the project format version and either migrate supported older versions or reject them clearly.
- Persistence operations must not require network access.

## Open questions

Resolved for the first implementation:

- IndexedDB stores projects behind a repository abstraction; `localStorage` stores only the last-opened project preference.
- Saving is automatic after a short debounce, with visible save status.
- Undo and redo history is bounded and session-only; local project revisions are not retained yet.
- Portable files use human-readable JSON and the `.chipwork.json` extension.
- The document envelope and project schema are independently versioned.
- Existing supported project migrations remain supported; document migrations begin when the envelope changes.
- The interface reports when browser storage is unavailable or a save fails.

Deferred:

- Binary asset representation.
- Accounts, cloud repositories, synchronization, and conflict resolution.
- Recoverable deletion and retained local revision history.
