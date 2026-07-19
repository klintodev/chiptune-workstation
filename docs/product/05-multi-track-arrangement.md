# PRD 5: Multi-Track Arrangement

## Description

Turn the single-pattern sequencer into a small chiptune DAW where users can build reusable musical patterns, place them independently across tracks, and play the result as a complete song.

The application retains one sequencer workspace. It edits one project-level pattern at a time. A pattern contains musical note data but no sound configuration. Placing a pattern on a track creates a linked clip, comparable to placing MIDI material in a DAW. The track supplies the instrument, envelope, and mixer settings used to play that clip.

Clips remain linked to their source pattern so that one edit updates every placement. A user creates an independent variation by duplicating the pattern and editing the duplicate. Tracks share one transport and tempo, but their clips can be positioned independently on a step-aligned timeline.

## Requirements

### Project model

- A project must contain a project-level pattern library, one or more tracks, an arrangement, and shared transport settings.
- A pattern must have a stable identifier, a user-visible name, a supported length, and serializable note-step data.
- A track must have a stable identifier, a user-visible name, an independent instrument configuration, mixer state, and an ordered collection of clip placements.
- A clip must reference a pattern by identifier and store an integer start step on the arrangement timeline.
- Pattern note data must not be copied into linked clip placements.
- The state model must remain serializable and must not contain DOM, Web Audio, or timer objects.
- Existing single-track project state must migrate atomically into the new model during development.

### Pattern workflow

- The application must expose one sequencer for creating and editing the selected pattern.
- The user must be able to create, select, rename, duplicate, and delete patterns.
- A new project must begin with one empty named pattern ready to edit.
- A duplicated pattern must receive independent note data and a new identity.
- Editing a pattern must update every clip that references it.
- Deleting a pattern referenced by clips must disclose the affected placements and require explicit confirmation before removing the pattern and those clips.
- The user must be able to place the selected pattern on the selected track without duplicating its note data.
- Existing pattern editing, gate, volume, preview, transposition, and undo/redo behaviour must continue to work on the selected pattern.

### Track workflow

- A project must support between one and four tracks.
- A new project must begin with one track named `Pulse 1`.
- The user must be able to add, select, rename, reorder, and remove tracks.
- The final remaining track must not be removable.
- Removing a track that contains clips must require explicit confirmation.
- Selecting a track must project that track's instrument and mixer state into the existing controls.
- Live keyboard performance and note preview must use the selected track's instrument.
- Track identity, selected state, instrument voice, mute, solo, and volume must remain visible without obscuring the sequencer or arrangement.

### Instruments and mixing

- Every track must own an independent voice type, octave offset, instrument volume, attack, and release configuration.
- The supported voice types remain square, triangle, sawtooth, and noise.
- Noise tracks must use the same sequencer and arrangement model while presenting occupied steps as hits rather than meaningful pitches.
- Every track must have independent volume, mute, and solo controls.
- Multiple tracks may be soloed simultaneously.
- When any track is soloed, only soloed tracks are eligible to sound; mute always overrides solo.
- The user must be able to control master output volume.
- Pan, send effects, master effects, shared instruments, and automation are outside this PRD.
- The audio graph must route every voice through its track channel and every track channel through the master signal path.

### Clip arrangement

- The arrangement must display one horizontal lane per track against a shared step-based timeline.
- Clip start positions must snap to integer sixteenth-note steps.
- A clip's duration must be derived from its referenced pattern length.
- Supported pattern and clip lengths remain 4, 8, 16, and 32 steps.
- The user must be able to place, select, move, repeat, and remove clips independently on each track.
- Repeating a clip must create another reference to the same pattern.
- Creating a musical variation must use pattern duplication rather than detaching or overriding a clip.
- Empty regions of a track must play as silence.
- Clips on the same track must not overlap.
- Invalid placements must be rejected without moving or deleting existing clips.
- A pattern resize must be rejected when the resulting linked clips would overlap or exceed the arrangement limit.
- The initial arrangement must support up to 256 sixteenth-note steps and may scroll horizontally.
- Clip-level transposition, velocity overrides, trimming, stretching, fades, and arbitrary unsnapped positioning are outside this PRD.

### Transport and playback

- All tracks and clips must play through one shared audio-clock transport and tempo.
- The user must be able to switch between looping the selected pattern and playing the full arrangement.
- Pattern-loop playback must use the selected track's instrument.
- Arrangement playback must begin at the requested timeline step and stop at the end of the final clip unless looping is enabled.
- The user must be able to define and clear a step-aligned arrangement loop region.
- The playhead must show the current arrangement position and the corresponding position inside the selected pattern clip.
- Starting, pausing, resuming, stopping, looping, and tempo changes must keep all tracks synchronized.
- Pattern edits must affect only occurrences that have not already been scheduled.
- Adding, removing, moving, muting, or soloing tracks and clips during playback must not create a second scheduler or destabilize transport timing.
- Removing an actively sounding track or clip must release only voices owned by that track or clip.
- Playback must transition between adjacent clips without an audible scheduling gap.

### Reliability and accessibility

- Project-level undo and redo must cover pattern, track, mixer, and arrangement mutations as coherent user actions.
- Continuous range-input changes must remain grouped into one history entry.
- A track must permit at most 16 active voices; when capacity is reached, the oldest voice must be retired before another is created.
- The maximum of four tracks and 256 arrangement steps must be enforced in state rather than only in the interface.
- Track and clip controls must expose useful names, selected states, and keyboard focus.
- The arrangement must support keyboard selection and movement without triggering live instrument notes.
- Audio activation rules must remain unchanged: no audio context or sound is created before a permitted user gesture.

## Resolved scope decisions

- PRDs 5 and 6 are combined because track architecture and arrangement playback are delivered as one coherent workflow.
- Patterns are project-level, reusable, and independent of instrument configuration.
- Clips remain linked to their patterns; duplicating a pattern creates a variation.
- Clips are positioned independently in track lanes rather than grouped into global scenes.
- Tracks own instruments and mixer settings.
- The initial limits are four tracks, 16 active voices per track, and 256 arrangement steps.
- New projects begin with one track and one empty pattern rather than a predefined ensemble.
- The same sequencer serves pitched and noise tracks.
- The first arrangement uses one constant project tempo and does not support per-clip overrides or effects.

## Open questions

None blocking initial epic planning. The resolved limits and interaction rules can be revisited after the first usable arrangement is tested.
