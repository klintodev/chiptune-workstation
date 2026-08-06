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

Limits remain one to eight Tracks. A compact Add Track action in Playlist and Mixer creates the next uniquely named Track with PRD 29's default Klinto Chip, default Mixer state and empty clips/effects, focuses its Track header, and commits one undo entry. At eight Tracks it is disabled with a reason. Reordering changes Playlist and Mixer order together as one command. Removing a Track discloses/removes its clips and disposes its Instrument/effects as one undoable command; the final Track's Remove action is disabled because a Project always retains one Track.

Track removal closes only device presentations owned by that Track. Pattern surfaces remain open because Patterns are project-level. Any Pattern whose `auditionTrackId` referenced the removed Track rebinds to the first surviving Track while preserving Pattern selection and viewport.

## Clip model and invariants

A clip contains stable `id`, `patternId` and integer `startTick`; destination is its owning Track. Duration is always the referenced Pattern's current `lengthTicks`.

- Clip starts are snapped to 1/8, 1/16 or 1/32; default 1/16.
- Clips may touch but may not overlap another clip on the same Track.
- A clip must end within the existing song boundary: 6,144 ticks, the exact conversion of V1's 256 sixteenth-step limit.
- The Pattern reference must resolve before Project activation.
- Editing a Pattern changes every linked clip's content/duration.
- Increasing Pattern length follows PRD 28's all-linked-clip preflight and rejects atomically on overlap/boundary failure.
- Decreasing length shortens linked clips in place and cannot create an overlap.
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

Desktop pointer and keyboard commands support one selected clip at launch:

- select one clip;
- move it by active snap and between valid Track lanes;
- duplicate it once with a new clip ID at its end on the same Track, rejecting atomically if occupied/out of bounds;
- delete it through the explicit action/keyboard command or by right-clicking the clip;
- undo/redo.

Multi-select, repeat-count and Playlist clipboard operations are post-V2.

Drag previews never mutate the Project until drop. Invalid drops restore the original position and announce why. Pointer cancellation commits nothing. Reorder/move keeps focus tied to stable clip identity, not its old lane/cell. Clip right-click suppresses the browser context menu and deletes exactly that clip as one undoable command; empty-lane right-click is suppressed and makes no change.

Empty-lane left-click adds the active Pattern at the exact snapped position on that Track. Clicking a clip continues to select it and never creates another clip.

## Timeline, playhead and transport

- Timeline coordinates derive from ticks; pixels are presentation only.
- Zoom changes viewport, never clip data.
- Horizontal navigation reaches the full 6,144-tick boundary through internal scrolling.
- `playlistCursorTick` is session-local insertion/navigation state. It defaults to 0, changes only through explicit Playlist navigation/seek or successful Add, and never advances during Pattern playback.
- Pattern phase, Song transport playhead and Playlist insertion cursor are distinct values. An explicit Song seek sets Song playhead and insertion cursor together; playback advances only the playhead.
- Pattern mode auditions the active Pattern through its `auditionTrackId` and does not traverse clips.
- Song mode schedules all valid clips through their destination Track chains.
- Stop, return-to-start, seek, tempo and mode switch retain V1 semantics projected into ticks. The direct `↻` control enables a whole-Song arrangement loop over `[0, currentSongEnd)` or disables it; Pattern playback repeats independently.
- Loop uses PRD 28's exclusive tick bounds plus retained `custom | arrangement` mode and does not duplicate Effect state at wrap.
- Visual playhead animation is silent to assistive technology and owned by one disposable loop.

## Pattern navigation

Opening a clip focuses/reuses the referenced Pattern's modeless Piano Roll above Playlist and explicitly sets its `auditionTrackId` to the clip's Track. It preserves/repairs the Pattern viewport according to PRD 28. At narrow widths, this navigates to fullscreen Piano Roll. Merely returning to an already-open Pattern does not change its audition Track.

Deleting a non-final Pattern discloses and removes all linked clips as one undoable command, closes only that Pattern surface and focuses the nearest surviving Pattern control/global switcher. The final Pattern cannot be deleted. Undo restores data but does not reopen the surface automatically.

## Composite timeline accessibility

Playlist exposes one named timeline/grid entry point with managed selection; empty tick cells are not individual Tab stops.

- Tab enters/exits the timeline in Navigation mode. Left/Right move `playlistCursorTick` by snap; Up/Down change the destination Track; none mutates a clip.
- Enter selects the clip under the cursor, or announces the empty position. With a clip selected, Enter opens its Pattern and Escape clears selection back to Navigation mode at the clip start.
- With a clip selected, Alt+Left/Right moves it by snap and Alt+Up/Down moves it one Track after atomic validation. Delete/Backspace deletes it and never triggers browser navigation. The explicit Duplicate action (shortcut shown as platform `Mod+D`) duplicates once.
- Space toggles transport only from the timeline/background; native controls and text fields retain native Space/Enter behaviour. Platform undo/redo remain available.
- A clip announcement includes Pattern name, destination Track, start bar/beat, duration and selected state. Animation frames never update the announcement channel.
- Commands take precedence only while the timeline owns focus; visible focus follows stable clip identity through move/reorder/undo.

When a selected clip disappears, focus/selection uses this order, skipping invalid targets before render:

1. nearest surviving clip;
2. same Track header;
3. Playlist heading.

When no clip survives, the empty state's `Open Piano Roll` action follows the heading in normal tab order; focus is not moved to it implicitly.

Removing the final clip keeps the desktop Playlist base and default Pattern library visible with a useful empty actionâ€”there is no blank gap or hidden focused element. Opening Piano Roll leaves Playlist beneath it; exclusive Mixer and narrow-width fullscreen navigation are the only cases that hide the base.

