# PRD 23 Epics: Maintainable Application Foundation

These epics deliver [PRD 23: Maintainable Application Foundation](../product/23-maintainable-application-foundation.md).

## Description

Create smaller, testable ownership boundaries around project state, arrangement UI, optional Firebase services, and page lifecycle. Reduce unnecessary project-wide work, remove duplicate module identities and dead audio-visual paths, and add browser and emulator quality gates for behaviour that Node fakes cannot prove.

The work preserves the current native-module, closure-factory architecture. It is delivered in compatibility-backed slices so composing, saving, playback, export, visualisation, and public pages remain usable throughout the refactor.

## Requirements

- Oversized domain, feature, and Firebase modules are split by ownership behind stable facades.
- Workstation, player, and optional services have explicit mount and disposal lifecycles.
- Project edits use structural sharing, granular subscriptions, and bounded change-based history.
- Local imports have one canonical identity and production-unreachable analyser or visualiser paths are removed.
- Optional code and remote services are loaded only when their page or user flow requires them.
- Real-browser, accessibility, Web Audio, and Firestore-rule tests become documented CI gates.

## Epic 83 - Decompose ownership and canonicalize the module graph

### User stories

#### US83.1 - Separate project rules from store mechanics

As a maintainer, I want project rules separated from store mechanics so a schema change does not require editing an 800-line state module.

#### US83.2 - Give arrangement concerns clear owners

As a contributor, I want arrangement interactions split by concern so a mixer change does not risk dialogs, timeline dragging, and clip rendering.

#### US83.3 - Keep one live module identity

As a maintainer, I want one instance of every local module and no dead analyser code creating work at runtime.

### Tangible requirements

- Extract project constants, defaults, validation and normalization into a schema module with no live-store dependency.
- Extract domain selectors, project commands, history mechanics, and store/subscription orchestration into focused modules.
- Keep `project-state.js` as a temporary compatibility facade and prohibit new domain behaviour from being added to it during migration.
- Extract arrangement projection/rendering, track and mixer controls, selection/drag interactions, menus/dialogs, and feature orchestration into separate owners.
- Give each extracted arrangement owner an explicit input contract, command contract, mount target, and `dispose()` operation.
- Split Firebase SDK loading, Auth operations, private-project operations, and publication operations into independently injectable adapters.
- Translate Firebase snapshots and errors at the adapter boundary so SDK values do not escape into features or domain state.
- Remove every source import query suffix and update callers atomically to canonical relative specifiers.
- Add an esbuild-metafile assertion that each resolved source path has one module identity per bundle.
- Configure ESM code splitting so dynamic imports emit fingerprinted chunks and optional Auth, Firestore, publication, and visual-tool code is absent from the eager workstation entry bundle.
- Generate and inspect a production reachability report for visualiser and audio analysis modules.
- Remove production-unreachable analyser-reader and legacy audio-reactive paths from `audio-features.js`, `canvas-renderer.js`, and unreachable visualiser configuration/editor modules, while preserving saved-data migrations.
- Preserve `composition-projection.js`, `signal-stack-renderer.js`, workstation and player projection surfaces, and the PRD 22 dock, inspector, DOM note list, and textual alternative.
- Stop constructing `AnalyserNode` graphs without a mounted consumer.
- Remove unused process-wide singleton exports where the composition root already constructs and injects an instance.
- Keep composition projection and shared timing helpers that have live workstation, player, scheduler, or offline-renderer consumers.
- Restrict static asset copying so source fonts are not emitted beside their fingerprinted build equivalents.

### Acceptance and automated coverage

- No extracted schema, selector, command, or history module imports DOM, audio, persistence, or Firebase code.
- No arrangement subview exceeds its documented ownership or registers a listener that its disposal path does not remove.
- Auth can be tested without importing Firestore, and private-project storage can be tested without a publication adapter.
- A source scan finds no local JavaScript import containing `?v=`.
- Production metafiles contain one project-state identity and one identity for every other resolved source file.
- Production build assertions prove optional dynamic modules are absent from the eager entry graph, requested only on first use, and served under fingerprinted chunk names.
- A reachability check or lint rule rejects production-unreachable source modules unless they carry an explicit documented test-only designation.
- Audio graph tests assert that no analyser is created when no analysis consumer is mounted.
- Existing domain, arrangement, publication, player, and production-build tests remain green after each extraction.

