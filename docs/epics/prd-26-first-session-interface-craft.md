# PRD 26 Epics: First-Session Interface Craft

These epics deliver [PRD 26: First-Session Interface Craft](../product/26-first-session-interface-craft.md) as a focused design-audit implementation over the current workstation.

## Epic 95 - Immediate startup and audio on intent

### Outcome

The workstation is visible immediately, and the first musical action produces sound without a blocking setup ritual.

### User stories

#### US95.1 - Enter the workstation immediately

As a new composer, I want to see the working interface on the first frame so that the product feels ready rather than stalled.

Requirements:

- Remove the timed critical-style reveal from workstation and public player entry points.
- Keep first paint stable without leaving visibility under timer control.
- Leave the audio setup dialog closed unless recovery is required.

#### US95.2 - Continue my first musical action

As a composer, I want my first Play or note action to initialise audio and continue so that I do not have to repeat it.

Requirements:

- Initialise audio from transport, pointer piano, computer keyboard, and note-preview intents.
- Cancel pending note ownership when its key or pointer is released.
- Open recovery UI on an audio initialisation error.
- Begin empty projects in Pattern mode.

### Acceptance and test coverage

- Tests cover source startup state, first-intent continuation, pending cancellation, note release, failure recovery, and empty-project mode.

## Epic 96 - Interface tokens and authored iconography

### Outcome

Typography, status colours, timeline geometry, and common controls follow one maintainable visual language.

### User stories

#### US96.1 - Read a consistent hierarchy

As a user, I want labels, headings, instructions, and values to look consistently related so that I can scan the workstation.

Requirements:

- Centralise compact and title pixel sizes as named tokens.
- Reserve the reading face for explanatory copy and values.
- Give focus, selection, playback, warning, and error distinct semantic roles.
- Keep clip labels readable independently of track colour.

#### US96.2 - Recognise controls reliably

As a user moving across devices, I want transport and overflow icons to keep the same form so that system fonts do not change their meaning.

Requirements:

- Replace text glyphs with inline SVG for transport, stop, loop, and overflow controls.
- Drive play/pause appearance from state rather than rewriting button text.
- Supply timeline geometry through CSS custom properties updated by the arrangement view.
- Remove avoidable shared-style `!important` overrides.

### Acceptance and test coverage

- Interface-contract tests cover token use, authored icons, semantic colours, state-driven transport rendering, and variable-driven geometry.

## Epic 97 - First-session hierarchy and terminology

### Outcome

The empty workstation emphasises the action a beginner can take now and teaches expert terms only when they become useful.

### User stories

#### US97.1 - Know where to begin

As a first-time composer, I want the empty pattern to dominate the workspace so that creating notes feels like the obvious next step.

Requirements:

- Give the pattern editor the majority of first-session workspace height.
- Compress the empty arrangement until the project contains its first clip.
- Preserve the normal hierarchy after a clip exists.

#### US97.2 - Understand music controls

As a beginner, I want plain primary labels and concise definitions so that unfamiliar production language does not block me.

Requirements:

- Use beginner-readable primary labels for loop, note length, loudness, sound shape, fade-in, and tail.
- Retain expert terms in the help glossary with plain definitions.
- Remove hidden duplicate pitch, octave, and voice controls.
- Make voice selection a keyboard-operable radio group.

### Acceptance and test coverage

- Tests cover label sources, glossary terms, duplicate-control removal, radio-group operation, and first-clip hierarchy state.

## Epic 98 - Atmosphere and responsive honesty

### Outcome

The workstation keeps its CRT character without obstructing content and presents a deliberate, truthful mobile composition surface.

### User stories

#### US98.1 - Control decorative effects

As a visually sensitive user, I want to reduce the CRT treatment so that decoration does not compete with the music interface.

Requirements:

- Keep overlays below modal content and lower their default strength.
- Provide a session-level CRT toggle where header space permits.
- Respect reduced-transparency and light-theme contexts.

#### US98.2 - Use a deliberate narrow layout

As a phone user, I want controls to fit and the song structure to remain understandable so that the interface does not present a clipped desktop timeline.

Requirements:

- Prevent global-header and compact-overview horizontal overflow.
- Retain direct core transport access.
- Present a compact arrangement overview below 768 CSS pixels.
- Explain that detailed arranging needs a wider screen while keeping other composition tools available.

### Acceptance and test coverage

- Source and visual review cover overlay stacking, effect preference, 390-by-844 containment, compact overview copy, and 1440-by-960 desktop hierarchy.

## Delivery sequence

1. Epic 95 removes first-entry friction and protects note ownership.
2. Epic 96 establishes the reusable visual primitives used by the remaining work.
3. Epic 97 applies those primitives to the beginner journey.
4. Epic 98 completes the atmosphere and responsive review before merge.
