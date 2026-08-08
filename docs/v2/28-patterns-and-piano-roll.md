# PRD 28: Patterns and Piano Roll

Status: Draft  
Release: Klinto Studio V2  
Depends on: PRDs 26â€“27

## Description

Replace V1's one-note-per-sixteenth-step Pattern and step editor with a shared tick/event foundation and an independently addressable Piano Roll presented as a draggable modeless desktop window above Playlist.

This PRD owns every musical-time conversion required by V2: the content-derived Pattern span, note events, Playlist clip starts and transport loop bounds. Playlist presentation is delivered by PRD 31, but it consumes this completed tick model. No production V2 document is written until PRD 32 activates the final schema.

## Product outcome

A user can write chords and melodies, set note duration and velocity, audition through a chosen Track and add the linked Pattern to Playlist. The Piano Roll is the dominant first-run desktop window above the useful Playlist base and is fully operable with pointer or keyboard.

## Pattern ownership and audition context

- Patterns remain project-level, reusable and independent of Instrument or Mixer state.
- One Piano Roll session surface is keyed by stable Pattern ID.
- Each surface owns transient `auditionTrackId`; it is not Pattern data and is never persisted.
- First open uses the current valid Track, falling back to the first Track.
- Opening from a Playlist clip sets audition Track to that clip's Track. Merely returning to the surface preserves its current audition Track.
- Deleting its Track repairs the value before render and preserves Pattern selection/viewport.
- Pattern-mode playback and Add to Playlist use the explicit audition Track.
- Editing a Pattern updates every linked clip. Duplicating creates a new Pattern and new note IDs.
- V2 does not adopt multi-channel Patterns or per-clip note overrides.

## Shared musical-time model

### Resolution and snap

- Serialized resolution is 96 pulses per quarter note (PPQ).
- Quarter = 96 ticks; eighth = 48; sixteenth = 24; thirty-second = 12.
- Launch snap options are 1/8, 1/16 and 1/32; default is 1/16.
- Newly created notes snap both edges. Move and resize commands apply the active snap as a delta from the note's existing start/end, preserving duration or the untouched edge and preserving any legacy phase.
- Exact migrated endpoints at 6- or 18-tick gate durations remain visible and unchanged even though launch creation snap bottoms out at 12 ticks. Move, copy and resize-by-delta preserve that phase. There is no automatic quantization; an explicit Quantize feature is post-V2.
- V2 remains constant-tempo 4/4. Off-grid/free timing, triplets, swing, tempo maps and time-signature editing are deferred.

### Pattern

A Pattern has stable `id`, `name` and a bounded note collection. Its serialized integer `lengthTicks` is canonical derived data for scheduling and clip layout, never a user-selected size.

- `lengthTicks = max(1, max(note.startTick + note.durationTicks))`; an empty Pattern's one-tick span is a transport implementation detail.
- Content may end on any integer tick from 1 through 3,072; there are no bar-sized choices or length increments.
- The Piano Roll always shows writable grid beyond the current content, with at least one bar visible, without adding that empty editor space to the Pattern duration.
- Reaching the right edge during a draw, move or resize drag extends that writable grid by exactly one 4/4 bar. Continued dragging can extend it another bar, up to the content limit; empty grid never changes Pattern duration.
- Notes are canonically serialized by `startTick`, then `pitch`, then stable ID.
- Initial safety limits: 1,024 notes per Pattern and 8,192 notes per Project, still subject to file/cloud byte limits.

Every note mutation recomputes the Pattern span in the same command and undo entry:

- Moving, adding, pasting or extending content past the current end grows the Pattern to the exact latest note end.
- Moving, deleting or shortening the latest content shrinks the Pattern to the next latest note end, or one tick when empty.
- Growth preflights every linked clip at its unchanged start. If any linked clip would overlap another clip on its Track or exceed the song boundary, reject the complete note command and explain why.
- Shrinkage shortens every linked clip in place and never deletes or truncates unrelated notes.
- No automatic span update may partially mutate a Project.

