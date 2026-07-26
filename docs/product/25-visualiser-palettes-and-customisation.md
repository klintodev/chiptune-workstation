# PRD 25: Visualiser Palettes and Customisation

## Description

Give each project a recognisable visual mood without asking the user to understand rendering code or colour theory.

The first release restores the existing project-level palette setting to the composition-projected visualiser, expands it into a curated preset library, and makes selection understandable through named swatches and a safe preview. The same palette follows the project into public playback.

This release also establishes the bounded colour-role model needed for later custom palettes. Custom values remain deferred until they can be validated, made accessible, previewed safely, and transported without accepting arbitrary CSS.

## Dependencies

- PRD 11 supplies the validated visualiser project configuration and history command.
- PRD 12 supplies immutable published project snapshots and the public player.
- PRD 21 supplies keyboard, focus, dialog, responsive, and non-colour interaction requirements.
- PRD 22 supplies the shared deterministic composition renderer, compact dock, performance view, high-contrast treatment, and textual alternatives.
- PRD 23 supplies module boundaries and browser-level quality gates.

## Implementation epics

[PRD25/E91-E94](../epics/prd-25-visualiser-palettes-and-customisation.md) separates the palette registry, selection experience, project and publication consistency, and a later bounded custom editor.

## Requirements

### Curated palette library

- The first release must provide at least eight named palettes with short plain-language descriptions.
- Each palette must define a scene background, perspective grid, primary text, muted text, and eight ordered track colours.
- Palette definitions must be immutable, serializable application data rather than CSS supplied by a user.
- Every text colour must retain at least WCAG AAA contrast against its scene background, muted text at least WCAG AA contrast, and every track mark at least 3:1 contrast.
- Existing `arcade`, `ice`, and `sunset` project values must remain valid.
- The current Klinto visual appearance must remain the default so enabling palette support does not unexpectedly restyle existing default projects.
- Track order must remain stable when a palette changes. Palette selection changes colour values, not track identity, note geometry, shape, timing, mixer state, or sound.

### Understandable selection and preview

- **Colours** must be reachable from both the compact visual guide and performance view.
- The picker must show a name, description, and representative swatches for every palette.
- The current palette must be selected when the picker opens.
- Moving among palette choices must update a visual sample and may temporarily preview the visualiser without changing authoritative project state.
- **Cancel**, Escape, or closing the picker must restore the saved palette and return focus to the control that opened it.
- **Use this palette** must apply exactly one project-history change, after which ordinary Undo restores the prior palette.
- The picker must state that colour changes do not change the music.
- Radio-group semantics, visible keyboard focus, touch-sized actions, and narrow-screen scrolling must remain practical at 320 by 568 and 375 by 812.

### One project identity across visual surfaces

- The compact guide and performance view must resolve scene and track colours from the same saved palette identifier.
- Public playback must render the palette stored in the immutable published project snapshot.
- Checkpoints, local persistence, downloads, cloud projects, publication, and remix import inherit palette data through the existing validated project document.
- Palette changes must not restart playback, reschedule notes, recreate audio graphs, or alter scheduler state.
- Canvas-unavailable textual alternatives must retain the same musical meaning without requiring palette information.

### Accessibility and user preferences

- Palette names and descriptions must be available as text; colour swatches alone are insufficient.
- Track name, track order, voice shape, note label, duration, depth, active marks, and the DOM note list must continue to communicate meaning without colour.
- High contrast must strengthen the selected palette's grid and note separation rather than silently switching project data to another palette.
- Reduced motion must remain independent of palette choice.
- Palette previews must not create automatic live-region announcements while a user moves through options.

### Future bounded custom palettes

- A later custom editor may expose background, grid, text, and track roles through native colour controls and validated hexadecimal values.
- A custom palette must be copied into the project document as bounded data; it must not reference global CSS variables, executable code, remote styles, images, shaders, or URLs.
- The editor must provide named-role defaults, reset per role and reset all, contrast feedback, and a safe preview before apply.
- Unsafe text contrast must be blocked or automatically corrected. Low track-mark contrast must produce an explicit warning and non-colour preview.
- Custom values must follow the same persistence, publication, remix, migration, history, and public-player boundaries as curated palettes.
- A project must retain a portable fallback preset identifier so unsupported custom data can fail safely.

## Out of scope for the palette-preset release

- Arbitrary custom colour entry, gradients, images, video, shaders, WebGL, user CSS, or external assets.
- Per-note colour editing or changing the meaning of track colour.
- Applying a visualiser palette to the complete workstation theme.
- Animated palette transitions or audio-reactive colour cycling.
- A public palette marketplace, palette URLs, account synchronisation independent of projects, or remote palette code.

## Acceptance and test coverage

- Palette tests must cover unique identifiers, immutable role data, eight track colours, hexadecimal bounds, deterministic track wrapping, and invalid identifier rejection.
- Contrast tests must cover primary text, muted text, and every track colour against every scene background.
- Project tests must cover default compatibility, apply, undo, serialization, and rejection of arbitrary values.
- Interaction tests must cover current selection, keyboard focus, live sample preview, apply, cancel, Escape, opener focus restoration, and proof that preview creates no history.
- Renderer tests must prove that compact, performance, and public playback resolve the same palette and track order.
- Browser layout tests must cover desktop, 375 by 812, and 320 by 568 without page or dialog overflow.
- The existing projection, scheduler, persistence, publication, remix, player, and accessibility suites must remain green.

## Open questions

- Should later custom palettes provide eight per-track colours, a smaller repeating colour ramp, or both?
- Should a project author be able to lock a published palette while still allowing a visitor-only high-contrast override?
- Should palette choice eventually affect exported video or image artwork if those formats are introduced?
- Should users be able to save personal palette presets outside a project, and if so, are they browser-local or account-synchronised?
