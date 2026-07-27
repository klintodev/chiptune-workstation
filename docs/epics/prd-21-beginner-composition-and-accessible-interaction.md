# PRD 21 Epics: Beginner Composition and Accessible Interaction

These epics deliver [PRD 21: Beginner Composition and Accessible Interaction](../product/21-beginner-composition-and-accessible-interaction.md).

These epics turn the current empty-project workflow into an understandable, input-independent path from first note to first song. They preserve the local-first project model, audio graph, scheduler and compact DAW layout.

Epics 74 through 77 are the must-have release. Epic 78 is optional onboarding polish and must not delay or substitute for the accessible blank-project workflow.

## Epic 74 - Compose the first loop and song

### Outcome

A first-time user can create an audible note, build a short loop, place it in the arrangement and start Song playback without discovering a hidden gesture or understanding DAW vocabulary in advance.

### User stories

#### US74.1 - Create the first note

As a new creator, I want an obvious action in an empty step so that my first interaction produces a visible and audible musical result.

Requirements:

- A blank pattern presents one primary instruction and does not lead with disabled secondary actions.
- One primary click, tap, or Enter activation adds the current note, defaulting to C4, and selects the empty step.
- Arrow-key focus or selection alone does not mutate a rest; the focused rest exposes the same one-action Add note command.
- Creating a note previews it when audio and note preview are enabled.
- Keyboard users can use Enter to add the current note and Delete or Backspace to clear it.
- The programmed note, selected step and playback playhead remain distinct states.

#### US74.2 - Turn a loop into a song

As a new creator, I want the interface to show what follows note entry so that I can hear my pattern in Song mode.

Requirements:

- Empty-state copy presents the sequence: add notes, add the loop to the song, then play.
- The visible placement action uses Add loop to song or equally clear language, with Pattern and Clip retained as explanatory terms.
- The current target track and placement position remain visible.
- An unavailable Song Play control explains that the song has no placed loop and links to the next action.
- Placement and removal remain undoable project edits.

#### US74.3 - Learn the essential model

As a beginner, I want unfamiliar terms explained where I use them so that I can learn the workstation rather than guess.

Requirements:

- Pattern, Clip, Gate, Velocity, Voice or Oscillator, Attack and Release receive concise plain-language explanations.
- The pattern note-entry octave is labelled Keyboard octave or equivalent.
- Help is available from the related control and is usable by touch, keyboard and assistive technology.
- Each help trigger has a programmatic relationship to its control, supports explicit close and Escape, and restores focus without changing the control's value.
- Explanations do not permanently crowd the primary musical canvas.

### Tangible requirements

- Update pattern-step interaction so a rest has an explicit pointer and touch path to a note.
- Add first-note and first-placement empty states driven by existing project and session state.
- Add an unavailable-play explanation without weakening the existing transport guard.
- Keep project serialization and default blank-project data unchanged.
- Cover note creation, placement and undo with focused state and browser interaction tests.

## Epic 75 - Navigate and edit without pointer assumptions

### Outcome

Pattern, Instrument, Keyboard, piano performance and clip editing are reachable and predictable with pointer, touch, keyboard and assistive technology.

### User stories

#### US75.1 - Choose an editing tool explicitly

As a user, I want visible Pattern, Instrument and Keyboard tabs so that clicking the correct track region is not the only way to find a tool.

Requirements:

- The three tools appear in one visible tablist.
- Tabs expose selected, focus and panel relationships with standard semantics.
- Arrow keys move between tabs and Enter or Space activates the focused tab.
- Track and clip selection may continue to switch context automatically.
- Switching tools preserves selected track, pattern, clip and step state.

#### US75.2 - Use shortcuts safely

As a keyboard user, I want shortcuts to respect focused controls so that Space, note keys and history commands do what the focused interface promises.

Requirements:

- Space toggles transport only from an eligible non-interactive workspace surface.
- Buttons, links, summaries, tabs, forms, menus, dialogs, sliders and radio groups retain their native keyboard behaviour.
- Open modal dialogs and menus suspend conflicting global shortcuts.
- Editable fields continue to suppress computer-keyboard note input.
- Shortcut policy is shared rather than independently reimplemented by each feature.

#### US75.3 - Play the on-screen piano with any input

As a keyboard or assistive-technology user, I want the visible piano keys to make sound so that they are not pointer-only controls.

Requirements:

- Focused piano keys respond to Enter and Space with one 250-millisecond preview.
- Keyboard activation updates the same active-note state as pointer and mapped computer-key input.
- Repeated keydown does not retrigger an owned preview.
- Focus loss, visibility change, cancellation, disposal, and Stop sound release every piano-owned note.
- Stop sound remains directly available while the Keyboard tool is active.

#### US75.4 - Move and manage a clip without dragging

As a keyboard or touch user, I want labelled clip properties and move actions so that arrangement editing does not depend on precise drag gestures.

Requirements:

