# PRD 03 Epics: Pattern Editing

These epics deliver [PRD 03: Pattern Editing](../product/03-pattern-editing.md). They extend the existing pattern model without adding tracks, arrangement, chords, or persistence.

## Initial scope decisions

- Supported pattern lengths are 4, 8, 16, and 32 steps.
- Shortening permanently removes steps beyond the new length; lengthening adds rests.
- Changing length during playback stops transport and returns it to step 1 before resizing.
- Per-step gate choices are 25%, 50%, 75%, and 100% of one step.
- Every occupied step has a 0–100% volume slider; new notes default to 70%.
- Audible note preview is optional and off by default.
- Duplicating appends one copy of the current contents into the next supported length.
- Clear uses an explicit armed confirmation rather than a modal dialog.
- Transposition is rejected as one operation if any note would leave the supported range.
- Undo and redo are session-only and retain at most 100 pattern mutations.
- Ties, chords, mouse painting, box selection, and clipboard operations are deferred.

## E10: Variable pattern length

### Outcome

The user can choose a supported pattern length while the editor, pattern state, and transport remain coherent.

### User stories

#### US10.1 - Choose a pattern length

As a user, I want to choose a short or long pattern so that the loop fits my musical idea.

Requirements:

- A labelled control offers 4, 8, 16, and 32 steps.
- The current length is always visible.
- A new project still begins with 16 steps.
- Unsupported lengths cannot enter pattern state.
- Changing length produces one coherent pattern-state change.

#### US10.2 - Lengthen a pattern

As a user, I want added steps to begin as rests so that lengthening does not invent notes.

Requirements:

- Existing steps retain their order and complete note data.
- New steps are appended after the previous final step.
- Every appended step is a rest.
- The grid immediately renders the added steps.
- Playback uses the new length the next time it starts.

#### US10.3 - Shorten a pattern

As a user, I want shortening behaviour to be explicit so that I understand which notes remain.

Requirements:

- Steps from the beginning through the new final step are retained.
- Steps beyond the new length are permanently removed.
- The interface communicates that shortening removes later steps.
- Editing selection remains on a valid step or clears safely.
- The playhead returns to step 1.

#### US10.4 - Resize safely around playback

As a user, I want length changes to leave transport predictable so that playback cannot reference removed steps.

Requirements:

- A length change while playing or paused stops transport first.
- Scheduled sequencer-owned voices are neutralized through the existing transport path.
- Transport returns to the stopped state at step 1.
- Resizing does not create a second scheduler.
- Live keyboard input remains independent of pattern length.

### Tangible technical requirements

- Supported lengths and the default length live in the pattern-state module.
- Step validation uses the pattern's current length rather than a fixed constant.
- Resizing returns a fresh serializable step array.
- The editor creates and removes step controls to match state.
- The scheduler reads pattern length when each playback session begins.

## E11: Per-step note detail and preview

### Outcome

The user can shape each step's pitch, gate, and volume and optionally hear edits immediately.

### User stories

#### US11.1 - Edit the selected note

As a user, I want the controls to reflect the selected step so that revising an existing note is direct.

Requirements:

- Selecting an occupied step loads its pitch and octave into the editor.
- Changing pitch or octave updates that selected step.
- Selecting a rest does not invent a note until the user assigns one.
- Step selection and playback position remain visually distinct.

#### US11.2 - Change note gate

As a user, I want to choose a short or full gate so that notes can feel clipped or sustained.

Requirements:

- Occupied steps store one of the supported gate percentages.
- New notes use a documented default gate.
- Gate changes affect the next unscheduled occurrence.
- Rests do not retain hidden gate data.
- The scheduler derives note duration from the step's gate and current BPM.

#### US11.3 - Set note volume

As a user, I want to set the volume of each note so that the pattern has controllable dynamics.

Requirements:

- Volume is an explicit per-step value from 0% to 100%.
- Every occupied step exposes its own volume slider.
- Volume changes affect only that voice instance's gain.
- Per-note volume does not mutate global instrument volume.

#### US11.4 - Preview edits

As a user, I want optional audible feedback while editing so that I can choose pitches without starting transport.

Requirements:

- Preview can be enabled or disabled explicitly and defaults off.
- Preview uses the current instrument and audio lifecycle.
- Selecting or changing an occupied note produces at most one short preview.
- Preview voices are not owned by transport or live keyboard input.
- Preview never changes the pattern by itself.

### Tangible technical requirements

- A note step is serializable as pitch, gate, and volume data.
- Legacy numeric note steps are migrated predictably or replaced atomically.
- Per-voice intensity is applied before the shared instrument output.
- Preview ownership can be stopped without affecting other voice owners.

## E12: Bulk pattern operations

### Outcome

The user can duplicate, clear, and transpose the pattern without rebuilding it step by step.

### User stories

#### US12.1 - Duplicate pattern contents

As a user, I want to repeat the current contents into a longer pattern so that I can extend an idea quickly.

