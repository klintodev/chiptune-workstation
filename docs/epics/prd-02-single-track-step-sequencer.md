# PRD 02 Epics: Single-Track Step Sequencer

These epics deliver [PRD 02: Single-Track Step Sequencer](../product/02-single-track-step-sequencer.md). They continue the delivery sequence established by PRD 01 and keep pattern state, audio scheduling, transport, and presentation separate.

## Initial scope decisions

- A pattern contains 16 sixteenth-note steps representing one bar of 4/4.
- A step contains either one note or a rest.
- Notes use a fixed gate of 80% of one step; ties and variable note lengths are deferred.
- Tempo ranges from 40 to 240 BPM and defaults to 120 BPM.
- Pause retains the next playback position; stop returns playback to step 1.
- Steps may be edited during playback. Changes affect notes that have not already entered the scheduling window.
- Hiding the page pauses playback safely. Returning requires an explicit play action.

## E06: Pattern state and step editing

### Outcome

The user can build and revise a complete 16-step pattern without starting playback.

### User stories

#### US06.1 - See the pattern

As a user, I want to see all 16 steps so that I can understand the complete loop at a glance.

Requirements:

- The interface presents exactly 16 steps in a stable order.
- Steps are visibly numbered from 1 to 16.
- Every step clearly shows whether it contains a note or a rest.
- A newly created pattern contains 16 rests.
- The grid remains usable at the project's supported viewport sizes.

#### US06.2 - Choose a note

As a user, I want to select a pitch and octave so that I can decide which note to place in the pattern.

Requirements:

- The editor exposes the supported pitch classes and octaves from the instrument's playable range.
- The current note selection is always visible.
- Selecting a pitch or octave does not alter existing steps.
- Invalid or unsupported note values cannot enter pattern state.
- Note names use the same naming convention as the playable keyboard.

#### US06.3 - Capture a played note

As a user, I want playing a note on the instrument keyboard to update the selected sequencer note so that entering melodies feels immediate.

Requirements:

- Successfully starting a note from the computer keyboard updates the selected sequencer note.
- Successfully starting a note from the on-screen keyboard follows the same path.
- The selection captures the note's actual sounding pitch, including the instrument octave offset.
- Capturing a note replaces the most recently selected pattern step.
- If no step has been selected, capturing a note only updates the pitch and octave controls.
- Releasing a note does not clear or change the selected note or step.
- The pitch and octave controls remain available for direct selection.

#### US06.4 - Set and replace a step

As a user, I want to place the selected note on a step so that I can compose a melody.

Requirements:

- Activating an empty step assigns the selected note to it.
- Activating an occupied step with a different selected note replaces its note.
- Editing one step does not alter any other step.
- The visible step label updates immediately after an edit.
- The pattern remains intact when instrument controls change.

#### US06.5 - Clear a step

As a user, I want to turn a note back into a rest so that I can revise the rhythm.

Requirements:

- An occupied step can be cleared directly.
- Clearing a step stores a rest rather than a placeholder note.
- Clearing an already empty step is harmless.
- The editor provides an understandable pointer and keyboard interaction for clearing.

### Tangible technical requirements

- Pattern state is owned by a closure-based module with no DOM or Web Audio dependency.
- The pattern has a serializable representation suitable for later persistence.
- Step indices are zero-based internally and numbered 1 to 16 in the interface.
- Pattern operations validate their inputs and publish one coherent change event.
- Rendering reads pattern state; it does not become the source of truth.

## E07: Web Audio step scheduling

### Outcome

The application can schedule one stable pass of the pattern against the Web Audio clock using the existing instrument engine.

### User stories

#### US07.1 - Hear a scheduled pattern

As a user, I want the notes in my pattern to play in order so that the grid becomes music.

Requirements:

- Steps are evaluated in order from 1 through 16.
- Occupied steps trigger their assigned note through the PRD 01 voice interface.
- Rest steps produce no voice.
- Every triggered note receives an absolute Web Audio start time.
- Note release is scheduled from the fixed gate length and current step duration.
- Playback timing does not depend on the visual grid rendering on time.

#### US07.2 - Hear stable timing

As a user, I want the rhythm to remain even during ordinary interaction so that the sequencer feels musical.

Requirements:

- A periodic look-ahead process discovers steps that enter the scheduling horizon.
- The periodic callback never acts as the note's audible start time.
- The scheduler fills a short future window using `AudioContext.currentTime`.
- Ordinary control interaction does not produce duplicate or reordered steps.
- A late scheduler wake-up does not fire a burst of every missed note.

#### US07.3 - Use the current instrument

As a user, I want sequenced notes to use my instrument settings so that the pattern sounds like the instrument I configured.

Requirements:

- The scheduler calls the same public voice API as live keyboard input.
- Scheduled notes pass the current waveform and supported note configuration.
- Sequencer code does not construct oscillators, gain nodes, or noise sources.
- Live input and sequencer input can be distinguished by voice ownership.
- Stopping sequencer voices does not incorrectly release live keyboard voices.

### Tangible technical requirements

