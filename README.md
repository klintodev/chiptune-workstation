# Chiptune Workstation

A dependency-free browser chiptune instrument and step sequencer built with the Web Audio API and native ES modules.

The current product includes a playable keyboard, editable single-track patterns, per-note gate and volume, tempo and transport controls, bulk pattern actions, and undo/redo.

## Run locally

Serve the repository over HTTP from its root:

```powershell
python -m http.server 4173
```

Then open <http://localhost:4173>.

## Test

Node 22 or later is required. The test suite uses only Node's built-in test runner.

```powershell
npm test
```

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
