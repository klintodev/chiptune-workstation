# PRD 02: Single-Track Step Sequencer

## Description

Allow a user to turn the playable instrument into a repeating musical pattern. The first sequencer is intentionally constrained to one track and one pattern so that transport, scheduling, state, and editing can be proven before multi-track complexity is introduced.

The defining quality requirement is stable playback. The application may use a periodic look-ahead process to discover upcoming notes, but note start and stop times must be scheduled against the Web Audio clock rather than fired directly by a JavaScript interval.

## Requirements

- The user must be able to create a fixed-length pattern containing 16 steps.
- Each step must support either one note or a rest.
- The user must be able to set, replace, and clear the note on a step.
- The user must be able to select the pitch and octave assigned to a step.
- The sequencer must use the instrument interface established by PRD 01.
- The user must be able to play, pause, stop, and return playback to the beginning of the pattern.
- The user must be able to change tempo within a defined safe range.
- The current playback step must be visually indicated.
- Notes must be scheduled ahead using `AudioContext.currentTime` or an equivalent Web Audio time source.
- Playback must remain musically stable during ordinary UI interaction and moderate main-thread activity.
- Tempo changes during playback must take effect predictably without double-triggering or skipping notes.
- Stopping playback must cancel or neutralize notes that have been scheduled but should no longer sound.
- Repeated start and stop operations must not create duplicate schedulers or orphaned voices.
- The pattern must remain intact when transport controls are used.
- Audio scheduling logic must be separable from the visual playhead, because the UI may render later than the audio event it represents.

## Open questions

- Is the initial grid 16 sixteenth notes in 4/4, or should step duration be configurable?
- Should pause resume from the current position while stop returns to the beginning?
- Should a step support note length or ties in this PRD, or play a fixed gate length?
- Can users enter notes while playback is running?
- Should changing tempo affect already scheduled notes inside the look-ahead window?
- What tempo range should the application support?
- What look-ahead interval and scheduling horizon provide the best balance of stability and responsiveness?
- How should background-tab throttling be communicated or handled?
