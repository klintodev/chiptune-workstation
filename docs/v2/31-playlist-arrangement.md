# PRD 31: Playlist arrangement

Status: Draft  
Release: Klinto Studio V2  
Depends on: PRDs 27â€“29

## Description

Turn V1's arrangement into the persistent desktop Playlist base for placing and editing linked Pattern clips. One draggable modeless Piano Roll and one draggable device may sit above it; Mixer alone replaces it as an exclusive primary.

This PRD consumes PRD 28's tick-based clip and loop model. It owns presentation, commands, navigation and focusâ€”not another schema migration.

## Product outcome

A user writes a Pattern, chooses Add to Playlist, immediately sees the new linked clip selected on the intended Track, arranges copies, plays Song mode and opens any clip back into its Pattern with the correct audition Track.

## Playlist surface

Playlist fills the desktop workspace beneath the global shell and modeless windows and contains:

- compact title, active snap and zoom/navigation actions;
- Track headers and aligned timeline lanes;
- bar/beat ruler, playhead and optional loop range;
- clip selection and compact property/action area;
- one useful empty state with an explicit `Open Piano Roll` action when Playlist is opened without clips.

The Pattern editor, Instrument parameters and Mixer strips are not rendered inside Playlist. At 1366Ã—768, eight compact Track headers/lanes remain reachable through internal scrolling with no page-level scroll.

Playlist opens with the Pattern library expanded as an inline `<details>` section above the lanes. Its labelled summary toggles the section without changing Project data; it remains ordinary Playlist content with no independent geometry, and reload restores it expanded.

The library uses one compact dropdown containing every Pattern in Project order and renders one draggable card for the selected Pattern only, so its height does not grow with the Pattern count. The selected card exposes Add context, opens for editing when double-clicked, and has a labelled cog action menu for Open, Rename, Duplicate, Length and Delete. Its New Pattern action creates and selects the Pattern, then immediately opens that new Pattern in the reusable Piano Roll. Disabled cap/final-Pattern actions retain their reasons. Opening a Pattern focuses/reuses the one Piano Roll window; library actions use the same atomic commands and focus repair as PRD 28.

At narrow widths, Pattern library remains the same collapsible section inside fullscreen Playlist, so exactly one surface remains mounted/exposed.

## Track model

V2 retains one-to-one Track ownership:

- one Playlist lane;
- one Instrument;
- one Mixer channel/effect chain;
- stable Track ID, name and order.

Limits remain one to eight Tracks. A prominent Add Instrument action in Playlist and Mixer creates the next uniquely named Track with PRD 29's default Klinto Chip, default Mixer state and empty clips/effects, focuses its Track header, and commits one undo entry. The Playlist exposes one Add Instrument row directly beneath the final Track, aligned with the sticky Track-header rail and reachable through Playlist scrolling while Piano Roll is raised. At eight Tracks it remains visible but disabled with a reason. Reordering changes Playlist and Mixer order together as one command. Removing a Track discloses/removes its clips and disposes its Instrument/effects as one undoable command; the final Track's Remove action is disabled because a Project always retains one Track.

Every Playlist Instrument row exposes compact Mute and Solo switches. They are alternate controls for the owning Track's canonical `mixer.muted` and `mixer.solo` fields, not separate Instrument state: Playlist and Mixer always show the same pressed values through edits, undo/redo and Project replacement. Multiple Tracks may be soloed, and mute always wins when a Track is both muted and soloed. Each activation commits one undoable/autosaved Track Mixer command without selecting the Track, opening the Instrument or changing transport.

Right-click routing uses the most specific target under the pointer: a clip first, its Klinto Chip Instrument launcher second, then the remaining Track header or empty lane. Every handled route suppresses the browser menu. A clip keeps its direct-delete command. The Instrument launcher opens the Track-scoped menu in the order Rename Instrument, Duplicate Instrument, New Pattern; the remaining Track area exposes New Pattern only.

Rename Instrument edits the owning Track's canonical persisted `name`; it does not add `instrument.name`, mutate `instrument.instanceId` or rename the immutable Klinto Chip product/type. The shared name updates the Instrument launcher's owner line, Track header, Mixer channel, device-window title and contextual labels live while the same Instrument/runtime remains open. A valid changed name is trimmed, bounded to the Track-name contract and commits one undo/autosave entry. Cancel, an unchanged trimmed value or invalid input commits nothing. After success, cancel or validation failure, focus returns to the same stable Instrument launcher or the documented Track fallback.

