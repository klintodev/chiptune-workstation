# PRD 07: Audio Export

## Description

Allow users to render their composition into an audio file that can be played outside the application. The exported result should faithfully reproduce the timing and mix heard during live playback.

This feature creates an immediately useful artifact even before publishing and sharing exist.

## Requirements

- The user must be able to export the complete current composition as a WAV file.
- Export must include all audible tracks, instrument settings, mixer levels, and supported master processing.
- Muted and soloed state must have explicitly defined export behaviour.
- Rendering should use offline audio rendering when supported and appropriate.
- The rendered file must begin and end predictably without clipped note releases or excessive silence.
- Exported timing and pitch must match live playback within an agreed tolerance.
- The user must be able to choose a filename or receive a clear, project-derived default.
- The interface must show when rendering is in progress and prevent ambiguous duplicate export actions.
- Rendering failures must leave the project unchanged and provide an actionable error.
- Export must work without uploading the project or rendered audio to a server.
- The generated file must use a sample rate, channel layout, and bit depth supported by the agreed target players.
- Long or resource-intensive exports must not make the application appear permanently frozen.

## Open questions

- Does the first export support only full arrangements, or also the current loop/pattern?
- Should muted tracks remain excluded while solo state is ignored, honoured, or explicitly selected?
- What sample rate, bit depth, and channel layout should be used?
- Should authentic low-resolution or bit-crushed export options be included?
- Is WAV sufficient for the hackathon, or is compressed export valuable enough to justify additional dependencies?
- Should visualiser output ever be exported as video, or remain outside this PRD?
- How much tail time should be added for envelopes and effects?
- What composition duration or memory limits must be enforced for offline rendering?