## Responsive boundary

At approximately 390Ã—844, Playlist is the sole exposed fullscreen surface and supports viewing, panning, managed single-clip selection, playback/seek, collapsing/expanding its inline Pattern library, opening a Pattern and returning safely. Piano Roll and devices replace Playlist rather than overlaying it. Add from Piano Roll remains supported. Precision drag/rearrange, multi-clip gestures and repeat editing on touch are post-V2; required actions may be exposed as explicit buttons/property controls rather than tiny timeline handles.

## Persistence and lifecycle

- Clip/Track commands persist through the final V2 schema owned by PRD 32.
- Opening, importing, switching, deleting or undoing Projects repairs selected Track, selected clip, Pattern phase, Song playhead, Playlist insertion cursor, loop and Pattern audition contexts before render.
- Invalid/missing Pattern references or overlapping/out-of-bound clips fail normalization; they do not enter audio state.
- Removing a Track containing the final clip updates Playlist immediately, closes only owned device UI, releases owned voices and applies the focus fallback.
- Playlist hidden by exclusive Mixer or narrow-width navigation performs no animation or layout work.

## Acceptance criteria

### Core journey

- Use the default-expanded inline Pattern library and Piano window to create two audible Patterns and choose Add to Playlist from each without manually moving the cursor; both appear sequentially in the persistent Playlist, the second scanning past any collision.
- Success switches to Song mode, selects the new clip and advances the insertion cursor; a full Track fails without mutation or surface switch.
- Song playback uses destination Instrument/Mixer/Effect chain; Pattern playback uses the explicit audition Track.
- Opening a clip returns to its Pattern and changes audition Track to that clip's Track.

### Editing/lifecycle

- Single-clip move, duplicate, action/keyboard/right-click delete and undo preserve stable identities/links and enforce overlap/boundary rules atomically.
- Selecting a Pattern in the library and clicking an empty Track position adds that Pattern exactly at the snapped click position without changing existing clip-click behavior.
- Double-clicking a Pattern card in the library opens that Pattern in the reusable Piano Roll for editing.
- Creating a Pattern from the Playlist library immediately opens the newly created Pattern in the Piano Roll.
- Pattern-library cog Rename/Duplicate/Length/Delete actions obey caps, final-Pattern rules, atomic history and focus repair.
- Increasing Pattern length rejects when any linked clip would become invalid; decreasing shortens all clips.
- Track removal closes its devices, keeps Pattern surfaces and repairs audition Track.
- Pattern removal deletes linked clips and closes only that Pattern surface.
- Final-clip and final-clip-Track removal leave visible, valid focus and no gap.

### Layout/accessibility

- On desktop, Playlist and its inline Pattern-library details remain beneath the Piano Roll and one device, but are never co-displayed with exclusive Mixer.
- At 1366Ã—768 there is no page scroll; bounded Piano/device dragging keeps both windows onscreen, and at 200% zoom all Tracks and Pattern-library controls remain reachable.
- The Pattern library stays compact with one dropdown and one selected card at the 64-Pattern project limit; it never expands into a card grid.
- Keyboard-only add/select/move/delete/undo/open-Pattern plus labelled cog-action journeys pass with contextual announcements.
- The 390Ã—844 reduced journey exposes one fullscreen surface, can view/select/open a clip and return with transport accessible.

## Automated coverage

- Domain tests for overlap, boundary, audible-Pattern disabled state, cursor scan/advance, two-Pattern placement, duplicate preflight and atomic failure
- Pattern-resize/linked-clip tests and Track/Pattern deletion/undo lifecycle tests
- Shared scheduler projection tests for Pattern/Song/loop/seek/tempo
- Playwright desktop compose â†’ Add â†’ arrange â†’ open Pattern journey with focus/announcement checkpoints
- Final-clip/final-Track focus fallback and exclusive-Mixer/narrow-width hidden-tree tests
- Pattern-library default-expanded/collapse/dropdown/scalable selected-card/cog-action and clip/empty-lane right-click browser tests
- 1366Ã—768 layout plus 390Ã—844 reduced mobile smoke
- Save/reload/import/export fixtures after PRD 32 activation

## Delivery slices

1. **Playlist command adoption:** consume PRD 28 tick clips/loop plus session cursor/playheads; overlap, boundary and scan-forward Add commands.
2. **Read-only Playlist:** Track lanes, linked clips, ruler, viewport, managed semantic selection and the default-expanded collapsible Pattern-library `<details>` with one scalable dropdown, one selected card and a labelled cog menu.
3. **Editing/history:** single-clip move, duplicate, delete, Track add/reorder/remove and atomic undo/redo.
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
- Playlist multi-select, repeat-count, clipboard operations and full touch clip rearrangement
- Richer custom context menus beyond direct clip deletion

## Resolved decisions

- Desktop Playlist, including its default-expanded collapsible Pattern-library details, is persistent beneath the two bounded modeless windows defined by PRD 27; Mixer remains exclusive, while narrow widths expose one fullscreen surface.
- PRD 28 owns tick schema/migration; this PRD owns Playlist UI and commands.
- Clips remain linked, fixed to Pattern length and non-overlapping per Track.
- Add uses the audition Track and first valid snapped position at/after the session insertion cursor, then advances it; Pattern playback never moves it.
- Only Patterns with an audible note may be added.
- Removing a Track never closes project-level Pattern surfaces; it repairs their audition context.
- Removing the final clip leaves an intentional Playlist empty state with deterministic visible focus.
- Pattern library is a default-expanded inline `<details>` section with one dropdown for all Patterns and one draggable selected-Pattern card with labelled cog actions; clip right-click deletes, while empty-lane right-click is suppressed/no-op.





