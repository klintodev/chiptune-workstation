# PRD 22: Visual Learning Workspace

## Description

Make the relationship between the arrangement, the pattern grid, and the composition-projected visualiser understandable while music is being written.

The workstation gains a docked miniature visualiser for continuous feedback and retains the nearly full-screen viewer as a performance mode. Both surfaces use the same deterministic projection of project data and scheduler time. They do not analyse, schedule, or mutate audio, and they do not become a second source of musical state.

The first release favours explanation over customisation. A visible legend, inspectable notes, pattern and arrangement playheads, clip contours, and track activity help a beginner connect what they see to what they hear. Advanced users can switch from separated teaching lanes to an accurate representation of the saved stereo pan.

## Dependencies

- PRD 16 supplies the deterministic composition projection and audio-clock snapshot; PRD 17 supplies authoritative track pan.
- PRD 21 supplies the visible workspace navigation, responsive baseline, input parity, dialog and focus rules, event-only announcement policy, and discrete reduced-motion behaviour.
- PRD 23's reachability and lazy-loading work must preserve every projection and accessible-alternative path introduced here.

## Implementation epics

[PRD22/E79-E82](../epics/prd-22-visual-learning-workspace.md) covers shared surfaces, the explainable visual space, musical state in the editors, and projected-note inspection.

## Requirements

### One projection, two surfaces

- The composition projection must be available in a compact dock inside the editing workspace and in the existing nearly full-screen performance mode.
- The dock must remain useful while arranging, editing a pattern, shaping an instrument, or playing the keybed without covering the active controls.
- The compact and full-screen surfaces must use one projection model, geometry vocabulary, colour system, and transport snapshot.
- At viewports 768 CSS pixels wide and above, the dock must provide a 32-pixel collapsed header, a 160-pixel default view, and an optional 240-pixel expanded view.
- Below 768 CSS pixels, the dock must start collapsed and expand in document flow immediately after the active detail editor, with a maximum height of 40 viewport percent; it must not overlay the transport or editing controls.
- Dock controls must follow the active editor in keyboard focus order, and collapsing the dock must return focus to its toggle.
- Opening, closing, resizing, or changing the presentation mode of either visual surface must not change project data, scheduler state, mixer values, or audio output.
- Stopped and paused projects must retain a deterministic preview of upcoming notes.
- The full-screen surface must keep Play, Stop, Close, playback mode, state, and current musical position available.
- The compact surface may reduce labels and horizon length, but it must not change the meaning of a visual mapping.

### Explain the visual language

- A discoverable legend must explain that depth represents time until onset, vertical position represents pitch, size or emphasis represents velocity, colour represents track, and shape represents voice type.
- The legend must explain duration tails as gate length and identify the active-note treatment.
- Track-lane presentation must explicitly say that horizontal position groups notes by track and does not represent stereo position.
- Stereo presentation must explicitly say that horizontal position follows the track's saved pan value.
- The legend must be available without stopping playback and must remain readable in compact, full-screen, dark, light, and high-contrast views.
- The empty visual state must include a direct explanation and a route back to the pattern editor rather than only asking the user to “program notes.”

### Track lanes and accurate stereo

- **Track lanes** must separate visible notes into stable track columns so a beginner can follow simultaneous parts even when every track is panned to the centre.
- **Stereo** must map horizontal position to the authoritative mixer pan value without adding track-index offsets that imply a different mix.
- Switching modes must affect presentation only and must not write pan values or duplicate notes.
- Track order, colour, name, voice, mute, solo, and effective audibility must remain consistent with the arrangement.
- The selected presentation mode may be retained as a local session preference, but it must not become musical project state.

### Adaptive camera and collision handling

- The camera must adapt to viewport aspect ratio, visible pitch range, track count, presentation mode, and the bounded projection horizon.
- Near and active notes must remain within safe screen margins at supported viewport sizes.
- Label placement must avoid collisions deterministically, prioritising active notes, near notes, note names, and then track names.
- When all labels cannot fit, the renderer may shorten, combine, or defer lower-priority labels, but it must not hide an active note solely to make text fit.
- Collision handling and camera framing must not use random values or frame-rate-dependent physics.
- Every note omitted or abbreviated visually must remain represented in the textual summary.

### Duration and activity

- A projected note must expose a duration tail derived from its gate length so short and sustained steps are distinguishable before onset.
- The foreground treatment must retain the note for its gate duration, then remove it according to the scheduler snapshot.
- Track headers and visual lanes must expose deterministic activity for audible tracks, including the current note name where practical.
- Muted and excluded-by-solo tracks must read as inactive without being removed from the user's understanding of the arrangement.
- Activity must come from the scheduler and project projection rather than from timers owned by the UI.

### Inspect and locate a note

- A pointer or keyboard user must be able to select a visible projected note without changing the note itself.
- Every bounded projected-note set must also appear in a focusable DOM list ordered by onset, track order, and pitch; this list and Canvas hit targets must drive the same inspector selection.
- Each DOM note item must have a stable key and accessible name containing its track, note, timing state, and pattern step, and must expose selected state programmatically.
- The inspector must show track, pattern, pattern step, arrangement position, note name, gate, velocity, voice shape, and pan.
- Editable workstation notes must offer **Edit this note**.
- **Edit this note** must use the existing `trackId`, `patternId`, `patternStepIndex`, and, when present, `clipId` to select the authoritative track, pattern, clip, and step.
- The command must reveal the existing pattern editor and selected-step controls rather than create a visualiser-specific editing path.
- If the source clip or pattern no longer exists, the inspector must close or explain that the note is no longer available without applying a stale edit.
- Public playback pages may expose the read-only inspector, but they must not expose **Edit this note**.

