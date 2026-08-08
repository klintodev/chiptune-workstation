# PRD 23: Maintainable Application Foundation

## Description

Refactor the delivered workstation into smaller ownership boundaries with explicit application lifecycle, efficient immutable state updates, one canonical module graph, and browser-level quality gates.

The product remains a dependency-light native JavaScript application. This release does not replace working features or introduce a frontend framework. It reduces the cost and risk of the beginner, accessibility, and visualisation work by separating responsibilities that have accumulated in the project store, arrangement view, Firebase client, and page entry points.

The refactor must be incremental and behaviour-preserving. Each slice must keep local composing available, preserve the versioned project document, and leave a compatibility path for existing callers until they move to the smaller contracts.

## Dependencies

- PRD 20 defines the playable-pitch, local recovery, serialized cloud, and network-silent guest invariants this refactor must preserve behind smaller boundaries.
- PRD 21 extends the initial browser harness with beginner and accessibility journeys; this PRD consolidates those journeys into shared blocking quality gates.
- PRD 22's composition projection, compact dock, performance surface, DOM note list, inspector, and textual alternative are live product paths and must survive reachability cleanup.
- The work is cross-cutting and may be delivered in slices alongside PRDs 21 and 22, but its full quality and state-performance gates must be complete.

## Implementation epics

[PRD23/E83-E86](../epics/prd-23-maintainable-application-foundation.md) covers module ownership, application lifecycle, proportional immutable updates, and real-environment quality gates.

## Requirements

### Smaller domain, feature, and service boundaries

- Split project schema defaults and validation, selectors, mutation commands, history, and store/subscription orchestration out of `project-state.js`.
- Keep one public project-state facade during migration so features do not need to change in the same commit as the domain split.
- Schema and migration code must be reusable without constructing a live store or creating undo history.
- Command modules must own domain invariants and return explicit changed or no-op results without importing UI, persistence, audio, or Firebase code.
- Split arrangement timeline projection and rendering, track/mixer controls, selection and drag interaction, context menus/dialogs, and feature orchestration out of `arrangement-view.js`.
- Each arrangement subview must receive the smallest state and command surface it needs and must own cleanup for the listeners it registers.
- Split Firebase SDK loading, authentication, private project storage, and public publication storage out of `firebase-client.js`.
- Firebase adapters must expose serializable application-level contracts rather than SDK references, snapshots, or errors.
- The account, cloud-project, and publication services must be replaceable independently in tests and local-only builds.
- No replacement module should become a generic `utils` or `services` dumping ground; ownership and permitted dependencies must be documented.
- Existing project migrations, local files, cloud projects, public pages, keyboard shortcuts, playback, export, and undo behaviour must remain compatible.

### Explicit mountable application lifecycle

- Workstation and player composition roots must be factories with explicit `mount()` and `dispose()` operations.
- Importing a reusable application, feature, domain, or adapter module must not query the DOM, initialize audio, open IndexedDB, load Firebase, register global listeners, or start animation and timer work.
- One named thin browser bootstrap per page may locate its root, select platform adapters, and mount one application instance; all construction dependencies must be injectable beneath that boundary.
- Mounting must validate required DOM and capabilities before registering long-lived work and must fail with a clear, contained error.
- Disposing must remove document and window listeners, subscriptions, timers, animation frames, dialogs, pending cloud retry work, audio voices, and feature-owned DOM.
- IndexedDB repositories must expose close and disposal ownership, close their connection immediately on `versionchange`, and allow a later clean schema upgrade and reopen without data loss.
- A disposed application must not process later state, Auth, scheduler, resize, pointer, or keyboard events.
- Repeated disposal must be safe. A factory must either support remounting or reject it with an explicit documented error.
- Tests must be able to mount two isolated application instances against separate roots and fake adapters without shared mutable state.
- Optional services must expose the same lifecycle discipline and may be mounted only when their capability is requested.

### Granular state updates and bounded history

- Preserve immutable public snapshots while using structural sharing so an update replaces only the project branches it changes.
- A no-op command must preserve the root snapshot identity and emit no project-change notification.
- Editing project metadata, master volume, one mixer value, or one pattern step must not clone, normalize, validate, or freeze every unrelated track, pattern, clip, and visualiser layer.
- Full-document normalization and migration must occur at trust boundaries such as creation, import, cloud load, and schema upgrade rather than on every command and repository hop.
- The store must expose selector- or topic-based subscriptions with an explicit equality rule so a feature is not asked to render when its selected data is unchanged.
- Broad project subscriptions may remain temporarily for compatibility but must be measured, documented, and removed from high-frequency UI paths.
- Persistence and cloud synchronization must observe committed project revisions without requiring every visual feature to receive the same event.
- Continuous pointer and keyboard gestures must support begin, update, and commit semantics so many live updates become one undoable edit.
- Undo history must use reversible commands, patches, or an equivalent bounded representation rather than retaining a complete deep-cloned project for every small edit.
- Undo and redo must preserve domain validation, structural sharing, and stable identifiers.
- A performance regression check must assert clone, normalization, notification, and render counts for representative edits; elapsed-time-only thresholds are not sufficient.

