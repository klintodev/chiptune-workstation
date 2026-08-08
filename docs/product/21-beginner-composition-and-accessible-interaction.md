# PRD 21: Beginner Composition and Accessible Interaction

## Description

Make the existing workstation understandable and operable from the first empty pattern through the first playing arrangement, without removing the compact DAW workflow used by experienced creators.

The release-critical work is an interaction and accessibility correction. A user must not need prior knowledge of patterns, clips, hidden keyboard mappings, hover controls, right-click menus or drag gestures to create a song. Pointer, keyboard, touch and assistive-technology users must have equivalent ways to reach and operate the core workstation.

Optional guided onboarding is a separate product layer. Demo projects, starter templates and a first-run checklist may accelerate learning, but the blank workstation must remain self-explanatory and fully usable when that layer is skipped.

## Dependencies

- PRD 20 supplies reliable project/audio boundaries, deterministic test seams, and storage-recovery states exercised by this workflow.
- PRD 23 may deliver module seams alongside this PRD, but must not delay the release-critical interaction corrections.
- PRD 22 reuses this PRD's workspace navigation, responsive layout, event-announcement, reduced-motion, dialog, and input policies.

## Implementation epics

[PRD21/E74-E78](../epics/prd-21-beginner-composition-and-accessible-interaction.md) separates the required blank-project and accessibility foundation in E74-E77 from optional guided starts in E78.

## Release boundary

### Must-have interaction foundation

The first release includes:

- a clear first-note and first-song path from a blank project;
- visible Pattern, Instrument and Keyboard workspace tabs;
- plain-language primary labels and concise explanations for essential music terms;
- safe global shortcuts that never override a focused control;
- keyboard-operable piano keys and clip movement;
- an explicit selected-clip inspector;
- complete mobile access to transport, mix, pattern and instrument controls;
- correct dialog, focus, live-region and reduced-motion behaviour;
- practical type, contrast and touch-target sizing;
- browser-level accessibility and responsive acceptance tests.

These requirements are not conditional on a tutorial, account, demo project or starter template.

### Optional onboarding polish

A later, independently shippable layer may add:

- a first-run choice between Learn with a demo, Start from a template and Blank project;
- a short, dismissible composition checklist;
- richer glossary and contextual-learning content;
- curated fixed starter songs and fixed instrument examples.

Skipping or dismissing this layer must lead to the same complete blank-project workflow. Optional onboarding state is local preference or session state and must not become persisted musical project data.

## Requirements

### First note and first song

- A new blank project must keep one empty pattern and one track; predefined musical content is not required for the must-have release.
- The empty pattern must present one obvious primary action for creating a note.
- Activating an empty step with one primary pointer click, one tap, or Enter must insert the current note, defaulting to C4, and select that step without first opening the on-screen keyboard.
- Moving focus or selection with arrow keys must not create a note; a focused rest must expose the same one-action Add note command and must not lead to a disabled inspector with no next step.
- Creating a note after audio activation should preview that note unless the user has disabled preview.
- The empty pattern state must explain the immediate sequence: add notes, add the loop to the song, then play it.
- The arrangement empty state and pattern placement action must use beginner-readable language such as Add loop to song while retaining Pattern and Clip as secondary terms where they teach the underlying model.
- If Song playback is unavailable because the arrangement is empty, the interface must explain why and offer the next relevant action rather than relying on a disabled Play button alone.
- The user must be able to place the active pattern on the selected track at the current song position without entering a step number.
- Undo and redo must cover note creation, placement and clip movement exactly as they do for existing project edits.

### Workspace navigation and terminology

- Pattern, Instrument and Keyboard must be visible workspace tabs at every supported viewport.
- The tabs must use appropriate tablist, tab and tabpanel semantics, expose the selected state, support arrow-key navigation and preserve the existing transient workspace selection.
- Selecting a track or clip may continue to open the related tool automatically, but implicit selection must not be the only route to that tool.
- The active track, pattern and clip context must remain visible when switching tools.
- Primary labels must use language understandable without DAW experience.
- Essential expert terms must be taught in context rather than removed. At minimum, the interface must explain:
  - Pattern as a repeating loop;
  - Clip as one occurrence of a loop in the song;
  - Gate as note length;
  - Velocity as note loudness or strength;
  - Oscillator or voice as sound shape;
  - Attack as the note's fade-in;
  - Release as the note's tail or fade-out.
- The control currently representing the octave used by pattern note entry must be labelled Keyboard octave or equivalent rather than implying a musical key or scale root.
- Concise explanations must be available from the relevant control without requiring a documentation site.
- Each required term must have a consistently placed help trigger or programmatic description that is reachable by touch, keyboard, and assistive technology.
- Contextual help must identify the control it explains, open without changing the control's value, support Escape and an explicit close action, and restore focus to its trigger.

### Keyboard and pointer parity

- Global playback shortcuts must run only when focus is on a non-interactive workstation surface.
- A global shortcut must not override a button, link, summary, select, input, dialog, menu, tab, slider, radio group or editable element.
- Opening a modal dialog or menu must suspend conflicting global shortcuts.
- On-screen piano keys must support pointer and touch hold-to-play operation plus a 250-millisecond one-shot preview when a focused key is activated with Enter or Space.
- Repeated keyboard events must not retrigger an owned preview; blur, page hiding, cancellation, disposal, and Stop sound must release every remaining piano-owned note.
- Computer-keyboard note input must remain available outside editable controls and must not interfere with workspace-tab or dialog navigation.
- Every clip must support keyboard selection, movement between tracks, movement by small and musical-grid increments, variation creation and removal.
- Dragging may remain the quickest pointer interaction, but it must not be the only way to move a clip.
- A selected-clip inspector must expose its pattern, track, start position and safe editing actions in labelled controls.
- Destructive clip and track actions must not depend on a small overlaid target or right-click menu.

