# Chiptune Workstation

A browser-based chiptune DAW built on the Web Audio API.

The current implementation covers **Epic 01: Audio lifecycle and master signal path**. It deliberately does not implement playable synth voices yet.

## Run locally

Serve the repository over HTTP from its root. For example, if Python is installed:

```powershell
python -m http.server 4173
```

Then open <http://localhost:4173>.

Opening `index.html` directly may work in some browsers, but an HTTP server more closely matches the intended deployment environment.

## Epic 01 review path

1. Open a fresh tab and confirm audio does not begin automatically.
2. Select **Enable audio** and confirm the engine becomes ready.
3. Select **Play test signal** and listen for a short square-wave tone.
4. Mute output, play the signal again, and confirm it is silent.
5. Unmute and confirm the signal is audible again.
6. Background and restore the tab. If the browser suspends audio, use **Resume audio**.
7. Reload and confirm audio once again requires an explicit gesture.

The diagnostic tone exists only to verify the E01 master signal path. The reusable voice engine is introduced in E02.

## Documentation

- [Product requirements](./docs/product/README.md)
- [PRD 01 implementation epics](./docs/epics/prd-01-playable-instrument.md)
