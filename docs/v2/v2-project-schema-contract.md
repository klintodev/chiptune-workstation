# Klinto Studio V2 Project schema contract

Status: Normative draft for PRD 32 activation  
Project schema: 7  
Outer document envelope: 1

This is the single authoritative persisted shape for the first public V2 release. PRDs explain behaviour; validators, migrations, fixtures, Firestore bounds, JSON import/export, cloud records and publications must implement this contract. If a PRD example conflicts with this file, this file wins.

## Outer Project document

The existing envelope remains version 1 and has exactly these keys in canonical serialization order:

```json
{
  "format": "chiptune-workstation",
  "documentVersion": 1,
  "id": "project-...",
  "revision": 0,
  "createdAt": "2026-08-03T12:00:00.000Z",
  "updatedAt": "2026-08-03T12:00:00.000Z",
  "project": {}
}
```

Envelope version 1 keeps production acceptance/canonicalization exactly:

- `id`: string whose trimmed value is non-empty. The local envelope adds no new length limit; existing hosted wrappers retain their current 100-character rule.
- `revision`: integer â‰¥ 0.
- `createdAt`/`updatedAt`: strings accepted by `Date.parse`, with `updatedAt >= createdAt`. Existing hosted wrappers retain their current 1â€“64-character rule; V2 does not tighten local envelope-v1 parsing.
- Unknown envelope keys are ignored by normalization and omitted from canonical serialization, matching production envelope v1. Project-schema V7 objects remain strict.

Any future tightening of these envelope semantics requires `documentVersion: 2` and its own migration.
- `.chipwork.json`, the 2,000,000-byte file limit and current cloud/public wrapper versions remain unchanged unless their own compatibility migration explicitly increments them.

## Project root

The `project` object has exactly these keys in canonical order:

```text
schemaVersion, metadata, transport, patterns, tracks, mixer
```

- `schemaVersion` is exactly `7`.
- V1 `visualiser` and legacy `scaleGuide` state are deliberately dropped. Neither appears in V7.
- No root value is nullable and unknown keys are rejected.

## Shared scalar rules

- Every numeric value is finite; integer fields contain JSON integers.
- `DomainId` matches `[A-Za-z0-9_-]{1,64}`.
- Pattern IDs are unique across Patterns; Track IDs across Tracks; note IDs across one Pattern; clip IDs across the Project; Instrument/Effect instance IDs together across the Project.
- A V1 ID already satisfying its V7 scope/grammar is preserved. An invalid/colliding legacy ID is deterministically remapped with every reference updated; fixtures pin the algorithm and result.
- A name's trimmed value must be non-empty and within its bound: Project title max 100 characters; Pattern/Track name max 32. Existing valid V1 spelling/whitespace is preserved by migration; newly committed rename/create input is trimmed.
- Unknown object keys and unknown enum values are rejected.

## Metadata

```json
{ "title": "Untitled chiptune" }
```

`metadata` contains exactly `title`.

## Transport

```json
{
  "bpm": 120,
  "loop": {
    "enabled": false,
    "mode": "custom",
    "startTick": 0,
    "endTick": 384
  }
}
```

- `bpm`: 40â€¦240.
- `loop.mode`: `custom | arrangement` and is retained from V1.
- `startTick`: integer 0â€¦6,143.
- `endTick`: integer 1â€¦6,144 and greater than `startTick`.
- In `arrangement` mode while enabled, the domain layer automatically sets the loop to `[0, arrangementEndTick)` as clips change. Removing the final clip sets `enabled: false`, keeps `mode: "arrangement"`, sets `startTick: 0`, and retains the previous valid `endTick` (so `endTick > startTick` remains true), matching V1. Adding a later clip does not silently re-enable looping; the user must enable it, at which point `endTick` becomes the current arrangement end.
- Pattern/Song playback mode and live playheads are session state, not persisted. New/open/reload defaults to Pattern mode. Successful Add to Playlist switches the current session to Song mode.
- Master volume is not transport state in V7.

## Patterns

`patterns` contains 1â€“64 objects in user-visible Project order:

```json
{
  "id": "pattern-1",
  "name": "Pattern 1",
  "lengthTicks": 18,
  "notes": [
    {
      "id": "note-1",
      "pitch": 60,
      "startTick": 0,
      "durationTicks": 18,
      "velocity": 0.7
    }
  ]
}
```

- Object keys are exactly `id, name, lengthTicks, notes`.
- `lengthTicks`: canonical derived value `max(1, max(note.startTick + note.durationTicks))`, bounded to 1â€¦3,072. It is never user-selected; normalization rewrites stale supplied values.
- `notes`: 0â€“1,024 per Pattern and 0â€“8,192 across the Project.
- Note keys are exactly `id, pitch, startTick, durationTicks, velocity`.
- `pitch`: integer MIDI 36â€¦112.
- `startTick`: integer â‰¥ 0.
- `durationTicks`: integer â‰¥ 1.
- `startTick + durationTicks <= 3,072`; the greatest note end equals `lengthTicks` for a non-empty Pattern.
- `velocity`: 0â€¦1; zero is persisted but schedules no voice.
- Notes are canonically serialized by `startTick`, then `pitch`, then `id`. Same-pitch overlap is valid.
- Pattern array order is user-visible. The final Pattern cannot be deleted.

The 18-tick duration is intentionally valid: exact V1 Â¼/Â¾ gate endpoints need not align to V2's 12-tick minimum creation snap.

## Tracks, Instruments, Mixer channels and clips

`tracks` contains 1â€“8 objects in the shared Playlist/Mixer order:

