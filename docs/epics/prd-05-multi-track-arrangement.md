# PRD 05 Epics: Multi-Track Arrangement

These epics deliver [PRD 05: Multi-Track Arrangement](../product/05-multi-track-arrangement.md). They combine reusable patterns, independent track timelines, track-owned instruments, mixing, and synchronized song playback without introducing persistence, effects, audio export, or visualisers.

## Initial scope decisions

- The project contains a global pattern library and between one and four tracks.
- One sequencer edits the selected pattern.
- Patterns contain notes, gate, and volume; tracks contain instruments and mixer settings.
- A clip is a linked pattern reference positioned at an integer sixteenth-note step.
- Reusing a clip retains the link; duplicating a pattern creates an independent variation.
- Clips are positioned independently in horizontal track lanes.
- Clip duration comes from pattern length, and clips on one track cannot overlap.
- The arrangement is limited to 256 steps.
- The first version has one project tempo and no clip overrides, pan, sends, effects, or automation.
- Multiple solo selections are allowed, and mute always overrides solo.
- Noise tracks use the same editor while displaying occupied steps as hits.
- Project history remains session-only and bounded.

## E15: Reusable pattern, track, and clip state

### Outcome

The project has a serializable domain model that can represent reusable patterns, track-owned sound settings, and independently positioned clips before the interface or audio runtime depends on it.

### User stories

#### US15.1 - Keep musical data reusable

As a user, I want a pattern to represent notes independently of a sound so that I can reuse the same musical idea on different tracks.

Requirements:

- A pattern has a stable unique identifier and non-empty name.
- A pattern owns a supported step array containing pitch, gate, and per-note volume.
- Pattern data contains no instrument, mixer, clip-position, DOM, or audio-node state.
- A new project contains one empty pattern.

#### US15.2 - Represent tracks and clip placements

As a user, I want each track to have its own sound and arrangement lane so that several musical parts can form one song.

Requirements:

- A track has a stable unique identifier and non-empty name.
- A track owns instrument settings, mixer settings, and a clip collection.
- A clip has its own stable identifier, a valid pattern identifier, and an integer start step.
- Clip duration is derived from its referenced pattern rather than copied into the clip.
- Project validation rejects missing pattern references, duplicate identifiers, and invalid positions.

#### US15.3 - Preserve the current project while upgrading

As a user, I want the composition already in the sequencer to survive the model change.

Requirements:

- The current single track becomes the first track in the new model.
- Its current pattern becomes a project-level pattern without losing note detail.
- The new track receives a clip referencing that pattern at step 0 when the pattern is not empty.
- Migration is atomic: either the complete new project validates or the previous project remains unchanged.
- The project schema version advances and the migration is covered by a focused automated test.

### Tangible technical requirements

- Pattern, track, and clip mutations live in state modules rather than UI handlers.
- State snapshots remain deeply immutable and JSON serializable.
- Referential and timeline validation occurs before committing a project change.
- State exposes lookups by stable identifier rather than array position.
- Project limits for tracks and arrangement steps are exported domain constants.

## E16: Pattern library and single sequencer workspace

### Outcome

The user can manage reusable patterns and edit the selected one through the existing sequencer.

### User stories

#### US16.1 - Create and select patterns

As a user, I want to create and switch between named patterns so that I can build several musical ideas in one project.

Requirements:

- The interface shows the selected pattern's name.
- The user can create a new empty pattern with a predictable default name.
- The user can select any project pattern.
- Selecting a pattern projects its steps into the one sequencer without recreating unrelated features.
- Pattern selection is session UI state and does not alter the arrangement.

#### US16.2 - Rename and duplicate a pattern

As a user, I want to duplicate a pattern before changing it so that existing clips retain the original version.

Requirements:

- A pattern can be renamed to a trimmed, non-empty name.
- Duplicate creates a new pattern identifier and copies every note and rest.
- The duplicate is selected immediately and receives an understandable derived name.
- Later edits to either pattern do not mutate the other.
- Duplicate creates one project-history entry.

#### US16.3 - Reuse a linked pattern

As a user, I want edits to a pattern to appear in all clips that use it so that repeated sections stay consistent.

Requirements:

- Every clip resolves its note data from the current referenced pattern.
- An edit updates all unscheduled future occurrences of that pattern.
- Editing a pattern never silently creates a detached clip copy.
- The interface communicates how many clips use the selected pattern.

