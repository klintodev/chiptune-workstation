# PRD 26: Klinto Studio V2 product direction

Status: Draft  
Release: Klinto Studio V2  
Owner: Product

## Description

Move Klinto Studio from a step-sequencer-led V1 into a focused browser music workstation built around Piano Roll composition, linked Pattern arrangement, first-party instruments and a bounded Mixer/effects workflow.

This PRD owns the product boundary. PRDs 27â€“32 own the interaction, data, audio and release contracts.

## Product problem

V1 exposes too many regions at once and makes its step grid the centre of the product. The arrangement, editor controls and former visualiser compete for attention, while one-note-per-step Patterns cannot express chords or variable note duration. Sound design is tied to a fixed property form and mixing stops at volume, pan, mute and solo.

The answer is not to add every familiar DAW feature. V2 must change the centre of gravity while remaining understandable, fast and maintainable in a browser.

## Product vision

Klinto Studio V2 feels like a small instrument studio:

- compose one reusable Pattern in a draggable modeless Piano Roll above the persistent Playlist;
- audition it through an explicit track and Klinto-built instrument;
- place linked Pattern clips directly into the Playlist beneath it;
- shape sound in a focused Instrument window;
- mix and add a short, curated chain of Klinto effects;
- keep transport available without keeping every editor visible.

On desktop it adopts FL Studio's separation of Patterns, Playlist, Mixer and devices. It does not copy FL Studio's visual density, unbounded window desktop or native plug-in hosting.

## Product principles

### Music before chrome

- A new project opens with Playlist as the base, its inline Pattern-library `<details>` expanded, and one dominant Piano Roll above it.
- At 1366Ã—768 there is no page-level vertical scroll.
- Primary musical content receives substantially more area than navigation or transport.
- The visualiser does not return.

### Windows without window chaos

- On desktop, Playlist is the persistent base beneath one draggable modeless Piano Roll and at most one draggable modeless Instrument or Effect window.
- Mixer remains the exclusive primary surface: while it is active, Playlist and all modeless composition/device windows are hidden from layout, focus and the accessibility tree.
- The Piano Roll and device windows have approved fixed sizes and bounded drag movement. They are not user-resizable, and their geometry is never persisted.
- Pattern library is an inline collapsible part of Playlist with one compact all-Pattern dropdown and one draggable selected-Pattern card; it has no independent geometry and does not grow into a card grid.
- Windows open, focus and close. V2 does not add pinning, minimizing, maximizing or saved layouts.
- At narrow widths, exactly one fullscreen surface is mounted and exposed at a time.
- Blocking confirmations are true modals; musical work surfaces are not.

### First-party sound system

- Klinto implements all launch instruments and effects using its own browser audio runtime.
- Device types come from closed application registries, never executable project content.
- V2 does not host VST, VST3, Audio Unit, native binaries or arbitrary third-party code.

### Local-first, portable and compatible

- IndexedDB autosave and downloadable project JSON remain first-class.
- V1 projects migrate deterministically without changing their musical meaning.
- Live playback, WAV export and public playback use the same authoritative synthesis/effect definitions.
- An unsupported future device never causes the original project record to be overwritten or disappear.

### Buildable in slices

- Each delivery slice produces a bounded capability with tests.
- A feature flag may hide incomplete V2 work, but it may not conceal incompatible user data in ordinary storage.
- No slice starts an adjacent post-V2 programme.

## Users and core jobs

### Browser-based chiptune creator

The primary user wants to create a musical idea quickly, hear it immediately, turn it into a song and share or export it without installing software.

Core jobs:

- write chords, melodies and bass lines with note lengths and velocity;
- reuse a Pattern across tracks and song positions;
- change the sound assigned to a track without rewriting notes;
- hear a clear mix with a small number of useful effects;
- return later and recover exactly the same project.

### Returning V1 user

The returning user expects an existing project to open, sound materially equivalent, remain editable and survive a V2 save/reload. They must not understand schema migration to stay safe.

### Keyboard and assistive-technology user

The core compose-to-song journey must not depend on precise pointer gestures, canvas-only meaning or decorative knobs. Desktop keyboard and screen-reader support is launch scope, not a later polish pass.

## V2 object model