```json
{
  "id": "track-1",
  "name": "Pulse 1",
  "instrument": {
    "instanceId": "instrument-track-1",
    "type": "klinto-chip",
    "version": 1,
    "params": {
      "waveform": "square",
      "octave": 0,
      "attackSeconds": 0.008,
      "releaseSeconds": 0.03,
      "level": 0.35
    }
  },
  "mixer": {
    "volume": 1,
    "pan": 0,
    "muted": false,
    "solo": false,
    "effects": []
  },
  "clips": []
}
```

- Track keys are exactly `id, name, instrument, mixer, clips`.
- The final Track cannot be deleted.

### Klinto Chip

- Instrument keys: `instanceId, type, version, params`.
- `type`: exactly `klinto-chip`; `version`: exactly `1`.
- Parameter keys: `waveform, octave, attackSeconds, releaseSeconds, level`.
- `waveform`: `pulse12 | pulse25 | square | triangle | saw | noise`.
- `octave`: integer âˆ’2â€¦+2.
- `attackSeconds`: 0.001â€¦2; default 0.008.
- `releaseSeconds`: 0.01â€¦3; default 0.03.
- `level`: 0â€¦1; default 0.35.

### Track Mixer

- Keys: `volume, pan, muted, solo, effects`.
- `volume`: 0â€¦1; default 1.
- `pan`: âˆ’1â€¦1; default 0.
- `muted`, `solo`: booleans; default false.
- `effects`: 0â€“4 Effect instances in processing order.

### Clips

- `clips`: 0â€“64 per Track, canonically serialized by `startTick`, then `id`.
- Clip keys: `id, patternId, startTick`.
- `patternId` must resolve.
- `startTick`: integer 0â€¦6,143.
- Derived end is `startTick + referencedPattern.lengthTicks` and must be â‰¤ 6,144; linked clip width changes automatically when note content changes.
- Clips on the same Track may touch but may not overlap.

## Master Mixer

```json
{
  "master": {
    "volume": 0.35,
    "effects": []
  }
}
```

- Project `mixer` contains exactly `master`.
- Master keys are exactly `volume, effects`.
- `volume`: 0â€¦1; default 0.35.
- `effects`: 0â€“4 Effect instances in processing order.

## Effect union

Every Effect has keys `instanceId, type, version, bypassed, params`; `version` is exactly 1 and `bypassed` defaults false.

### Klinto Filter

```json
{
  "instanceId": "effect-1",
  "type": "klinto-filter",
  "version": 1,
  "bypassed": false,
  "params": { "cutoffHz": 12000, "q": 0.7 }
}
```

- `cutoffHz`: 20â€¦20,000; default 12,000.
- `q`: 0.1â€¦20; default 0.7.

### Klinto Delay

```json
{
  "instanceId": "effect-2",
  "type": "klinto-delay",
  "version": 1,
  "bypassed": false,
  "params": { "timeDivision": "1/8", "feedback": 0.3, "mix": 0.2 }
}
```

- `timeDivision`: `1/32 | 1/16 | 1/8 | 1/4 | 1/2`; default `1/8`.
- `feedback`: 0â€¦0.85; default 0.3.
- `mix`: 0â€¦1; default 0.2.

## Exact V1 migration map

- `transport.bpm` â†’ `transport.bpm`.
- `transport.loop.enabled` â†’ same.
- `transport.loop.mode` (`custom | arrangement`) â†’ same.
- `loop.startStep/endStep * 24` â†’ `startTick/endTick`.
- Playback Pattern/Song mode is not migrated because V1 does not persist it.
- `transport.masterVolume` â†’ `mixer.master.volume`; initialize master effects empty.
- Drop `visualiser`, `scaleGuide` and Pattern `rootOctave`.
- V1 Pattern steps/length and clip starts migrate per PRD 28.
- `instrument.voiceType`: preserve `pulse12|pulse25|square|triangle|noise`; map `sawtooth â†’ saw`.
- `instrument.octaveOffset â†’ params.octave`.
- `instrument.attackSeconds â†’ params.attackSeconds`.
- `instrument.releaseSeconds â†’ params.releaseSeconds`.
- `instrument.volume â†’ params.level`.
- `track.mixer.volume|pan|muted|solo` â†’ same keys under the V7 Track Mixer; initialize Track effects empty.

Schemas 1â€“6 first use the existing production migration chain to normalized V6, then one V6â†’V7 migration. Fixtures cover every source schema and verify the exact final result.

## Default V7 Project

- Title `Untitled chiptune`; BPM 120; custom loop disabled at 0â€¦384.
- Pattern `pattern-1`, name `Pattern 1`, derived technical length 1, no notes; the editor still exposes a normal writable grid.
- Track `track-1`, name `Pulse 1`, Klinto Chip defaults above, Mixer volume 1/pan 0/not muted/not solo/no Effects, no clips.
- Master volume 0.35, no Effects.
- Session opens Pattern 1 Piano Roll in Pattern mode with Track 1 as `auditionTrackId`; session state is not serialized.

## Canonicalization and activation

- Arrays whose order has product meaning retain that order: Patterns, Tracks and Effect chains.
- Notes and clips use the canonical sorts defined above.
- Object serialization uses the key order shown in this contract for stable fixtures/diffs; parsers must not rely on JSON object order.
- Validation rejects additional keys rather than preserving hidden state.
- A machine-readable JSON Schema or equivalent shared validator generated from this contract is required before V7 activation. Every local/cloud/public normalizer and fixture consumes the same rules.
- Any persisted change to these keys, enums, meanings, bounds or defaults requires schema 8 or later. V7 never changes meaning in place.