Duplicate Instrument creates an independent Track immediately below the source so the one-Track/one-Instrument invariant remains intact. It copies the Klinto Chip type, version and full parameter snapshot, allocates fresh Track and Instrument instance IDs and derives a bounded unique owner name such as `Pulse 1 copy`. It deliberately does not copy clips, Effects or Track Mixer volume/pan/mute/solo; those collections are empty and the Mixer starts at its defaults. The source Instrument and runtime are not changed or reopened.

The duplication is one undoable/autosaved Project command. Success makes the copy the Playlist destination, clears clip selection and focuses its Instrument launcher without opening the device; undo removes it and redo restores the same identities. Duplicate Instrument remains visible but disabled with the Track-cap reason at eight Tracks. A disabled activation changes neither Project, history, transport nor focus.

New Pattern creates one empty automatically sized Pattern, makes the clicked Track the Playlist destination and Piano Roll audition Track, selects the Pattern and immediately opens its reusable Piano Roll. It does not create a clip; placement remains an explicit Playlist action after the Pattern has audible content. The menu closes on action, outside interaction, Escape, scrolling, resize or surface replacement, and New Pattern is disabled with its existing reason at the 64-Pattern cap.

Track removal closes only device presentations owned by that Track. Pattern surfaces remain open because Patterns are project-level. Any Pattern whose `auditionTrackId` referenced the removed Track rebinds to the first surviving Track while preserving Pattern selection and viewport.

## Clip model and invariants

A clip contains stable `id`, `patternId` and integer `startTick`; destination is its owning Track. Duration is always the referenced Pattern's current content-derived `lengthTicks`.

- Clip starts are snapped to 1/8, 1/16 or 1/32; default 1/16.
- Clips may touch but may not overlap another clip on the same Track.
- A clip must end within the existing song boundary: 6,144 ticks, the exact conversion of V1's 256 sixteenth-step limit.
- The Pattern reference must resolve before Project activation.
- Editing a Pattern changes every linked clip's content/duration automatically.
- A note edit that grows the Pattern follows PRD 28's all-linked-clip preflight and rejects atomically on overlap/boundary failure.
- A note edit that shrinks the Pattern shortens linked clips in place and cannot create an overlap.
- Clip move/duplicate preserves the Pattern link. There is no per-clip note data, stretch, transpose, gain or independent variant in V2.

## Add to Playlist

The action is always visible and names/previews its computed destination. It is disabled with a reason until the active Pattern contains a note with `velocity > 0`.

It uses active Pattern, the Pattern surface's valid `auditionTrackId`, active snap and session-local `playlistCursorTick` (default 0). Pattern playback never advances this cursor.

Placement is deterministic and atomic:

1. Snap the cursor and try that position on the destination Track.
2. If occupied, scan forward by the active snap until the first non-overlapping placement that ends by tick 6,144.
3. On success, create one clip, set Song playhead to its start, advance `playlistCursorTick` to its end, switch session playback to Song, select/reveal the clip in the persistent desktop Playlist and focus its context; at narrow widths, switch from Piano Roll to fullscreen Playlist.
4. If no position fits, create nothing, remain in Piano Roll and explain that the Track has no valid remaining space.

In Playlist, selecting a Pattern in the expanded library and left-clicking an empty Track position places that active Pattern at the exact snapped position on the clicked Track. It does not scan forward when the position is occupied: an invalid placement creates nothing and announces why. Drag-and-drop retains the same exact-placement semantics, while `S` remains the explicit command for moving the Song playhead to the Playlist cursor.

It creates one undo history entry and one autosave revision. A tested two-Pattern journey must place both sequentially without the user manually moving the cursor.

## Clip editing

Desktop pointer and keyboard commands support one or more selected clips:

- plain click selects one clip, while Control/Command-drag from an empty lane draws a marquee that replaces the selection with every intersecting clip across Tracks;
- dragging any selected clip moves the complete selection by one snapped tick delta and one Track delta while preserving IDs and relative offsets;
- Control/Command+B duplicates the selected bounding block immediately to its right, preserving Pattern links, Tracks and internal gaps, then selects the new copies so the command can be repeated;
- the duplicate offset is the exact span from the earliest selected start to the latest selected end;
- move and duplicate preflight the complete candidate and commit one undo entry, rejecting without partial mutation when any clip would collide, cross a Track/song boundary or exceed a Track limit;
- right-clicking a clip deletes exactly that clip; otherwise the Instrument launcher takes priority over its Track and exposes Rename Instrument, Duplicate Instrument and New Pattern, while the remaining Track area exposes New Pattern without changing any clip;
- undo/redo.

