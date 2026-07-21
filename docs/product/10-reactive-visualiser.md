# PRD 10: Reactive Visualiser

## Description

Add a responsive visual experience driven by the complete audio mix. The visualiser makes each composition feel performative while remaining simple enough to configure through a small set of presets and controls.

This first visualiser feature is preset-based. It proves the audio-analysis pipeline and rendering performance before users are given a general visual editor.

## Requirements

- The master audio signal must feed an `AnalyserNode` without changing the audible output.
- The visual system must consume time-domain waveform and frequency-domain data and derive bounded amplitude, bass, mid, and treble values.
- The application must include Spectrum, Oscilloscope, and Pixel pulse presets.
- At least one preset must respond clearly to amplitude and one to frequency distribution.
- The user must be able to switch presets during playback.
- The user must be able to customize palette, intensity, sensitivity, motion, and enabled state.
- Visual changes must preview immediately and persist in the versioned project document.
- Canvas 2D must be used for the first release so the feature remains dependency-free and broadly supported.
- Animation must use `requestAnimationFrame`, cap pixel density, and remain independent of audio scheduling.
- Rendering must stop while the visualiser or browser tab is hidden and resume when it becomes visible.
- Reduced-motion mode must remove rotation and retain a useful audio response.
- Unsupported Canvas or Web Audio analysis must fall back gracefully without preventing music playback.
- Configuration migration and audio-feature extraction must have focused automated tests.

## Open questions

None for the first release. Fullscreen performance mode, onset detection, sequencer events, WebGL, and more advanced sensitivity normalization are candidates for later iterations.
