# PRD 22 Epics: Visual Learning Workspace

These epics deliver [PRD 22: Visual Learning Workspace](../product/22-visual-learning-workspace.md) as an explainable, deterministic projection shared by editing and performance surfaces.

## Epic 79 - Shared compact and performance projection

### Outcome

Users can keep a small visual explanation beside their work or expand the same musical view for performance.

### User stories

#### US79.1 - Keep visual feedback beside the editor

As a composer, I want a compact visual dock while I work so that I can connect edits to the resulting musical shape without leaving the workstation.

Requirements:

- Add a collapsible visual dock that does not cover arrangement, pattern, instrument, or keybed controls.
- Use 32-pixel collapsed, 160-pixel default, and 240-pixel expanded desktop heights.
- Below 768 CSS pixels, start collapsed and expand in document flow after the active editor with a 40-viewport-percent maximum rather than overlaying controls.
- Keep the dock after the active editor in focus order and return focus to its toggle when collapsed.
- Draw from the existing project state and immutable scheduler snapshot.
- Keep stopped, paused, and playing previews useful.
- Shorten horizon and labels when necessary without changing their meaning.

#### US79.2 - Expand without changing the scene

As a performer, I want to open a full-screen version of the same view so that the visual language remains familiar when the interface is hidden.

Requirements:

- Reuse one projection builder, presentation mode, colour mapping, and renderer vocabulary.
- Keep mode, position, Play, Stop, and Close in the full-screen header.
- Preserve current transport state while opening, closing, and resizing.
- Stop rendering hidden surfaces and resume from a current scheduler snapshot.

### Acceptance and test coverage

- Focused tests prove compact and full-screen surfaces receive equivalent projected notes.
- Surface lifecycle tests cover hidden dialogs, collapsed docks, page visibility, resize, and disposal.
- Existing transport and audio-scheduling tests remain unchanged and green.

## Epic 80 - Explainable and accessible visual space

### Outcome

The visualiser explains its mappings, separates tracks when helpful, and remains readable across motion and vision preferences.

### User stories

#### US80.1 - Understand what every dimension means

As a beginner, I want a plain legend so that I know how time, pitch, velocity, duration, track, voice, and pan affect the scene.

Requirements:

- Explain depth, vertical pitch, velocity emphasis, track colour, voice shape, duration tail, and active state.
- Keep the legend available during playback and in compact, full-screen, high-contrast, and narrow layouts.
- Give the empty state a clear explanation and a route to the pattern editor.

#### US80.2 - Separate parts without misrepresenting the mix

As a learner, I want stable track columns so that centred parts do not collapse into one stack.

Requirements:

- Add a clearly named **Track lanes** mode that separates notes by project track order.
- Add a clearly named **Stereo** mode that maps horizontal position to the exact saved pan.
- State that Track lanes are a teaching layout rather than a stereo display.
- Keep the choice out of musical project state.

#### US80.3 - Keep dense scenes readable

As a user with a busy song, I want the camera and labels to adapt so that active and near notes remain understandable.

Requirements:

- Frame the scene from viewport, pitch extent, track count, mode, and bounded horizon.
- Resolve labels deterministically with active and near notes first.
- Keep active notes inside safe margins and preserve every projected note in the textual summary.
- Avoid random offsets and frame-rate-dependent layout.

#### US80.4 - Use an accessible alternative

As a user who needs stronger contrast or less motion, I want the same musical information without continuous perspective animation.

Requirements:

- Add high-contrast note, grid, selected, and active treatments.
- Provide a bounded textual current-and-upcoming-note summary grouped by track.
- Keep the continuously changing summary as ordinary non-live DOM and add a user-triggered **Announce current view** snapshot action.
- Add a discrete scheduler-aligned motion mode and respect `prefers-reduced-motion`.
- Preserve the textual surface and transport when Canvas is unavailable.

### Acceptance and test coverage

- Geometry tests cover lane and pan positioning, camera bounds, label priority, collisions, and representative aspect ratios.
- Accessibility tests cover legend names, keyboard order, textual update cadence, high contrast, Canvas fallback, and discrete motion.
- Determinism tests compare repeated output for identical project, timeline, viewport, and preference inputs.

