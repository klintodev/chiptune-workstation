# PRD 29: First-party instruments

Status: Draft  
Release: Klinto Studio V2  
Depends on: PRDs 27â€“28

## Description

Introduce a closed, first-party Instrument contract and move each Track's V1 sound properties into one stable Klinto Chip instance with its own focused device window.

Klinto writes and ships the synthesis code. This is not native VST hosting, a browser plug-in loader or a public extension API.

## Product outcome

A user opens the audition/destination Track's Klinto Chip, changes its sound while music plays, closes it and returns to the same Piano Roll context. Each Track keeps independent, persisted Instrument state, and migrated V1 projects retain their sound controls and runtime behaviour.

## Ownership and lifecycle

- Every Track owns exactly one Instrument instance at V2 launch.
- The owning Track's `name` is the one persisted user-editable name shared by Track, Mixer and Instrument presentation.
- Klinto Chip is the immutable registry product/type name; an Instrument instance has no independent alias.
- Pattern note events contain no Instrument data.
- A Playlist clip sounds through its destination Track's Instrument.
- Instrument identity remains stable through parameter edits, Track reorder, save/reload and Effect changes.
- Removing a Track releases its voices, disposes its Instrument runtime and closes its visible device presentation before dependent UI unmounts.
- Undo restores data/runtime but does not automatically reopen the device.
- Closing the Instrument window changes presentation only; playback and the runtime continue.

## Serialized Instrument contract

The final V2 Track embeds:

```json
{
  "instrument": {
    "instanceId": "inst_...",
    "type": "klinto-chip",
    "version": 1,
    "params": {
      "waveform": "square",
      "octave": 0,
      "attackSeconds": 0.008,
      "releaseSeconds": 0.03,
      "level": 0.35
    }
  }
}
```

These are the exact new-Project defaults. The complete normative object, bounds and canonical keys live in [the V2 schema contract](./v2-project-schema-contract.md).

Contract rules:

- Type and parameter keys above are stable once schema activation occurs.
- The Instrument object has no `name` key. Rename Instrument writes the owning Track's canonical `name` and preserves this strict shape.
- `instanceId` is 1â€“64 ASCII characters matching `[A-Za-z0-9_-]+` and is globally unique among Instrument/Effect instances in the Project.
- Project data stores only validated JSON values, never factories, code, DOM/Audio nodes, timers, voices, registry metadata or window state.
- Unknown type/version or parameter keys fail normalization into the recovery path; they never select a â€œclose enoughâ€ sound.

## Closed Instrument registry

Application source owns a static registry. Each definition supplies:

- immutable type ID and device-schema version;
- product name and bounded UI metadata;
- exact default state, parameter bounds and normalization;
- migration from every supported older version;
- live runtime factory plus offline/public adapters using the same definition;
- Instrument-window UI factory;
- explicit runtime and UI disposal contracts.

Registry lookup is deterministic and side-effect free. Importing a definition must not create AudioContext, AudioNode, timer, listener or DOM state. The registry never scans files, fetches remote scripts, executes project content or accepts third-party registration.

The registry's product name `Klinto Chip` identifies the fixed Instrument definition. It is not project-authored data and cannot be renamed. User-facing owner context composes the current Track name with that immutable product name.

## Klinto Chip launch Instrument

### Parameters

Klinto Chip preserves the V1 range and meaning:

| Key | Values/range | Meaning |
| --- | --- | --- |
| `waveform` | `pulse12`, `pulse25`, `square`, `triangle`, `saw`, `noise` | V1 oscillator/noise choice |
| `octave` | integer âˆ’2â€¦+2 | Pitch offset applied by the Track |
| `attackSeconds` | 0.001â€¦2 | V1 attack time |
| `releaseSeconds` | 0.01â€¦3 | V1 release time |
| `level` | 0â€¦1 | Instrument output, distinct from Mixer channel volume |

Serialized Pattern pitches remain MIDI 36â€“112. After octave offset, effective playback pitch remains within MIDI 12â€“136. Pulse construction and noise behaviour remain unchanged. The 16-active-voice-per-Track cap uses PRD 28's canonical occurrence order and V1-compatible oldest-inserted-voice retirement identically in live, WAV and public playback.

V2 does not add oscillators, filters, LFOs, modulation, samples or a full ADSR to Klinto Chip. Filter belongs to the Effect chain, not a hidden Instrument expansion.

### Reset

Reset restores the pinned Klinto Chip defaults as one undoable command. It does not change Pattern notes, Track Mixer state, effects, clips or the Piano Roll audition Track. Factory/user presets and `Custom` preset state are deferred.

### Shared owner name and duplication

Right-clicking the Playlist Klinto Chip launcher takes priority over the surrounding Track and exposes Rename Instrument followed by Duplicate Instrument. Rename is intentionally user-facing shorthand for renaming canonical `Track.name`; it does not mutate `instanceId`, `type`, version, parameters, Mixer state, clips or runtime identity. The launcher shows the renamed owner name alongside the immutable Klinto Chip product type, while Track, Mixer, device-window and accessible owner labels use the same value.