- **Project:** persisted musical document. Window state is not part of it.
- **Pattern:** project-level, instrument-independent note-event collection with a finite tick length.
- **Track:** owns one instrument instance, one Mixer channel/effect chain and one Playlist lane.
- **Clip:** linked placement of a Pattern on one Track at a tick position; editing the Pattern updates all linked clips.
- **Instrument:** first-party sound generator owned by a Track.
- **Effect:** first-party processor instance in a Track or master serial insert chain.
- **Piano Roll:** draggable modeless Pattern-composition window with a transient audition/destination Track on desktop; fullscreen surface at narrow widths.
- **Playlist:** persistent desktop song-arrangement base and fullscreen narrow-width surface.
- **Mixer:** exclusive Track/master level, pan, mute, solo, metering and insert-management primary surface.
- **Device window:** the one visible draggable modeless Instrument or Effect editor on desktop; fullscreen surface at narrow widths.

## V2 minimum product

### Global shell

- One row, fixed maximum height, containing compact project identity/save state, V1-style transport with direct `↻` Song-loop toggle, Pattern/Song mode, tempo, the inline Master slider/readout and workspace controls.
- Space starts or pauses transport from every Studio surface and non-text control, without scrolling the page or activating the focused control; text fields retain Space for typing.
- Audio enable/state remains visible.
- The recognisable V1 Klinto visual identity and working direct dark/light theme toggle are retained; the visualiser remains removed.
- Project management, help, sharing and account actions live in one secondary menu.
- Exactly one `V2 Beta` badge during Beta.

### Composition

- 96 PPQ shared musical time.
- Polyphonic note events with start, duration, MIDI pitch and velocity.
- Launch snap values: 1/8, 1/16 and 1/32; default 1/16.
- Pointer and desktop-keyboard creation, selection, movement, resize, velocity, delete, copy/paste, undo and redo.
- Explicit audition Track, compact New/Duplicate/Rename/Delete Pattern actions and one-click Add to Playlist.

### Sound

- One instrument per Track.
- Klinto Chip migrates and exposes the existing waveform, octave, attack, release and instrument-output level behaviour.
- Device parameter changes and Reset are undoable and persist.
- Factory/user presets are deferred.

### Mix and effects

- V1 Track volume, pan, mute and solo plus master volume are retained.
- Maximum four serial insert effects on each Track and four on master.
- Launch effects: Klinto Filter and Klinto Delay.
- Add, bypass, reorder, remove, reset and edit with click-safe graph changes.

### Arrangement

- Persistent desktop Playlist with up to eight Track lanes and the existing bounded song length; Mixer alone replaces it as an exclusive primary.
- Linked, fixed-duration Pattern clips.
- Add at the first valid snapped position at or after the session-local Playlist insertion cursor; advance the cursor to the new clip end and fail atomically only when no position fits.
- Select a Pattern from the Playlist library dropdown and click an empty Track position to place it exactly on the snapped click; occupied positions reject without scanning forward.
- Song mode, loop and single-clip select, duplicate, move and delete.

### Persistence and output

- Deterministic V1 migration into one immutable V2 schema shape.
- Local autosave, project switching, JSON download/import, cloud save/open, publication, remix and public playback.
- Live, offline and public audio paths share timing and device definitions.
- Existing ten-minute WAV allocation safety limit remains in force after bounded tails are included.

## Experience requirements

- Opening, moving or closing a desktop modeless window does not stop audio or lose Pattern selection/viewport; activating exclusive Mixer preserves restorable composition context.
- Opening or closing a device does not change musical data or audio ownership.
- Hidden surfaces are unmounted or otherwise absent from layout, tab order and the accessibility tree.
- Focus returns to a connected, visible and enabled origin; destructive lifecycle changes use documented fallbacks.
- Empty states teach the next useful action without adding a second dashboard.
- At 200% zoom, required controls remain reachable without two-dimensional page scrolling.
- Narrow screens expose exactly one fullscreen Playlist (including its inline Pattern-library `<details>`), Piano Roll, Mixer or device surface at a time and support switching, transport, single-note create/select/delete via explicit controls, device parameter editing, save/reload and safe Back/focus behaviour.
- Full touch composition, multi-note gestures and mobile clip rearrangement are post-V2.

## Success measures

### Product validation

- A first-time user can create two Patterns, add both to Playlist in sequence and hear Song playback without opening help.
- A user can open Klinto Chip, change a parameter, close it and return to the unchanged Piano Roll context.
- At 1366Ã—768, the default composition journey has no page-level vertical scroll and shows Playlist beneath one Piano Roll plus no more than one device window; Mixer is never co-displayed with them.
- Qualitative review finds the Piano Roll visually dominant above the useful Playlist base, not another strip in a stacked dashboard.

### Correctness

- Migrated event timing, pitch, duration, velocity, IDs, parameters, routing and mix values match normalized V1 fixtures exactly.
- Deterministic oscillator renders meet the reference-browser tolerance; noise compares scheduling, envelope, gain, duration and spectral bounds unless deliberately seeded.
- Save/reload, export and public playback preserve V2 device/effect state.
- Required E2E journeys fail on uncaught page or console errors.

