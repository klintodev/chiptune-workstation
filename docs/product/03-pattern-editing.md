# PRD 3: Pattern Editing

## Description

Expand the basic sequencer into an efficient composition surface. Users should be able to shape and revise a musical idea without repeatedly clearing and rebuilding individual steps.

This feature is about editing fluency rather than adding tracks or arranging a full song. It should establish the interaction patterns and data model that later composition features can reuse.

## Requirements

- The user must be able to choose from a defined set of supported pattern lengths.
- Existing notes must be handled predictably when a pattern is shortened or lengthened.
- The user must be able to edit a note's pitch and octave.
- The user must be able to edit note duration or gate length within the limits supported by the sequencer.
- The user must be able to edit note velocity or an equivalent chip-appropriate intensity value.
- Selecting or changing a note must provide an optional audible preview.
- The user must be able to duplicate a pattern's contents.
- The user must be able to clear a pattern after an explicit action.
- The user must be able to transpose all eligible notes in a pattern up or down by semitones or octaves.
- Transposition must define how notes outside the supported pitch range are handled.
- The user must be able to undo and redo the essential note-editing operations performed in the current session.
- Keyboard interaction must support efficient movement through the grid and common editing actions.
- Editing during playback must not corrupt scheduler state or produce unintended duplicate notes.
- The interface must distinguish the selected editing position from the current playback position.

## Open questions

- Which pattern lengths should be supported initially?
- Are arbitrary note lengths necessary, or are fixed gates plus ties a better chiptune workflow?
- Should patterns support chords before the multi-track feature exists?
- Which operations belong in the first undo/redo history?
- Should undo history survive page reloads or remain session-only?
- How should destructive operations such as clear be confirmed without slowing down composition?
- Should mouse painting, drag selection, copy/paste, and box selection be included now or deferred?