Input uses the existing Track-name command: trim, require 1–32 characters and commit only a changed valid value. Success creates one undo/autosave entry and restores focus to the same stable launcher. Cancel, unchanged input and validation failure commit nothing and retain/restore launcher focus. An already-open Instrument or Track-owned Effect updates its owner title and parameter labels live without being replaced, reopening audio nodes or interrupting playback.

Duplicate Instrument preserves one-to-one Track ownership by creating an independently owned Track immediately below the source. The copy receives fresh Track and Instrument instance IDs plus a bounded unique owner name such as `Pulse 1 copy`; it copies the source Klinto Chip type, version and complete parameter snapshot. It does not copy clips, Track Mixer volume/pan/mute/solo, Effects or open device presentation: the new Track starts with the default Mixer state and empty clip/Effect collections. The source and any sounding runtime remain unchanged.

Duplication commits one undo/autosave entry, makes the new Track the Playlist destination, clears clip selection and focuses its Instrument launcher without opening it. Undo removes the copied Track and redo restores the same allocated identities. At the eight-Track Project limit, Duplicate Instrument remains visible but disabled with the Track-cap reason and commits nothing.

## V1 migration

Each normalized V1 Track maps exact production fields: `voiceType â†’ waveform` (`sawtooth â†’ saw`; all other enum values retain their spelling), `octaveOffset â†’ octave`, `attackSeconds â†’ attackSeconds`, `releaseSeconds â†’ releaseSeconds`, and `volume â†’ level`. The migration adds deterministic `instanceId`, `type` and `version` values using the fixed collision-safe migration helper shared by PRD 32.

Migration must not conflate Instrument `level` with Track Mixer volume or the master. Fixtures cover all six waveforms, every boundary, multiple Tracks and malformed values. The source record remains untouched until the final V2 schema is safely activated.

## Instrument window

The PRD 27 device frame contains:

- contextual title and owning Track;
- Reset and Close;
- **Oscillator:** waveform and octave;
- **Envelope:** attack and release;
- **Output:** Instrument level.

There is no preset selector, movable geometry or permanent keyboard. An optional on-screen audition control is embedded/collapsed and absent by default; it does not write Pattern notes.

Open routes are the Piano Roll audition-Track control, Playlist Track header and Mixer Instrument slot. Opening the same instance focuses it; opening another device replaces the visible presentation. Opening focuses the programmatically focusable title or first parameter. Closing restores the connected, visible, enabled opener, then the owning Track launcher, active primary heading or global switcher.

The Playlist launcher context menu follows PRD 31's clip > Instrument > Track right-click priority. Rename Instrument and Duplicate Instrument appear only for the Instrument target, in that order; New Pattern remains Track-scoped and follows them in the Instrument menu.

Accessible labels carry complete context, for example `Track 1, Klinto Chip, Attack: 8 milliseconds`. Instrument output uses that phrase explicitly so it cannot be confused with `Track 1 Mixer channel volume`.

## Parameter editing and history

- One continuous pointer or keyboard gesture commits one undo entry; no-op changes commit none.
- Parameter feedback is audible without transport restart.
- Autosave sees committed values, not transient drag samples.
- Undo/redo updates the one existing runtime without duplicate nodes/voices.
- Rename Instrument/Track is one undoable owner-name command; undo/redo updates every live owner label without changing or replacing the Instrument runtime.
- Duplicate Instrument is one undoable command that creates one new Track/Instrument identity from a parameter snapshot without copying or restarting the source runtime.
- Reset is one undoable command and requires no confirmation.
- Abrupt gain changes use bounded click-safe smoothing.
- Device UI subscribes only to its instance and necessary owner context.

## Audio-runtime contract

- Runtime construction remains lazy and follows the user-gesture AudioContext policy.
- The runtime accepts normalized note occurrences and validated parameter snapshots only.
- Instrument `level` updates the shared Instrument gain and therefore affects active voices with smoothing, matching V1.
- `waveform`, `octave`, `attackSeconds` and `releaseSeconds` are captured for a voice at note-on; changes affect future note-ons, not an already sounding voice, matching V1.
- Note ownership remains attributable to Track, Pattern/clip, note and occurrence IDs.
- Dispose releases voices, disconnects every owned node and is safe when repeated.
- Live, offline and public paths use the same waveform, envelope, pitch and level definitions.
- Deterministic oscillator offline fixtures compare against a fixed reference-browser/sample-rate tolerance. Noise compares configuration, occurrence schedule, envelope, gain, duration and spectral bounds unless the test source is deliberately seeded; random buffers are not required to be sample-identical.

## Accessibility and responsive requirements

