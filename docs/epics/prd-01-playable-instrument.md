# PRD 01 Epics: Playable Instrument

These epics deliver [PRD 01: Playable Instrument](../product/01-playable-instrument.md). They are ordered by dependency and each ends in an observable increment.

## E01: Audio lifecycle and master signal path

### Outcome

The application can deliberately initialize and recover Web Audio, and all future sound has one controlled route to the browser output.

### User stories

#### US01.1 — Enable audio

As a user, I want to enable audio with an explicit action so that the browser permits the application to make sound.

Requirements:

- The initial interface presents one clear **Enable audio** action.
- Audio does not start before a user gesture.
- Activating the control creates or resumes one application-owned `AudioContext`.
- Repeated activation does not create multiple active contexts.
- The interface reflects running, suspended, and failed audio states.
- A failed or blocked start displays a recovery action rather than failing silently.

#### US01.2 — Route sound through a master output

As a user, I want application volume to be controlled and predictable so that playing is comfortable.

Requirements:

- The graph has one master gain stage between instruments and `AudioDestinationNode`.
- No voice connects directly to the destination.
- Master gain starts at a conservative, non-zero default.
- Master output can be silenced without destroying the audio context.
- The signal path exposes a future connection point for analysis and offline rendering.

#### US01.3 — Recover suspended audio

As a returning user, I want to resume audio after the browser suspends it so that I do not need to reload.

Requirements:

- The application observes the real `AudioContext.state` rather than inferring it from UI state.
- When a gesture is required, the interface offers an explicit resume action.
- Resumption reuses the existing context when valid.
- Disposing the engine releases application-owned audio resources.
- Lifecycle operations are safe when called repeatedly.

### Tangible technical requirements

- Consumers cannot construct their own `AudioContext`.
- The audio service exposes the context's current audio time when ready.
- Lifecycle failures become recoverable application errors, not uncaught exceptions.
- The master signal path is created in one authoritative place.

## E02: Chip voice engine

### Outcome

The engine can start and stop reusable chip-style voices by note and Web Audio time without depending on keyboard or DOM events.

### User stories

#### US02.1 — Play pitched chip voices

As a user, I want distinct chip-style waveforms so that I can choose a recognisable electronic timbre.

Requirements:

- 12.5%, 25%, and 50% pulse, triangle, and sawtooth pitched voices are available.
- A trigger accepts a musical note or frequency and an audio-clock start time.
- The same note has consistent pitch across voice types.
- Notes outside the supported range are rejected or constrained predictably.
- Starting a note returns a stable identifier or handle used to release it.
- Voice triggering has no dependency on DOM or keyboard events.

#### US02.2 — Play a noise voice

As a user, I want a noise-based voice so that the instrument can later support chip percussion and effects.

Requirements:

- Noise is audibly distinct from pitched oscillators.
- Noise passes through the same envelope and master path as other voices.
- Repeated triggers do not allocate unbounded reusable resources.
- Released noise voices stop and disconnect their per-voice nodes.

#### US02.3 — Hear clean starts and releases

As a user, I want notes to begin and end cleanly so that playing does not click or leave stuck sound.

Requirements:

- Every voice uses a short attack and release gain envelope.
- Automation is scheduled against Web Audio time.
- Releasing during attack remains safe and produces a release.
- Repeated release requests are harmless.
- Sources stop, disconnect, and leave the active-voice registry after release.
- Defaults feel immediate enough for live input.

#### US02.4 — Schedule independently of UI timing

As a future sequencer, I want explicit audio-time scheduling so that note timing does not depend on main-thread timer precision.

Requirements:

- Start accepts an absolute Web Audio time.
- Stop accepts an absolute Web Audio time or duration.
- APIs clearly distinguish audio seconds from wall-clock milliseconds.
- Actual note onset does not require `setInterval` or `setTimeout`.

### Tangible technical requirements

- Voice configuration and active voice instances are separate concepts.
- The engine tracks active voice instances and removes completed ones.
- Frequency conversion uses a documented tuning reference.
- Live input and the later sequencer can use the same public trigger API.
- Oscillator and buffer-source nodes never bypass the master path.

## E03: Playable input surfaces

### Outcome

Users can play the same instrument through an on-screen keyboard and a computer keyboard, with shared note state and reliable releases.

### User stories

#### US03.1 — Use the on-screen keyboard

As a user, I want visible musical keys so that I can play without memorizing mappings.

Requirements:

- The interface displays a labelled range of notes.
- Pointer down starts the selected note after audio is enabled.
- Pointer up or cancellation releases the same note.
- Mouse and touch-capable pointer events follow the same path.
- Leaving or cancelling a key cannot leave its note playing.
- Attempting to play before audio is enabled directs the user to enable it.

#### US03.2 — Use the computer keyboard

As a user, I want familiar computer keys mapped to notes so that I can play quickly.

