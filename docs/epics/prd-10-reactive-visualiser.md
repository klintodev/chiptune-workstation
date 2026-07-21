# PRD 10 Epics: Reactive Visualiser

These epics deliver [PRD 10: Reactive Visualiser](../product/10-reactive-visualiser.md) as a Canvas 2D, master-mix visual system.

## E36: Non-invasive master analysis

- Feed an analyser from the master signal without changing the audible mix.
- Produce bounded amplitude, bass, mid, treble, waveform, and spectrum values.
- Keep analyser reads separate from audio scheduling.

## E37: Chiptune visual presets

- Provide Spectrum, Oscilloscope, and Pixel pulse presets.
- Make amplitude and frequency response obvious across the presets.
- Render through Canvas 2D with a capped pixel ratio and no new dependency.

## E38: Immediate visual controls

- Let users change preset, palette, intensity, sensitivity, motion, and enabled state.
- Preview every change immediately in one focused modal workspace.
- Store all choices in the versioned project document and history.

## E39: Performance and accessibility

- Render only while the modal is visible and stop work in hidden tabs.
- Respect reduced-motion preferences by removing rotation and retaining a useful static response.
- Fail gracefully when Canvas or Web Audio analysis is unavailable.
- Cover configuration migration and audio feature extraction with focused tests.