Drag previews never mutate the Project until drop. Invalid drops restore the original position and announce why. Pointer cancellation commits nothing. Reorder/move keeps focus tied to stable clip identity, not its old lane/cell. Clip right-click suppresses the browser context menu and deletes exactly that clip as one undoable command; Instrument-launcher right-click opens Rename Instrument/Duplicate Instrument/New Pattern, and the remaining Track header or empty lane opens the Track-scoped New Pattern menu.

Empty-lane left-click adds the active Pattern at the exact snapped position on that Track. Clicking a clip continues to select it and never creates another clip.

## Timeline, playhead and transport

- Timeline coordinates derive from ticks; pixels are presentation only.
- Zoom changes viewport, never clip data.
- Horizontal navigation reaches the full 6,144-tick boundary through internal scrolling.
- `playlistCursorTick` is session-local insertion/navigation state. It defaults to 0, changes only through explicit Playlist navigation/seek or successful Add, and never advances during Pattern playback.
- Pattern phase, Song transport playhead and Playlist insertion cursor are distinct values. An explicit Song seek sets Song playhead and insertion cursor together; playback advances only the playhead.
- Clicking the bar/beat ruler performs an explicit seek to the nearest active Playlist snap, switches transport to Song mode and sets both the Song playhead and Playlist insertion cursor without adding a clip.
- Pattern mode auditions the active Pattern through its `auditionTrackId` and does not traverse clips.
- Song mode schedules all valid clips through their destination Track chains.
- Stop, return-to-start, seek, tempo and mode switch retain V1 semantics projected into ticks. The first Stop during playback returns to the start of that playback pass; a ruler seek replaces that return point, and it survives Pause/Resume. Stop remains available at a non-zero return point, and activating it again—such as the second click of a double-click—returns the scheduler, every playhead and the Playlist cursor to tick 0. The direct `↻` control enables a whole-Song arrangement loop over `[0, currentSongEnd)` or disables it; Pattern playback repeats independently.
- Loop uses PRD 28's exclusive tick bounds plus retained `custom | arrangement` mode and does not duplicate Effect state at wrap.
- Visual playhead animation is silent to assistive technology and owned by one disposable loop.

## Pattern navigation

Opening a clip focuses/reuses the referenced Pattern's modeless Piano Roll above Playlist and explicitly sets its `auditionTrackId` to the clip's Track. It preserves/repairs the Pattern viewport according to PRD 28. At narrow widths, this navigates to fullscreen Piano Roll. Merely returning to an already-open Pattern does not change its audition Track.

Deleting a non-final Pattern discloses and removes all linked clips as one undoable command, closes only that Pattern surface and focuses the nearest surviving Pattern control/global switcher. The final Pattern cannot be deleted. Undo restores data but does not reopen the surface automatically.

## Composite timeline accessibility

Playlist exposes one named multi-select timeline/grid entry point with a primary selected clip for focus; empty tick cells are not individual Tab stops.

- Control/Command + wheel anywhere over Playlist scrolls its timeline horizontally and suppresses browser zoom and page scrolling; Piano Roll retains its separate Control/Command + wheel zoom gesture.
- Tab enters/exits the timeline in Navigation mode. Left/Right move `playlistCursorTick` by snap; Up/Down change the destination Track; none mutates a clip.
- Enter selects the clip under the cursor, or announces the empty position. With clips selected, Enter opens the primary clip's Pattern and Escape clears the selection back to Navigation mode at its start.
- With clips selected, Alt+Left/Right moves the group by snap and Alt+Up/Down moves it one Track after atomic validation. The explicit Duplicate action and platform `Mod+B` duplicate the group to the right; key repeat is ignored.
- Space toggles transport throughout Studio from the timeline, surfaces and non-text controls, without scrolling or activating a focused control. Repeated keydown does not retrigger transport, text fields retain Space for typing and platform undo/redo remain available.
- A single-clip announcement includes Pattern name, destination Track, start bar/beat, duration and selected state; a group announces its selected count. Animation frames never update the announcement channel.
- Commands take precedence only while the timeline owns focus; visible focus follows the stable primary clip identity through move/reorder/undo.

When selected clips disappear, invalid IDs are removed and the primary promotes the first surviving selected clip. If none survives, focus/selection uses this order, skipping invalid targets before render:

1. nearest surviving clip;
2. same Track header;
3. Playlist heading.

When no clip survives, the empty state's `Open Piano Roll` action follows the heading in normal tab order; focus is not moved to it implicitly.

Removing the final clip keeps the desktop Playlist base and default Pattern library visible with a useful empty actionâ€”there is no blank gap or hidden focused element. Opening Piano Roll leaves Playlist beneath it; exclusive Mixer and narrow-width fullscreen navigation are the only cases that hide the base.

