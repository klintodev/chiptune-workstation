# Klinto Studio V2 product requirements

Status: Draft for implementation planning  
Product: Klinto Studio  
Target release: V2 Beta, then V2 Stable

This package defines the smallest coherent route from the current step-sequencer product to a browser-native, FL Studio-inspired workstation. It is a product contract, not permission to build a general DAW.

## Confirmed direction

- The Piano Roll becomes the default composition surface.
- The Playlist, Piano Roll and Mixer are full-workspace primary surfaces; only one is visible at a time.
- A first-party Instrument or Effect may open above the primary surface; only one device window is visible at a time.
- Patterns remain project-level, reusable musical objects. Tracks own an instrument, a Mixer channel and a Playlist lane.
- V2 uses 96 pulses per quarter note (PPQ), with launch editing snapped to 1/8, 1/16 or 1/32 notes.
- Klinto Chip is the launch instrument. Schema 8 adds the post-launch Klinto Drums first-party instrument; Klinto Filter and Klinto Delay remain the only effects.
- Instruments and effects are written by Klinto for the Web Audio runtime. V2 does not host native VST, Audio Unit or arbitrary third-party plug-ins.
- One `V2 Beta` badge is shown during Beta and removed or deliberately renamed at Stable.

The direction borrows FL Studio's object separation and workflow, not its density, free-floating desktop or native plug-in ecosystem.

## Document set

| PRD | Owns | Depends on |
| --- | --- | --- |
| [PRD 26](./26-v2-product-direction.md) | Product boundary, retained capabilities and release definition | V1 stabilization |
| [PRD 27](./27-windowed-studio-workspace.md) | Global shell, primary-surface host and one-device window model | PRD 26 |
| [PRD 28](./28-patterns-and-piano-roll.md) | Shared tick/event foundation, Patterns and Piano Roll | PRDs 26â€“27 |
| [PRD 29](./29-first-party-instruments.md) | First-party instrument contract and Klinto Chip | PRDs 27â€“28 |
| [PRD 31](./31-playlist-arrangement.md) | Playlist presentation and arrangement commands | PRDs 27â€“29 |
| [PRD 30](./30-mixer-routing-and-effects.md) | Mixer, bounded routing, Klinto Filter and Klinto Delay | PRDs 27â€“29 |
| [PRD 32](./32-v2-compatibility-and-release.md) | Schema activation, migration, hosted compatibility and release gates | PRDs 26â€“31 |
| [PRD 33](./33-klinto-drums.md) | Schema-8 Klinto Drums instrument, mapped kit and instrument chooser | PRDs 27–32 |
| [V2 schema contract](./v2-project-schema-contract.md) | Normative Project/document shape, defaults, bounds and V1 field map | Finalized PRDs 28â€“30; required before PRD 32 activation |
| [Release and rollback runbook](./release-and-rollback-runbook.md) | Exact PRD 32 artifacts, cutover order, recovery evidence and emergency rollback | PRD 32 compatibility implementation |

The numbering follows the existing product-document sequence. Delivery order is intentionally not numerical: Playlist is part of the core compose-to-song journey and does not wait for effects.

## Delivery order

1. Finish the V1 stabilization and deterministic test baseline already in progress.
2. Build PRD 27's generic primary-surface and single-device hosts behind a V2 flag, with approved 1366Ã—768 and 390Ã—844 wireframes.
3. Build PRD 28's complete in-memory musical-time foundation and Piano Roll: pattern events, clip starts, loop bounds and shared scheduling all use ticks together.
4. Build Klinto Chip and its first-party instrument runtime under PRD 29.
5. Build the Playlist presentation and commands under PRD 31.
6. Build the Mixer, Filter and Delay under PRD 30.
7. Pass PRD 32's schema-activation gate. The final V2 serialized shape lands atomically before any ordinary V2 save, import, cloud write, publish or export is enabled.
8. Run an opt-in Beta, close compatibility/accessibility gaps, remove superseded V1 UI, then declare Stable.

No intermediate persisted V2 shape may escape into a normal user repository. If a persisted shape changes after activation, its schema version increments; a published schema version never changes meaning in place.

## V2 launch definition

V2 is complete only when a user can:

1. Open or create a project into a clean Piano Roll-first workspace.
2. Create and edit variable-duration Pattern notes with desktop pointer and keyboard access, including chords formed by overlapping notes at different pitches.
3. Audition the Pattern through an explicit track and Klinto Chip.
4. Add that Pattern at the first valid snapped position at or after the Playlist insertion cursor, arrange linked clips and play Song mode.
5. Mix tracks and master, insert Filter or Delay, and hear the same graph in live playback, WAV export and public playback.
6. Save, reload, download, import, publish and remix without losing V1 or V2 musical state.
7. Complete the required journeys at 1366Ã—768 without page-level scrolling and complete the defined mobile smoke journey at approximately 390Ã—844.

## Scope discipline

Each implementation PR must name one PRD and one delivery slice. A PR must not begin the next slice merely because adjacent code is convenient to touch.

V2 explicitly excludes:

- Native VST or Audio Unit hosting, arbitrary uploaded code, third-party plug-ins or a plug-in SDK
- Rack/channel-rack UI, a separate Keyboard window or a generic movable/minimizable window manager
- Additional instruments beyond the PRD 33 Klinto Drums extension, additional effects, user presets or a preset marketplace
- Automation lanes, MIDI import/export, audio recording, audio clips or sample libraries
- Sends, return buses, sidechains or arbitrary routing graphs
- Free/off-grid timing, triplets, swing, tempo automation or time-signature editing
- Full touch composition, multi-note gestures and mobile clip rearrangement
- Collaboration, account, publishing, sharing or theming redesigns

Anything outside these contracts needs its own post-V2 product decision.