## Epic 84 - Make application and optional-service lifecycle explicit

### User stories

#### US84.1 - Mount and dispose explicitly

As a maintainer, I want to mount and dispose the workstation in a test without relying on module-import side effects.

#### US84.2 - Keep optional code dormant

As a guest, I want optional account and cloud code to stay dormant while I compose locally.

#### US84.3 - Give resources an owner

As a contributor, I want every listener, timer, voice, repository connection, and network subscription to have an obvious owner.

### Tangible requirements

- Introduce workstation and player application factories with injected root, document/window adapters, repositories, clocks, and optional-service loaders.
- Expose `mount()` and idempotent `dispose()` from each application instance.
- Reduce page entry modules to root lookup, adapter selection, application construction, mounting, and fatal bootstrap reporting.
- Prohibit top-level DOM queries, AudioContext creation, IndexedDB opening, Firebase loading, global event registration, timers, and animation frames in importable feature modules.
- Record every long-lived resource in the factory that owns it and release it in reverse construction order.
- Stop transport sessions, release voices, cancel animation frames and timers, close dialogs, unsubscribe stores and Auth, and cancel or safely hand off queued optional work during disposal.
- Give each IndexedDB repository an idempotent `close()` or `dispose()`, listen for `versionchange`, close immediately when notified, and surface a safe reopen or reload path.
- Ensure callbacks check lifecycle state so a late promise or Firebase snapshot cannot mutate a disposed UI.
- Support two concurrently mounted instances against separate roots without shared feature state.
- Dynamically import account/Auth code after explicit intent or a prior opt-in marker; import Firestore adapters only for authenticated cloud or publication work.
- Lazy-mount visualiser editing and other optional panels on first use while keeping their domain data available to project serialization.
- Surface optional-feature loading errors inside that feature and keep the local application mounted.

### Acceptance and automated coverage

- Importing workstation and player modules performs no observable browser, storage, audio, timer, or network action.
- Mounting registers the expected resources once; disposing twice leaves zero listeners, timers, animation frames, live voices, and subscriptions.
- Events and deferred promises delivered after disposal have no effect.
- Two test roots can edit different projects without state, selection, transport, dialog, or Auth leakage.
- A clean guest startup excludes Firebase and Firestore from requested assets and the eager application bundle.
- Opening the account control loads Auth; a cloud action loads Firestore; failure in either path leaves local editing usable.
- Lifecycle tests use instrumented adapters and public mount/remount contracts rather than private implementation inspection.
- Repository lifecycle tests open two schema versions, deliver `versionchange`, assert old connections close, complete the upgrade, reopen, and preserve existing project data.

## Epic 85 - Make immutable edits proportional to their change

### User stories

#### US85.1 - Keep edits proportional

As a composer, I want mixer drags and note edits to remain responsive as my song grows.

#### US85.2 - Commit one gesture as one edit

As a composer, I want one continuous adjustment to be one undo step.

#### US85.3 - Render only changed data

As a feature author, I want my view to update only when the data it displays changes.

### Tangible requirements

- Implement project commands as copy-on-write transitions that preserve identity for every unchanged branch.
- Return the previous root snapshot and suppress notifications for semantic no-ops.
- Move full migration and normalization to untrusted-document boundaries; validate changed command inputs and affected invariants during ordinary edits.
- Avoid serializing and normalizing the same document more than once per persistence or cloud boundary.
- Add selector- or topic-based subscriptions with defined equality and unsubscribe behaviour.
- Migrate high-frequency master, mixer, pattern, transport, selection, and visualiser consumers away from broad project subscriptions.
- Emit revision and change metadata for persistence and cloud consumers without exposing mutable patches.
- Add gesture transactions that preview continuous values, commit one domain edit, and cancel back to the starting value.
- Store bounded forward/inverse changes or reversible commands for undo and redo instead of a deep project snapshot per input event.
- Preserve stable project, track, pattern, clip, and layer identifiers through commit, undo, and redo.
- Cache project-revision-dependent visual projections and style data so animation frames update time-dependent values rather than rebuilding and sorting the same event model.

