# Schema 8: musical Pattern length

Schema 8 changes the meaning of `patterns[].lengthTicks` from a derived note endpoint to an explicit musical duration. The object keys, document envelope version, limits and canonical ordering remain as documented in the schema-7 contract.

- `lengthTicks` is an integer from 1 to 3,072 and must contain every note. Import rejects a length shorter than its content; it never stretches or clips notes.
- New Patterns start at 384 ticks (one 4/4 bar at 96 PPQ). The Piano Roll **Length** selector offers 1–8 bars. A dashed line marks the end.
- Adding, moving or extending notes beyond the current length grows it to the containing whole bar. Shortening, moving earlier or deleting notes retains the chosen length, including when a Pattern becomes empty.
- Explicit shortening fails if it would cut off a note. Growth fails atomically if any linked Playlist clip would overlap or exceed the Song boundary. The message identifies the conflicting clip. Clip positions do not move automatically.
- Pattern playback, Playlist clip width, repeat placement, Song looping, public playback and WAV content duration all use `lengthTicks`. Instrument release and effect tails remain additional export tails; note gates are unchanged.
- Pattern duplication preserves the length; explicit changes participate in undo/redo and autosave.

## Migration and compatibility

Schema-7 input is first validated and canonicalized with its original content-derived semantics. Its resulting exact lengths, note gates, clip positions and transport settings are then copied into schema 8. This preserves existing Song timing, including adjacent clips that would overlap if rounded up. Empty legacy Patterns retain their one-tick technical length. The Length selector displays non-bar lengths as imported values; selecting a bar length is an explicit edit.

Pattern preview of an imported Pattern now repeats at that same exact musical length as its Playlist clips, rather than applying a separate rounded-bar boundary. Select a whole-bar length to add a trailing rest. Schemas 1–6 retain the existing V1 migration chain and its resulting exact V2 timing. Migration is deterministic and does not write storage until the ordinary save path runs.

Local documents, cloud/public adapters and WAV dispatch recognize schema 8. Source-preserving shared adapters still validate native schema-7 records without upgrading them. Existing `*ToV7` adapter exports remain compatibility aliases for upgrading to the current V2 format; the domain also exports `migrateProjectToV8`.

The save disclosure is scoped to this schema upgrade. Older deployed builds cannot edit schema 8, so deployment must include the matching app, public player and Firestore rules together. Rules accept schemas 6, 7 and 8 with the existing structural bounds. The live workflow runs checks, deploys Firestore rules with the existing service account, then publishes Hosting. A rules deployment failure blocks the app release; older clients remain compatible with the expanded rules.