## Responsive boundary

At approximately 390Ã—844, Playlist is the sole exposed fullscreen surface and supports viewing, panning, managed clip selection, playback/seek, collapsing/expanding its inline Pattern library, opening a Pattern and returning safely. Piano Roll and devices replace Playlist rather than overlaying it. Add from Piano Roll remains supported. Precision multi-clip gestures and repeat editing on touch are post-V2; required actions may be exposed as explicit buttons/property controls rather than tiny timeline handles.

## Persistence and lifecycle

- Clip/Track commands persist through the final V2 schema owned by PRD 32.
- `Track.name` is the sole persisted owner/Instrument display name. Instrument type and identity remain the strict PRD 29 fields; Playlist rename never adds another schema key.
- Duplicate Instrument reuses the existing Track/Instrument schema with fresh identities and copies only the strict Instrument contract; it introduces no alias or duplication-only field.
- Opening, importing, switching, deleting or undoing Projects repairs selected Track, selected clip IDs/primary, Pattern phase, Song playhead, Playlist insertion cursor, loop and Pattern audition contexts before render.
- Invalid/missing Pattern references or overlapping/out-of-bound clips fail normalization; they do not enter audio state.
- Removing a Track containing the final clip updates Playlist immediately, closes only owned device UI, releases owned voices and applies the focus fallback.
- Playlist hidden by exclusive Mixer or narrow-width navigation performs no animation or layout work.

## Acceptance criteria

### Core journey

- Use the default-expanded inline Pattern library and Piano window to create two audible Patterns and choose Add to Playlist from each without manually moving the cursor; both appear sequentially in the persistent Playlist, the second scanning past any collision.
- Success switches to Song mode, selects the new clip and advances the insertion cursor; a full Track fails without mutation or surface switch.
- Song playback uses destination Instrument/Mixer/Effect chain; Pattern playback uses the explicit audition Track.
- Clicking the ruler at a snapped Song position, playing, then pressing Stop returns to that position; pressing Stop again returns to tick 0.
- Opening a clip returns to its Pattern and changes audition Track to that clip's Track.

### Editing/lifecycle

- Control/Command-drag marquee selection, group drag/Alt+arrow move and Control/Command+B duplicate-right preserve stable identities, links and relative offsets while enforcing overlap/boundary rules atomically.
- Selecting a Pattern in the library and clicking an empty Track position adds that Pattern exactly at the snapped click position without changing existing clip-click behavior.
- Double-clicking either the selected Pattern card or a Playlist clip opens that Pattern in the reusable Piano Roll for editing; a single clip click only selects it.
- Creating a Pattern from either the Playlist library or a Track's context menu immediately opens the newly created Pattern in the Piano Roll; the Track menu binds audition/destination to the clicked Track without creating a clip.
- Right-clicking a Klinto Chip launcher exposes Rename Instrument, Duplicate Instrument and then New Pattern; a successful rename changes the canonical Track name in one undoable command, keeps the stable Instrument identity/type/runtime, updates all live owner labels and restores focus to the launcher. Cancel, no-op and validation failure preserve data and focus.
- Duplicate Instrument creates and focuses a source-adjacent Track with a bounded unique owner name, copied Klinto Chip parameters and fresh identities, while leaving its Mixer at defaults and its Effects/clips empty. It does not open the device, commits once, restores the same copy through redo and is disabled without mutation at eight Tracks.
- Playlist Mute and Solo switches update the same Track Mixer state shown by the Mixer, apply during playback without restarting transport, retain focus through render and undo/redo, and preserve multi-solo with mute-overrides-solo semantics.
- Pattern-library cog Rename/Duplicate/Delete actions obey caps, final-Pattern rules, atomic history and focus repair.
- Pattern growth caused by note content rejects when any linked clip would become invalid; content shrinkage shortens all linked clips.
- Track removal closes its devices, keeps Pattern surfaces and repairs audition Track.
- Pattern removal deletes linked clips and closes only that Pattern surface.
- Final-clip and final-clip-Track removal leave visible, valid focus and no gap.

### Layout/accessibility

- On desktop, Playlist and its inline Pattern-library details remain beneath the Piano Roll and one device, but are never co-displayed with exclusive Mixer.
- At 1366Ã—768 there is no page scroll; bounded Piano/device dragging keeps both windows onscreen, and at 200% zoom all Tracks and Pattern-library controls remain reachable.
- The Pattern library stays compact with one dropdown and one selected card at the 64-Pattern project limit; it never expands into a card grid.
- Keyboard-only add/select/group-move/duplicate-right/undo/open-Pattern plus labelled cog-action journeys pass with contextual announcements.
- The 390Ã—844 reduced journey exposes one fullscreen surface, can view/select/open a clip and return with transport accessible.

