# PRD 06 Epics: DAW Workspace Redesign

These epics deliver [PRD 06: DAW Workspace Redesign](../product/06-daw-workspace-redesign.md). They reorganise the existing product around familiar DAW hierarchy without changing the project model, audio engine, or delivered musical capabilities.

## E22: Compact application shell and global transport

### Outcome

The user enters a music workspace where global controls are immediately recognisable and no longer compete with product branding or feature descriptions.

### User stories

#### US22.1 - Understand the workspace at a glance

As a user, I want the application to look like one music tool so that I know where to arrange, edit, and play without scrolling through feature sections.

Requirements:

- The enabled application shows a compact global bar above the workspace.
- Branding is reduced to a small product identity.
- The arrangement and active detail editor remain visible together at supported desktop sizes.
- The browser body does not become the primary editor scrollbar.

#### US22.2 - Control playback from one place

As a user, I want transport controls grouped consistently so that play, pause, stop, tempo, master volume, start position, and looping have clear scope.

Requirements:

- Play, pause, and stop form one primary transport group.
- Tempo is a compact editable BPM value.
- Master volume is visually distinct from tempo.
- Start and loop configuration are secondary but discoverable.
- Transport remains available in every detail mode.

#### US22.3 - Leave startup behind after enabling audio

As a user, I want audio activation to stop occupying workspace space after it succeeds.

Requirements:

- Initial activation receives a clear focused state.
- Successful activation collapses to status only.
- Suspension or activation errors restore the required recovery action.
- Collapsing activation does not recreate or replace the AudioContext.

### Tangible requirements

- Shell styling and behaviour remain colocated in a dedicated workspace-shell feature.
- Global and detail layout state remains in session state.
- No project mutation or audio scheduling contract changes in this epic.
- The shell is checked at 1366×768 and 1920×1080.

## E23: Arrangement canvas and compact track headers

### Outcome

The arrangement becomes the primary canvas, with conventional aligned track headers and uncluttered lanes.

### User stories

#### US23.1 - Read tracks and clips as one timeline

As a user, I want each track header aligned with its clip lane so that I can understand the song vertically and time horizontally.

Requirements:

- Track headers use one consistent fixed width.
- Timeline ruler and clip lanes begin at the same horizontal origin.
- Track headers remain pinned during timeline scrolling.
- Vertical scrolling keeps every header aligned with its lane.
- Clips remain entirely inside their track lanes.

#### US23.2 - Mix a track without header clutter

As a user, I want the common track controls available without seeing duplicate names and permanent administrative buttons.

Requirements:

- Each header shows one name, selected state, mute, solo, and level.
- Rename is contextual rather than a second permanently visible name field.
- Reorder and remove are discoverable secondary actions.
- Add track is associated with the track list.
- Track controls retain usable hit areas without consuming most of the timeline width.

#### US23.3 - Edit a selected clip in context

As a user, I want clip actions near the selected clip context so that moving or repeating a clip does not open a giant unrelated panel.

Requirements:

- Selecting a clip reveals its pattern, target track, start step, and supported actions.
- The contextual editor consumes only the space required by its controls.
- Move, repeat, and remove retain their existing domain commands.
- Selection never causes track headers, clips, or the detail editor to overlap.

### Tangible requirements

- Arrangement layout derives from explicit header width, lane height, step scale, and viewport measurements.
- Track control rendering has one authoritative name representation.
- Timeline and header scrolling share one vertical position owner.
- Clip selection remains session state and clip data remains project state.

## E24: Focused pattern and step editor

### Outcome

The sequencer reads as a compact musical pattern rather than a collection of oversized cards and unrelated forms.

### User stories

#### US24.1 - Manage the current pattern from one header

As a user, I want pattern identity and creation actions grouped together so that I can tell what I am editing without scanning a large form.

Requirements:

- Select, name, length, usage, new, and duplicate form one compact editor header.
- Target track and placement remain clear but visually secondary to programming notes.
- Delete and clear are visually separated from common actions.
- Controls retain sensible maximum widths on wide screens.

#### US24.2 - Read the sequence as musical time

As a user, I want the steps to form one coherent rhythmic sequence so that I can recognise positions immediately.

Requirements:

- Four-, eight-, and sixteen-step patterns read left to right as one sequence.
- Step cells use a compact consistent size with a useful maximum width.
- Active note, rest, selected, and playhead states remain distinct.
- A 32-step pattern uses the chosen bank or horizontal-scroll treatment without stretching the page.

#### US24.3 - Edit one step without enlarging every step

As a user, I want expression controls for the selected note so that gate and volume remain editable without every cell becoming a control panel.

Requirements:

- Gate choices and per-step volume appear once for the selected step.
- The selected-step editor shows pitch, gate, volume, and clear action together.
- Editing continues to update the authoritative pattern state immediately.
- Keyboard note entry continues to program the selected step.

### Tangible requirements

