# PRD 05: Song Arrangement

## Description

Extend repeating patterns into a composition with a beginning, development, and ending. Users should be able to reuse patterns and place them in an ordered structure without needing the complexity of a fully free-form timeline.

The first arrangement model should be deliberately simple and optimized for short chiptunes. It should build on the established pattern and track models while preserving loop-based experimentation.

## Requirements

- A project must support multiple named patterns for each applicable track.
- The user must be able to create, duplicate, rename, and delete patterns.
- The user must be able to arrange pattern references into an ordered song structure.
- Reusing a pattern in multiple positions must not require duplicating its note data.
- The user must be able to choose between looping the current pattern and playing the full arrangement.
- The user must be able to start playback from a selected arrangement position.
- The interface must show the current arrangement position during playback.
- The user must be able to repeat, move, insert, and remove arrangement blocks.
- The user must be able to define a loop region within the arrangement.
- The arrangement must have a clear end at which playback stops or loops according to the selected mode.
- Changes to a reused pattern must be reflected at every arrangement position that references it.
- Deleting an in-use pattern must require the user to resolve or confirm its arrangement references.
- The scheduler must transition between patterns without audible timing gaps.

## Open questions

- Should the arrangement be a sequence of global scenes or an independent sequence per track?
- Can patterns have different lengths, and how do mismatched lengths interact?
- Is a linear block arranger sufficient, or is a tracker-style order list more appropriate?
- Should arrangement blocks support per-instance transposition or other overrides?
- Can tempo change within a song?
- Should users be able to name sections such as intro, verse, and outro?
- What is the maximum practical song length?
- Does this feature precede persistence, or should persistence be delivered first in implementation order?
