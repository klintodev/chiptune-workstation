# PRD 20: Reliability and Recovery

## Description

Harden the workstation's highest-risk audio, local recovery, and optional cloud paths before adding more creation features.

A project that the editor accepts must remain playable through note preview, live keyboard input, arrangement playback, and WAV export. Local edits must remain authoritative while cloud work is pending, including when a user edits during a conflict. Failures in IndexedDB, Firebase, or the network must leave the workstation usable and give the user a portable way to recover the current project.

This release fixes reliability invariants rather than redesigning the editor. The same validation, serialization, and synchronization decisions must be shared across features so a fix in one playback or storage path cannot leave another path inconsistent.

## Dependencies

- PRDs 7 and 8 provide the local repository, project-document, cloud-link, and cloud-project boundaries hardened here.
- PRD 9 provides the offline arrangement renderer that must share the playable-pitch policy.
- PRDs 13 and 19 provide verified ownership, validation limits, and cloud security invariants that conflict recovery must preserve.
- This PRD establishes the initial Playwright and Firebase-emulator harness used and expanded by PRDs 21 and 23.

## Implementation epics

[PRD20/E70-E73](../epics/prd-20-reliability-and-recovery.md) decomposes this release into playable audio and transport bounds, conflict-safe cloud work, bounded naming and recovery downloads, and genuinely optional Firebase contact.

## Requirements

### Playable pitch and audio boundaries

- Define one exported playable-pitch policy for the complete effective pitch produced by a pattern note plus its instrument octave offset.
- The policy must cover the full range currently reachable through the editor: effective MIDI notes `12` through `136`, inclusive.
- That range maps from approximately `16.3516 Hz` through `21096.1636 Hz`. Supported live and offline contexts must run at a sample rate of at least `44100 Hz` so the upper boundary remains below Nyquist.
- If a browser cannot create the required audio context, activation must report an unsupported-audio state before transport starts while keeping project download and non-audio recovery available.
- Note preview, live keyboard input, arrangement scheduling, and offline rendering must use the same MIDI-to-frequency conversion and pitch validation.
- The voice engine must not impose a narrower hard-coded frequency range than the project and input controls allow.
- Every pitch and octave combination accepted by project validation must play through all four audio paths without a range exception.
- A pitch outside the canonical range, a non-finite pitch, or a non-finite frequency must be rejected before AudioNodes are created or a transport session starts.
- A voice started without an explicit future time must capture the audio clock once and schedule at that captured time or a safe future epsilon. It must not compare a default start time against a later clock reading.
- A rejected individual note must stop or skip only that note, release any partially created resources, and report a useful error without leaving stuck voices.
- Focused tests must cover both inclusive boundaries, the first values outside them, every octave-offset extreme, an advancing audio clock, arrangement playback, and offline rendering.

### Dynamic whole-arrangement bounds

- The whole-arrangement loop option must represent a dynamic sentinel rather than a captured numeric end step.
- Before transport start, seek, loop wrap, and an arrangement edit during playback, the scheduler must resolve that sentinel from the current occupied arrangement end.
- Adding, moving, repeating, shortening, or removing the final clip must update the effective whole-arrangement loop without requiring the user to reselect it.
- An explicit custom loop range must remain stable across unrelated clip edits and must continue to obey its existing validated bounds.
- When an edit shortens the dynamic range behind the current position, the next scheduler transition must seek or wrap according to one documented rule without emitting an out-of-range event.
- Focused tests must cover final-clip add, move, repeat change, and removal while stopped and playing, including a project that becomes empty.

### Conflict-safe cloud synchronization

- Local persistence must complete independently of cloud synchronization and remain the source of truth for active editing.
- Cloud work must be serialized per project. Two retry, flush, save, or conflict-resolution calls for the same project must not perform overlapping reads or writes.
- Calls for different projects may proceed independently.
- Rapid local revisions may be coalesced, but the latest queued revision must remain pending until it is confirmed remotely.
- Entering a conflict must preserve both the remote document and a local conflict candidate.
- Further local edits made while a conflict is visible must replace the pending local candidate rather than being discarded or hidden behind the first conflicting revision.
- Choosing **Use local version** must serialize and upload the latest active local document at the moment the action is confirmed.
- Choosing the remote version must preserve any divergent local work as an independent, valid local copy before replacing the active document.
- A cloud operation must settle in one truthful state: synced, offline with work pending, conflict, or failed with a retry available. It must not remain indefinitely in syncing after an exception.
- Retries and repeated conflict actions must be idempotent. A completed revision must not be uploaded twice because two callers observed an empty in-flight set.
- Focused tests must cover simultaneous flushes, a retry racing an explicit flush, edits made during conflict, each resolution choice, a write failing after its remote read, and recovery after reload.

