# PRD 9: Reactive Visualiser

## Description

Add a responsive visual experience driven by the complete audio mix. The visualiser should make each composition feel performative while remaining simple enough to configure through a small set of presets and controls.

This first visualiser feature is preset-based. It proves the audio-analysis pipeline and rendering performance before users are given a general visual editor.

## Requirements

- The master audio signal must feed an `AnalyserNode` or equivalent analysis path without altering the audible output.
- The visual system must be able to consume time-domain waveform and frequency-domain data.
- The application must include multiple visually distinct presets.
- At least one preset must respond clearly to amplitude and one to frequency distribution.
- The user must be able to switch presets during playback.
- The user must be able to customize a limited set of parameters such as palette, intensity, sensitivity, and motion speed.
- Visual changes must preview immediately.
- Visual animation must be synchronized perceptually with playback.
- The visualiser must stop, pause, and resume consistently with the transport.
- Visual rendering must not interfere with audio scheduling or cause audible glitches on supported devices.
- The system must reduce work when the visualiser is hidden, disabled, or not visible.
- The visualiser must respect reduced-motion preferences through an appropriate fallback or reduced mode.
- The selected preset and its parameter values must be stored in the project format.
- Unsupported graphics capabilities must fall back gracefully rather than preventing music playback.

## Open questions

- Should the renderer use Canvas 2D, WebGL, CSS, or a layered combination?
- Which presets best communicate the chiptune identity?
- Which audio features should be exposed beyond raw waveform and frequency bins?
- Should beat, onset, or note events come from audio analysis, sequencer events, or both?
- Is fullscreen performance mode required?
- What frame-rate and device-performance targets should be enforced?
- How should visual sensitivity be normalized across quiet and loud mixes?
- What accessibility alternative should be provided when motion is reduced or disabled?
