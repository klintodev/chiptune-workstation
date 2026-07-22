# PRD 17: Track Panning

## Description

Add conventional stereo panning to each track. Panning belongs to the track mixer, so every note produced by that track shares one stereo position. The same persisted value also controls the horizontal position of that track's notes in the composition-projected visualiser.

## Requirements

- Store `mixer.pan` as a finite value from `-1` (left) through `0` (centre) to `+1` (right).
- Default new and migrated tracks to centre.
- Add a compact, continuously updating pan control to every arrangement track header.
- Display understandable values: `L100` through `C` to `R100`.
- Group continuous slider movement into one undoable project edit.
- Apply pan after track gain in the live Web Audio signal path.
- Apply the same pan during offline WAV rendering.
- Preserve mute, solo, volume, per-track analysis, and voice limits.
- Use pan as the primary horizontal position for notes in the visualiser.
- Persist panning locally and in cloud/shared project documents through a schema migration.

## Open questions

- Per-note pan is outside this PRD; expression remains track-level until a concrete editing workflow is designed.
- Stereo width and automated pan movement are future mixer features.

## E58: Persisted mixer pan

- Add validated pan state and migrate existing project documents to centre.
- Include panning in undo/redo, serialization, cloud documents, and copied tracks.

## E59: Live and exported stereo position

- Add a stereo panner to each live track channel with smooth parameter changes.
- Reproduce the same stereo placement in offline WAV export.
- Cover channel routing and render-plan pan values with focused tests.

## E60: Pan control and visual position

- Add an accessible pan slider and readout to each arrangement track.
- Update sound and visuals during slider input without producing a note.
- Position projected note objects horizontally from the persisted pan value.

