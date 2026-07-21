# PRD 14 Epic: Composition Workflow Polish

This epic removes friction from the current workstation without expanding its core scope.

## E51: Clearer composition and delivery controls

### Outcome

Common composition, playback, sharing, and export actions are easy to understand and behave consistently in both themes.

### User stories

#### US51.1 - Keep project actions focused

As a user, I want the technical JSON export action removed so that the project library only presents actions I am expected to use.

Requirements:

- The visible JSON export action is removed from the project library.
- Local autosave and JSON import remain available.
- Removing the action does not change the persisted project format or cloud storage boundary.

#### US51.2 - Export a playable WAV

As a user, I want WAV export to download a valid audio file so that I can listen to my arrangement outside Klinto Studio.

Requirements:

- Export renders the complete audible arrangement and downloads a stereo 16-bit PCM WAV.
- The file has a valid RIFF/WAVE structure and a project-derived filename.
- Progress, success, empty-arrangement, unsupported-browser, and render failures are clearly reported.
- Focused automated checks cover the render plan and encoded file structure.

#### US51.3 - Tune noise voices

As a user, I want note pitch and instrument octave to change a noise voice so that I can program distinct percussion and effects.

Requirements:

- Noise uses note frequency to control its chiptune noise clock.
- Pitch changes are audible in keyboard preview, live playback, and WAV export.
- Noise steps show their note name instead of hiding pitch behind a generic “Hit” label.

#### US51.4 - Change gate length quickly

As a user, I want a clear one-click gate control so that I can shape note length without fighting a small control.

Requirements:

- The four supported gate lengths are shown together as 25%, 50%, 75%, and Full.
- Exactly one value is selected for a programmed note.
- The selected value has a strong visual state and an explicit readout.
- Arrow, Home, and End keys move through the available values.

#### US51.5 - Recognise global tools

As a user, I want familiar share and visualiser icons so that I can identify the global tools without guessing.

Requirements:

- Share uses a standard connected-nodes symbol.
- Visualiser uses a standard equaliser symbol.
- Each control retains a clear accessible name and tooltip.

#### US51.6 - Keep playback mode with transport

As a user, I want Song/Pattern mode next to restart, play, and stop so that all playback decisions live together.

Requirements:

- The mode control is moved beside the transport buttons.
- Sign in remains in the top-right account area.
- Existing mode behaviour and keyboard playback shortcuts are unchanged.

#### US51.7 - Use a clean light theme

As a user, I want light mode without scanlines so that controls and text remain clear.

Requirements:

- The CRT scanline overlay is disabled in light mode.
- Dark mode retains its current visual treatment.
- Light-theme colour contrast and keyboard focus treatment remain intact.

## E52: Track-coloured arrangement grid

### Outcome

The arrangement reads as a set of distinct musical lanes because every track's colour continues from its header through its grid and clips, without losing the selected-clip highlight.

### User stories

#### US52.1 - Follow a track across the arrangement

As a user, I want each arrangement lane and its clips to use the same colour as the track header so that I can scan a busy song without losing which clip belongs to which instrument.

Requirements:

- Each track keeps one colour across its header stripe, name, volume control, lane grid, and clips.
- Adjacent tracks use distinct colours from the existing track palette.
- Lane colours remain deliberately subtle so that the timeline grid stays readable.
- Clip labels and boundaries remain legible in both dark and light themes.
- The add-track action follows the final track as its own row instead of competing with the timeline ruler.

#### US52.2 - Keep selection obvious

As a user, I want a selected clip to retain the existing strong highlight so that track colour never makes the current editing target ambiguous.

Requirements:

- Selection is an additional outline and glow, not a replacement for the track colour.
- The selected clip remains identifiable without relying on colour alone.
- Drag, remove, hover, and keyboard-focus states continue to work.