#### US16.4 - Delete a pattern safely

As a user, I want to understand where a pattern is used before deleting it.

Requirements:

- An unused pattern can be deleted with an explicit action.
- Deleting an in-use pattern first reports the number of affected clips.
- Confirmation removes the pattern and all clips referencing it as one mutation.
- Cancellation leaves the project unchanged.
- The final remaining pattern cannot be deleted.

### Tangible technical requirements

- The pattern editor binds through a replaceable selected-pattern adapter.
- Switching patterns disposes or redirects subscriptions without duplicating listeners.
- Pattern history actions write through project state.
- Pattern selection remains separate from transport position and clip selection.
- Existing pattern-state tests continue to run without requiring a browser or AudioContext.

## E17: Track workspace and selection

### Outcome

The user can manage up to four tracks while the single sequencer, instrument controls, and keyboard consistently represent the selected track.

### User stories

#### US17.1 - Add and select tracks

As a user, I want to add and select tracks so that I can create another musical part and edit its sound.

Requirements:

- A new project begins with `Pulse 1` selected.
- Add track creates an empty track with a unique identifier and predictable name.
- New tracks receive independent default instrument and mixer settings.
- Track creation is unavailable at the four-track limit.
- Selecting a track visibly identifies it and updates the projected controls.

#### US17.2 - Rename and reorder tracks

As a user, I want meaningful track names and ordering so that the arrangement reflects the roles in my song.

Requirements:

- Track names can be changed to trimmed, non-empty values.
- Tracks can move earlier or later without changing clip timing.
- Reordering changes the arrangement lane order and no audio identities.
- Rename and reorder each create one history entry.

#### US17.3 - Remove a track safely

As a user, I want to remove an unused part without accidentally losing arranged clips.

Requirements:

- An empty track can be removed explicitly.
- Removing a track with clips first reports that its arrangement content will be removed.
- Confirmation removes the track and its clips as one mutation.
- The final remaining track cannot be removed.
- Selection moves predictably to a surviving neighbouring track.

#### US17.4 - Keep one coherent editing context

As a user, I want the keyboard and controls to follow my selected track so that I always know which instrument I am hearing.

Requirements:

- Instrument controls render the selected track's configuration.
- Live keyboard notes use the selected track's voice and signal path.
- Note preview uses the selected track's instrument.
- Changing track releases live keyboard and preview voices owned by the previous selection.
- Changing track does not stop arrangement playback.

### Tangible technical requirements

- Selected track identifier lives in session state.
- Feature state adapters can change their target track without recreating project state.
- DOM rendering is a projection of selected track and authoritative project state.
- Removing the selected track cannot leave a stale adapter or audio reference.

## E18: Per-track instruments and mixer

### Outcome

Every track has an independent chip voice and controllable place in the complete mix.

### User stories

#### US18.1 - Shape each track's instrument

As a user, I want each track to have its own voice and envelope so that melody, bass, and percussion sound distinct.

Requirements:

- Voice type, octave offset, instrument volume, attack, and release are stored per track.
- Changing the selected track loads that track's values into the existing controls.
- Input changes update only the selected track.
- Already-started voices retain their start-time configuration except for supported live volume changes.
- Reset instrument affects only the selected track.

#### US18.2 - Balance tracks

As a user, I want to set each track's level so that parts sit together in the mix.

Requirements:

- Every track exposes a 0-100% mixer-volume control.
- Mixer volume is separate from per-note and instrument volume.
- Volume changes ramp smoothly on the track channel.
- Continuous slider input creates one undoable history action.
- Track level remains visible when another track is selected.

#### US18.3 - Mute and solo tracks

As a user, I want to isolate or silence parts while arranging the song.

Requirements:

- Mute silences only its track.
- Multiple tracks can be soloed simultaneously.
- When any solo is active, non-soloed tracks are silent.
- A muted and soloed track remains silent.
- Mute and solo changes apply without restarting transport.

#### US18.4 - Control the master output

As a user, I want one master-volume control so that I can adjust the complete mix safely.

Requirements:

- Master volume ranges from 0% to 100% and is stored in project state.
- The control ramps the existing master gain without rebuilding the graph.
- Master volume affects live input, preview, pattern-loop, and arrangement playback.
- Master volume does not rewrite individual track settings.

#### US18.5 - Use a noise percussion track

As a user, I want noise-based hits so that the song can include a simple percussion part.

Requirements:

