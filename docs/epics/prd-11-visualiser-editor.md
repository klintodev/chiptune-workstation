# PRD 11 Epics: Visualiser Editor

These epics deliver [PRD 11: Visualiser Editor](../product/11-visualiser-editor.md) as a constrained, serializable layer editor.

## E40: Safe visual layer model

- Define Bars, Waveform, and Pulse layers as validated data.
- Bound layer count, names, opacity, size, colour role, and audio mappings.
- Store no executable code or external resources.

## E41: Ordered layer workflow

- Add, select, rename, show, hide, reorder, duplicate, reset, and remove layers.
- Start a custom visual from the active preset or an empty layer list.
- Keep all edits in project history so accidental changes can be undone.

## E42: Constrained audio mapping

- Map amplitude, bass, mid, or treble to each layer's energy.
- Expose bounded drive and expand/contract direction.
- Preview property and mapping changes immediately.

## E43: Portable custom rendering

- Render custom layers in saved order through the existing Canvas 2D pipeline.
- Retain palette, intensity, sensitivity, motion, visibility, and reduced-motion behaviour.
- Migrate preset-only visualiser data without changing its appearance.
- Cover schema bounds, migration, history, and immutability with focused tests.