## Verification coverage

- Domain tests for overlap, boundary, audible-Pattern disabled state, cursor scan/advance, two-Pattern placement, group move/duplicate-right preflight and atomic failure
- Pattern-content-span/linked-clip tests and Track/Pattern deletion/undo lifecycle tests
- Shared scheduler projection tests for Pattern/Song/loop/ruler-seek/tempo plus first-Stop return and second-Stop reset across Pause/Resume
- Manual desktop compose â†’ Add â†’ arrange â†’ open Pattern journey with focus/announcement checkpoints
- Final-clip/final-Track focus fallback and exclusive-Mixer/narrow-width hidden-tree tests
- Pattern-library default-expanded/collapse/dropdown/scalable selected-card/cog-action, marquee/group-drag, shortcut and right-click routing coverage, including clip > Instrument > Track priority, Track-menu positioning/dismissal, clicked-Track binding, Rename Instrument validation/undo/focus/live-label behaviour, Duplicate Instrument copy boundaries/name/identity/order/cap/undo/destination/focus behaviour, Playlist/Mixer mute-solo state mirroring and clip-delete isolation, plus manual interaction review
- 1366Ã—768 layout plus 390Ã—844 reduced mobile smoke
- Save/reload/import/export fixtures after PRD 32 activation

## Delivery slices

1. **Playlist command adoption:** consume PRD 28 tick clips/loop plus session cursor/playheads; overlap, boundary and scan-forward Add commands.
2. **Read-only Playlist:** Track lanes, linked clips, ruler, viewport, managed semantic selection and the default-expanded collapsible Pattern-library `<details>` with one scalable dropdown, one selected card and a labelled cog menu.
3. **Editing/history:** marquee multi-selection, atomic group move/duplicate-right, single-clip delete, Track add/Instrument duplicate/reorder/remove and undo/redo.
4. **Transport/navigation:** Pattern/Song projection, loop/seek and open-Pattern audition context.
5. **Lifecycle/accessibility:** final-object focus, project switching, 200% zoom and reduced mobile smoke.
6. **Persistence hand-off:** contribute Playlist fixtures to PRD 32; no new intermediate schema version.

## Out of scope

- Audio clips, recording, sample lanes or waveform editing
- Per-clip note overrides, transpose/gain, stretch, unlink or â€œmake uniqueâ€
- Off-grid/free or triplet placement, swing or tempo maps
- Automation lanes, markers, sections or scene launching
- Track groups, folders, buses, sends or sidechains
- More than eight Tracks or the existing song boundary
- Repeat-count, clipboard operations and full touch multi-clip rearrangement
- Track context actions beyond New Pattern plus the Instrument-target Rename Instrument and Duplicate Instrument actions, and richer clip context actions beyond direct deletion
- A separate per-Instrument alias, mutable Klinto Chip product/type name or `instrument.name` schema field

## Resolved decisions

- Desktop Playlist, including its default-expanded collapsible Pattern-library details, is persistent beneath the two bounded modeless windows defined by PRD 27; Mixer remains exclusive, while narrow widths expose one fullscreen surface.
- PRD 28 owns tick schema/migration; this PRD owns Playlist UI and commands.
- Clips remain linked, follow the Pattern's automatically derived content span and remain non-overlapping per Track.
- Add uses the audition Track and first valid snapped position at/after the session insertion cursor, then advances it; Pattern playback never moves it.
- Only Patterns with an audible note may be added.
- Removing a Track never closes project-level Pattern surfaces; it repairs their audition context.
- Removing the final clip leaves an intentional Playlist empty state with deterministic visible focus.
- Pattern library is a default-expanded inline `<details>` section with one dropdown for all Patterns and one draggable selected-Pattern card with labelled cog actions; right-click priority is clip, Instrument launcher, then Track. Clip right-click deletes, the Instrument launcher exposes shared-owner Rename Instrument, Duplicate Instrument and New Pattern in that order, and the remaining Track exposes New Pattern.
- Rename Instrument is UI wording for renaming canonical `Track.name`; Klinto Chip type and Instrument identity are immutable, and no Instrument-name field is introduced.
- Duplicate Instrument creates a source-adjacent Track with copied Klinto Chip parameters and new stable Track/Instrument identities; Mixer state, Effects and clips are intentionally not duplicated.
- Playlist selection is transient, retains stable clip IDs plus one primary focus ID, and never enters Project JSON; group move and duplicate-right each commit atomically once.





