# PRD 4: Scalable Application Foundation

## Description

Refactor the working single-track workstation into an application foundation that can support multi-track songs, persistence, arrangement, export, visualisers, and sharing without repeatedly rewriting existing features.

This is an enabling release between pattern editing and multi-track songs. It must preserve the current user experience while making ownership, dependencies, lifecycle, and data flow explicit. The runtime remains dependency-free, uses native ES modules, and continues to favour closure-based factories over classes.

The refactor must be incremental. Every completed slice must leave the instrument and sequencer usable; a framework rewrite or a feature freeze until the entire architecture is replaced is not acceptable.

## Requirements

### Application and domain boundaries

- `app.js` must become a composition root responsible for constructing modules, connecting their public interfaces, handling application lifecycle, and starting the application.
- Feature rendering and individual DOM event handlers must move out of the composition root into feature-scoped modules.
- Domain and application state must live outside feature UI directories and must not depend on feature presentation modules.
- Domain state must not import or access the DOM, Web Audio nodes, timers, animation frames, or browser storage.
- State transitions must be expressible as pure functions and exposed through closure-based stores with small command and subscription interfaces.
- UI features may depend on public state contracts; state modules must never depend on UI features.
- Browser and Web Audio capabilities must be accessed through small adapters whose dependencies can be replaced in tests.
- Modules must communicate through explicit arguments, returned interfaces, and serializable data rather than hidden global state or a general-purpose global event bus.
- Mutable state must remain private to closure-based factories and be exposed through small frozen interfaces.
- Every module that owns listeners, timers, animation frames, scheduled voices, or browser resources must expose a deterministic `dispose()` or equivalent lifecycle operation.

### Project model and state ownership

- The application must define one authoritative, serializable project snapshot with an explicit schema version.
- The project snapshot must contain project metadata, transport settings, and a track collection.
- The initial refactored application may expose one track in the UI, but that track must own a stable identifier, name, instrument configuration, pattern, and mixer settings.
- Pattern and instrument data must be plain data inside the project snapshot rather than separate application-level islands of state.
- Runtime-only values such as active voices, AudioNodes, timers, editing focus, and playback position must not enter the project snapshot.
- Persisted project state and transient session state must have separate owners and explicit lifecycles.
- Transient values such as selected step, focused control, active live notes, and playhead position may live in session state but must not be hidden exclusively in DOM elements.
- State validation and default creation must be reusable by new-project creation, import, persistence, tests, and future migrations.
- Project mutations must be expressed as atomic domain operations with predictable no-op and validation behaviour.
- Undo and redo must operate on project mutations so future instrument, mixer, track, pattern, and arrangement edits can share one bounded history.
- A project snapshot must survive JSON serialization and restoration without changing its musical meaning.

### Transport and scheduling

- The application must own one shared transport and scheduling timeline regardless of track count.
- The scheduler must consume serializable musical data and injected clock/timer interfaces; it must not query DOM state.
- Track scheduling must be routed through explicit track or voice destinations rather than a single hard-coded instrument configuration.
- Adding tracks in PRD 5 must not require creating independent transport timers or allowing track clocks to drift.
- Tempo, start, pause, stop, loop position, and look-ahead behaviour must have one authoritative owner.
- Scheduled-event calculation must be separable from Web Audio node creation so the same musical plan can later support live playback and offline export.
- Already-scheduled audio and unscheduled project edits must retain the current predictable relationship.

### Audio graph

- The audio layer must distinguish the master output, per-track channels, and individual voices.
- A track channel must provide a stable destination for its voices and defined hooks for level, mute, and future solo behaviour.
- The master signal path must provide an observation point for later analyser and export features without changing the audible signal.
- Voice ownership must identify the source track and owner so stopping preview, live input, transport, or one removed track does not stop unrelated voices.
- Audio graph creation must be lazy and remain behind the existing user-gesture lifecycle.
- Live and future offline audio contexts must use shared musical configuration without sharing concrete AudioNodes.

