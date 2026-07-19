# PRD 5: Multi-Track Songs

## Description

Allow users to combine multiple synchronized chip-style parts into a recognisable piece of music. This is the point at which the product becomes a small DAW rather than a single-pattern sequencer.

Each track owns an instrument and pattern while sharing a common transport. The initial experience should favour a small, understandable set of musical roles rather than unlimited routing or a general-purpose mixer.

## Requirements

- A project must support multiple tracks playing against one shared transport and tempo.
- The user must be able to add, remove, rename, and reorder tracks.
- Each track must contain an independently editable pattern.
- Each track must have its own instrument configuration.
- The initial product must support pitched melodic/bass voices and a noise-based percussion role.
- The user must be able to select which track is currently being edited.
- The user must be able to mute and unmute each track.
- The user must be able to solo a track, with clearly defined behaviour when multiple solo controls are active.
- The user must be able to control each track's volume.
- The user must be able to control master output volume.
- All tracks must remain synchronized through starting, pausing, stopping, looping, and tempo changes.
- Adding or removing a track during playback must not destabilize the transport.
- The interface must make track identity, voice, mute/solo state, and level visible without obscuring the pattern editor.
- The audio graph must provide a per-track signal path and a master signal path so later analysis and export can observe the complete mix.
- The application must define and enforce a practical initial track limit.

## Open questions

- How many tracks should be supported initially?
- Should new projects begin with a predefined set of musical roles or one empty track?
- Does each track contain exactly one pattern at this stage?
- Can two tracks share an instrument configuration, or is each configuration always independent?
- Which instrument parameters are editable per track?
- Are pan, send effects, or master effects in scope?
- How should solo interact with muted tracks and multiple solo selections?
- Should the percussion track use a dedicated grid or the same note-oriented editor?
- What CPU or voice limits are necessary to keep playback reliable on target devices?