- Noise remains a selectable track voice.
- Occupied noise steps are labelled `Hit` in note and clip context where pitch would be misleading.
- Gate, per-note volume, attack, and release continue to shape noise hits.
- Noise tracks use the same pattern editor, clip model, transport, and mixer.

### Tangible technical requirements

- One lazy track channel exists per track and connects to one master input.
- Voice ownership identifies the originating track.
- Solo eligibility is derived centrally from the complete track collection.
- Mixer changes do not allocate replacement GainNodes.
- Removing a track disposes only that track's audio resources.

## E19: Independent clip arranger

### Outcome

The user can place linked patterns independently across horizontal track lanes to create a song structure.

### User stories

#### US19.1 - Place a pattern on a track

As a user, I want to add the selected pattern to the selected track so that my sequenced idea becomes part of the song.

Requirements:

- The placement action identifies the selected pattern, track, and start step.
- Start positions snap to integer sixteenth-note steps.
- A new clip references the pattern and does not copy note data.
- The clip width reflects the referenced pattern length.
- Successful placement selects the new clip.

#### US19.2 - Move and repeat clips

As a user, I want to reposition and repeat clips so that I can build sections quickly.

Requirements:

- A clip can move earlier or later and between tracks while remaining step-aligned.
- A repeated clip receives a new clip identity and retains the same pattern reference.
- Repeat defaults to the first valid position immediately after the source clip.
- Moving or repeating never changes the source pattern.
- Each completed action creates one history entry.

#### US19.3 - Remove clips and leave silence

As a user, I want to remove an arrangement placement without deleting its reusable pattern.

Requirements:

- Removing a clip leaves the pattern in the library.
- Empty timeline regions are rendered and played as silence.
- Removing the selected clip leaves a valid track and pattern selection.
- Clip removal affects playback only after already-scheduled audio.

#### US19.4 - Prevent ambiguous overlaps

As a user, I want invalid placements rejected clearly so that one track never has competing clips.

Requirements:

- Clips whose occupied step ranges intersect cannot share a track.
- A rejected place, move, or repeat operation leaves all clips unchanged.
- Pattern resizing is rejected if any linked clip would overlap another clip or pass step 256.
- The interface explains the conflicting track and step range.
- Different tracks may contain clips over the same time range.

#### US19.5 - Navigate the arrangement

As a user, I want to see and select clips across the song without losing the sequencer workspace.

Requirements:

- Each track has one horizontal lane aligned to a shared time ruler.
- The arrangement scrolls horizontally up to 256 steps.
- Clips display pattern name, length, and selected state.
- Selecting a clip selects its track and loads its pattern into the sequencer.
- Keyboard focus can move between clips without invoking live notes.

### Tangible technical requirements

- Placement collision checks are pure state functions with boundary tests.
- Timeline position is stored as step data rather than pixels.
- Rendering derives clip position and width from start step, pattern length, and grid scale.
- Pointer interactions commit one mutation on completion rather than on every movement.
- The arranger owns no audio scheduling logic.

## E20: Shared multi-track transport

### Outcome

All arranged clips play through one synchronized transport, with reliable clip transitions and clear playback position.

### User stories

#### US20.1 - Play the full arrangement

As a user, I want to hear all tracks together so that I can judge the complete song.

Requirements:

- Arrangement playback schedules every eligible track from one audio-clock timeline.
- Clips begin at their stored start step and end with their pattern duration.
- Empty regions schedule no voices.
- Playback stops after the final clip release when arrangement looping is disabled.
- The arrangement playhead advances against the shared ruler.

#### US20.2 - Loop the selected pattern

As a user, I want to loop the pattern I am editing so that I can refine it before returning to the song.

Requirements:

- An explicit mode switches between selected-pattern loop and full arrangement playback.
- Pattern mode uses the selected track's instrument and mixer path.
- Switching modes stops the current playback session before starting another.
- Pattern-loop playhead remains distinct from arrangement position.

#### US20.3 - Start and loop within the arrangement

As a user, I want to audition part of the song so that I can refine a section efficiently.

Requirements:

- The user can choose a valid start step before playback.
- A loop region has integer start and exclusive end steps.
- The end must be later than the start and no greater than step 256.
- When enabled, all tracks wrap at the same loop boundary.
- Clearing the loop restores playback through the arrangement end.

#### US20.4 - Keep transport coherent

As a user, I want play, pause, resume, stop, and tempo changes to keep every part aligned.

