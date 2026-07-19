# PRD 6: DAW Workspace Redesign

## Description

Reorganise the working chiptune workstation into a familiar DAW-style workspace that makes the arrangement, tracks, transport, pattern editor, and instrument controls understandable at a glance.

The current interface exposes the right capabilities but gives global controls, track controls, clip actions, pattern management, note programming, and instrument settings equal visual weight. Large branding, explanatory copy, stretched panels, permanently visible secondary actions, and nested scrolling reduce the space available to the music itself. At wide resolutions, controls expand into empty space; at shorter resolutions, important controls are clipped or require unexpected scrolling.

This PRD is an interaction and information-architecture refactor. It must preserve the project model, audio graph, scheduling behaviour, editing commands, and dependency-free module architecture delivered by PRDs 1-5. The result should resemble a compact desktop music tool rather than a vertically stacked product page.

## Requirements

### Workspace hierarchy

- The enabled application must use a conventional DAW hierarchy: global control bar, primary arrangement canvas, fixed track headers, and a contextual detail editor.
- The arrangement must receive the largest continuous area of the screen.
- The selected pattern, track, or clip must determine the contents of the detail editor without duplicating project data.
- Pattern, instrument, and keyboard tools may share the detail editor through compact mode controls, but they must not read as separate full-width web pages.
- The detail editor must be collapsible and must retain its selected mode in session state.
- At desktop sizes, switching tools must not move the arrangement off screen or require body-level page scrolling.
- Empty canvas space may remain available for future clips; empty containers must not expand merely to fill the viewport.
- Marketing-scale branding and instructional paragraphs must not compete with editing controls after audio activation.

### Global control bar

- Project identity, audio status, transport, tempo, master level, and loop state must be recognisable as global controls.
- Play, pause, and stop must form one visually distinct transport group.
- Tempo must remain directly editable as a whole-number BPM value.
- Master volume must remain visually separate from tempo and timeline position.
- Loop configuration and start position must read as secondary transport options rather than primary actions.
- Audio activation may occupy a focused startup state before the first gesture; after activation it must collapse to a compact status indicator.
- The global control bar must remain visible while editing the arrangement or any detail tool.

### Arrangement and track headers

- Each track must appear as one concise header aligned with one timeline lane.
- A track header must show one authoritative track name, selection state, mute, solo, and level without duplicating the name in simultaneous display and edit controls.
- Renaming must be available in context without keeping a second large text field permanently visible.
- Reorder and remove actions must remain discoverable but must not occupy the same visual prominence as mute, solo, and level.
- The timeline must begin at a consistent boundary after the fixed-width track headers.
- Clips must never overlap track controls or escape their lane.
- Clip position and duration must be visually legible against bar or step divisions.
- Selecting a clip must expose its pattern, track, position, repeat, move, and remove actions in a compact contextual inspector or action strip.
- The selected-clip editor must not consume a full-width row when only a few controls are required.
- Horizontal scrolling must affect the timeline while track headers remain pinned; vertical scrolling must keep track headers and lanes aligned.
- Adding tracks must remain near the track list rather than isolated in unused header space.

### Pattern editor

- Pattern selection, naming, length, usage, and creation must live in a compact editor header.
- Common pattern actions must remain visible; destructive or infrequent actions must be visually secondary.
- The step sequence must be the dominant element of the pattern editor.
- Step cells must have a useful maximum size and must not stretch into oversized cards on wide displays.
- A 16-step pattern should read as one coherent sequence; longer patterns may use banks or internal horizontal scrolling rather than enormous multi-row cards.
- Rest, active note, selected, and playhead states must remain distinguishable without relying only on colour.
- Gate and per-step volume controls must be shown for the selected step in one expression editor rather than making every step cell permanently tall.
- Keyboard note entry must continue to update the selected sequencer step.
- Pattern placement must clearly identify its target track and start step without dominating the editor.

### Instrument editor

- The instrument editor must resemble a compact track device rather than a presentation panel.
- Voice and octave controls must form one oscillator group.
- Attack and release must form one envelope group.
- Instrument volume and reset must form one output or utility group.
- Controls must use widths appropriate to their values instead of stretching across the full application width.
- The selected track name must remain visible in the device header.
- Explanatory prose must not consume permanent space once the control purpose is evident from labels.

### Keyboard tool

- The on-screen keyboard must read as one compact musical keybed rather than four unrelated button rows surrounded by empty space.
- White and black key relationships must remain visually clear while preserving the documented computer-key mapping.
- The keybed must size to its content or useful maximum width and must not stretch across empty viewport space.
- Stop-sound must remain visible whenever the keyboard tool is active.
- Computer keyboard input must continue working regardless of which detail mode is visible, except while focus is inside an editable control.

### Progressive disclosure

- Frequently used controls must be visible where the user performs the related task.
- Infrequent, destructive, or administrative actions must move to a compact contextual area, menu, or secondary action group.
- The same command must not appear in several unrelated regions.
- Disabled controls must not dominate the interface; where practical, unavailable secondary actions may be hidden until relevant.
- Modal dialogs, floating plugin windows, detachable panels, and popup editors are deferred for later investigation.

### Viewport and responsive behaviour

- At 1366×768 and larger desktop viewports, the enabled application must expose the global controls, usable arrangement lanes, and the active detail tool without body-level scrolling.
- The arrangement and detail editor may scroll internally only when their musical content exceeds the available region.
- Internal scrollbars must correspond to an obvious canvas or editor boundary and must not clip controls unexpectedly.
- At wide resolutions, controls must retain sensible maximum widths and alignment rather than stretching to consume empty space.
- At narrow or short viewports, the layout may fall back to a vertical document flow, but controls must remain ordered by the same global, arrangement, and detail hierarchy.
- No supported viewport may produce overlapping clips and headers, truncated action labels, unreachable controls, or horizontally clipped form fields.

### Behaviour preservation and testability

- The redesign must not change the serializable project schema or move presentation state into project state.
- Active detail mode, collapsed state, focused selection, and inspector visibility must remain transient session state.
- Existing track, pattern, clip, instrument, keyboard, history, and transport commands must remain the authoritative mutation paths.
- Selecting tracks and clips must continue to update the correct pattern and instrument projections.
- Audio activation, interruption cleanup, scheduling, mute, solo, and live-input behaviour must remain unchanged.
- Existing automated tests must remain green.
- New automated coverage should be limited to interaction state that can regress independently of CSS, such as active detail mode and selected-context projection.
- Layout verification must cover the supported desktop viewport boundaries and each detail mode.

## Out of scope

- Modal editors, floating windows, detachable panels, and multi-monitor layouts.
- A visual theme rewrite, user-selectable themes, or custom layout persistence.
- New synthesis parameters, effects, automation, piano-roll editing, or mixer channels.
- Clip trimming, stretching, fades, or detached clip overrides.
- Replacing native modules with a frontend framework or component library.

## Open questions

- Should the detail editor use a fixed open height, two preset heights, or a user-resizable divider?
- Should selected clip properties live in a narrow side inspector or in the detail editor above the pattern sequence?
- Should clip movement become direct drag-and-drop in this PRD, or should the first redesign retain the step input in a compact inspector?
- Should track rename, reorder, and remove use an inline overflow menu or a selected-track inspector?
- For 32-step patterns, should the sequencer use two visible 16-step banks or one horizontally scrollable row?
