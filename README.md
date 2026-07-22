# Chiptune Workstation

A browser chiptune workstation built with the Web Audio API and native ES modules. The app has no runtime framework; esbuild is used only to prepare production assets.

The current product includes a playable keyboard, editable single-track patterns, per-note gate and volume, tempo and transport controls, bulk pattern actions, and undo/redo.

## Run locally

Serve the repository over HTTP from its root:

```powershell
python -m http.server 4173
```

Then open <http://localhost:4173>.

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

- `src/app.js` constructs the application and connects feature interfaces.
- `src/state/` owns the serializable project model and separate transient session state.
- `src/audio/` owns Web Audio lifecycle and voice creation.
- `src/transport/` owns the shared audio-clock scheduler.
- `src/features/` contains UI factories with their colocated CSS.
- `styles.css` is the single stylesheet entry point and imports shared and feature styles.
- `tests/` protects domain behaviour and scheduler timing with deterministic fakes.

State never imports UI. Feature rendering is a projection of state snapshots, and user interactions issue commands through injected state interfaces.

## Documentation

- [Product requirements](./docs/product/README.md)
- [Implementation epics](./docs/epics/README.md)