### Note event

Each note contains:

- stable `id`;
- integer MIDI `pitch` from 36 through 112;
- integer `startTick >= 0`;
- positive integer `durationTicks`;
- numeric `velocity` from 0 through 1.

Invariants:

- `startTick + durationTicks <= 3,072`; canonical `pattern.lengthTicks` becomes the greatest note end.
- Notes of any pitch, including the same pitch, may overlap. Stable note/voice IDs distinguish occurrences; the existing voice cap remains the safety boundary.
- Touching notes remain separate events.
- Move, resize and velocity changes preserve ID; copy/duplicate creates a new ID.
- Zero-velocity events remain valid/persisted but never trigger an audio voice, matching V1 behaviour.
- The Track Instrument's octave offset is applied at playback; Klinto Chip must keep effective pitch within MIDI 12â€“136.

### Clips and loop bounds

- Playlist clips retain stable ID and Pattern reference but use integer `startTick`.
- Clip duration is always the referenced Pattern's current content-derived `lengthTicks`.
- Transport loop state uses `{ enabled, mode, startTick, endTick }`; `mode` remains `custom | arrangement`, `endTick` is exclusive and greater than `startTick`, and arrangement mode continues to follow the computed song end.
- The user-facing `↻` control is contextual. In Song mode, enabling it sets arrangement mode over `[0, currentSongEnd)` and disabling it stops Song playback at the arrangement end. In Pattern mode, it toggles repetition over exactly `[0, pattern.lengthTicks)`; disabled Pattern playback runs once and stops at that content end. Pattern-loop state is transient workspace state and does not alter Project data.
- The existing maximum song duration is converted exactly from sixteenth steps to ticks.
- Pattern, clip and loop fields switch to ticks as one foundation. Step and tick fields never coexist in an activated schema.

## V1 migration

For each populated V1 Pattern step:

- `pitch = step.note`
- `startTick = stepIndex * 24`
- `durationTicks = max(1, round(step.gate * 24))`
- `velocity = step.volume`
- note ID is generated by a deterministic, collision-safe migration helper whose fixed namespace/algorithm is pinned by fixtures
- `lengthTicks = max(1, max(startTick + durationTicks))` after populated steps are converted; unused trailing V1 steps do not become Pattern duration

For every V1 time-bearing placement:

- `clip.startTick = clip.startStep * 24`
- `loop.startTick = loop.startStep * 24`
- `loop.endTick = loop.endStep * 24`
- `loop.mode = loop.mode` (`custom | arrangement`), retaining arrangement auto-follow behaviour

Migration preserves valid Project, Pattern, Track and clip IDs, names, ordering, links and all non-time musical state. V1 `rootOctave` is dropped because it never affects stored-note playback. Initial Piano Roll view centres on the first note's octave, or C4 when empty; `rootOctave` is excluded from audio parity.

Migration is pure, deterministic, idempotent at the normalization boundary and never mutates the source record.

## Scheduler and live-edit contract

One normalized tick-to-occurrence projection is shared by Studio playback, public playback and offline export.

- Convert ticks through constant BPM without cumulative step drift.
- Schedule every occurrence entering the existing look-ahead window, including simultaneous and overlapping notes, under one deterministic 16-voice-per-Track arbitration policy.
- Per Track, occurrences sort by absolute `startTick`, then pitch, note ID and clip ID before submission. The runtime retains V1's insertion-order cap: before the 17th trigger, retire the oldest inserted scheduled/sounding/releasing voice at the new occurrence time, then admit the new voice. Scheduled future and release-tail voices count until retired/ended. The shared projection/runtime applies this exact order in live, WAV and public playback.
- Own voices by Project, transport mode, Track, clip, Pattern, note and occurrence identity.
- Pattern mode loops at the Pattern's content-derived `lengthTicks` only while its contextual loop is engaged; otherwise it plays once. Song mode adds Pattern-relative tick to `clip.startTick`.
- Gate ownership ends at the Pattern/clip boundary. Normal Instrument release and Effect tails may ring across that boundary; a note gate may not leak into the next iteration.
- Zero velocity produces no voice.