### Dialogs and focus

- A control that is visually modal must use native dialog behaviour or equivalent dialog semantics and focus management.
- Every dialog and mobile sheet must have an accessible name, a visible close or cancel action and a predictable Escape path.
- Opening a dialog must move focus to a useful, non-destructive first control.
- Closing or cancelling must return focus to the control or musical object that opened it whenever that object still exists.
- Focus must remain contained within a modal dialog.
- Moving between Pattern, Instrument and Keyboard must not lose the current musical selection or start a live note.

### Responsive workstation

- Restart, Play/Pause and Stop must remain directly available on supported mobile viewports.
- Song/Pattern mode, tempo and master volume must remain reachable on mobile. Secondary mix controls may move into a labelled Mix sheet, but they must not be hidden without an alternative.
- The mobile global bar may use two rows or a bottom transport; it must not overlap, clip or horizontally scroll.
- Narrow pattern editors must use explicit banks or pages while preserving the full pattern length, global step numbers, selection and playhead.
- Bank size and navigation must remain understandable for 4-, 8-, 16- and 32-step patterns.
- Instrument controls must reflow into vertical groups on narrow screens rather than requiring an 820-pixel horizontal rack.
- The arrangement timeline may scroll horizontally while track identity and selected context remain available.
- At 200% browser zoom, core controls and labels must remain reachable without two-dimensional page scrolling outside the musical timeline.

### Legibility and target size

- Primary and destructive touch actions must provide a target of at least 44 by 44 CSS pixels.
- Other standalone interactive targets must be at least 24 by 24 CSS pixels. A smaller target is permitted only where the WCAG 2.2 spacing or equivalent-control exception is documented and a labelled 44-by-44 alternative is available in the relevant inspector or toolbar.
- Compact uppercase labels must remain legible at common phone density and browser zoom; essential labels must not depend on approximately 8-pixel text.
- Normal text must meet at least 4.5:1 contrast and large text at least 3:1.
- Interactive boundaries, focus indicators and non-text state indicators must meet at least 3:1 contrast against adjacent colours when required to identify the control or state.
- Focus, selection, playhead, mute, solo and error states must not rely on colour alone.

### Status and motion

- Live regions must announce semantic events such as Ready, Playing, Paused, Stopped, Saved, Export complete and Error.
- Frame-by-frame step counters, visualiser movement and continuously changing audio time must not be live regions.
- Status text must update the DOM only when its meaningful value changes.
- Reduced-motion mode must remove smooth scrolling, pulsing locate effects and continuous depth travel.
- When reduced motion is requested, transport and visualisation may update discretely on user actions and musical step boundaries while retaining useful state, pitch, track and playback information.
- Reduced-motion behaviour must not change audio scheduling or project data.

### Validation and success measures

- Manual release journeys must cover first note, first placement, Song playback, workspace switching, piano operation, clip movement and modal focus using pointer and keyboard input.
- axe checks must report no critical or serious violations in the startup state, active workstation, each workspace tool, each modal and the published player.
- Responsive acceptance must cover at least 320 by 568, 375 by 812, 768 by 1024, 1366 by 768 and 1920 by 1080 viewports.
- Tests must verify that mobile users can reach tempo, master volume and Song/Pattern mode.
- Tests must verify that Space activates a focused button normally and toggles transport only from an eligible workspace surface.
- Tests must verify that reduced-motion mode uses discrete visual updates and that transport status is not announced on every animation frame.
- In an unassisted usability check with first-time chiptune-workstation users, the median time from audio activation to the first audible programmed note must be under 30 seconds.
- In the same check, the median time from audio activation to a playing arrangement containing at least one placed non-empty pattern must be under two minutes.
- The median time from initial page entry to audio activation must be under 15 seconds, to the first audible programmed note under 45 seconds, and to the playing arrangement under two minutes 30 seconds.
- The check must include at least eight first-time users, with at least three completing the task on a narrow touch device and at least three on a desktop pointer-and-keyboard device.
- Unsuccessful attempts remain in the results and count as exceeding the relevant target; they must not be discarded from the median.
- Measurement may use a moderated test or consented local instrumentation; the acceptance targets do not require production analytics.

## Out of scope

- Replacing the native module architecture or introducing a component framework.
- Changing the project schema solely for onboarding or workspace preferences.
- A full piano-roll editor, score notation, effects rack or automated composition system.
- Removing expert terminology or maintaining separate beginner and expert applications.
- Replacing the full-screen composition visualiser.
- Requiring an account, cloud project or published snapshot to learn the workstation.

## Open questions

Resolved for this release:

- One primary click, tap, or Enter activation on a rest adds the current note, defaulting to C4, and selects it. Focus navigation alone never mutates the pattern.
- Focused on-screen piano buttons play a 250-millisecond one-shot preview with Enter or Space; mapped computer keys and pointer-held piano keys retain their existing held-note lifecycle.
- Clip movement uses one step for the small increment and four sixteenth-note steps for the larger beat increment.

Deferred:

- Should visible tabs use Pattern, Instrument and Keyboard, or paired labels such as Loop (Pattern), Sound (Instrument) and Keys (Keyboard)?
- Should narrow layouts show eight-step banks consistently, or choose four or eight steps from available width?
- Which controls belong directly in the mobile transport row and which belong in the Mix sheet?
- Which first-run choice should receive primary emphasis in the optional onboarding layer?
