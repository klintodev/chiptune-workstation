# PRD 09 Epics: Audio Export

These epics deliver [PRD 09: Audio Export](../product/09-audio-export.md) as a dependency-free, local WAV renderer.

## Scope decisions

- The first release exports the complete arrangement only.
- Export honours mute and solo exactly as live arrangement playback does.
- Output is stereo, 44.1 kHz, signed 16-bit PCM WAV.
- The filename is derived from the project title.
- A tail equal to the longest audible track release plus a small safety margin is rendered.
- WAV is the only format; compressed audio, bit-crushing options, loop export, and video are deferred.
- Exports longer than ten minutes are rejected before allocating the offline buffer.

## E32: Deterministic arrangement render plan

### User stories

#### US32.1 - Translate the arrangement into scheduled notes

As a user, I want export timing and pitch to match playback so the downloaded song is the song I composed.

Requirements:

- Sixteenth-note duration comes from the project BPM.
- Clips resolve their linked patterns and absolute step positions.
- Note gate, velocity, instrument octave, waveform, envelope, instrument volume, track volume, and master volume are retained.
- Muted tracks are omitted and solo state is honoured.
- Arrangement end and release tail produce a predictable render duration.

## E33: Offline Web Audio rendering

### User stories

#### US33.1 - Render without real-time playback

As a user, I want the browser to render my arrangement locally so export needs no recording pass or server.

Requirements:

- `OfflineAudioContext` renders the plan when supported.
- Voice synthesis matches the live engine's supported waveforms and envelopes.
- Rendering does not change transport, project, selection, or history state.
- Unsupported browsers and resource limits produce actionable errors.

## E34: PCM WAV encoding and download

### User stories

#### US34.1 - Download a portable audio file

As a user, I want a clearly named WAV file I can play outside the workstation.

Requirements:

- The rendered stereo buffer is encoded with a valid RIFF/WAVE header.
- Samples are clamped and converted to signed 16-bit PCM.
- The filename is safely derived from the project name and ends in `.wav`.
- Object URLs are revoked after download.

## E35: Export workflow and regression coverage

### User stories

#### US35.1 - Understand export progress and failure

As a user, I want clear feedback while an export is running so I do not trigger duplicates or think the app has frozen.

Requirements:

- A visible Export WAV action lives with other project file actions.
- The action becomes disabled and reports rendering progress until completion.
- Failure leaves the project untouched and displays the reason.
- Focused tests cover timing, audible-track selection, duration limits, and WAV structure.
