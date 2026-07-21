# PRD 9: Audio Export

## Description

Allow users to render their composition into an audio file that can be played outside the application. The exported result should faithfully reproduce the timing and mix heard during live playback.

This feature creates an immediately useful artifact even before publishing and sharing exist.

## Requirements

- The user must be able to export the complete current arrangement as a WAV file.
- Export must include every audible track, its instrument settings, mixer level, and the master level.
- Export must honour the current mute and solo state exactly as arrangement playback does.
- Rendering must use `OfflineAudioContext` and must not require real-time recording or a server upload.
- Output must be stereo, 44.1 kHz, signed 16-bit PCM WAV.
- The rendered file must begin at arrangement step one and include a tail equal to the longest audible release plus a 50 ms safety margin.
- Exported timing and pitch must use the same musical and synthesis primitives as live playback.
- The downloaded filename must be safely derived from the project title.
- The interface must show rendering progress and disable duplicate export actions while work is in progress.
- Rendering failures must leave project, history, selection, and transport state unchanged and show an actionable error.
- Exports longer than ten minutes must be rejected before the offline audio buffer is allocated.
- Rendering and WAV encoding must have focused automated regression coverage.

## Open questions

None for the first release. Pattern/loop export, compressed formats, intentional bit crushing, and visualiser video export are deferred until there is evidence they are useful.