Requirements:

- A documented key row maps to ascending musical notes.
- Key down starts a note and key up releases the same note.
- OS key repeat does not create overlapping voices for one held key.
- Unmapped keys do nothing.
- Musical shortcuts are disabled while typing in editable fields.
- The current mapping is visible or discoverable.
- Simultaneous keys follow the agreed mono/polyphonic policy consistently.

#### US03.3 — See active notes

As a user, I want sounding notes highlighted so that input and audio feel connected.

Requirements:

- Computer-keyboard notes highlight the matching on-screen keys.
- Pointer input uses the same active-note representation.
- Shared note ownership prevents one input incorrectly releasing another.
- Highlights clear when voices end or the panic action is used.

#### US03.4 — Prevent stuck notes

As a user, I want interrupted input to release safely so that sound never continues unexpectedly.

Requirements:

- Live notes release when the window loses focus.
- Live notes release when the document becomes hidden.
- Pointer cancellation releases notes owned by that pointer.
- A visible **Stop sound** action releases every active voice.
- Recovery never requires a reload.

### Tangible technical requirements

- Input adapters translate device events into shared note-on and note-off commands.
- Each note start has enough ownership data to pair it with the correct release.
- Event listeners are removed when their UI is disposed.
- Input code calls the public voice API and never constructs audio nodes.

## E04: Instrument controls and visual feedback

### Outcome

Users can understand and shape the instrument through a small control surface for voice, octave, volume, and essential envelope behaviour.

### User stories

#### US04.1 — Select a voice

As a user, I want to select a chip voice so that I can change the instrument's character.

Requirements:

- Every E02 voice appears under an understandable name.
- One voice is visibly selected by default.
- A change affects notes triggered after the selection.
- Behaviour for already sounding notes is defined and consistent.
- Changing voice does not reset octave, volume, or envelope settings.

#### US04.2 — Change octave

As a user, I want to move the playable range by octave so that I can perform bass and lead parts.

Requirements:

- Controls move the keyboard range up and down by octave.
- The current octave is visibly labelled.
- Limits prevent notes from exceeding the supported engine range.
- Held notes keep their original pitch; new notes use the new octave.
- On-screen labels update after an octave change.

#### US04.3 — Control volume

As a user, I want to change output volume so that listening remains comfortable.

Requirements:

- A labelled control adjusts master gain across a bounded range.
- Its current value is available visually and accessibly.
- Gain changes are smoothed to avoid obvious clicks.
- The control can reach silence.
- Default volume is conservative.

#### US04.4 — Shape note response

As a user, I want limited attack and release control so that the instrument can feel percussive or soft.

Requirements:

- Attack and release controls have bounded ranges and safe defaults.
- Changes affect newly triggered notes.
- Extreme values cannot create invalid automation or permanent voices.
- Labels use musical language and meaningful units.
- A reset action restores all instrument defaults.

### Tangible technical requirements

- Instrument configuration is serializable application state.
- UI controls update configuration rather than arbitrary audio nodes.
- Values are validated before reaching the voice engine.
- Defaults and permitted ranges live in one authoritative location.
- Every control supports pointer and keyboard operation.

## E05: Resilience and recovery

### Outcome

The finished instrument survives common browser interruptions and communicates failure states clearly.

### User stories

#### US05.1 — Recover from interruptions

As a user, I want the instrument to recover from focus, visibility, and audio-state changes so that I can keep playing.

Requirements:

- Focus loss and document hiding release live-input notes.
- Returning shows whether audio is ready or requires resumption.
- A suspended context resumes through an explicit action.
- **Stop sound** remains available whenever sound may be active.
- Repeated suspend/resume cycles do not duplicate event listeners or responses.
- Recoverable errors preserve the current instrument settings.

#### US05.2 — Understand unsupported states

As a user, I want a clear explanation when required audio capabilities are unavailable so that I know what to do.

Requirements:

- Required Web Audio capabilities are checked before the interface claims readiness.
- Unsupported browsers receive a concise message and suggested recovery path.
- Initialization failure does not leave misleading active controls.
- User-facing messages do not expose stack traces.
- Development diagnostics remain available separately.

### Tangible technical requirements

- Errors distinguish unsupported, blocked/suspended, and unexpected states.
- One engine operation releases all active voices.

## Delivery sequence

1. E01 produces an initialized but silent audio foundation.
2. E02 produces sounds callable from a temporary development harness.
3. E03 produces the first genuinely playable experience.
4. E04 produces the complete PRD 01 product experience.
5. E05 hardens it for demonstration.

## Definition of done for PRD 01

- All five epic outcomes are present.
- Every acceptance requirement is met or explicitly removed from scope in the PRD.
- A fresh user can enable audio, choose a voice, play notes, change octave and volume, and stop all sound without developer assistance.
