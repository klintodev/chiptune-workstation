# PRD 26: First-Session Interface Craft

## Description

Turn the existing beginner workflow into an interface that feels immediate, legible, and intentional from the first frame to the first note.

This release applies the findings from the July 2026 interface audit without changing the musical project model. It removes startup gates, gives the empty pattern visual priority, separates focus, selection, and playback states, simplifies essential language, and replaces text glyphs with a small consistent icon system. It also establishes reusable type, colour, geometry, and CRT-effect tokens instead of solving those concerns independently in each feature.

The release complements PRD 21. PRD 21 defines the complete beginner and accessibility outcome; this PRD records the visual and interaction craft pass that can be delivered independently against the current workstation.

## Dependencies

- PRD 18 supplies the production loading and asset pipeline affected by first-paint changes.
- PRD 21 supplies the beginner terminology, keyboard, touch, dialog, and responsive interaction requirements.
- PRD 22 supplies the compact visual guide and performance visualisation surfaces.
- PRD 23 supplies the maintainable module and browser-quality direction.
- PRD 25 supplies project-owned visualiser palettes; this PRD does not replace that customisation model.

## Implementation epics

[PRD26/E95-E98](../epics/prd-26-first-session-interface-craft.md) separates immediate startup, reusable interface tokens, first-session hierarchy, and responsive quality gates.

## Requirements

### Immediate first frame and first sound

- The application shell must render without an artificial loading delay or a timed blank state.
- Critical inline styles may prevent an unstyled flash, but the loaded application must own visibility immediately.
- Audio setup must not obscure the workstation on entry.
- The first musical intent—Play, a piano key, a computer-keyboard note, or a note preview—must initialise audio and continue the requested action.
- Releasing a key before audio is ready must cancel its pending note so delayed startup cannot create a stuck sound.
- Audio errors must expose the existing setup and recovery dialog.
- An empty project must start in Pattern playback mode so its primary transport action is meaningful.

### Cohesive visual language

- Pixel typography must use a small set of named size tokens. Pixel labels use the compact token and major pixel headings use the title token.
- Essential instructions and values must continue to use the larger reading face; dense pixel text must not become body copy.
- Transport and overflow controls must use authored SVG icons rather than operating-system glyphs or emoji.
- Focus, selection, playback, warning, and error must use separate semantic colour roles.
- Track colour identifies a track but must not reduce clip-label readability.
- Timeline step and bar geometry must come from shared runtime CSS variables rather than duplicated pixel constants.
- Disabled controls must remain recognisable and readable while clearly inactive.
- Shared action and help styles must resolve through normal component specificity rather than `!important`.

### Beginner-readable controls

- Primary labels must prefer **Loop**, **Note length**, **Loudness**, **Sound shape**, **Fade-in**, and **Tail** where the expert term is not required to complete the task.
- Help content must retain and explain Pattern, Clip, Gate, Velocity, Voice/oscillator, Attack, and Release.
- Instrument voice choices must be one visible radio group with arrow, Home, and End key operation.
- Pattern pitch, octave, and voice must have one authoritative visible control or state owner rather than hidden duplicate form controls.
- The first empty pattern must receive more vertical space than the empty song arrangement.
- Once the project contains a clip, the normal balanced editing hierarchy may return.

### CRT atmosphere and user control

- Scanlines and vignette may add character but must remain behind dialogs and avoid reducing foreground legibility.
- The effect must have a visible session-level on/off control on viewports where the global tool bar has room.
- Reduced-transparency preferences must weaken the effect automatically.
- Light theme must retain only a subtle treatment.
- CRT preference is interface session state and must not alter musical project or publication data.

### Responsive composition

- The mobile global bar must not horizontally overflow.
- Core transport actions remain directly available on narrow screens.
- Secondary appearance and account actions may leave the narrow global bar when space is insufficient.
- Below 768 CSS pixels, the arrangement presents a compact song overview and explicitly directs detailed arranging to a wider screen.
- The compact overview must retain song structure and playback position without pretending the full desktop timeline is touch-optimised.
- Pattern, instrument, keyboard, visual guide, and mix workflows remain available on narrow screens.

## Acceptance and test coverage

- Source tests verify that startup has no timed reveal and no initially open audio dialog.
- Interaction tests cover audio-on-intent, pending-note cancellation, keyboard note release, and transport startup.
- Interface-contract tests cover typography tokens, semantic states, SVG controls, absence of hidden duplicate fields, and variable-driven timeline geometry.
- First-session tests verify Pattern mode and the empty-project hierarchy.
- Responsive visual review covers at least 390 by 844 and 1440 by 960.
- The full unit, accessibility, architecture, build, and smoke suite must remain green.
- Production assets must build successfully after the inline critical-style change.

## Deferred work

- Browser-automated screenshot comparison and overflow assertions across the complete PRD 21 viewport matrix.
- Usability measurement with first-time composers.
- A complete icon registry if more controls adopt icons.
- User-authored workstation themes; PRD 25 remains the bounded customisation path for visualiser colours.
- A fully touch-optimised arrangement editor. This release uses an honest compact overview on phones.

## Design review questions

- Does hiding detailed arranging below 768 CSS pixels remain the right trade-off after observing tablet and landscape-phone use?
- Should CRT preference become a persisted local preference once the session control has been observed?
- Should the compact pixel label increase above 8 CSS pixels on low-density or high-zoom displays?
- Which secondary global actions deserve a dedicated mobile menu rather than being omitted from the narrow header?
