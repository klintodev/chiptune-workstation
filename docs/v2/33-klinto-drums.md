# PRD 33: Klinto Drums

Status: Draft
Release: Klinto Studio schema 8
Depends on: PRDs 27–32

## Description

Add `Klinto Drums` as the second closed, first-party browser Instrument. It follows the same Track ownership, device-window, routing, persistence and disposal contracts as Klinto Chip. It is not native VST hosting and loads no third-party code or recorded samples.

## Product outcome

A user chooses Klinto Chip or Klinto Drums when adding an Instrument Track. A Drums Track exposes a synthesized kit on named Piano Roll pitches, plays through the Track's existing Mixer and Effect route, and produces the same result in live playback, WAV export and public playback.

## Serialized contract

Schema 8 admits this exact Instrument record:

```json
{
  "instanceId": "instrument-track-2",
  "type": "klinto-drums",
  "version": 1,
  "params": {
    "tone": 0.5,
    "decaySeconds": 0.45,
    "level": 0.5
  }
}
```

Parameter bounds are:

| Key | Range | Meaning |
| --- | --- | --- |
| `tone` | 0…1 | Global brightness/tuning character captured at note-on |
| `decaySeconds` | 0.05…2 | Global one-shot decay captured at note-on |
| `level` | 0…1 | Smoothed Instrument output, independent of Mixer volume |

Unknown keys, type versions and out-of-range values fail normalization. Existing schemas 1–7 migrate to schema 8 as Klinto Chip Tracks without changing their IDs, parameters, ordering or musical data. A schema-7 record forged with a Drums type is invalid rather than reinterpreted.

## Piano Roll map

The map is fixed and intentionally centred on the existing computer-keyboard range:

| MIDI | Pitch | Voice |
| ---: | --- | --- |
| 60 | C4 | Kick |
| 61 | C♯4 | Short Kick |
| 62 | D4 | Snare |
| 63 | D♯4 | Tight Snare |
| 64 | E4 | Closed Hat |
| 65 | F4 | Pedal Hat |
| 66 | F♯4 | Open Hat |
| 67 | G4 | Low Tom |
| 68 | G♯4 | Low-mid Tom |
| 69 | A4 | Mid Tom |
| 70 | A♯4 | High-mid Tom |
| 71 | B4 | High Tom |

Piano Roll rows combine the musical pitch and drum name while the active audition Track uses Klinto Drums. Pattern data remains Instrument-independent. Unmapped pitches remain valid Pattern notes but produce no Drums voice.

## Synthesis and playback

- Kicks and toms use pitched oscillator sweeps.
- Snares combine a pitched body with deterministic synthesized noise.
- Hats use deterministic synthesized noise with piece-specific one-shot decay.
- Velocity controls the hit peak. Tone and decay are captured at note-on; output level updates active audio with click-safe smoothing.
- Drum hits are one-shots. Stored Pattern duration still owns editing, arrangement length and occurrence identity, but it does not stretch the synthesized hit.
- The same definition, event adapter and synth factory are selected by Instrument type for live, offline and public playback.
- Unmapped notes are filtered before voice-cap arbitration and do not allocate sources or consume a Track voice slot.

## Interaction

- Playlist and Mixer expose a native Instrument-type selector beside `+ Add Instrument`.
- Adding Drums creates one new Track with fresh Track/Instrument IDs, default Mixer state, no clips and no Effects.
- Launchers, Mixer slots, device titles and accessible labels use the immutable registry product name.
- The device window exposes Tone, Decay and Instrument output, plus the fixed note map and Reset.
- Duplicate Instrument preserves the source type and parameter snapshot while retaining the existing fresh-identity/default-Mixer rules.

## Acceptance criteria

- Chip remains the default for new Projects and for Add Instrument until the user chooses Drums.
- A mixed Chip/Drums Project persists, migrates, reloads, duplicates, exports, publishes and remixes without type or parameter loss.
- MIDI 60–71 resolve to the pinned voices above; all other pitches are silent through Drums.
- Piano Roll labels update when its audition Track changes without mutating Pattern data or history.
- Live, WAV and public paths dispatch each Track to its registered Instrument synth and retain the existing per-Track 16-voice limit.
- Schema 7 remains immutable; schema 8 is the first schema that accepts `klinto-drums`.

## Out of scope

- Native VST/VST3 or Audio Unit binaries
- Recorded samples, sample import or a sample browser
- User presets, kit authoring, per-pad routing, choke groups or multiple outputs
- Custom pitch maps, automation, MIDI learn or a third-party Instrument SDK