Committed edits during playback follow this launch policy:

- occurrences not yet submitted to Web Audio use the new state;
- already scheduled occurrences keep the scheduled state, avoiding broad graph rebuilds;
- deleting, moving or changing pitch of an actively sounding note immediately releases only that owned voice through the normal anti-click release, then future occurrences use the edit;
- shortening an active note releases it when the new end is at/before the current play position; otherwise its already scheduled end remains for that occurrence;
- extending an active note does not extend that already scheduled occurrence; the next occurrence uses the new duration;
- velocity changes affect future note-ons only;
- stop, seek, Project/Track/Pattern deletion and mode switch release all invalid owned voices and cannot leave a stuck note.

Tempo changes rebuild only future scheduling from a stable tick playhead. Tests define the small look-ahead boundary rather than promising impossible sample-instant cancellation.

## Piano Roll window

### Persistent header

Only these groups remain permanently visible:

- Pattern identity/switcher;
- audition/destination Track;
- active tool and snap;
- Add to Playlist.

History is grouped; Piano Roll zoom has no buttons and is controlled only by `Mod+wheel` over the editor. The Pattern switcher menu owns New, Duplicate, Rename and Delete. New creates an empty automatically sized `Pattern N`, activates its Piano Roll, preserves the current valid audition Track and focuses the editor as one undoable command. At 64 Patterns, New/Duplicate are disabled with a reason. Delete is disabled for the final Pattern; undoing creation closes the removed surface and restores the prior Pattern/switcher focus. The audition-Track control changes destination only: Piano Roll contains no `Open Instrument` action or other Instrument launcher. The header does not duplicate transport, Mixer or Project controls.

### Editor

The editor shows pitch rows, bar/beat grid, notes, selection and a visual playhead. Velocity appears only for selection/property editing, not as a permanent full-width lane. `Control+wheel` on Windows/Linux and `Command+wheel` on macOS zoom around the pointer; ordinary wheel/trackpad input pans or scrolls. Zoom and pan never modify musical data or invoke page zoom while the editor owns the gesture.

Launch tools:

- **Draw:** click/drag empty space to create one snapped note with default duration of one snap; drag a note to move; drag its end handle to resize.
- **Select:** select one or a bounded group, marquee, move, copy/paste and edit properties.
- **Pan:** explicit pan tool plus unmodified wheel/trackpad scrolling that cannot create notes.
- **Zoom:** `Mod+wheel` over the editor changes viewport scale; no zoom button is rendered.
- **Context click:** right-clicking empty editor space suppresses the browser context menu and makes no change; right-clicking a note deletes that note as one undoable command.

Every gesture previews a proposed change but commits one atomic domain command on completion. Invalid boundaries or caps reject the complete gesture and announce the reason. Pointer cancellation makes no change.

## Keyboard and semantic editor contract

The Piano Roll exposes one named composite editor entry point using managed cursor/active-descendant semantics or an equivalent testable model.

- `Mod` means Control on Windows/Linux and Command on macOS. Tab enters/exits the editor; commands below act only while it owns focus.
- With no note selected, Left/Right move the cursor by active snap and Up/Down by semitone. Enter selects the note at the cursor or creates the default snapped note when empty.
- With a note selected, `Mod+Left/Right` moves its start by one snap while preserving duration; `Mod+Up/Down` transposes one semitone; `Mod+Shift+Left/Right` shortens/extends the end by one snap delta; `[`/`]` changes velocity by 0.05 within 0â€¦1. Invalid boundary/pitch/duration edits reject atomically and announce why.
- Escape clears selection and returns the managed cursor to the note start. Delete/Backspace removes selection only while the editor owns focus and never triggers browser navigation.
- Space controls transport only from the editor/background; native controls and text fields retain native Space/Enter behaviour.
- `Mod+C`, `Mod+V`, `Mod+Z` and platform redo follow conventions; commands are ignored in incompatible text fields. Launch does not assign other Shift/arrow combinations.
- While the editor owns focus, editor commands take precedence over computer-key audition. Audition requires an explicit visible mode or non-conflicting mapping and can always be exited.

