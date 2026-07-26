# Architecture conventions

## JavaScript design

Prefer functional object-oriented design using closures and factory functions over class-based object-oriented design.

- Keep mutable state private inside a factory closure.
- Return a small object containing the operations consumers need.
- Compose modules through explicit function arguments and returned interfaces.
- Prefer plain serializable data for application state.
- Use classes only when a platform API requires them or when they provide a concrete advantage that a closure cannot express as clearly.

The audio engine demonstrates the intended pattern: `createAudioEngine()` owns its Web Audio state and returns a frozen public interface.

## Composition roots and lifecycle

- `src/workstation-app.js` constructs the always-available local editor.
- `src/app.js` is the thin workstation page entry and owns optional account, cloud, publication, export, and visualisation features.
- `src/player.js` constructs the read-only public player.
- A factory owns every listener, timer, animation frame, audio graph, repository connection, and subscription it creates.
- Long-lived factories expose idempotent `dispose()` operations and release owned resources in reverse construction order.
- IndexedDB repositories close on `versionchange`, expose explicit close/disposal operations, and may be reopened cleanly until finally disposed.
- Importable domain, adapter, and feature modules do not start network, storage, audio, or timer work merely by being imported.

## Dependency direction

Dependencies point inward:

1. State schema, validation, commands, selectors, and music helpers depend only on other domain modules.
2. Persistence, audio, transport, Firebase, and visual projection adapters depend on serializable domain contracts.
3. Features depend on the smallest state and command interfaces they render or invoke.
4. The composition roots select concrete adapters and connect features.

State and domain modules never import UI, audio, persistence, or Firebase code. Firebase SDK values, snapshots, and errors are translated before they cross into features. Visual projections are derived, read-only values and never become a second source of musical state.

## Module identity and optional code

- Local source modules use one stable relative specifier without version query strings.
- Production filenames and dynamically emitted ESM chunks receive content hashes from the build.
- The build rejects duplicate module identities and does not copy unhashed font sources beside generated assets.
- Optional hosted or editing capabilities should use dynamic imports at the page composition boundary; a failed optional load must leave local composing usable.

## State and data flow

Validated project documents enter through creation, import, local persistence, cloud load, or migration boundaries. Project commands produce immutable snapshots and change metadata. Persistence and optional cloud synchronization observe committed revisions; audio, arrangement, and visual features consume state projections without mutating snapshots.

Transient selection, playback, focus, and dialog state belongs in session or feature-owned state and is not serialized into project documents.

## Test layers

- `npm test` runs deterministic Node coverage for domain, persistence, cloud, audio, transport, projection, security, and build contracts.
- `npm run check` builds production entry points first and then runs the fast test suite.
- Build tests enforce canonical module identities and fingerprinted static assets.
- Browser, accessibility, Web Audio, and Firebase-emulator suites belong at the corresponding platform boundary and must not contact production services.
