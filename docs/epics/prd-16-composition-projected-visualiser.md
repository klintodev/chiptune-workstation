# PRD 16: Composition-Projected Visualiser

## Description

Replace analyser-led visual guessing with a deterministic pixel-art scene projected from the project document and the audio scheduler's clock. Upcoming notes begin near a vanishing point and travel towards the viewer, reaching the foreground when their scheduled audio begins.

The visualiser is a read-only projection. It does not own musical state, schedule sound, or write animation objects into the saved project.

## Requirements

- Build every visible object from persisted project data: tracks, clips, patterns, notes, instruments, mixer values, tempo, mute, solo, gate, and velocity.
- Read timing from the scheduler's AudioContext-based playback snapshot rather than `setInterval`, wall-clock time, or DOM state.
- Produce the same scene for the same project and transport position across local, shared, and future exported playback.
- Show upcoming notes in depth, with their distance decreasing continuously as their scheduled start approaches.
- Keep a note at the foreground for its gate duration, then remove it.
- Map produced pitch to vertical position, velocity to size, track colour to object colour, track pan to horizontal position, and voice type to pixel shape.
- Support arrangement and selected-pattern playback, including arrangement loop wrapping.
- Keep stopped and paused scenes useful and deterministic.
- Keep rendering separate from projection calculation so the mapping can be tested without Canvas or Web Audio.

## Open questions

- Future iteration: should release duration leave a visual tail after the gate closes?
- Future iteration: should users be able to customise the projection mappings per track?
- Future iteration: should live keyboard preview produce temporary visual events even though it is not part of the saved arrangement?

## E56: Audio-clock timeline projection

- Expose an immutable scheduler snapshot containing mode, status, current step, fractional step progress, step duration, and active pattern/track ownership.
- Convert the project document and scheduler snapshot into a bounded list of upcoming and active note objects.
- Cover arrangement, pattern, looping, rests, mute, solo, octave, gate, and velocity with focused tests.

## E57: Head-on note field

- Render each projected note as a labelled pixel-art object in perspective.
- Move objects from the vanishing point to the foreground using scheduled musical time.
- Give pulse, triangle, saw, and noise voices distinct silhouettes.
- Keep transport controls, themes, reduced motion, and Canvas fallback behaviour intact.