### Acceptance and automated coverage

- Updating master volume preserves identity for tracks, patterns, clips, visualiser settings, and their nested arrays.
- Editing one pattern step changes only the root, owning track, pattern collection, edited pattern, and edited step path.
- A no-op command creates no revision, notification, persistence save, render, or history entry.
- One 100-event slider gesture produces live feedback and exactly one undo entry.
- Undo and redo reproduce the before and after validated snapshots without changing unrelated branch identities.
- Instrumented tests count normalization, clone, notification, projection-build, render, and serialization work for metadata, mixer, pattern, and arrangement edits.
- A representative maximum-size project remains within explicit operation-count budgets documented beside the tests; timing data is reported for diagnosis but is not the sole gate.

## Epic 86 - Add deterministic and release quality gates

### User stories

#### US86.1 - Verify real browser workflows

As a composer, I want core workflows reviewed in the same browser environment where I make music.

#### US86.2 - Gate accessibility regressions

As a keyboard or screen-reader user, I want accessibility regressions caught before deployment.

#### US86.3 - Exercise real platform boundaries

As a maintainer, I want Web Audio and Firestore rules verified by their real implementations rather than source-text assertions alone.

### Tangible requirements

- Maintain a repeatable release checklist for first edit, keyboard and pointer note entry, transport, undo/redo, project recovery, narrow-screen navigation, dialogs, reduced motion and public playback.
- Document manual checks for musical meaning, screen-reader announcements, focus order, 200-percent zoom, forced colors, contrast, reduced motion, touch and keyboard-only clip editing.
- Include real `AudioContext` and `OfflineAudioContext` release checks for activation, playable boundaries, current-time starts, envelope release, voice ownership, scheduler/export event parity and completed WAV rendering.
- Extend PRD 20's Local Emulator Suite harness for authentication, verification, ownership, schema and size limits, publication quota, legacy public reads, deletes, and revision conflicts.
- Replace security tests that only search rule source text with emulator assertions where behaviour can be executed.
- Define `npm` scripts for fast checks, rules checks and the complete pre-merge suite.
- Add checked JSDoc contracts for project snapshots, commands, selectors, scheduler snapshots, repositories, and optional-service adapters, and run JavaScript static analysis in the fast suite.
- Reuse one authoritative build-and-test workflow or command from pull-request, preview-deploy, and production-deploy workflows.
- Run the production build and module-identity check in the pre-merge suite.
- Upload emulator logs when CI fails.
- Document runtime ownership, module dependencies, lazy boundaries, project-state flow, test-layer responsibilities, local prerequisites, and common failure diagnosis.
- Refresh the top-level README to describe the delivered multi-track workstation and current composition roots rather than the earlier single-track feature set.

### Acceptance and automated coverage

- A clean checkout can install development dependencies and run the documented complete suite without undisclosed local setup.
- CI blocks deterministic state, audio-boundary and owner-only Firestore-rule regressions; interaction and focus regressions block release through the manual checklist.
- Manual release review records console errors and unhandled rejections as failures.
- Test fixtures use validated public project documents and do not depend on production Firebase, network access, speakers, or elapsed musical playback.
- Emulator tests cover signed-out, unverified, wrong-owner, verified-owner, malformed, oversized, quota-full, and stale-revision requests.
- CI artifacts make failed deterministic or rule assertions diagnosable without rerunning the job locally.

## Out of scope

- A frontend-framework, TypeScript, or state-library migration.
- New composition, synthesis, collaboration, or visualisation features.
- A full cross-browser and physical-device laboratory.
- Arbitrary coverage-percentage targets.
- Worker-based rendering or scheduling without measured need.

## Open questions

- Which selector-subscription contract is simplest while preserving closure-based stores?
- Should reversible history use command-specific inverse data or a small generic patch representation?
- Should remounting reuse an application instance or require constructing a new instance after disposal?
- Which browsers belong in the manual release-review matrix?
- Should manual accessibility evidence be stored per release or maintained as a continuously updated checklist?