- Scheduling is implemented by a closure-based module with no DOM dependency.
- Audio times are represented in seconds and named distinctly from timer milliseconds.
- Step duration is derived from BPM and sixteenth-note subdivision in one authoritative function.
- The scheduling interval and look-ahead horizon are bounded configuration values.
- Each scheduled voice is registered against its playback session and step.

## E08: Loop transport and playhead

### Outcome

The user can play, pause, resume, and stop a repeating pattern while seeing its current musical position.

### User stories

#### US08.1 - Play a repeating loop

As a user, I want the pattern to repeat continuously so that I can hear it as a musical loop.

Requirements:

- Play starts from the retained transport position.
- After step 16, scheduling continues at step 1 without an extra gap.
- Activating play while already playing does not start another scheduler.
- Starting playback enables audio through the established lifecycle rather than creating another context.
- The pattern remains editable and intact while it loops.

#### US08.2 - Pause and resume

As a user, I want to pause playback and continue from the same position so that I can interrupt listening without losing my place.

Requirements:

- Pause halts future pattern playback.
- Pause retains the next step position.
- Resume continues from that retained step with a newly anchored audio time.
- Repeated pause actions are harmless.
- Pause does not clear or alter pattern notes.

#### US08.3 - Stop and restart

As a user, I want stop to return the pattern to its beginning so that the next playback starts predictably.

Requirements:

- Stop halts future pattern playback.
- Stop releases or neutralizes voices owned by the active playback session.
- Stop resets the next position to step 1.
- Repeated stop actions are harmless.
- Playing after stop starts with step 1 exactly once.

#### US08.4 - Follow the playhead

As a user, I want the current step highlighted so that I can connect what I hear to the pattern grid.

Requirements:

- One step at most is presented as the current playback step.
- The playhead follows audio-clock position rather than advancing from the scheduler timer.
- Visual delay cannot change or delay scheduled audio.
- Pause retains a clear transport position without implying that audio is still playing.
- Stop returns the visible position to step 1.

### Tangible technical requirements

- Transport state explicitly distinguishes stopped, playing, and paused.
- Each play or resume operation creates one identifiable playback session.
- Stale callbacks from an earlier session cannot schedule notes into the current session.
- Audio scheduling and playhead rendering expose separate update paths.
- The visual playhead may use `requestAnimationFrame`; audio onset may not.

## E09: Tempo changes and playback resilience

### Outcome

The sequencer remains predictable when tempo, pattern content, focus, or transport state changes during playback.

### User stories

#### US09.1 - Set the tempo

As a user, I want to choose the tempo so that the loop plays at the speed I intend.

Requirements:

- A labelled control accepts values from 40 through 240 BPM.
- The current BPM is visible as a number.
- Values outside the range are rejected or constrained predictably.
- Tempo is retained when transport controls are used.
- Changing tempo while stopped does not alter pattern content or position.

#### US09.2 - Change tempo during playback

As a user, I want tempo changes to take effect while the loop plays so that I can adjust its feel without restarting.

Requirements:

- A tempo change re-anchors future scheduling at the first step that has not entered the scheduling window.
- Notes already inside the scheduling window are not triggered again.
- The next unscheduled steps use the new step duration.
- A tempo change does not skip a step or create two active schedulers.
- Rapid input is coalesced into valid bounded tempo state.

#### US09.3 - Edit during playback

As a user, I want to change notes while listening so that composition remains immediate.

Requirements:

- Setting, replacing, or clearing a step remains available while playing.
- An edit affects the next occurrence that has not already been scheduled.
- Editing the highlighted step does not retrigger it immediately.
- Pattern edits do not reset transport position.
- Playback reads an authoritative pattern snapshot when each step is scheduled.

#### US09.4 - Recover without duplicate playback

As a user, I want playback to stop safely when the page is interrupted so that no notes become stuck or unexpectedly catch up later.

Requirements:

- Hiding the document pauses the sequencer and releases sequencer-owned voices.
- Returning to the page does not resume without an explicit action.
- A delayed scheduler callback cannot emit a burst of missed steps.
- Repeated play, pause, and stop operations leave at most one scheduler active.
- Audio suspension presents the existing resume path and preserves pattern state.

### Tangible technical requirements

- Tempo and pattern edits invalidate only future unscheduled work.
- Scheduled voice handles can be neutralized by playback session.
- Scheduler teardown cancels its periodic wake-up and clears session-owned records.
- Catch-up policy advances position without retroactively sounding missed steps.
- Pattern, tempo, and retained transport position survive recoverable audio interruptions.

## Delivery sequence

1. E06 produces a complete editable pattern with no playback dependency.
2. E07 proves Web Audio clock scheduling through one stable pattern pass.
3. E08 turns scheduled playback into a usable looping sequencer.
4. E09 makes live editing, tempo changes, and interruption recovery predictable.

## Definition of done for PRD 02

- All four epic outcomes are present.
- A user can create, revise, play, pause, resume, and stop a 16-step pattern.
- The pattern loops at a user-selected tempo without using UI timer precision for note onset.
- Transport operations do not erase the pattern, duplicate schedulers, or leave sequencer-owned voices sounding.
- Pattern edits and tempo changes during playback follow the documented scheduling-window behaviour.
