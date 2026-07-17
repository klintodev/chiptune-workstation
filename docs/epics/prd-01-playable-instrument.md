# PRD 01 Epics: Playable Instrument

These epics deliver [PRD 01: Playable Instrument](../product/01-playable-instrument.md). They are ordered by dependency and each ends in an observable, manually testable increment.

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

### Manual acceptance checks

- Open a fresh tab and verify no sound starts automatically.
- Enable audio and verify the visible state becomes ready.
- Activate enable repeatedly and verify behaviour does not multiply.
- Background and restore the tab; resume audio if prompted.
- Mute master output and verify all sound is silent.
- Reload and verify audio again requires an intentional gesture.

## E02: Chip voice engine

### Outcome

The engine can start and stop reusable chip-style voices by note and Web Audio time without depending on keyboard or DOM events.

### User stories

#### US02.1 — Play pitched chip voices

As a user, I want distinct chip-style waveforms so that I can choose a recognisable electronic timbre.

Requirements:

- Square, triangle, and sawtooth pitched voices are available.
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

### Manual acceptance checks

- Play one note with every pitched voice; verify pitch matches and timbre differs.
- Trigger noise and verify it is distinct.
- Play short repeated notes and listen for clicks.
- Hold and release notes; verify they end cleanly.
- Release one voice twice and verify no error or new sound occurs.
- Rapidly trigger and release voices for 30 seconds; verify responsiveness remains stable.
- Schedule a note shortly in the future; verify it does not begin immediately.
- Inspect active voice state after releases; verify completed voices are removed.

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

### Manual acceptance checks

- Play and release every visible key with a mouse.
- Repeat with touch or emulated touch.
- Play every mapped computer key and verify its visible note.
- Hold a key through OS repeat and verify only one voice sounds.
- Type mapped characters in a text field and verify no notes play.
- Hold notes while changing tab and window focus; verify they release.
- Cancel or drag away from pointer input; verify no note sticks.
- Start several notes and use **Stop sound**; verify immediate silence.

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

### Manual acceptance checks

- Select each voice and verify the next note uses it.
- Change voice while holding a note and verify the defined behaviour.
- Traverse every octave and verify labels and pitch direction.
- Try to exceed octave limits and verify controls prevent it.
- Change octave while holding a note; verify its pitch stays stable.
- Sweep volume and listen for clicks; set it to zero and verify silence.
- Exercise minimum and maximum attack/release values.
- Reset the instrument and verify every default returns.
- Operate all controls using only the keyboard.

## E05: Resilience and browser validation

### Outcome

The finished instrument survives common browser interruptions, communicates failure states, and has a repeatable manual release check.

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

#### US05.3 — Use supported browsers

As a user, I want the instrument to behave consistently in its documented browsers.

Requirements:

- Documentation names one primary desktop browser and at least one secondary browser.
- The full PRD 01 manual pass is completed in the primary browser.
- A smoke test is completed in each secondary browser.
- Browser-specific limitations are recorded.
- Blocking failures are fixed or the affected browser is removed from support.

#### US05.4 — Run a repeatable release check

As a developer, I want a recorded manual test run so that demo readiness is visible rather than assumed.

Requirements:

- A test record captures browser, operating system, date, result, and notes.
- Every check has an expected observable result.
- Critical failures are distinguishable from cosmetic issues.
- The demo journey works from a fresh load without developer tools.

### Tangible technical requirements

- Errors distinguish unsupported, blocked/suspended, and unexpected states.
- One engine operation releases all active voices.
- Supported-browser claims reflect actual test results.
- Manual evidence is stored as lightweight Markdown in the repository.

### Manual acceptance checks

- Complete all E01–E04 checks in the primary browser.
- In secondary browsers, enable audio, play each voice, change octave and volume, then stop all sound.
- Repeat tab switching and audio resume several times; verify one response per input.
- Exercise an initialization failure if possible and verify recovery guidance.
- Play rapidly for five continuous minutes and verify responsiveness.
- Complete the intended demo from a fresh page load without developer tools.
- Record the environment, results, limitations, and blocking defects.

## Delivery sequence

1. E01 produces an initialized but silent audio foundation.
2. E02 produces sounds callable from a temporary development harness.
3. E03 produces the first genuinely playable experience.
4. E04 produces the complete PRD 01 product experience.
5. E05 validates and hardens it for demonstration.

## Definition of done for PRD 01

- All five epic outcomes are present.
- Every acceptance requirement is met or explicitly removed from scope in the PRD.
- The complete manual test pass has no unresolved critical failures in the primary browser.
- Secondary-browser smoke-test results and limitations are recorded.
- A fresh user can enable audio, choose a voice, play notes, change octave and volume, and stop all sound without developer assistance.
