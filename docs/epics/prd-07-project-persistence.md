# PRD 07 Epics: Project Persistence

These epics deliver [PRD 07: Project Persistence](../product/07-project-persistence.md). They add local-first project storage, project-wide undo and redo, and portable project files without coupling the editor to a particular database or future account system.

## Scope decisions

- Project state remains the serializable source of truth; UI and audio runtime state are not persisted.
- State mutations emit change events and each completed user action is one undoable transaction.
- Saved records are versioned project documents containing a stable project ID, revision, timestamps, and a validated project snapshot.
- IndexedDB stores the local project library. `localStorage` stores only the last-opened project ID.
- Autosave is debounced, explicit project switching flushes pending changes, and save status remains visible.
- Undo history remains bounded and in memory. It is not included in saved or exported documents.
- Storage is accessed through a repository interface that a future cloud implementation can satisfy.
- Portable projects use human-readable JSON with the `.chipwork.json` extension.
- Accounts, remote synchronization, conflict resolution, revision history, and binary assets are deferred.

## E21: Versioned project documents and repository boundary

### Outcome

The application can turn domain state into a validated, portable document without knowing where that document is stored.

### User stories

#### US21.1 - Preserve a complete project

As a user, I want every musical decision saved together so that reopening a project restores the same composition.

Requirements:

- A document contains a format identifier, document version, stable ID, revision, creation time, update time, and complete project snapshot.
- The snapshot contains composition, transport, patterns, tracks, instruments, mixer settings, and arrangement clips.
- Audio nodes, active notes, playback position, selected controls, open panels, and undo stacks are excluded.
- Documents survive JSON serialization without loss.

#### US21.2 - Reject unsafe project data

As a user, I want invalid files rejected before they affect my work.

Requirements:

- Document structure and project schema are validated before replacement.
- Supported older project schemas use the existing migration path.
- Unsupported document or project versions produce an actionable error.
- Validation never partially mutates the active project.

#### US21.3 - Keep storage replaceable

As a developer, I want persistence behind a small repository contract so that cloud storage can be added later.

Requirements:

- The repository exposes list, get, save, and delete operations.
- Editing features do not import IndexedDB APIs.
- List entries contain enough metadata to render a project picker without loading every body.
- Repository behavior can be tested through an in-memory implementation.

## E22: IndexedDB project library and autosave

### Outcome

Edits are preserved locally and the most recent project reopens automatically.

### User stories

#### US22.1 - Autosave committed edits

As a user, I want my work saved shortly after I change it so that a refresh does not lose progress.

Requirements:

- Every committed project change marks the active project as unsaved.
- A short debounce combines rapid changes into one database write.
- A save increments the document revision and update timestamp.
- The interface reports unsaved, saving, saved, and failed states.
- A later edit cannot be reported as saved by an earlier in-flight write.

#### US22.2 - Resume the last project

As a user, I want the last project I edited to reopen when I return.

Requirements:

- The last-opened ID is stored as a lightweight preference.
- Startup loads and validates it before constructing editing features.
- A missing preference falls back to the most recently updated valid project.
- With no local project, a default project is created and saved.
- Storage failure leaves the workstation usable and reports that changes are not being persisted.

#### US22.3 - Avoid losing pending changes

As a user, I want project transitions to wait for pending saves.

Requirements:

- New, open, duplicate, import, and delete actions flush pending changes where relevant.
- The page warns before unloading while an unsaved or failed change exists.
- Project replacement clears undo and redo history.

## E23: Project lifecycle and global history

### Outcome

The global bar is the clear place to name, create, select, duplicate, and safely delete projects while undo and redo apply across the project.

### User stories

#### US23.1 - Name and browse projects

As a user, I want named projects in a local library so that I can return to different songs.

Requirements:

- The active project title and save state are visible globally.
- The project panel lists saved projects ordered by most recent update.
- Selecting a project stops sound, saves the current project, validates the target, and replaces state atomically.
- Renaming is a project-state transaction and autosaves.

#### US23.2 - Create and duplicate projects

As a user, I want a blank project or independent copy so that I can start safely or explore a variation.

Requirements:

- New creates a default project with a new stable document ID.
- Duplicate copies the current project under a derived name and new ID.
- The created project becomes active immediately.
- Neither operation mutates its source document.

#### US23.3 - Delete a project safely

As a user, I want protection before permanently deleting a local project.

Requirements:

- Delete opens an application-owned modal that blocks background interaction.
- The safer cancel action receives primary emphasis and initial focus.
- The message identifies the project and states deletion cannot be undone.
- Deleting the active project opens another project or creates a default project.
- Cancellation changes nothing.

#### US23.4 - Undo and redo across the project

As a user, I want mistakes reversed consistently regardless of which editor made them.

Requirements:

- Global undo and redo controls reflect project history.
- Keyboard shortcuts continue to work outside editable controls.
- Track, clip, pattern, instrument, mixer, and transport mutations share one history.
- Continuous input remains one transaction.
- Opening or creating a project clears history.

## E24: Portable import and export

### Outcome

Projects can move between browsers or machines without a backend.

### User stories

#### US24.1 - Export a project

As a user, I want to download the active project so that I can back it up or move it elsewhere.

Requirements:

- Export flushes pending changes before creating the file.
- The filename is safely derived from the title and ends in `.chipwork.json`.
- The file contains an indented, human-readable project document.
- Export does not alter project state or history.

#### US24.2 - Import a project safely

As a user, I want to open a project file without risking my current work.

Requirements:

- Import accepts one `.chipwork.json` or JSON file.
- File size and parsed structure are checked before persistence or replacement.
- Existing IDs are not overwritten silently; collisions create independent copies.
- A successful import saves and opens the project.
- Any failure leaves the active project untouched and displays a useful error.

## E25: Persistence regression coverage

### Outcome

The small set of failure-prone persistence rules is protected without building a large test suite.

### User stories

#### US25.1 - Protect document and repository behavior

As a maintainer, I want focused tests around the storage boundary so later cloud work cannot corrupt projects.

Requirements:

- Tests cover document creation, revision, serialization, validation, and ID collisions.
- Repository tests cover list ordering, get, save, replacement, and delete.
- Orchestration tests cover autosave, project replacement, duplicate, and failed-import atomicity.
- Existing state, scheduler, input, and audio tests remain green.