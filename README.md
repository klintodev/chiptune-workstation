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

## Documentation

- [Product requirements](./docs/product/README.md)
- [PRD 01 implementation epics](./docs/epics/prd-01-playable-instrument.md)