Requirements:

- One play action creates one scheduler session.
- Pause retains one shared next-step position and releases scheduled arrangement voices.
- Resume restarts every track from the same retained position.
- Stop returns to the chosen start position or step 0.
- Tempo changes preserve a common anchor and affect all unscheduled steps.

#### US20.5 - Edit during playback

As a user, I want arrangement and mix edits to affect upcoming music without corrupting playback.

Requirements:

- Pattern and clip edits affect only unscheduled steps.
- Mute, solo, and volume changes apply through existing track channels.
- Removing a sounding clip or track releases only its owned voices.
- Adding a track or clip does not create another scheduler timer.
- Adjacent clips transition without an audible scheduling gap.

### Tangible technical requirements

- A single transport coordinator schedules all tracks inside one look-ahead loop.
- Scheduling resolves clip and pattern state for each absolute arrangement step.
- Scheduled voice records include session, track, clip, and timing ownership.
- The transport publishes one authoritative status and absolute playhead step.
- Timing tests use injected clocks and timers and do not require real audio output.

## E21: History, limits, and multi-track safety

### Outcome

The combined workflow remains recoverable and responsive under the project's explicit hackathon limits.

### User stories

#### US21.1 - Undo song-building actions

As a user, I want to undo pattern, track, mixer, and arrangement changes so that experimentation remains inexpensive.

Requirements:

- Undo and redo cover create, rename, duplicate, delete, place, move, repeat, reorder, and mixer actions.
- Confirmation-driven deletions restore or remove all affected entities as one history entry.
- One pointer drag or slider gesture creates at most one history entry.
- A new edit after undo clears the redo branch.
- Transport status, playhead, active voices, focus, and current selections are excluded from project history.

#### US21.2 - Enforce project limits

As a user, I want the product to remain responsive rather than accepting a song it cannot play reliably.

Requirements:

- State rejects a fifth track and positions beyond step 256.
- Each track allows at most 16 active voices.
- When the limit is reached, the oldest active voice is retired before a new voice starts.
- Voice retirement never stops another track.
- Disabled UI controls explain when a project limit has been reached.

#### US21.3 - Survive structural edits and interruptions

As a user, I want sound to stop predictably when tracks disappear or the page loses focus.

Requirements:

- Removing a track disposes its scheduler records, live notes, preview, and audio channel.
- Deleting a pattern removes its referencing clips without leaving scheduled future triggers.
- Blur, visibility loss, and page exit release voices across every owner.
- A stopped or failed transport leaves no repeating timer.
- Audio can resume through the existing explicit activation lifecycle.

#### US21.4 - Retain minimal regression coverage

As a contributor, I want focused tests around high-risk state and timing rules so that later features do not silently break songs.

Requirements:

- Tests cover pattern duplication independence and linked clip resolution.
- Tests cover overlap, track-count, arrangement-boundary, and dangling-reference rejection.
- Tests cover mute/solo eligibility, including mute overriding solo.
- Tests prove multiple tracks schedule from one transport clock.
- Tests prove structural removal cleans only the affected owners.

### Tangible technical requirements

- Resource budgets are constants consumed by state, audio, and UI projections.
- Audio ownership cleanup is idempotent.
- Project validation can run on plain JSON snapshots.
- New automated tests remain dependency-free and use the existing Node test runner.

## Delivery sequence

1. E15 establishes the reusable pattern, track, and clip model.
2. E16 moves the sequencer onto a selectable project-level pattern library.
3. E17 adds track management and one coherent editing context.
4. E18 gives every track an instrument, mixer channel, and master output control.
5. E19 provides independently positioned linked clips in track lanes.
6. E20 replaces single-pattern playback with one shared multi-track transport.
7. E21 hardens history, resource limits, cleanup, and minimal regression coverage.

## Definition of done for PRD 05

- A user can create a pattern once, place linked copies independently across tracks, and duplicate the pattern to create a variation.
- A user can add, name, reorder, mix, mute, solo, and remove up to four tracks.
- Every track uses its own instrument while the one sequencer edits the selected pattern.
- The independent clip arrangement plays through one synchronized audio-clock transport.
- Pattern loop and full arrangement modes have distinct, predictable playheads.
- Invalid overlaps and out-of-bounds edits are rejected without corrupting project state.
- Undo, cleanup, and resource limits protect the usable hackathon workflow.
- Focused state and timing tests pass without a browser or real AudioContext.