- Step rendering and selected-step controls are separate UI projections over the same pattern state.
- No expression value is stored only in the DOM.
- Pattern structural actions retain current undo grouping and scheduler interruption behaviour.
- Existing pattern tests remain unchanged unless public behaviour intentionally changes.

## E25: Track device and playable keyboard tools

### Outcome

Instrument shaping and live performance use compact, purpose-built lower-editor modes without large empty regions.

### User stories

#### US25.1 - Shape the selected track like a device

As a user, I want related synthesis controls grouped like a small instrument device so that I can understand the signal without reading explanatory copy.

Requirements:

- Voice and octave form an oscillator group.
- Attack and release form an envelope group.
- Instrument volume and reset form an output or utility group.
- The selected track name is visible in the device header.
- Control widths remain appropriate to their values at wide resolutions.

#### US25.2 - Play one coherent keybed

As a user, I want the on-screen keyboard to resemble a musical keybed so that the relationship between white and black notes is obvious.

Requirements:

- White and black keys have clear spatial relationships.
- Existing computer-key labels remain visible.
- The keybed uses a content-sized or bounded width rather than filling empty space.
- Stop-sound remains visible whenever the keyboard mode is active.

#### US25.3 - Keep the selected context coherent

As a user, I want tool changes to retain the selected track and pattern so that changing editors never changes my music unexpectedly.

Requirements:

- Track selection updates the device and keyboard sound source.
- Clip selection updates the pattern editor without creating a new pattern.
- Switching detail modes creates no project-history entry.
- Live computer keyboard input remains available outside editable fields.

### Tangible requirements

- Detail-mode selection and collapsed state remain transient session state.
- Existing instrument, input-controller, and voice-engine contracts remain authoritative.
- Tool switching does not recreate feature stores, audio channels, or event listeners.

## E26: Progressive disclosure, responsive behaviour, and regression safety

### Outcome

The redesigned workspace stays legible across supported viewports and preserves every delivered musical workflow.

### User stories

#### US26.1 - See the controls needed for the current task

As a user, I want common actions visible and secondary actions nearby but quieter so that the interface is capable without appearing crowded.

Requirements:

- Frequent controls remain directly visible.
- Infrequent and destructive actions use a secondary group, contextual inspector, or compact menu.
- Disabled secondary actions do not dominate empty states.
- No command is duplicated across unrelated regions.
- No modal or floating editor is introduced by this PRD.

#### US26.2 - Use the workstation at practical desktop sizes

As a user, I want the workspace to fit my screen so that controls are neither clipped nor stretched into unused space.

Requirements:

- Global controls, usable arrangement lanes, and the active detail tool are visible at 1366×768 without body scrolling.
- The same hierarchy remains balanced at 1920×1080.
- Timeline and editor scrolling occur only inside clear content boundaries.
- Narrow layouts fall back to ordered vertical flow without overlap or unreachable controls.

#### US26.3 - Navigate without losing focus or sound

As a keyboard user, I want predictable focus and editor navigation so that changing context does not trigger notes or leave them stuck.

Requirements:

- Detail modes expose correct tab semantics and focus states.
- Track and clip selection remain keyboard accessible.
- Editable controls suppress live note shortcuts while focused.
- Focus changes, select controls, and detail switching do not leave active voices stuck.

#### US26.4 - Preserve the working DAW

As a user, I want the redesign to retain the features already delivered so that visual improvement does not remove musical capability.

Requirements:

- Pattern creation, editing, placement, variation, and history still work.
- Track creation, naming, ordering, removal, mixing, and instruments still work.
- Clip placement, movement, repetition, removal, and collision rejection still work.
- Arrangement and pattern playback, looping, tempo, and audio interruption behaviour still work.
- Existing automated tests remain green.

### Tangible requirements

- Add only focused tests for new session-level interaction rules.
- Verify each detail mode and selected-context transition at supported viewport boundaries.
- Remove obsolete layout overrides instead of layering another set of competing global rules.
- Keep CSS and JavaScript colocated with the redesigned feature that owns them.

## Delivery sequence

1. E22 establishes the compact shell and global hierarchy.
2. E23 rebuilds the arrangement as the primary canvas.
3. E24 makes pattern programming compact and musically legible.
4. E25 reshapes the instrument and keyboard into focused tools.
5. E26 applies progressive disclosure, viewport hardening, accessibility, and regression checks.

## Definition of done for PRD 06

- The enabled application reads as one DAW workspace rather than stacked product sections.
- Global, track, clip, pattern, and instrument controls have visibly different and appropriate scopes.
- The arrangement remains the primary canvas while the active detail editor stays immediately available.
- Track headers, clips, and editor controls never overlap or clip at supported desktop sizes.
- Pattern steps remain compact, and selected-step expression controls appear only once.
- Instrument and keyboard modes use content-sized controls without large empty presentation panels.
- No delivered musical workflow or audio lifecycle behaviour regresses.
- Existing and focused new automated tests pass.
