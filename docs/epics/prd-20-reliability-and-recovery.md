# PRD 20 Epics: Reliability and Recovery

These epics deliver [PRD 20: Reliability and Recovery](../product/20-reliability-and-recovery.md).

## Description

Make accepted musical data playable everywhere, make cloud decisions preserve the user's latest local work, and provide a portable recovery path when browser or network storage is unavailable.

The implementation keeps the existing local-first project document and closure-based service boundaries. Reliability rules are centralized so live audio, transport, export, naming, and cloud synchronization cannot drift into incompatible interpretations.

## Requirements

- One pitch policy governs editor input, preview, live input, arrangement playback, and offline export.
- Per-project cloud operations are serialized and conflicts always resolve from fresh documents.
- Generated duplicate and conflict names remain valid at their maximum lengths.
- The current in-memory project can be downloaded even when durable local storage is unavailable.
- A new guest session starts without contacting Firebase or Google identity services.
- Reliability regressions are covered at domain, service, and real-browser boundaries.

## Epic 70 - Enforce one playable pitch pipeline

### User stories

#### US70.1 - Play every accepted pitch

As a composer, I want every note the editor lets me enter to play live and appear in an exported WAV.

#### US70.2 - Start against one audio-clock reading

As a performer, I want pressing a key to start a note reliably even while the audio clock is advancing.

#### US70.3 - Isolate a malformed event

As a listener, I want one malformed event to fail safely rather than stop the whole arrangement or leave a stuck voice.

#### US70.4 - Keep the whole-arrangement loop current

As an arranger, I want Whole arrangement to follow later clip edits so playback never loops to a stale song end.

### Tangible requirements

- Add a dependency-free pitch-policy module that owns the inclusive effective MIDI range `12` through `136`, octave-offset calculation, MIDI-to-frequency conversion, and validation errors.
- Document the corresponding `16.3516 Hz` through `21096.1636 Hz` range and require live and offline contexts of at least `44100 Hz`; fail audio activation clearly on an unsupported lower-rate context.
- Route note preview, keyboard input, arrangement event planning, real-time voice triggering, and offline rendering through that module.
- Remove or widen voice-engine frequency guards that reject a frequency produced by a valid effective MIDI note.
- Capture `currentTime` once when resolving an omitted voice start time; clamp an explicitly late time according to one documented scheduling rule.
- Validate an arrangement event before creating its oscillator, gain, or routing nodes.
- Dispose any partially created nodes if an audio adapter still rejects a valid event.
- Keep ownership scoped so a failed event cannot release voices belonging to preview, live input, another track, or another transport session.
- Represent Whole arrangement with a dynamic loop sentinel and resolve the current occupied end before start, seek, wrap, and arrangement edits during playback.
- Recompute the dynamic end after final-clip add, move, repeat change, or removal while leaving explicit custom loop ranges unchanged.

### Acceptance and automated coverage

- The combinations base note `36` with octave offset `-2` and base note `112` with octave offset `+2` can be previewed, performed, scheduled, and rendered offline without throwing.
- Effective notes `12` and `136` are accepted; `11`, `137`, `NaN`, and infinity are rejected before voice creation.
- A fake clock that advances between reads cannot make a default voice start time appear to be in the past.
- Unit tests exercise the full base-note and octave-offset boundary matrix.
- Scheduler tests cover dynamic-end changes while stopped and playing, shortening behind the current position, and a project becoming empty.
- Browser tests use a real `AudioContext` after a user gesture and a real `OfflineAudioContext` to verify sample rate, boundary-note setup, rendering completion, and cleanup.

## Epic 71 - Serialize cloud work and resolve fresh conflicts

### User stories

#### US71.1 - Preserve edits made during conflict

As a signed-in composer, I want edits made while a conflict dialog is open to remain part of the version I choose.

#### US71.2 - Retry the latest revision once

As a composer on an unreliable network, I want retrying to upload the latest revision once without corrupting synchronization state.

#### US71.3 - Keep project queues independent

As a maintainer, I want one project's slow write not to stall unrelated cloud-backed projects.

### Tangible requirements

- Introduce a per-project operation queue or promise lock whose ownership is recorded synchronously before the first asynchronous read.
- Route automatic flush, manual retry, first upload, remote open, and conflict resolution through the same serialization boundary.
- Coalesce queued local revisions by project ID while retaining the highest pending revision and its current document.
- Refresh the pending local candidate whenever the linked local project changes, including while link status is `conflict`.
- Resolve **Use local version** from a newly serialized and flushed active local document rather than a cached conflict-time document.
- Before applying **Use cloud version**, save divergent local content under a new bounded conflict-copy name and stable new project ID.
- Use compare-and-set revision preconditions where the repository supports them and treat a precondition failure as a new conflict.
- In `finally` paths, settle link status and release locks without deleting unsent pending work.
- Make a repeated resolution, retry, or completion callback idempotent for the same local and remote revisions.

### Acceptance and automated coverage

- Two flush calls made before either asynchronous read completes produce no overlapping write and at most one write for an unchanged revision.
- A new revision queued during an active write is sent after the first operation and becomes the reported synced revision.
- Editing after conflict detection and then selecting **Use local version** uploads the post-conflict edit.
- Selecting **Use cloud version** opens the remote document and leaves a valid local conflict copy containing the divergent edit.
- A failed write reports offline or failed with work pending; retry reaches synced without duplicate writes.
- Reloading while work is pending or conflicted reconstructs a truthful link state, preserves the latest local candidate, and allows the user to retry or resolve without losing edits.
- Deterministic service tests use deferred repository promises to cover each interleaving without wall-clock sleeps.
- A Firestore-emulator integration test covers revision preconditions and owner isolation.