### Canonical module graph and lazy optional code

- Remove version query strings such as `?v=20260722-1` from source imports and use one canonical specifier for each local module.
- Production content hashes remain the only cache-busting mechanism.
- A production metafile check must fail when one source file appears under multiple module identities in the same page bundle.
- Dynamic imports must produce fingerprinted ESM chunks, and optional Auth, Firestore, publication, and visual-tool chunks must be absent from the eager workstation entry bundle.
- Audit visualiser, analyser, and scheduler helpers for production reachability.
- Delete obsolete analyser readers and audio-reactive visualiser paths in `audio-features.js`, `canvas-renderer.js`, and unreachable legacy visualiser-configuration/editor code only after the reachability report proves they have no production consumer and saved-data compatibility is preserved.
- Do not create master or per-track `AnalyserNode` instances unless a mounted feature consumes their data.
- Remove unused process-wide singleton exports where the application already constructs an injected instance; ownership must remain explicit at the composition root.
- Shared timing or projection helpers still used by live playback, export, or the composition visualiser must remain in focused modules rather than being deleted with legacy controllers.
- Preserve `composition-projection.js`, `signal-stack-renderer.js`, the workstation and player projection surfaces, and every PRD 22 compact-dock, inspector, DOM-list, and textual-alternative path.
- Account, cloud, publication, visualiser editor, and other optional features must be loaded or initialized only when the page and user flow require them.
- A local workstation startup must not construct cloud repositories or load Firebase merely because optional account UI exists.
- Lazy-loading failure must be contained to the requested optional feature and must not unmount the editor.
- Build output must avoid duplicate raw and fingerprinted copies of the same font or static asset.

### Quality gates and documentation

- Retain deterministic Node tests for pure domain, scheduling, persistence, synchronization, serialization and component behaviour.
- Manual release journeys cover first edit, keyboard and pointer note entry, playback, stop, undo/redo, project download/import, narrow-screen navigation, dialog focus, public playback and real Web Audio activation.
- Document manual accessibility checks for meaning, musical feedback, screen-reader flow, zoom, contrast and reduced motion.
- Extend PRD 20's Firebase Local Emulator Suite harness to test private-project and publication rules for signed-out, wrong-owner, unverified, verified-owner, malformed-document, quota, and revision-precondition cases.
- CI must run formatting or syntax checks, Node tests, the production build, the module-identity check and Firestore emulator tests from a clean checkout.
- Cross-module data and adapter contracts must use checked JSDoc types or an equivalent JavaScript static-analysis boundary without requiring a TypeScript source migration.
- Repeated build-and-test setup across deployment workflows must be consolidated into one reusable check workflow or command so preview, production, and pull-request gates cannot drift.
- CI failures must retain useful emulator logs as short-lived artifacts.
- Document one local command for the fast suite and one for the complete pre-merge suite, including emulator prerequisites.
- Update architecture documentation with composition roots, lifecycle ownership, state/data flow, optional-service loading, module dependency rules, and the location of each test layer.
- Update the top-level README so its delivered feature summary and architecture entry points describe the current multi-track, persistence, export, account, sharing, and composition-visualisation product.

## Out of scope

- Rewriting the application in React, another UI framework, TypeScript, or a new state-management library.
- Changing the project schema solely to make the refactor easier.
- Redesigning arrangement, visualiser, account, or player workflows.
- Adding new synthesis, collaboration, or cloud-storage product features.
- Moving audio rendering or projection into Web Workers without a measured main-thread problem.
- Pursuing 100-percent code coverage or a full browser and device matrix.
- Replacing Firebase as the optional hosted backend.

## Open questions

Resolved for this release:

- Native ES modules and closure-based factories remain the default architecture.
- Refactoring proceeds behind compatibility facades in independently reviewable slices.
- Source imports use stable canonical paths; production build fingerprints own cache invalidation.
- State performance is guarded by observable work counts and identity assertions, not machine-dependent timing alone.
- Production-unreachable analyser and visualiser paths are removed. They can return behind a new feature contract when audio-reactive visuals have a product requirement.
- Browser interaction is manually reviewed for release; accessibility receives documented manual checks.
- Firebase emulator tooling may be added as a development dependency without changing the runtime dependency policy.

Deferred:

- Should selector subscriptions use a small in-house contract or a future standards-based signal primitive?
- At what project size should render-plan creation or visual projection move to a worker?
- Which browsers belong in the manual release-review matrix?
- Should production source maps be uploaded to a private diagnostics service?
- Should public player and workstation share one shell factory or retain separate composition roots over shared feature modules?