## Epic 81 - Musical state on the arrangement and pattern grid

### Outcome

The editing workspace shows where playback is, what each clip contains, and which tracks are active.

### User stories

#### US81.1 - Follow pattern playback

As a composer, I want the sounding pattern step highlighted so that I can connect the rhythm I hear to the grid.

Requirements:

- Drive one visible pattern playhead from the scheduler snapshot.
- Keep playhead, selected step, keyboard focus, and destructive armed state distinct without relying on colour alone.
- Retain a paused position and return the stopped position to step 1.

#### US81.2 - Read bars, beats, and clips

As a new arranger, I want familiar bar and beat structure and a preview of notes inside each clip so that the timeline looks musical rather than empty.

Requirements:

- Add bar and beat emphasis to the existing sixteenth-note, 4/4 ruler while retaining absolute step access.
- Extend the arrangement playhead through visible lanes.
- Render bounded note contours inside clips using pitch, rest, gate, and velocity.
- Support 4-, 8-, 16-, and 32-step patterns without increasing lane height.

#### US81.3 - See which track is producing sound

As a mixer, I want deterministic track activity so that I can follow how the parts combine.

Requirements:

- Show active-note or activity state in track headers and visual lanes.
- Use scheduler ownership, effective mute and solo, and projected note state.
- Do not infer authoritative activity from a UI timer.
- Keep inactive and muted tracks identifiable.

#### US81.4 - Navigate a long arrangement

As an arranger, I want zoom, Fit song, and an overview of the occupied timeline so that I can move between precise edits and whole-song structure without losing my place.

Requirements:

- Add bounded timeline zoom without changing any musical position or duration.
- Add **Fit song** using the occupied arrangement range rather than the maximum canvas length.
- Show track occupancy, current viewport, playhead, selection, and loop region in a compact minimap.
- Support pointer, touch, and keyboard viewport movement without moving clips.
- Keep zoom and viewport state transient and out of the project document.

### Acceptance and test coverage

- Pattern tests cover playing, paused, stopped, selection, focus, and structural edits during playback.
- Arrangement tests cover ruler labels, loop wrapping, playhead alignment, and clip contours at every pattern length.
- Track-activity tests cover simultaneous notes, rests, mute, solo, removed tracks, and stale ownership cleanup.
- Navigation tests cover zoom limits, default reset, **Fit song**, minimap viewport movement, selection visibility, and non-mutation of arrangement and transport state.

## Epic 82 - Projected-note inspection and editing handoff

### Outcome

A visible note can explain itself and, inside the workstation, lead to the one authoritative editor that owns it.

### User stories

#### US82.1 - Inspect a visual note

As a learner, I want to select an object in the projection so that I can see which musical choices created it.

Requirements:

- Support pointer and keyboard note selection.
- Expose a focusable DOM list of the bounded projected notes, ordered by onset, track, and pitch, with stable keys, accessible names, and selected state.
- Show track, pattern, step, arrangement position, pitch, gate, velocity, voice, and pan.
- Derive hit targets from rendered geometry without writing them to project state.
- Drive the same inspector from Canvas hit targets and DOM-list selection, and retain full list-based inspection when Canvas is unavailable.
- Close or invalidate stale inspection when its source disappears.

#### US82.2 - Continue in the real editor

As a composer, I want **Edit this note** to reveal its pattern step so that the visualiser teaches the existing workflow instead of creating a competing editor.

Requirements:

- Resolve the note through existing `trackId`, `patternId`, `patternStepIndex`, and optional `clipId` values.
- Select the existing track, pattern, clip, and step through current state interfaces.
- Reveal the existing selected-step controls and return focus meaningfully.
- Omit the edit action from public read-only playback.

### Acceptance and test coverage

- Interaction tests cover hit testing, stable DOM-list order and names, keyboard selection, shared inspector content, stale sources, Canvas fallback, and focus restoration.
- Handoff tests prove exact ID resolution for arrangement, looped, and selected-pattern projections.
- Tests assert that inspection and handoff do not mutate note, mix, transport, or saved visualiser state.
- Public-player tests assert that inspection remains read-only and contains no editing route.
