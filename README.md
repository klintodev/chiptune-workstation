# Chiptune Workstation

A browser chiptune workstation built with the Web Audio API and native ES modules. The app has no runtime framework; esbuild is used only to prepare production assets.

The current product includes a playable keyboard, reusable patterns, a multi-track clip arrangement, per-note expression, mixer controls, transport and looping, bounded undo/redo, local project persistence, JSON recovery, WAV export, optional accounts and cloud backup, public sharing, and a composition-projected visualiser.

## Run locally

Serve the repository over HTTP from its root:

```powershell
python -m http.server 4173
```

Then open <http://localhost:4173>.

## Feature workbench

Open <http://localhost:4173/workbench.html> to inspect every user-facing feature family against small, disposable scenarios. The catalogue covers arrangement, composition guidance, editing, instruments, local projects, cloud and sharing flows, visual learning, help, theme, and audio lifecycle states without starting the full application or connecting real persistence, accounts, audio, or network services.

Each story owns a `mount({ canvas, scenario })` lifecycle and returns a disposer. Add stories under `src/workbench/stories/`, then register them in `src/workbench/story-catalog.js`. Story and scenario selections are encoded in the URL, so a specific state can be shared directly.

## Test

Node 22 or later is required.

```powershell
npm test
```

Run the full production build and test gate with:

```powershell
npm run check
```

## Production build

Install the development dependency and build the deployable site:

```powershell
npm install
npm run build
```

The build bundles and minifies each page's JavaScript and CSS, fingerprints the filenames, and writes the Firebase-ready site to `dist/`. Generated output is not committed.

## Architecture

- `src/app.js` is the workstation browser entry and connects optional account, cloud, publishing, export, and visualisation features.
- `src/workstation-app.js` owns the local composition root: project/session state, audio, transport, persistence, and editing features.
- `src/player.js` owns the read-only public-player composition root.
- `src/state/` owns the serializable project model and separate transient session state.
- `src/persistence/` owns validated project documents and replaceable local repositories.
- `src/audio/` owns Web Audio lifecycle and voice creation.
- `src/transport/` owns the shared audio-clock scheduler.
- `src/features/` contains UI factories with their colocated CSS.
- `src/firebase/` translates optional hosted services into serializable application contracts.
- `src/visualiser/` derives deterministic visual projections from project and transport snapshots.
- `styles.css` is the single stylesheet entry point and imports shared and feature styles.
- `tests/` protects domain, persistence, cloud, audio, projection, build, and scheduler behaviour with deterministic fakes.

State never imports UI. Feature rendering is a projection of state snapshots, and user interactions issue commands through injected state interfaces.
See [the architecture conventions](./docs/architecture.md) for dependency, lifecycle, and module-identity rules.

## Documentation

- [Product requirements](./docs/product/README.md)
- [Implementation epics](./docs/epics/README.md)