### Feature organisation and UI

- Source code must be organised into feature directories such as audio activation, instrument controls, keyboard input, pattern editing, transport, and project actions.
- JavaScript and CSS must be colocated inside the feature directory that owns the behaviour and presentation.
- Each feature must expose a small public entry module rather than allowing other features to import its internal files freely.
- Each feature must own its DOM queries, event registration, rendering, styling, and cleanup.
- UI features must receive state snapshots and command interfaces through explicit construction arguments.
- User interactions must issue commands to the appropriate state owner; UI modules must not mutate domain data directly.
- UI rendering must be a repeatable projection of current project and session state.
- A single application stylesheet entry point may import feature styles so HTML does not need to know every feature file.
- Only genuinely cross-feature tokens, reset rules, layout primitives, and controls may live in a shared directory.
- Shared code must not become a dumping ground; code should remain feature-local until at least two consumers require the same contract.
- Required DOM elements must be validated at feature startup with a clear failure rather than producing a later null-reference error.
- Rendering must be derived from authoritative state snapshots; DOM elements must not become hidden sources of application state.
- Editing selection, transport position, active live notes, and persisted project data must remain distinct concepts.
- Epic-numbered JavaScript and stylesheets must not return.
- Shared design tokens and controls must be reusable by the future editor and read-only playback page.
- User-visible behaviour delivered by PRDs 1–3 must remain available after the refactor.

### Automated testing and testability

- The repository must provide one documented command that runs all automated tests from a clean checkout.
- The initial test runner must use Node's built-in `node:test` facilities and add no runtime or test-library dependency.
- Tests must be deterministic and must not require speakers, a real AudioContext, a visible browser, network access, or elapsed wall-clock time.
- Production factories must accept narrow clock, timer, and audio dependencies where needed so important behaviour can be tested with small handwritten fakes.
- A minimal domain suite must protect project defaults, validation, atomic mutations, undo/redo, and JSON serialization.
- A minimal scheduler suite must protect core step timing, rests, gate, per-note volume, tempo, looping, pause, and stop behaviour.
- Focused regression tests must protect the highest-risk bugs already encountered, including stuck notes, release during attack, selection overwrites, and first-drag range input state.
- Thin DOM wiring, CSS appearance, and trivial getters do not require automated tests.
- Tests must assert public behaviour rather than private closure implementation details.
- A minimal GitHub Actions workflow must run syntax checks and the test command on pushes and pull requests.
- No coverage percentage, exhaustive browser matrix, snapshot suite, or broad mocking framework is required for the hackathon.
- Testability work must remain proportional and must not create abstractions that are more complicated than the production behaviour they protect.

### Migration and delivery constraints

- The refactor must be delivered in independently reviewable slices rather than one large replacement commit.
- Characterisation tests must protect current behaviour before a module's ownership or interface changes.
- Existing project-independent modules may be moved only when imports are updated atomically and the application remains runnable.
- Temporary adapters between old and new interfaces are acceptable when they have a documented removal point.
- The refactor must not add multi-track UI, arrangement, persistence, export, or visualiser features from later PRDs.
- Runtime dependencies and a frontend framework remain out of scope unless a later decision demonstrates a concrete need that native modules cannot meet cleanly.
- README and architecture documentation must describe the delivered product boundary, module ownership, project schema, test command, and repository structure when the refactor is complete.

## Open questions

- What is the smallest version-one project schema that prepares for PRD 5 without prematurely implementing multi-track behaviour?
- Should undo history store complete project snapshots, reversible commands, or a hybrid once projects grow larger?
- Should all tracks share one pattern length initially, or must the scheduler contract support mismatched lengths before PRD 5?
- Which scheduler representation can be reused most cleanly by both real-time playback and `OfflineAudioContext` export?
- Should project schema validation remain handwritten initially or adopt a schema library when import and sharing arrive?