- Every parameter exposes name, bounds, current value, unit and keyboard adjustment through semantic controls or equivalent complete range semantics.
- Decorative knobs may supplement but never replace an operable input.
- Parameter state does not depend on angle or colour alone.
- At 200% zoom, every parameter, Reset and Close remains reachable without horizontal page scrolling.
- On narrow screens the Instrument is the non-modal content view with compact transport and Back reachable; editing each launch parameter and returning to its launcher is required.
- Rapid audio values are never continuously announced.

## Acceptance criteria

- Each Track opens exactly its own stable Klinto Chip from Piano Roll, Playlist and Mixer routes.
- Right-clicking a Playlist Instrument launcher exposes Rename Instrument, Duplicate Instrument and then New Pattern; the remaining Track area exposes New Pattern only.
- Rename Instrument maps to the owning Track's canonical name and leaves the Klinto Chip type plus stable Instrument identity unchanged.
- Rename success, undo and redo update Track, Mixer, device-window and accessible owner labels live; cancel, no-op and invalid input preserve data and return focus to the launcher/fallback.
- Duplicate Instrument creates one independent Track immediately below the source with copied Klinto Chip parameters, fresh Track/Instrument IDs and a bounded unique owner name, but default Mixer state and no Effects or clips. It focuses the new launcher without opening it, and undo/redo removes/restores the same copy atomically.
- At eight Tracks Duplicate Instrument is disabled with a reason and changes neither Project, history nor focus.
- Changing Track 1 never changes Track 2.
- Opening focuses a correctly contextualized target; closing returns to the exact visible launcher or documented fallback.
- Opening an Effect or another Instrument removes the first presentation from layout, tab order and accessibility tree without interrupting its audio.
- Waveform, octave, attack, release and Instrument level persist through local save/reload, JSON round-trip and the hosted routes enabled at schema activation.
- Reset/undo/redo update UI and audio once without duplicate nodes.
- Parameter-update timing matches the explicit V1 launch policy.
- Removing a Track closes its device, releases its voices, repairs focus and leaves project/scheduler state valid.

## Verification coverage

- Registry tests for known/unknown type, version, defaults, validation and side-effect-free lookup
- Pure schema-1-through-6 migration fixtures across source field names, `sawtooth â†’ saw`, bounds, multiple Tracks and deterministic IDs
- Runtime tests for waveform/envelope/pitch/voice cap, update timing, smoothing and idempotent disposal
- Live/offline/public definition-parity tests, with deterministic and noise-specific comparisons
- Component tests for all open routes, one-device replacement and focus fallback; manual review covers 200% zoom
- Domain/component coverage for Track-name trim/bounds/no-op/undo, launcher-specific right-click priority, immutable Instrument shape/type/identity, focus restoration and live owner-label refresh in an already-open device
- Domain/component coverage for Duplicate Instrument parameter fidelity, fresh deterministic identities, bounded unique names, source-adjacent order, default Mixer/empty Effects and clips, one-step undo/redo, eight-Track rejection and destination/focus repair
- Keyboard parameter and Reset/undo journey; 390Ã—844 edit/Back smoke journey
- Save/reload and import/export/cloud fixture coverage under PRD 32's activation gate

## Delivery slices

1. **Registry contract:** type/version/parameter validation, side-effect-free lookup and recovery errors.
2. **Klinto Chip normalization:** exact parameters/default fixture and pure V1 Track migration.
3. **Shared runtime:** live synthesis plus offline/public adapters and parity/disposal tests.
4. **Instrument window:** semantic controls, Reset/history and PRD 27 lifecycle/focus.
5. **Track lifecycle:** reorder/delete/undo/project-switch ownership and leak coverage.
6. **Persistence hand-off:** contribute the final Instrument shape and fixtures to PRD 32; do not independently activate an intermediate user schema.

## Out of scope

- VST/VST3, Audio Unit, native binaries, remote scripts or third-party device loading
- Public plug-in SDK, sandbox host or marketplace
- Additional Instrument products/types, factory/user presets or preset sharing
- Extra oscillators, ADSR stages, filters, LFO/modulation, samples or wavetable synthesis
- MIDI learn, external MIDI, automation or macro controls
- Multiple Instruments, layering or split zones on one Track
- A separate `instrument.name`, per-device alias, or mutable Klinto Chip product/type label

## Resolved decisions

- One first-party Klinto Chip instance per Track.
- Closed static registry; project data contains type IDs and parameters, never executable code.
- Stable type ID is `klinto-chip`; stable waveform enum is `pulse12|pulse25|square|triangle|saw|noise`.
- `Track.name` is the shared persisted owner/Instrument display name; Rename Instrument delegates to Track rename and the Instrument schema gains no name field.
- Duplicate Instrument creates a second one-Instrument Track with fresh identities and copied Klinto Chip parameters; it is not full Track, Mixer, Effect or clip duplication.
- V1 parameter meaning and active/future voice update behaviour are preserved.
- Instrument output and Mixer channel volume remain distinct.
- Reset ships; presets do not.
- Device presentation follows PRD 27's one-visible-device model.
- Instrument persisted shape activates only as part of the final V2 schema gate.



