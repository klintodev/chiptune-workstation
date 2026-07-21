# PRD 11: Visualiser Editor

## Description

Allow users to create a distinctive visual identity for their music without writing code. Users build a visualiser from a constrained set of layers, then map analysed audio signals to each layer's energy.

The editor balances creative flexibility with safety, performance, portability, and consistent playback when shared.

## Requirements

- A user must be able to switch between a built-in preset and custom layer mode.
- A custom visualiser may start from the active preset or an empty layer list.
- A visualiser may contain up to eight ordered layers.
- The supported layer types must be Bars, Waveform, and Pulse.
- The user must be able to add, select, rename, remove, duplicate, show, hide, reset, and reorder layers.
- Each layer must expose colour role, opacity, and size.
- Each layer must map one of amplitude, bass, mid, or treble to its energy.
- A mapping must expose a bounded drive amount and expand/contract direction.
- Changes must preview without restarting the visualiser.
- Layer changes must participate in project history and automatic persistence.
- The configuration must be serializable as validated data without arbitrary executable code.
- Custom rendering must use the existing Canvas 2D pipeline, palette, master controls, and reduced-motion behaviour.
- The editor must prevent more than eight layers and reject invalid properties or mappings.
- Preset-only visualiser data must reopen unchanged and receive safe editor defaults.
- Focused tests must cover bounds, migration, deep immutability, and history.

## Open questions

None for the first release. Text, images, external assets, shaders, independent visualiser files, additional mapping transforms, and more layer types are deferred.