Requirements:

- Duplicate copies every step in order, including rests and note detail.
- The result uses the next supported length that can contain two copies.
- Duplicate is unavailable when no supported result can contain the copy.
- Copies do not share mutable step objects.
- Transport stops before the pattern length changes.

#### US12.2 - Clear the pattern

As a user, I want to clear all steps intentionally so that an accidental click cannot erase my work.

Requirements:

- The first action visibly arms clear without mutating state.
- A second explicit action confirms the clear.
- Cancelling or performing another editing action disarms clear.
- Confirmed clear replaces every step with a rest and preserves length.

#### US12.3 - Transpose by semitone

As a user, I want to move the pattern up or down by semitone so that I can change its key.

Requirements:

- Controls transpose every occupied step by one semitone.
- Rests remain rests.
- Gate and volume values remain unchanged.
- If any result is out of range, the whole operation is rejected unchanged.

#### US12.4 - Transpose by octave

As a user, I want to move the pattern by octave so that I can place it in another register quickly.

Requirements:

- Controls transpose by exactly 12 semitones up or down.
- The same all-or-nothing range policy applies.
- One transpose action publishes one pattern change.

### Tangible technical requirements

- Bulk operations live in pattern state rather than DOM handlers.
- Every bulk mutation is atomic and returns fresh step data.
- Rejected operations do not publish change events.
- Clear, duplicate, and transpose remain independent of Web Audio nodes.

## E13: Session undo and redo

### Outcome

The user can reverse essential pattern edits made during the current page session.

### User stories

#### US13.1 - Undo an edit

As a user, I want to undo my last pattern change so that mistakes are inexpensive.

Requirements:

- Undo covers set, replace, clear-step, resize, duplicate, clear-pattern, transpose, gate, and volume changes.
- One user operation creates at most one history entry.
- Undo restores the complete prior pattern state.
- Undo is unavailable when history is empty.

#### US13.2 - Redo an edit

As a user, I want to redo an undone change so that I can move safely through alternatives.

Requirements:

- Redo restores the next complete pattern state.
- A new edit after undo clears the redo branch.
- Redo is unavailable when no future state exists.
- Undo and redo do not create recursive history entries.

#### US13.3 - Keep history bounded

As a user, I want editing to remain responsive during a long session.

Requirements:

- History retains at most 100 mutations.
- The oldest entry is discarded when the limit is exceeded.
- History is not written to browser storage in this PRD.
- Transport state and active voices are excluded from history.

### Tangible technical requirements

- History stores serializable pattern snapshots, not DOM or audio objects.
- History controls expose their availability from authoritative state.
- Restoring history publishes one coherent pattern change.
- Playback reads restored pattern state only for unscheduled steps.

## E14: Keyboard editing workflow and playback safety

### Outcome

The pattern can be edited efficiently from the keyboard without confusing editing selection, live performance, or playback position.

### User stories

#### US14.1 - Move through the grid

As a user, I want arrow keys to move the editing position so that I can navigate without a pointer.

Requirements:

- Left and right move by one step within the pattern.
- Up and down move by one visible grid row where possible.
- Navigation does not trigger instrument notes.
- Focus and selected styling follow the editing position.
- The playhead remains a separate visual state.

#### US14.2 - Perform common edits

As a user, I want keyboard commands for frequent actions so that composition is faster.

Requirements:

- Enter assigns the chosen note to the selected step.
- Delete or Backspace clears the selected step.
- Standard platform undo and redo shortcuts call pattern history.
- Shortcuts do not run while typing in editable controls.
- Repeated key events cannot create unintended duplicate mutations.

#### US14.3 - Edit safely during playback

As a user, I want keyboard edits during playback to affect only future scheduling so that the loop remains stable.

Requirements:

- Editing never changes the active playback session identity.
- Already-scheduled voices are not retriggered by an edit.
- Length-changing and duplicate operations still stop transport first.
- Note-detail and transpose edits affect only unscheduled occurrences.
- Focus loss releases live notes and preserves pattern edits.

### Tangible technical requirements

- Grid navigation is derived from current pattern length and rendered column count.
- Shortcut handling is separate from live instrument key mapping.
- Editing selection, keyboard focus, and playhead position are distinct state values.
- Event handling prevents one key press from invoking both editing and performance commands.

## Delivery sequence

1. E10 introduces variable-length pattern state and rendering.
2. E11 adds detailed note shaping and optional preview.
3. E12 adds atomic bulk composition operations.
4. E13 makes those edits reversible within the session.
5. E14 completes a keyboard-first editing workflow and playback safety pass.

## Definition of done for PRD 03

- All five epic outcomes are present.
- A user can resize, revise, shape, duplicate, clear, and transpose a pattern.
- Essential edits can be undone and redone during the current session.
- Pointer and keyboard workflows keep editing selection distinct from the audio-clock playhead.
- Editing during playback changes only future unscheduled work and never duplicates the scheduler.