Committed cursor movement announces Pattern, bar/beat, pitch and empty/note state. Selection announces note count and, for one note, pitch, start, duration and velocity. Playhead animation, pointer previews and meter frames never write to that announcement channel.

Cursor and selection repair deterministically after delete, automatic Pattern-span changes and undo. A canvas implementation must pass the same keyboard, focus and screen-reader contract as a DOM implementation.

## Add to Playlist

The action is always visible. It is disabled with `Add a note with non-zero velocity first` when the Pattern has no audible note. Otherwise it delegates to PRD 31 using `auditionTrackId` and the session-local Playlist insertion cursor, which defaults to tick 0 and never advances during Pattern playback. PRD 31 finds the first valid snapped position at or after that cursor. On desktop, success keeps the modeless Piano Roll available above Playlist, selects/reveals the new clip and advances the insertion cursor to its end; at narrow widths it switches to fullscreen Playlist. Failure leaves Piano Roll active and explains that no valid space remains.

## Responsive boundary

Desktop supports the full pointer and keyboard contract in its modeless window. At approximately 390Ã—844, Piano Roll is the only exposed fullscreen surface and guarantees view/pan, cursor/select, explicit single-note create/delete, transport, Pattern/Track switching, save/reload and safe Back/focus. Multi-note touch selection, drag move/resize, velocity gestures and precision touch parity are post-V2. Touch targets for required explicit controls meet the target-size policy.

## Performance and reliability

- Editing and viewport work stay responsive at 1,024 notes in one Pattern and 8,192 per Project on the reference browser/device profile.
- Playhead movement updates through one owned animation loop and does not cause full-editor React renders per frame.
- Hidden Piano Rolls perform no animation or layout work.
- Clipboard input, imported notes and migrations pass the same validator and caps.
- Project/Pattern/Track removal, reload and switch dispose scheduled voices, listeners and workers owned by the old state.

## Acceptance criteria

### Musical/time foundation

- V1 step fixtures map exactly to 24-tick boundaries; clips and loops move to ticks in the same normalized result, and direct `↻` enable targets the full current Pattern or Song according to playback mode.
- A Pattern supports chords and overlapping same-pitch notes with distinct stable IDs.
- Pitch 36â€“112, duration, boundary, velocity and count validation rejects malformed input before audio activation.
- Pattern increase preflights all linked clips; decrease removes/truncates disclosed notes as one undoable command.
- Pattern, Song, loop, seek, tempo change, live, offline and public occurrence projections agree.

### Editor and lifecycle

- A new desktop Project opens Pattern 1 Piano Roll above visible Playlist; no second Piano Roll, device or Mixer competes with it.
- Pointer and keyboard journeys create, select, move, resize, change velocity, delete and undo notes on desktop.
- `Mod+wheel` zooms without zoom buttons; empty right-click is suppressed/no-op, note right-click deletes, and Piano Roll exposes no Instrument launcher.
- Open-from-clip changes audition Track; ordinary surface return preserves it; Track removal repairs it without closing the Pattern.
- Active-note delete/move/pitch change releases the owned voice without stuck notes or unrelated cut-offs.
- New/Duplicate/Rename/Delete obey the 64-Pattern cap and final-Pattern rule; undo of active-Pattern creation/deletion repairs the surface and focuses a visible Pattern control.
- At 1366Ã—768 the fixed-size draggable window stays bounded above Playlist with no page scroll; at 200% zoom required editor and grouped actions remain reachable.

