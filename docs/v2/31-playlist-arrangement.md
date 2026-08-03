# PRD 31: Playlist arrangement

Status: Draft  
Release: Klinto Studio V2  
Depends on: PRDs 27â€“29

## Description

Turn V1's arrangement into a dedicated Playlist primary surface for placing and editing linked Pattern clips. Playlist is an intentional song-building view, never a permanent region below Piano Roll.

This PRD consumes PRD 28's tick-based clip and loop model. It owns presentation, commands, navigation and focusâ€”not another schema migration.

## Product outcome

A user writes a Pattern, chooses Add to Playlist, immediately sees the new linked clip selected on the intended Track, arranges copies, plays Song mode and opens any clip back into its Pattern with the correct audition Track.

## Playlist surface

Playlist fills the workspace beneath the global shell and contains:

- compact title, active snap and zoom/navigation actions;
- Track headers and aligned timeline lanes;
- bar/beat ruler, playhead and optional loop range;
- clip selection and compact property/action area;
- one useful empty state with an explicit `Open Piano Roll` action when Playlist is opened without clips.

The Pattern editor, Instrument parameters and Mixer strips are not rendered inside Playlist. At 1366Ã—768, eight compact Track headers/lanes remain reachable through internal scrolling with no page-level scroll.

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
3. On success, create one clip, set Song playhead to its start, advance `playlistCursorTick` to its end, switch session playback to Song, open Playlist, select the clip and focus its context.
4. If no position fits, create nothing, remain in Piano Roll and explain that the Track has no valid remaining space.

It creates one undo history entry and one autosave revision. A tested two-Pattern journey must place both sequentially without the user manually moving the cursor.

## Clip editing

Desktop pointer and keyboard commands support one selected clip at launch:

- select one clip;
- move it by active snap and between valid Track lanes;
- duplicate it once with a new clip ID at its end on the same Track, rejecting atomically if occupied/out of bounds;
- delete it;
- undo/redo.

Multi-select, repeat-count and Playlist clipboard operations are post-V2.

Drag previews never mutate the Project until drop. Invalid drops restore the original position and announce why. Pointer cancellation commits nothing. Reorder/move keeps focus tied to stable clip identity, not its old lane/cell.

## Timeline, playhead and transport

- Timeline coordinates derive from ticks; pixels are presentation only.
- Zoom changes viewport, never clip data.
- Horizontal navigation reaches the full 6,144-tick boundary through internal scrolling.
- `playlistCursorTick` is session-local insertion/navigation state. It defaults to 0, changes only through explicit Playlist navigation/seek or successful Add, and never advances during Pattern playback.
- Pattern phase, Song transport playhead and Playlist insertion cursor are distinct values. An explicit Song seek sets Song playhead and insertion cursor together; playback advances only the playhead.
- Pattern mode auditions the active Pattern through its `auditionTrackId` and does not traverse clips.
- Song mode schedules all valid clips through their destination Track chains.
- Stop, return-to-start, seek, loop, tempo change and mode switch retain V1 semantics projected into ticks.
- Loop uses PRD 28's exclusive tick bounds plus retained `custom | arrangement` mode and does not duplicate Effect state at wrap.
- Visual playhead animation is silent to assistive technology and owned by one disposable loop.

## Pattern navigation

Opening a clip activates the referenced Pattern surface and explicitly sets that surface's `auditionTrackId` to the clip's Track. It preserves/repairs the Pattern viewport according to PRD 28. Merely switching back to an already-open Pattern through the global switcher does not change its audition Track.

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

Removing the final clip keeps the explicitly active Playlist visible with its useful empty actionâ€”there is no blank gap or hidden focused element. Returning to Piano Roll shows no arrangement region because Playlist is a separate primary surface.

## Responsive boundary

At approximately 390Ã—844, Playlist supports viewing, panning, managed single-clip selection, playback/seek, opening its Pattern and returning safely. Add from Piano Roll remains supported. Precision drag/rearrange, multi-clip gestures and repeat editing on touch are post-V2; required actions may be exposed as explicit buttons/property controls rather than tiny timeline handles.

## Persistence and lifecycle

- Clip/Track commands persist through the final V2 schema owned by PRD 32.
- Opening, importing, switching, deleting or undoing Projects repairs selected Track, selected clip, Pattern phase, Song playhead, Playlist insertion cursor, loop and Pattern audition contexts before render.
- Invalid/missing Pattern references or overlapping/out-of-bound clips fail normalization; they do not enter audio state.
- Removing a Track containing the final clip updates Playlist immediately, closes only owned device UI, releases owned voices and applies the focus fallback.
- Hidden Playlist performs no animation or layout work.

## Acceptance criteria

### Core journey

- Create two audible Patterns and choose Add to Playlist from each without manually moving the cursor; both appear sequentially on the audition Track, the second scanning past any collision.
- Success switches to Song mode, selects the new clip and advances the insertion cursor; a full Track fails without mutation or surface switch.
- Song playback uses destination Instrument/Mixer/Effect chain; Pattern playback uses the explicit audition Track.
- Opening a clip returns to its Pattern and changes audition Track to that clip's Track.

### Editing/lifecycle

- Single-clip move, duplicate, delete and undo preserve stable identities/links and enforce overlap/boundary rules atomically.
- Increasing Pattern length rejects when any linked clip would become invalid; decreasing shortens all clips.
- Track removal closes its devices, keeps Pattern surfaces and repairs audition Track.
- Pattern removal deletes linked clips and closes only that Pattern surface.
- Final-clip and final-clip-Track removal leave visible, valid focus and no gap.

### Layout/accessibility

- Playlist is never stacked with Piano Roll or Mixer.
- At 1366Ã—768 there is no page scroll; at 200% zoom all Tracks are reachable with channel/timeline navigation.
- Keyboard-only add/select/move/delete/undo/open-Pattern journey passes with contextual announcements.
- The 390Ã—844 reduced journey can view/select/open a clip and return with transport accessible.

## Automated coverage

- Domain tests for overlap, boundary, audible-Pattern disabled state, cursor scan/advance, two-Pattern placement, duplicate preflight and atomic failure
- Pattern-resize/linked-clip tests and Track/Pattern deletion/undo lifecycle tests
- Shared scheduler projection tests for Pattern/Song/loop/seek/tempo
- Playwright desktop compose â†’ Add â†’ arrange â†’ open Pattern journey with focus/announcement checkpoints
- Final-clip/final-Track focus fallback and hidden-tree tests
- 1366Ã—768 layout plus 390Ã—844 reduced mobile smoke
- Save/reload/import/export fixtures after PRD 32 activation

## Delivery slices

1. **Playlist command adoption:** consume PRD 28 tick clips/loop plus session cursor/playheads; overlap, boundary and scan-forward Add commands.
2. **Read-only Playlist:** Track lanes, linked clips, ruler, viewport and managed semantic selection.
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

## Resolved decisions

- Playlist is a dedicated primary surface, never permanent furniture beneath Piano Roll.
- PRD 28 owns tick schema/migration; this PRD owns Playlist UI and commands.
- Clips remain linked, fixed to Pattern length and non-overlapping per Track.
- Add uses the audition Track and first valid snapped position at/after the session insertion cursor, then advances it; Pattern playback never moves it.
- Only Patterns with an audible note may be added.
- Removing a Track never closes project-level Pattern surfaces; it repairs their audition context.
- Removing the final clip leaves an intentional Playlist empty state with deterministic visible focus.