### Quality

- No known keyboard-only or screen-reader blocker in a required V2 journey at Stable.
- No automatically detectable WCAG 2.2 A/AA violation on required surfaces except a documented false positive with manual evidence.
- Existing V1 unit/integration/E2E checks remain green or are deliberately replaced by stronger V2 coverage.

## V1 capabilities retained

- Project create, rename, switch, delete and local autosave
- JSON download/import and project validation
- Pattern and Song playback, constant tempo and direct V1 `↻` whole-Song loop control
- Up to 64 Patterns, eight Tracks and the existing bounded arrangement duration
- Existing waveform and envelope behaviour
- Track volume, pan, mute and solo; the V1 inline Master slider/readout
- Undo/redo for musical edits
- Cloud projects, sharing, publication, remix and public playback
- WAV export and the existing allocation guard
- Recognisable V1 visual identity, a working direct dark/light toggle, help and account capabilities without redesign

## Cross-cutting constraints

- No new dependency without a separately approved need; launch PRDs assume none.
- Persist stable musical identities, never DOM positions or window geometry.
- Project input is untrusted data. Validate before activating audio or UI state.
- Audio nodes, timers, animation frames and listeners must have explicit owners and disposal tests.
- The shared scheduler/device registry is authoritative; live/export/public paths may adapt it, not reimplement musical rules.
- Every persisted schema version shipped to users remains migratable and never changes shape in place.

## Launch criteria

V2 Beta begins only after the full vertical journey works behind opt-in activation, core keyboard/focus/mobile smoke gates pass and every visible persistence/output route is either V2-capable or explicitly unavailable. Default V2 authoring waits until local, import/export, cloud and hosted/public compatibility are deployed in the safe order defined by PRD 32.

V2 Stable requires all PRD 32 gates, removal of superseded V1 composition UI, documented rollback/recovery and no known P0/P1, data-loss, keyboard-only or screen-reader blocker.

## Out of scope

- Native or third-party plug-in hosting; plug-in SDK or marketplace
- Additional instruments/effects and factory/user presets
- A Rack, separate Keyboard window, unbounded freeform desktop/window manager, user-resizable windows or saved window geometry
- Automation, modulation routing, buses, sends, sidechains or groups
- Audio recording/clips, sample import, MIDI import/export or external MIDI devices
- Tempo maps, time-signature changes, swing, triplets or off-grid editing
- Pattern variants, per-clip overrides or clip stretching
- Full mobile production parity
- Account, cloud, collaboration, sharing, publishing, remixing, theming or help redesign

## Principal risks and controls

- **Scope recreates clutter:** enforce the chrome budget, persistent-Playlist/one-Piano/one-device desktop bound, exclusive Mixer and visual gate before implementation acceptance.
- **Timing migration breaks songs:** migrate every time-bearing field atomically, pin fixtures and share one scheduler projection.
- **Audio paths diverge:** expose first-party processors as shared definitions with live/offline/public adapters.
- **Rollback hides data:** deploy dual-schema validation and V2-read recovery before enabling V2 writes.
- **Canvas excludes users:** require a testable semantic composite-editor contract independent of rendering technology.
- **Mobile becomes a second editor project:** keep the launch boundary to viewing, transport, simple note actions and device parameters.

## Resolved decisions

- Patterns are project-level and instrument-independent.
- A Piano Roll has a transient `auditionTrackId`; it is repaired when Tracks change and is never persisted.
- Tracks own Instrument, Mixer and Playlist-lane state.
- Clips are linked and fixed to Pattern duration.
- Pattern/Song playback mode and the Playlist insertion cursor are session state, not Project data.
- A Project always contains at least one Pattern and one Track; final-object deletion is unavailable.
- V2 launch timing is snapped to 1/8, 1/16 or 1/32 at 96 PPQ; off-grid timing and triplets are deferred.
- Desktop exposes persistent Playlist beneath one draggable modeless Piano Roll and at most one draggable modeless device; Mixer remains exclusive.
- Piano Roll and device sizes are fixed. Their bounded drag positions are session-only and never persisted.
- Reload restores the approved Playlist with its Pattern-library `<details>` expanded and the Piano Roll at its default position.
- Narrow widths expose one fullscreen surface at a time.
- Klinto builds its own web instruments and effects; no native or arbitrary plug-in hosting.
- V2 ships one instrument, two effects and no presets.
- One final V2 schema shape is activated atomically; any later persisted change receives a new version.