## Automated coverage

- Pure migration fixtures for Pattern, clip and loop time/mode, deterministic IDs, `rootOctave` removal and 6/18-tick legacy endpoint editing
- Validation/property tests for event invariants, limits, ordering and automatic Pattern-span atomicity
- Scheduler tests for chords, same-pitch overlap, deterministic simultaneous ordering/oldest-voice retirement, V1 direct whole-Song `↻` loop boundaries, tempo/seek/stop and the live-edit policy
- Shared occurrence-projection parity tests for Pattern, Song, offline and public adapters
- Desktop Playwright pointer and exact keyboard-command compose journeys covering create, move, transpose, resize, velocity, right-click rules, `Mod+wheel`, delete, undo and focus/announcement checks, including absence of zoom buttons/Instrument launcher
- 1366Ã—768 Playlist-under-window layout and 390Ã—844 single-fullscreen-surface smoke tests
- Lifecycle/leak coverage for Pattern/Track/Project deletion and surface switching

## Delivery slices

1. **Musical-time domain:** event Pattern plus tick clip/loop models, validators, complete pure V1 normalization and fixture tests.
2. **Shared occurrence projection:** scheduler ownership and live-edit tests; live/offline/public adapters consume it behind the V2 flag.
3. **Read-only Piano Roll:** semantic cursor, rendering, viewport and bounded performance fixture.
4. **Editor commands:** draw/select/pan, `Mod+wheel` zoom, context-click delete/suppression, keyboard commands, clipboard, Pattern operations and undo/redo.
5. **Audition/Add integration:** transient Track context, Klinto Chip hand-off and PRD 31 command boundary.
6. **Responsive/accessibility closure:** desktop assistive journey, 200% zoom and reduced mobile smoke.

These slices use feature-flagged in-memory fixtures or isolated development storage. They do not activate an ordinary persisted V2 schema; PRD 32 does so only after the final device/mixer shape and every exposed route are ready.

## Out of scope

- V1 step-editor compatibility mode after migration
- Multi-channel Patterns or per-clip note overrides
- Off-grid/free timing, triplets, swing, tuplets or groove templates
- Tempo maps and time-signature changes
- Expression lanes beyond velocity, automation or MPE
- Humanize, quantize dialogue, scale helpers, chord generators or MIDI import/export
- Full mobile gesture parity
- Piano Roll zoom buttons, an in-window Instrument launcher or arbitrary/custom editor context menus
- User resizing or persisted Piano Roll geometry

## Resolved decisions

- 96 PPQ; 1/8, 1/16 and 1/32 creation snap only; default 1/16. Migrated 6/18-tick durations remain exact until explicitly resized.
- Serialized Pattern pitch remains MIDI 36â€“112; octave offset is Track Instrument state.
- Same-pitch overlaps are allowed and bounded by voice/count caps.
- Clip starts and loop bounds migrate with Pattern events in this foundation.
- V1 `rootOctave` is removed from musical data; the view initializes deterministically.
- Pattern span follows its notes exactly; growth preflights linked clips and shrinkage follows removal/move/shortening without a separate length action.
- Already submitted Web Audio occurrences are not broadly rescheduled; active destructive edits release the owned voice, and future occurrences use new state.
- Overflow deterministically retires the oldest inserted Track voice after canonical occurrence ordering, matching the V1 runtime cap.
- Playback mode and Playlist insertion cursor are session state; Pattern playback never moves the insertion cursor.
- The direct `↻` control toggles the complete current playback context: the active Pattern in Pattern mode or the full arrangement in Song mode.
- Piano Roll uses `Mod+wheel` zoom with no zoom buttons or Instrument launcher; empty right-click is suppressed and note right-click deletes.
- A Project always retains at least one Pattern.
- Normal release/effect tails may cross Pattern boundaries; gates may not.
- The production schema cutover is deferred to PRD 32's atomic activation gate.







