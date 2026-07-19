# PRD 10: Visualiser Editor

## Description

Allow users to create a distinctive visual identity for their music without writing code. Users build a visualiser from a constrained set of layers, then map musical or analysed audio signals to supported visual properties.

The editor must balance creative flexibility with safety, performance, portability, and the need for a visual configuration to reproduce consistently when shared.

## Requirements

- The user must be able to create a custom visualiser from an existing preset or an empty supported template.
- A visualiser must contain one or more ordered visual layers.
- The user must be able to add, remove, duplicate, show, hide, and reorder layers.
- The product must provide a defined set of layer types with editable properties.
- The user must be able to map supported audio or sequencer signals to supported visual properties.
- Each mapping must expose a constrained transformation model, including sensitivity/range and direction where appropriate.
- Changes must preview during playback without requiring the visualiser to be restarted.
- The user must be able to reset a property, layer, or full visualiser to known defaults.
- The editor must distinguish static property values from audio-driven values.
- Invalid combinations must be prevented or explained in the interface.
- The configuration must be serializable as data without arbitrary executable code.
- Custom visualisers must be stored in the versioned project format.
- The editor must enforce limits that protect rendering and audio performance.
- A saved visualiser must reproduce consistently after the project is reopened.
- Reduced-motion behaviour must be defined for custom mappings as well as built-in presets.

## Open questions

- Which layer types are necessary for a compelling first editor?
- Which properties can be mapped safely and intelligibly?
- Should mappings use raw analyser data, derived features, sequencer events, or all three?
- How advanced should mapping transforms be before the editor becomes inaccessible to non-technical users?
- Is a canvas-based layer model sufficient, or should shader-based layers be supported?
- Should users be able to add text, images, or other external assets?
- How are fonts and other potentially non-portable resources handled?
- What hard limits should apply to layers, mappings, resolution, and frame rate?
- Should visualiser configurations be importable/exportable independently of songs?
