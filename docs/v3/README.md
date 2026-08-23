# Klinto Studio V3: Part 1 foundation

Status: implementation baseline

Part 1 is implementation-led. It is deliberately not a new PRD, EPIC or ARD package. The code, tests and automated architecture checks are the working contract; this document records only the boundary needed to keep later slices coherent.

## Outcome

Part 1 establishes a clean TypeScript and React application beside the existing beta. It proves the dependency direction before feature work begins and provides the first framework-free project, playback and engine contracts.

The slice includes:

- A Vite and React entry point under `src/v3`
- Strict TypeScript, linting, formatting, unit-test and production-build baselines
- A versioned V3 project model and boundary validation
- A pure `Project -> PlaybackPlan` compiler seam
- A detached audio-engine contract with commands, events and diagnostic snapshots
- Automated dependency, unused-code and bundle-size checks
- A minimal shell that proves the modules can be composed without coupling the engine to React or application state

The V3 format and storage namespace start cleanly. Project files use the `chiptune-workstation-v3` discriminator and begin at format version 1. Compatibility with V1 or V2 projects is not part of this release.

## Dependency direction

Imports flow down this graph, never back up it:

```text
app / features / UI
    |---> project ----------> shared
    |---> playback ---------> project + shared
    |---> persistence ------> project + shared
    `---> engine -----------> playback + shared
```

Within a layer, files may import other files from the same layer. Across layers:

- `shared` depends on no other V3 layer.
- `project` depends only on `shared`.
- `playback` depends only on `project` and `shared`.
- `persistence` depends only on `project` and `shared`.
- `engine` depends only on `playback` and `shared`.
- Project code permits Zod for boundary validation; any other runtime npm dependency requires an explicit architecture-rule change.
- Shared, playback and engine code currently permit no runtime npm dependencies.
- Persistence dependencies must be explicitly approved when that layer lands.
- Project, shared, playback and engine code remain free of React, Redux, UI and persistence libraries.
- V3 dependencies must resolve and the V3 graph must remain acyclic.

The engine owns live audio runtime state such as `AudioContext`, nodes, voices, transport position and scheduler queues. Application state owns the editable project and workspace state. Neither is a mirror of the other. The pure playback compiler is the translation boundary between them, and carries the source project revision so controllers can reject stale async results.

These rules are executable in [`dependency-cruiser.v3.cjs`](../../dependency-cruiser.v3.cjs). New browser execution roots should use an explicit `*.worker.ts` or `*.worklet.ts` suffix and be added to [`knip.v3.jsonc`](../../knip.v3.jsonc), so Knip can distinguish them from unused modules.

## Commands

Run V3 work through its dedicated scripts so the beta build remains isolated:

| Command                   | Purpose                                        |
| ------------------------- | ---------------------------------------------- |
| `npm run v3:dev`          | Start the V3 development server                |
| `npm run v3:build`        | Create the V3 production build                 |
| `npm run v3:typecheck`    | Type-check the V3 TypeScript project           |
| `npm run v3:lint`         | Run the V3 lint rules                          |
| `npm run v3:format`       | Verify V3 formatting                           |
| `npm run v3:test`         | Run the V3 unit tests                          |
| `npm run v3:architecture` | Enforce the V3 dependency graph                |
| `npm run v3:knip`         | Find unused V3 files, exports and dependencies |
| `npm run v3:size`         | Enforce the V3 production bundle budget        |
| `npm run v3:check`        | Run the complete V3 validation gate            |

`npm run v3:check` is the Part 1 hand-off gate. The existing beta scripts remain separate and continue to describe the existing application rather than V3.

## Non-goals

Part 1 does not attempt to deliver:

- A production synthesizer, scheduler, mixer graph or offline renderer
- Piano Roll, Playlist, instrument, mixer or effects workflows
- Persistence, file import/export, accounts, Firebase or cloud synchronisation
- V1/V2 schema migration, project import or runtime compatibility
- Microfrontends, a monorepo, a plug-in SDK or a general window manager
- Feature parity with the beta, visual polish or a public V3 cutover

The native Web Audio engine remains first-party. Libraries may support the surrounding product, but no audio framework owns its scheduling, graph or musical constraints.

## Next slices

The next work should remain vertical and independently verifiable:

1. Prove engine lifecycle, transport, scheduling and deterministic offline rendering in real browsers.
2. Add project commands, gesture-level undo/redo and the first editable note flow.
3. Build the Piano Roll on the measured canvas renderer, then add arrangement.
4. Add first-party instruments, mixer routing and effects through the engine contract.
5. Add local persistence and file exchange, followed by audio export.
6. Add optional cloud repositories, then profile and harden the complete workstation.

Each slice may add a short decision note when a trade-off genuinely needs recording. It should not recreate the document hierarchy that V3 is replacing.
