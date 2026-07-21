# PRD 15 Epics: Signal Stack Visualiser

These epics translate the supplied Klinto Studio designs into a focused visual performance surface. The workstation layout already matches the new direction closely, so this work concentrates on the major visualiser change without reversing established product decisions.

## Design boundary

- Keep Song/Pattern mode beside the transport and keep Sign in in the account area.
- Do not restore JSON export or the light-theme scanline overlay.
- Keep track removal behind the existing custom confirmation dialog.
- Preserve saved visualiser data for local and cloud project compatibility, even though the focused viewer no longer exposes the previous layer editor.

## E53: Immersive Signal Stack viewer

### Outcome

The visualiser becomes a full-screen performance view instead of a settings form around a small canvas.

### User stories

#### US53.1 - See the music without interface clutter

As a user, I want the visualiser to fill the available screen so that it feels like a performance surface rather than another editor.

Requirements:

- The visualiser opens as a modal that uses nearly the full viewport while keeping a deliberate outer margin.
- The Signal Stack canvas is the dominant element and grows with the viewport.
- Preset, palette, intensity, sensitivity, motion, and layer-editing controls are removed from the viewing surface.
- The viewer works in dark and light themes without reintroducing light-theme scanlines.

#### US53.2 - Control playback from the viewer

As a user, I want playback controls and status inside the visualiser so that I do not need to close it during a performance.

Requirements:

- The header shows the current playback mode, state, and step.
- Play and Stop actions use the workstation's existing transport behaviour.
- Close is clear, keyboard accessible, and returns focus to the button that opened the viewer.
- Escape closes the viewer using native modal behaviour.

## E54: Per-track reactive signal lanes

### Outcome

Every track has its own readable visual lane driven by that track's audio, colour, voice, and mixer state.

### User stories

#### US54.1 - Follow each instrument visually

As a user, I want one lane per track so that I can see how the parts of my song combine.

Requirements:

- Every project track renders exactly one lane in project order.
- Lane colour matches the same track colour used by its arrangement header, grid, and clips.
- Each lane identifies the track name and voice type.
- Track mute, solo, volume, and instrument volume are reflected by the lane because analysis happens after the track's mixer gain.
- Adding, removing, renaming, reordering, or changing the voice of a track updates the viewer immediately.

#### US54.2 - Give tonal and noise voices distinct character

As a user, I want noise and pitched instruments to look different so that the visualiser communicates the arrangement rather than drawing four identical meters.

Requirements:

- Pulse, triangle, saw, and square voices use a pixelated waveform/spectrum treatment.
- Noise voices use a stable pixel-noise treatment whose density reacts to their signal.
- Stopped or silent projects retain a restrained, deterministic idle trace so the screen is never an unexplained blank.
- Rendering remains decorative only and never changes the audible signal path.

## E55: Resilient visual performance

### Outcome

The Signal Stack remains usable from one to eight tracks, across common viewport sizes, and when browser capabilities are limited.

### User stories

#### US55.1 - Keep every lane legible

As a user, I want the visualiser to adapt to my project and screen so that track labels and signals remain readable.

Requirements:

- Lane height adapts to the number of tracks and the available viewport.
- The viewer remains usable on narrow screens without controls covering the canvas.
- Canvas pixel density is capped to protect performance on high-density displays.
- Animation stops while the dialog or browser tab is hidden.

#### US55.2 - Respect accessibility and browser limits

As a user, I want the viewer to remain understandable with reduced motion, keyboard navigation, or missing Canvas support.

Requirements:

- Reduced-motion mode keeps audio response while removing unnecessary time-based movement.
- Controls have visible names, useful tooltips, and practical click targets.
- A clear fallback message appears if Canvas 2D is unavailable; music playback is unaffected.
- Focused automated tests cover per-track analysis wiring, deterministic lane rendering, and existing saved visualiser compatibility.

