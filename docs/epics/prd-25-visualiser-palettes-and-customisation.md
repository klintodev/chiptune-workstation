# PRD 25 Epics: Visualiser Palettes and Customisation

These epics deliver [PRD 25: Visualiser Palettes and Customisation](../product/25-visualiser-palettes-and-customisation.md) as a curated, project-owned palette foundation followed by bounded custom colour editing.

## Epic 91 - Portable palette registry

### Outcome

Every visual surface can resolve one validated palette identifier into the same accessible scene and track colours.

### User stories

#### US91.1 - Choose from distinct visual moods

As a composer, I want several intentional colour moods so that the visualiser feels connected to my song.

Requirements:

- Define at least eight immutable palettes with names, descriptions, scene roles, and eight ordered track colours.
- Preserve legacy identifiers and the current default appearance.
- Centralise palette resolution so workstation, legacy Canvas rendering, and public playback do not maintain separate colour maps.
- Reject unknown palette identifiers at the project-validation boundary.

#### US91.2 - Retain legibility

As a user with low vision or colour-vision differences, I want every palette to retain readable labels and non-colour meaning.

Requirements:

- Enforce contrast thresholds with deterministic tests.
- Retain shape, track name, order, note label, tails, active marks, and DOM alternatives.
- Keep high contrast and reduced motion independent of the saved palette.

### Acceptance and test coverage

- Tests cover palette identity, immutability, hexadecimal roles, contrast, deterministic track wrapping, default fallback, and unknown-value rejection.

## Epic 92 - Preview and apply workflow

### Outcome

Users can understand, compare, apply, cancel, and undo palette choices without disturbing music or project state during preview.

### User stories

#### US92.1 - Compare palettes visually

As a beginner, I want named swatches and a sample scene so that I can choose by feeling without knowing hexadecimal colour values.

Requirements:

- Expose **Colours** from compact and performance visualiser controls.
- Present choices as one labelled radio group with name, description, and swatches.
- Preview the selected choice while keeping it transient.
- Explain that the palette changes visuals rather than music.

#### US92.2 - Apply safely

As a composer, I want Cancel and Undo to work predictably so that experimenting with a palette is low risk.

Requirements:

- Start on the saved project palette.
- Make apply one history operation and leave cancel history-free.
- Restore the saved rendering and opener focus on close or Escape.
- Keep controls operable by keyboard, pointer, and touch at supported narrow sizes.

### Acceptance and test coverage

- Interaction coverage proves preview isolation, apply, cancel, Escape, focus restoration, history behaviour, and narrow-screen containment.

## Epic 93 - Shared project visual identity

### Outcome

A project's selected palette looks consistent while editing, performing, publishing, and remixing.

### User stories

#### US93.1 - See one identity everywhere

As a creator, I want the public player to retain my palette so that a shared song keeps the visual mood I chose.

Requirements:

- Resolve the palette from saved project state in the dock and performance viewer.
- Resolve the same palette from the immutable published snapshot in public playback.
- Preserve the palette through existing persistence, checkpoint, download, cloud, publication, and remix document paths.
- Never let palette application alter scheduler, audio, projection geometry, or musical data.

### Acceptance and test coverage

- Renderer and player tests cover matching scene roles, stable track order, publication round trips, and unchanged projection meaning.

## Epic 94 - Bounded custom palette editor

### Outcome

Users can create a portable personal palette without introducing arbitrary code, unreadable text, or unsafe publication content.

### User stories

#### US94.1 - Edit named colour roles

As a visual creator, I want to adjust background, grid, text, and track colours so that I can establish my own identity.

Requirements:

- Use native colour controls and validated hexadecimal data.
- Provide role explanations, safe defaults, per-role reset, reset all, and preview-before-apply.
- Block unsafe text contrast and clearly warn about weak track contrast.
- Store bounded custom palette data inside the project with a curated fallback identifier.

#### US94.2 - Share custom colours safely

As a publisher, I want my custom palette to remain intact on shared and remixed snapshots without executing code.

Requirements:

- Carry custom data through validation, migration, persistence, checkpoints, publication, and remixing.
- Accept no CSS strings, remote assets, URLs, shaders, or executable transforms.
- Fall back predictably when custom data is invalid or unsupported.

### Acceptance and test coverage

- Tests cover colour parsing, role bounds, contrast correction, reset, preview isolation, history, serialization, migration, publication, remixing, invalid-data fallback, and browser layout.

## Delivery sequence

1. Epic 91 centralises and validates palette data.
2. Epic 92 exposes curated selection and reversible preview.
3. Epic 93 carries the chosen identity through every existing visual surface.
4. Epic 94 follows as a separate iteration after the preset workflow has been observed with users.