### Make time and note shape legible in the workstation

- Pattern playback must visibly identify the current scheduler step.
- Pattern playhead, editing selection, keyboard focus, and armed clear state must have separate treatments that do not rely on colour alone.
- The arrangement ruler must show bar and beat structure in addition to absolute step position for the existing sixteenth-note, 4/4 timeline.
- The arrangement playhead must continue through the visible track lanes so the sounding clips can be followed.
- Each clip must contain a bounded miniature note contour derived from its pattern: rests remain empty, pitch controls vertical placement, gate controls mark length, and velocity controls emphasis.
- Clip contours must remain legible for 4-, 8-, 16-, and 32-step patterns without making clips taller.
- Clip selection and track colour must remain clear over the contour.

### Navigate long arrangements

- Timeline zoom must change only presentation density; it must not change clip positions, lengths, pattern content, loop boundaries, or transport timing.
- The user must be able to zoom in for step-level editing, zoom out for song structure, and return to a documented default density.
- A **Fit song** action must frame the occupied arrangement range without treating the full maximum timeline as meaningful content.
- A bounded overview or minimap must show the occupied range, current viewport, arrangement playhead, and active loop region.
- Pointer, touch, and keyboard users must be able to move the timeline viewport from the overview without moving clips.
- Track headers, selected context, and global transport must remain available while the timeline is zoomed or navigated.
- The overview may simplify clip contours, but it must retain track colour and distinguish occupied, selected, playing, and looped regions without relying only on colour.
- Zoom level and viewport position are transient presentation state and must not enter the project document.

### Accessible alternatives

- A high-contrast presentation must strengthen grid, note, active, selected, and text separation without depending on a scanline effect.
- A textual summary must identify the current position, active notes, and bounded upcoming notes by track.
- The continuously updating summary and projected-note list must use ordinary DOM with live announcements disabled.
- An explicit **Announce current view** action may copy one current summary into an event live region on request; automatic live announcements remain limited to the semantic transport events defined by PRD 21.
- Reduced-motion presentation must replace continuous perspective travel with discrete, scheduler-aligned position changes while retaining depth order, active state, duration, and the same legend.
- The user must be able to choose reduced motion in the visual surface in addition to the application respecting `prefers-reduced-motion`.
- Canvas unavailability must preserve the textual summary, transport controls, note inspector where possible, and music playback.
- Keyboard focus, hit targets, inspector semantics, and contrast must remain practical on narrow screens.

### Deterministic and read-only boundary

- Projection calculation must remain a pure read over a validated project snapshot and an immutable scheduler timeline snapshot.
- Camera framing, lane placement, tails, collision decisions, activity, and textual summaries must be reproducible for the same inputs and viewport.
- The renderer must not write animation objects, hit-test state, camera values, or inspector selection into the project document.
- Visual frames must not schedule notes, infer the authoritative playhead from elapsed wall-clock time, or delay audio scheduling.
- Rendering must stop while its surface or browser tab is hidden and must resume from a fresh scheduler snapshot.

## Out of scope

- Directly dragging notes, changing pitch, or changing pan on the visual canvas.
- A second pattern editor or independent visualiser-owned note model.
- WebGL, 3D assets, shaders, particle physics, or non-deterministic camera motion.
- A general visual layer editor or restoration of every legacy visualiser control.
- New time signatures, tempo maps, automation lanes, chords, or polyphonic pattern steps.
- Replacing the existing audio-clock scheduler with visual timing.
- Claiming that Track lanes represent the audible stereo field.

## Acceptance and test coverage

- Projection tests must cover Track lanes and Stereo mode, gate tails, mute and solo, looping, pattern mode, track order, and stopped, paused, and playing snapshots.
- Geometry tests must cover wide, tall, and narrow viewports, safe margins, adaptive framing, deterministic label priority, and collision fallback.
- Interaction tests must prove that inspected notes resolve through existing IDs and that **Edit this note** selects the existing track, pattern, clip, and pattern step without changing project data.
- Interaction tests must prove stable DOM-note order, accessible names and selected state, shared Canvas/list inspection, focus restoration, and complete list-based inspection when Canvas is unavailable.
- Pattern-editor tests must prove that one playback step is visible, selection remains distinct, and stop returns the visible pattern position to step 1.
- Arrangement tests must cover bar and beat labels, full-lane playhead position, and clip contours for every supported pattern length.
- Timeline-navigation tests must cover zoom boundaries, default and **Fit song** framing, minimap viewport movement, loop wrapping, and proof that navigation does not mutate clips or transport.
- Accessibility tests must cover the non-live textual summary, user-requested announcement, keyboard inspection, high contrast, Canvas fallback, and discrete reduced-motion output.
- Compact and full-screen surfaces must produce equivalent note meaning from the same projection snapshot.
- Layout verification must cover the supported desktop boundary and representative narrow phone, tablet, and short laptop viewports in both themes.
- Dock layout tests must cover its three desktop heights and collapsed-by-default in-flow mobile expansion at 320 by 568 and 375 by 812 without covering the transport or active editor.
- The existing scheduler, projection, player, project validation, and persistence suites must remain green.

## Open questions

- Should Track lanes be the default for new local sessions while public playback defaults to Stereo, or should both surfaces remember one local preference?
- How many upcoming notes should the bounded DOM list and silent textual summary show before offering pagination or a horizon control?
- Should a duration tail encode gate only, or should a later iteration add a separately explained instrument-release tail?
- When several identical notes collide, should the visual group them with a count or offset their labels while leaving their geometry unchanged?
- Should high-contrast and manual reduced-motion choices be shared across devices through account preferences, or remain browser-local?