- Selecting a clip exposes a compact inspector with Pattern, Track and Start position.
- The inspector can move by one step and by four sixteenth-note steps, representing one beat in the current 4/4 grid.
- The inspector can move the clip to another track, create a variation and remove the clip.
- Invalid destinations are reported without changing the arrangement.
- Dragging remains available as a faster pointer path.
- Destructive actions use practical targets and are not nested inside another interactive control.

#### US75.5 - Enter and leave overlays predictably

As a keyboard or screen-reader user, I want modal editors and menus to manage focus so that I never become stranded behind an overlay.

Requirements:

- Visually modal inspectors use a native dialog or equivalent labelled dialog.
- Opening moves focus to a safe useful control and contains focus.
- Escape and a visible cancel or close action dismiss the overlay.
- Dismissal restores focus to the invoking control, step or clip when it still exists.
- Mobile and desktop versions expose equivalent names and actions.

### Tangible requirements

- Replace the implicit detail-mode selector with an accessible workspace-tab component.
- Centralise global-shortcut eligibility and modal suppression.
- Add keyboard ownership to on-screen piano notes.
- Add a selected-clip command interface backed by existing project movement commands.
- Replace nested or undersized destructive clip controls.
- Convert the fixed mobile step inspector into an accessible sheet or dialog.

## Epic 76 - Keep the workstation responsive and perceivable

### Outcome

Core composition controls remain reachable and legible from a 320-pixel phone through a large desktop, at browser zoom, and with reduced motion.

### User stories

#### US76.1 - Keep transport and mix available on mobile

As a mobile creator, I want playback and mix controls to remain available so that a narrow screen does not remove musical capability.

Requirements:

- Restart, Play or Pause and Stop remain directly available.
- Song/Pattern mode, tempo and master volume remain reachable through the transport or a labelled Mix sheet.
- The global bar uses an ordered two-row or bottom-transport layout without overlap or page-level horizontal scrolling.
- Opening and closing the Mix sheet follows the dialog and focus requirements from Epic 75.

#### US76.2 - Edit patterns in understandable banks

As a mobile creator, I want a small group of steps at a time so that controls remain large enough to operate without losing my place in the full pattern.

Requirements:

- Narrow layouts present explicit pattern banks or pages.
- Bank controls identify the visible step range and total pattern length.
- Selection, playhead, keyboard entry and undo continue across bank changes.
- Four-, eight-, 16- and 32-step patterns remain fully editable.

#### US76.3 - Shape an instrument without horizontal panning

As a mobile creator, I want sound controls in vertical groups so that changing a voice or envelope does not require an 820-pixel horizontal rack.

Requirements:

- Oscillator, Envelope and Output groups stack at narrow widths.
- Every value and label remains visible next to its control.
- Voice choices may wrap or use an accessible select without changing the instrument model.

#### US76.4 - Read and target every control

As a low-vision or touch user, I want legible labels, visible boundaries and practical targets so that the pixel aesthetic does not obscure operation.

Requirements:

- Primary and destructive touch actions target at least 44 by 44 CSS pixels.
- Every target meets WCAG 2.2 target-size requirements or a valid spacing exception.
- Normal text, interactive boundaries and focus indicators meet their applicable WCAG AA contrast.
- Essential labels remain legible at common phone density and 200% browser zoom.
- Selection, playhead, mute, solo and error states do not rely on colour alone.

#### US76.5 - Reduce motion without losing musical state

As a user who requests reduced motion, I want discrete useful updates so that I can follow playback without smooth travel, scrolling or pulsing.

Requirements:

- Locate actions scroll without smooth animation and do not pulse.
- The visualiser removes continuous depth movement.
- Playback and visual state update on user actions and musical step boundaries.
- Pitch, track, active-note and transport information remain understandable.
- Audio scheduling and persisted data are unchanged.

### Tangible requirements

- Add a mobile transport layout and accessible Mix sheet instead of hiding controls.
- Add narrow pattern banking with one authoritative global step index.
- Reflow instrument fieldsets vertically below the agreed breakpoint.
- Introduce shared type, target-size, control-border and focus tokens.
- Add explicit non-colour playhead and selected states.
- Route reduced-motion preference through workspace location and visual rendering.

## Epic 77 - Announce events and prove the workflow

### Outcome

Assistive technology receives calm, meaningful feedback, and browser tests protect the complete first-composition workflow across supported viewports.

### User stories

#### US77.1 - Hear meaningful status changes

As a screen-reader user, I want event-level announcements so that playback does not flood the reading queue with every frame or step.

Requirements:

- Ready, Playing, Paused, Stopped, Saved, Export complete and Error may be announced.
- Visual step counters, animation frames and audio-clock time are not live.
- Repeated assignment of the same status does not mutate a live region.
- The workstation, full-screen visualiser and published player follow the same policy.

#### US77.2 - Trust keyboard and responsive behaviour

As a maintainer, I want browser acceptance tests so interaction regressions are caught before deployment.

Requirements:

- Playwright covers first note, first placement, Song playback, workspace tabs, piano keys, clip movement, mobile mix and modal focus.
- Each journey has keyboard coverage where the operation is keyboard-relevant.
- Clip journeys cover one-step and four-step movement, cross-track movement, invalid destinations, variation, removal, undo, touch operation, and focus restoration.
- Contextual-help journeys cover every required term, programmatic control relationship, touch and keyboard opening, Escape, close, and focus restoration.
- axe reports no critical or serious violations in startup, workstation tools, dialogs and published playback.
- Viewport coverage includes 320 by 568, 375 by 812, 768 by 1024, 1366 by 768 and 1920 by 1080.
- Audio-dependent journeys use a deterministic browser test seam and do not require audible CI output.
- A reduced-motion test verifies discrete rather than frame-driven visual changes.

#### US77.3 - Measure first-use success

As the product owner, I want concrete first-use targets so beginner friendliness is judged by outcomes rather than added copy.

Requirements:

- The median first-time user creates an audible programmed note within 30 seconds of audio activation.
- The median first-time user starts a playing arrangement with at least one placed non-empty pattern within two minutes.
- From initial page entry, median audio activation is under 15 seconds, first audible programmed note is under 45 seconds, and a playing arrangement is under two minutes 30 seconds.
- The task is unassisted after a short neutral introduction.
- The check includes at least eight first-time users, at least three narrow touch sessions and at least three desktop pointer-and-keyboard sessions.
- Unsuccessful attempts remain in the result set and count as exceeding the target.
- Measurement may be moderated or use consented local instrumentation and does not require production analytics.

### Tangible requirements

- Separate visual transport readouts from event-only live status.
- Diff status content before changing a live region.
- Extend PRD 20's Playwright harness with the beginner journeys, add axe integration, and expose one browser acceptance command.
- Run responsive and accessibility acceptance in the production check or CI gate.
- Record the usability protocol and results without storing participant data in project documents.

## Epic 78 - Offer optional guided starts

### Outcome

First-time users may learn from a demo, starter template or checklist, while returning users and blank-project creators enter the workstation without friction.

This epic is optional onboarding polish. Epics 74 through 77 must be complete and independently usable before this work is treated as a release dependency.

### User stories

#### US78.1 - Choose how to begin

As a first-time visitor, I want to choose Learn with a demo, Start from a template or Blank project so that the application matches my confidence.

Requirements:

- The chooser appears only for a genuinely new empty first run.
- Existing local or cloud projects bypass it.
- Every option works without an account.
- Demo and template choices create an editable local copy and never overwrite another project.
- Demo and template choices use fixed, versioned teaching documents.
- Blank project opens the complete Epic 74 workflow.
- The chooser can be skipped and reopened from Help.

#### US78.2 - Follow a short composition checklist

As a learner, I want a small sequence of goals so that I understand how loops become a song.

Requirements:

- The checklist covers adding notes, previewing the pattern, adding it to the song, starting playback and opening the visualiser.
- Progress derives from actual project and session state rather than a separate mutable copy of the song.
- The checklist is dismissible and does not block controls.
- Completion and dismissal remain local preference or session state.

#### US78.3 - Revisit explanations

As a returning learner, I want a glossary and contextual help so that I can refresh one concept without replaying the whole introduction.

Requirements:

- Help defines Pattern, Clip, Gate, Velocity, Voice, Attack and Release using the same wording as the interface.
- Contextual links open the relevant definition.
- Help is keyboard accessible, mobile readable and available offline with the application assets.

### Tangible requirements

- Add a first-run preference outside persisted project state.
- Add bounded, checked-in demo and template project documents.
- Reuse existing project validation and import boundaries for starter content.
- Drive checklist progress from authoritative project and session selectors.
- Keep all onboarding actions dismissible and account-independent.

## Delivery sequence

1. Epic 74 removes the blank-project dead end and establishes the first-composition language.
2. Epic 75 makes every related tool and edit reachable without pointer assumptions.
3. Epic 76 hardens responsive layout, legibility and reduced-motion behaviour.
4. Epic 77 adds event-level announcements, browser acceptance and measurable first-use evidence.
5. Epic 78 may add guided starts after the must-have workflow passes acceptance.

## Definition of done for PRD 21

- Epics 74 through 77 are complete without depending on Epic 78.
- A blank project supports the complete first-note and first-song journey with pointer, touch and keyboard input.
- Core controls remain reachable at every required viewport and at 200% zoom.
- The browser acceptance and axe gates pass.
- Reduced-motion and live-region behaviour pass focused checks.
- The first-note and first-arrangement timing targets are met in the agreed usability check.
- Project schema, audio scheduling and local-first account boundaries remain unchanged.

## Open questions

Resolved for this release:

- One primary click, tap, or Enter activation adds the current note, defaulting to C4; focus navigation alone does not create a note.
- Clip movement uses one step and one four-step beat.
- Focused on-screen piano buttons use a 250-millisecond one-shot keyboard preview.
- The timing check includes at least eight first-time users with the documented touch and desktop mix, and retains unsuccessful attempts.
- Epic 78 starter content is fixed teaching material.

Deferred:

- Should mobile banks use four or eight steps at the minimum supported width?
- Should the Mix sheet be a modal dialog, bottom sheet or expandable transport row?
- Which demo projects should be included in optional Epic 78?
