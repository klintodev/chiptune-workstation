# PRD 1: Playable Instrument

## Description

Create the smallest complete musical experience: a chip-style synthesizer that can be played directly in the browser. This feature establishes the Web Audio foundation, proves that the supported browsers can produce sound reliably, and gives later sequencing features a reusable instrument interface.

A user should be able to open the application, deliberately enable audio, select a chip-style voice, and immediately play notes with sufficiently responsive feedback to feel like an instrument rather than a collection of sound buttons.

## Requirements

- Audio must begin only after an explicit user gesture, in accordance with browser autoplay restrictions.
- The user must be able to play notes from an on-screen keyboard.
- The user must be able to play notes from a mapped set of computer keyboard keys.
- The interface must show which note or key is currently active.
- The instrument must support square, triangle, sawtooth, and noise-based voices, subject to validation of the desired chiptune sound palette.
- The user must be able to change octave without reloading the application.
- The user must be able to control the instrument's output volume.
- Pitched voices must have a short configurable amplitude envelope so that notes start and stop without audible clicks.
- Releasing a key must stop its associated voice cleanly.
- The system must prevent stuck notes when focus changes, a key-up event is missed, or the browser tab becomes inactive.
- Multiple simultaneous input events must behave predictably. The initial implementation may be monophonic if this is communicated by the interface.
- The audio engine must expose an instrument-triggering interface that can later be called by a sequencer without depending on keyboard or UI events.
- Unsupported or suspended audio states must produce a clear recovery action rather than failing silently.

## Open questions

- Is the first instrument monophonic, polyphonic, or selectable between the two?
- Should pulse-width control be included now, or should the first square voice use a fixed duty cycle?
- Does sawtooth fit the desired aesthetic, or should pulse/noise variations take priority?
- Should the noise voice be pitched, unpitched, or represented as a separate percussion instrument?
- Which browsers and mobile devices are officially supported for the first release?
- What keyboard layout should be the default, and must it adapt to non-QWERTY keyboards?
- How much envelope control should be exposed to the user in this feature?
- What latency is acceptable for interactive playing, and how will it be measured?