### Bounded names and portable recovery

- Project titles, track names, pattern names, visualiser-layer names, duplicated-item names, and conflict-copy names must remain inside their existing validated length limits.
- One shared bounded unique-name operation must truncate the base text as needed to reserve room for suffixes such as `copy`, `2`, or `conflict`.
- Generated names must be non-empty, deterministic, valid on their first use, and unique within the relevant collection.
- Repeated duplication at the length limit must continue to succeed without bypassing validation.
- A **Download project** action must be available for the active project without requiring an account, cloud status, or a successful IndexedDB save.
- The download must serialize the current in-memory state into the existing versioned, validated project-document format and use a safe filename.
- Downloading must not wait for a cloud write and must remain available when the application is using its in-memory persistence fallback.
- A downloaded project must import into a fresh session without changing its musical content, identifiers, or supported metadata.
- The emergency file contains only the active versioned project document. It does not recursively include the checkpoint history introduced by PRD 24.
- When durable local storage is unavailable or a save fails, the interface must identify that work is at risk and place the download action beside the warning.
- A failed download must leave project state unchanged and provide an actionable error instead of reporting success.
- Focused tests must cover maximum-length and repeated duplicate names, conflict-copy naming, invalid filename characters, storage-unavailable download, and export/import round trips.

### Genuinely local-first optional services

- A first-time guest must be able to load and use the workstation without downloading a Firebase SDK, initializing Firebase, restoring Auth, opening Firestore, or making a request to a Firebase or Google identity origin.
- Firebase may be loaded after an explicit account action or when a local opt-in marker indicates that the user previously chose an account session.
- A missing, blocked, or malformed Firebase configuration must not prevent the local workstation from mounting.
- IndexedDB being absent, denied, or failing during startup must select the in-memory project repository without causing optional account, cloud, or publication repository construction to abort the application.
- Cloud repositories and services must be created only after their required browser capability and authenticated account state are available.
- Signing out must clear the account-session opt-in marker and stop cloud work while retaining local projects.
- Local audio, editing, project download, project import, and WAV export must continue while Firebase is offline or blocked.
- The UI must not imply that a guest project is remotely backed up or that sign-in is required to recover it.
- Focused browser tests must assert a network-silent guest startup, local startup with IndexedDB disabled, recovery with Firebase requests blocked, and lazy account startup after explicit user intent.

## Out of scope

- Live multi-user editing or note-level conflict merging.
- General cloud revision history, remote trash, or recovery of projects deleted on every device.
- Automatic upload of all existing local projects after sign-in.
- A new project-file schema or a second portable backup format.
- Audio-device failover, crash reporting, or guaranteed recovery after the browser process itself terminates.
- Redesigning the account panel, project library, transport, or arrangement workflow beyond the recovery controls and status needed by this release.

## Open questions

Resolved for this release:

- Effective MIDI notes `12` through `136` are the canonical playable range because they cover every note and octave-offset combination exposed by the current editor; supported audio contexts run at `44100 Hz` or higher.
- Whole arrangement is a dynamic loop sentinel resolved from the current occupied end, while custom numeric loop ranges remain explicit.
- The existing versioned project JSON document is the emergency recovery artifact.
- **Use local version** always means the latest active local state, not the state captured when the conflict was first detected.
- Cloud operations are serialized per project rather than globally so unrelated projects do not block each other.
- A previous explicit account choice may trigger lazy authentication restoration; a new guest session does not contact Firebase.
- Name generation truncates the base to preserve a human-readable suffix instead of truncating the completed name and potentially losing uniqueness.

Deferred:

- Should emergency downloads later include optional WAV renders or preview images in an archive?
- Should a successful local save retain recoverable named checkpoints in addition to bounded undo history?
- Should cloud conflicts later provide a read-only musical comparison before the user chooses a version?
- Should a service worker provide offline application-shell loading once update and cache invalidation behaviour is designed?