## Epic 72 - Keep generated names valid and expose recovery downloads

### User stories

#### US72.1 - Duplicate a maximally named item

As a composer, I want to duplicate a maximally named pattern or project without an unexpected validation error.

#### US72.2 - Download work at risk

As a guest whose browser storage is blocked, I want to download my current song before closing the tab.

#### US72.3 - Restore the downloaded project

As a returning user, I want that downloaded file to restore the same musical project.

### Tangible requirements

- Add one bounded unique-name helper that accepts the candidate base, suffix strategy, maximum length, and sibling names.
- Normalize whitespace, reserve suffix space before truncating, retain at least one base character, and compare names using the collection's existing uniqueness rule.
- Use the helper for duplicate project, pattern, track, visualiser-layer, variation, and cloud conflict-copy names.
- Keep project titles within 100 characters and component names within 32 characters after every generated suffix.
- Add an always-available project download command backed by the active in-memory snapshot and the existing project-document serializer.
- Expose the command in the project library and beside the in-memory-storage or failed-save warning.
- Sanitize the download filename independently from the document's preserved project title.
- Validate the serialized document before initiating the browser download and report browser download failures without mutating state.
- Keep import compatible with the exact downloaded representation.
- Export only the active versioned project document; do not embed PRD 24 checkpoint records or a recursive recovery archive.

### Acceptance and automated coverage

- A 100-character project title and 32-character component name can each be duplicated repeatedly; every result validates and remains unique.
- Conflict-copy creation succeeds when the original title is exactly 100 characters.
- A guest using the in-memory repository can download the active project without any repository or cloud call.
- Importing the download in a fresh store preserves project ID, notes, instruments, mixer state, clips, visualiser settings, and supported metadata.
- The file contains no local checkpoint history, cloud-link record, or account metadata.
- Unit tests cover suffix growth into double digits, all-whitespace input, Unicode, duplicate sibling names, and filename-reserved characters.
- A browser test disables IndexedDB, edits a note, downloads the project, and verifies the captured file can be imported.

## Epic 73 - Make Firebase contact explicitly optional

### User stories

#### US73.1 - Start without contacting a cloud provider

As a guest, I want to make music without sending a request to an identity or cloud provider.

#### US73.2 - Restore an explicitly chosen account lazily

As a returning account user, I want my chosen session restored without delaying the local editor.

#### US73.3 - Keep local recovery available

As a composer with blocked storage or network access, I want the workstation and recovery download to remain usable.

### Tangible requirements

- Split local workstation bootstrap from account, cloud-project, and publication bootstrap.
- Do not import the Firebase SDK loader from the eager guest application graph.
- Record a small local account opt-in marker only after the user explicitly starts or completes account setup.
- Dynamically load Auth for an explicit account action or a prior opt-in session; load Firestore only after verified authentication requires a cloud or publication operation.
- Construct IndexedDB cloud-link and cloud-project repositories behind a browser-capability check and retain the in-memory local repository when construction fails.
- Treat configuration, SDK loading, Auth restoration, and Firestore failures as optional-service states rather than application startup failures.
- Clear the opt-in marker and dispose cloud subscriptions and retry work on sign-out.
- Keep local editing, playback, import, project download, and WAV export independent of optional-service readiness.
- Document the allowed Firebase and Google request origins so a network test can distinguish account traffic from unrelated application assets.

### Acceptance and automated coverage

- A clean guest page reaches an editable state with zero requests to the Firebase SDK, Auth, Firestore, or Google identity origins.
- Blocking all configured Firebase origins does not stop the workstation from mounting or a local project from playing.
- Disabling IndexedDB selects the in-memory repository, displays the recovery warning, and leaves the account control non-fatal.
- Selecting the account control performs the first Firebase load; a stored opt-in marker may perform lazy Auth restoration on reload.
- Firestore is not loaded merely to render a signed-out account panel.
- Playwright coverage records requests for clean guest, returning opt-in, blocked-network, and disabled-IndexedDB scenarios.
- Unit tests cover capability selection, optional-service state transitions, sign-out disposal, and marker cleanup.

## Out of scope

- Live collaboration, automatic musical merges, or a general cloud revision browser.
- Bulk-uploading local libraries after sign-in.
- Replacing the existing project-document format.
- Service-worker offline caching or browser-crash recovery.
- A broader visual or navigation redesign.

## Delivery sequence

1. Epic 70 establishes the shared pitch policy, dynamic arrangement bound, and initial real-browser audio harness.
2. Deliver Epic 72's bounded-name helper before Epic 71 creates conflict copies.
3. Epic 71 adds serialized cloud work and establishes the Firebase-emulator harness, including reload recovery.
4. Complete Epic 72's recovery download before Epic 73 relies on it in storage-failure paths.
5. Epic 73 makes optional account and cloud loading genuinely lazy.

PRD 21 extends the Playwright harness and adds axe journeys. PRD 23 consolidates these suites and promotes the complete browser, accessibility, audio, and emulator set into blocking CI gates.

## Open questions

- Should the account opt-in marker expire after a long period of inactivity?
- Should a cloud conflict copy be placed in a dedicated recovery group once the project library supports folders?
- Should download success include a checksum that a later support tool can verify?
- Real-time and offline browser audio coverage starts in Chromium; additional engines can be added after the initial reliability gate is stable.
