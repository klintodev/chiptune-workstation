# PRD 32: V2 compatibility, quality and release

Status: Draft  
Release: Klinto Studio V2 Beta â†’ V2 Stable  
Depends on: PRDs 26â€“31

## Description

Activate V2 without losing V1 projects, splitting audio behaviour across runtimes or creating a rollback that hides user data. This PRD owns the final schema gate, trust boundaries, local/hosted cutover, recovery, release tests and exit criteria.

V2 is not done when the new editor renders. It is done when the complete compose â†’ arrange â†’ sound â†’ mix â†’ save/share/export journey is safe in every currently exposed route.

## Current boundary

The audited V1 baseline uses outer Project document envelope version 1 and Project schema 6, sixteenth-step Patterns/clips/loops (including persisted `custom | arrangement` loop mode), fixed Track Instrument properties, Track volume/pan/mute/solo, master volume under transport, persisted visualiser state, IndexedDB autosave, `.chipwork.json`, cloud/public records and separate live/offline/public audio adapters. Pattern/Song playback mode is session state in V1.

Existing safety limits remain unless a preceding PRD explicitly tightens them:

- 2 MB downloaded/imported Project file boundary;
- approximately 900 KB hosted Project/public record boundary;
- 64 Patterns, eight Tracks and current clip/song limits;
- existing voice cap;
- ten-minute WAV render/allocation boundary.

## Atomic schema activation

The first public V2 Project is `schemaVersion: 7` inside the unchanged outer `documentVersion: 1` envelope. [The V2 Project schema contract](./v2-project-schema-contract.md) is the single normative shape; feature-PRD excerpts are non-normative. Version 7 lands atomically containing all of:

- 96 PPQ note events and canonical content-derived Pattern `lengthTicks`;
- tick-based clip `startTick` and loop `{ enabled, mode, startTick, endTick }`, retaining `custom | arrangement`;
- Track `instrument` records for Klinto Chip;
- Track `mixer` objects with empty-or-populated effect chains;
- canonical `project.mixer.master = { volume, effects }`;
- stable Instrument/Effect instance IDs and closed type/version/parameter contracts.

No PRD independently writes an intermediate V2 shape to the ordinary IndexedDB repository, downloaded file, cloud record or publication. Feature-flag development uses in-memory fixtures or a clearly isolated disposable development store.

After activation:

- a persisted schema version's meaning never changes in place;
- every persisted shape change increments the version;
- every version shipped to users remains migratable;
- an unshipped internal version may be consolidated before Beta only if it never entered ordinary user storage;
- a version number is never reused for a different shape.

V7 has not been activated or written to ordinary user storage, so its final Pattern overlap invariant is consolidated before Beta without a schema bump: note spans are half-open, notes on the same pitch may touch end-to-start but may not overlap, and notes at different pitches may overlap to form chords within one Pattern. Once V7 activates, this meaning is frozen and any later change follows the schema-increment rule above.

## V1 â†’ V2 migration

Migration is a pure trust-boundary operation: clone/parse â†’ validate source envelope â†’ migrate â†’ deeply validate V7 â†’ activate. It never mutates or overwrites the original before successful V7 validation.

### Musical time

- Populated steps become notes first, then `lengthTicks` is derived from the greatest note end; unused trailing V1 steps no longer impose a fixed Pattern size. Â¼/Â¾ gates become exact 6/18-tick durations and remain editable without implicit quantization.
- Each populated step â†’ one deterministic note ID and `{ pitch, startTick, durationTicks, velocity }` per PRD 28.
- Clip `startStep * 24` â†’ `startTick`.
- Loop step bounds Ã— 24 â†’ exclusive tick bounds; preserve `transport.loop.mode` exactly and retain arrangement-mode auto-follow behaviour.
- Pattern/Song playback mode is not migrated or persisted; a new/opened session starts in Pattern mode.
- Pattern mode derives a non-persisted whole-bar performance end from final V7 `lengthTicks`: `ceil(lengthTicks / 384) * 384`. Empty Patterns therefore perform one silent bar, and content already ending on a bar boundary adds no further bar. This derivation does not change migrated Pattern data, linked clip width or Song timing.
- Note/clip ordering becomes canonical and deterministic.
- `rootOctave` is removed from musical data; initial view derives from first note or C4 and is not part of audio parity.

### Instrument

- Every Track gains deterministic globally unique Instrument `instanceId` plus `type: "klinto-chip"`, `version: 1`.
- Map exact V1 production fields: `voiceType â†’ waveform` with `sawtooth â†’ saw`, `octaveOffset â†’ octave`, `attackSeconds â†’ attackSeconds`, `releaseSeconds â†’ releaseSeconds`, and `volume â†’ level`.
- Pattern notes remain Instrument-independent.

### Mixer/effects

- V1 Track volume/pan/mute/solo move exactly under `track.mixer`.
- Track `mixer.effects` initializes empty.
- V1 `transport.masterVolume` moves exactly to `project.mixer.master.volume`.
- `project.mixer.master.effects` initializes empty.
- No Effect is invented during migration.

### Remaining Project data

Preserve valid Project/Pattern/Track/clip IDs, names, tempo, loop mode, ordering, timestamps, ownership/publication metadata and other retained V1 fields. Deliberately drop V1 `visualiser`, legacy `scaleGuide` and Pattern `rootOctave`; none belongs to V7. New deterministic IDs use one fixed namespace/algorithm pinned by fixtures; collisions are resolved deterministically and remain within `[A-Za-z0-9_-]{1,64}`.

Migration is idempotent at the normalizer boundary: normalizing a valid V7 Project returns the same canonical V7 data and does not re-migrate or regenerate IDs.

## Migration equivalence contract

Normalized V1-versus-V7 comparisons require exact equality for:

- Pattern/Track/clip identity and ordering;
- event pitch, start, duration, velocity and deterministic IDs;
- clip starts and loop bounds;
- Instrument type/parameters and effective Track routing;
- Mixer/master values, mute/solo selection and empty chains;
- scheduled occurrence identity/timing before audio rendering.

For audio fixtures:

- WAV parity renders at the production 44.1 kHz export rate. Deterministic offline fixtures use a maximum absolute sample difference of â‰¤ 1e-5 and RMS difference of â‰¤ 1e-6 after identical normalization;
- a deliberately changed test environment must re-baseline through reviewed evidence, never silently widen tolerances;
- unseeded noise is not sample-identical: compare occurrence schedule, graph/configuration, envelope, gain, duration and bounded spectral/RMS characteristics;
- release and Effect tails may ring through Pattern performance padding and cross a Pattern/clip boundary exactly as in V1; they are compared separately from stored gate duration.

## Fixture matrix

Fixtures cover V1 Project schemas 1 through 6 through the production migration chain, plus documented legacy aliases, including:

- empty/default Project;
- every content-derived Pattern span and note boundary, plus empty, partial-final-bar and exact-bar Pattern performance boundaries;
- valid end-to-start touching, valid cross-pitch overlaps including chords, and malformed same-pitch interval overlap;
- every waveform, octave and parameter boundary;
- sequential notes produced from distinct migration steps, chords within one Pattern, zero-velocity notes and maximum voice/count cases;
- multiple linked clips, touching clips, maximum song boundary and loop bounds;
- multi-Track mute/solo/pan/volume/master combinations;
- local JSON, cloud and public envelopes;
- near-2 MB and near-hosted-size documents;
- malformed numbers, duplicate IDs, missing references, oversized arrays and unknown types/versions.

Each fixture asserts source immutability, canonical V7 result, repeated-normalization equality and expected audio occurrence projection. Any same-pitch overlapping Pattern-note intervals are rejected at import and every local/cloud/public normalization boundary as complete proposals: no note, selection, history entry or linked clip is partially changed. Cross-pitch overlaps remain valid.

## Unsupported or malformed Project recovery

Repository listing must no longer silently omit records merely because deep normalization fails.

- A metadata/raw-read path lists unsupported or malformed local/cloud records without activating Project or audio state.
- The library shows an unavailable/recovery state with safe metadata where readable.
- The untouched raw record can always be downloaded.
- Ordinary editing/autosave is blocked while unsupported state remains.
- V2 launch recovery is read-only: the original remains visible/downloadable and is never edited or deleted implicitly. Device replacement/recovery copies are post-V2.
- Import failures keep the source file untouched and create no partial Project.
- Unknown type/version can never execute Project-provided code or fall back to another device.

Tests cover unsupported local, imported and cloud documents plus a future-schema envelope. Public playback treats malformed/unsupported nested state as unavailable rather than partially playing it.

## Local persistence and portability

- V7 autosave retains the current debounce/transaction semantics and saves committed commands only.
- Open, create, switch, import and delete run disposal/focus repair before replacing active state.
- JSON download includes explicit schema version and the canonical full device/effect state.
- Import parses and deeply validates within byte/count/depth limits before activation.
- V1 import migrates in memory; it is not overwritten until the user commits a V7 save.
- V7 files cannot be opened by V1; the first committed upgrade is disclosed once and documented.
- Quarantined/raw download works even when the editor cannot normalize the record.

## Cloud, sharing, publication and remix

Two validation layers have different jobs:

- Hosted rules enforce authentication/ownership, envelope fields, supported schema versions and feasible byte/count/structural limits for both V1 and V7 during transition.
- Shared JavaScript normalizers deeply validate every Pattern, note, clip, Instrument, Mixer and Effect before Studio activation, cloud write, publication use or remix.

Rules must not claim to deeply validate arbitrary nested arrays when that is not feasible. Closed registries ensure even malformed type IDs cannot execute project code.

- Cloud save/open preserves exact V7 state and continues to read V1.
- Publication stores an immutable, fully normalized snapshot.
- Public player reads/migrates V1 and natively reads V7 before any V7 publication is allowed.
- Remix creates a new editable Project with new ownership/publication metadata but preserves musical/device identities where the current remix policy permits.
- A malformed public snapshot displays unavailable state and never partially activates audio.

## Shared playback and WAV export

- Studio, public player and offline export consume PRD 28's occurrence projection and PRDs 29â€“30's closed device/graph definitions.
- No route keeps an independent switch statement for waveform/effect semantics.
- Pattern and Song timing, clip links, tempo, Instrument parameters, Track/master mix and insert order agree. Pattern one-shot and loop playback share the same bar-rounded performance boundary, while Song clips retain exact content-derived duration.
- WAV renders the arrangement once and ignores transport-loop repetition.
- Compute bounded Instrument plus serial Track/master tails, then enforce the existing ten-minute absolute limit before creating offline buffers.
- Public visitor volume is a transient post-master output gain, not persisted and not applied to WAV.
- AudioContext/OfflineAudioContext absence or failure is reported without corrupting/saving Project state.

## Staged cutover

### Stage 1: internal construction

- V2 remains feature-flagged and does not write ordinary user repositories.
- PRD slices pass domain/browser/audio tests against isolated fixtures.
- Approved desktop/mobile wireframes and 1366Ã—768 density review occur before production shell acceptance.

### Stage 2: compatibility deployment

Deploy before V7 writes:

1. Dual-schema hosted rules/envelope validation that keeps V1 reads/writes working and admits finalized V7 bounds.
2. A Studio compatibility build that still edits V1 but can list/detect/preserve/download raw V7 records without overwriting them.
3. A public player that can migrate/play V1 and natively validate/play V7.
4. Cloud/public read/write integration checks for both versions.

Only after these are live and verified may any user-facing build enable V7 autosave, cloud save, JSON export/import, publication or remix.

### Stage 3: V2 Beta

- Opt-in cohort first, then controlled expansion.
- Every visible persistence/output route works with V7. A route that is not ready is explicitly unavailable with explanatory copy; it never silently drops state.
- Core desktop keyboard composition, surface/device focus lifecycle, effect parameter editing and reduced mobile Back/transport smoke pass before the first cohort.
- Show exactly one `V2 Beta` badge; do not duplicate the existing generic Beta label.
- Monitor migration/open/save/publish/playback errors and recovery downloads without recording musical content.

### Stage 4: V2 Stable

- Default authoring uses V7.
- All retained routes and the complete accessibility/manual gates pass.
- Superseded V1 step/stacked UI and dead adapters are removed after evidence, not in foundational slices.
- The badge is removed or deliberately renamed; `V2 Beta` does not remain.

## Focused release verification journeys

Run these journeys manually against a clean-storage production build. Check page errors, unhandled rejections and unexpected console errors throughout, and record the result in the release ticket.

### 1. Compose, save and reload

Create Project â†’ create two Patterns â†’ create/select/move/resize/velocity notes with keyboard, including a migrated 6/18-tick endpoint fixture â†’ Pattern playback â†’ open/change/close Klinto Chip â†’ autosave â†’ reload â†’ project switch/return. Assert note/state/audio readiness and focus after device close, reload and switch.

### 2. Arrange, mix and effects

Add both Patterns using the insertion-cursor scan/advance rule â†’ move/duplicate clip â†’ Song playback â†’ Mixer â†’ add/open/change/bypass/reorder/remove/undo Filter/Delay â†’ reload. Assert focus after surface switches, Effect close/removal, final clip deletion and non-final Track deletion.

### 3. V1 migration, import/export and hosted parity

Open representative V1 local/cloud/public fixtures â†’ compare normalized V7 â†’ commit save â†’ JSON download/import â†’ WAV guard/tail â†’ publish/public play â†’ remix. Include raw recovery for unsupported local/import/cloud records.

### 4. Mobile surface smoke

At approximately 390Ã—844: switch surfaces, create/select/delete one note through explicit controls, play, open/change/Back from Instrument and Effect, view/open a Playlist clip, save/reload. Assert transport/Back and restored focus at every transition.

## Quality gates

### Deterministic/domain

- Full existing check/build suite passes.
- V1/V7 migration and exact normalized-equivalence fixtures pass.
- Schema/range/count/unique-ID/property tests pass.
- Scheduler/graph/history/lifecycle tests pass with fake-clock determinism where applicable.

### Runtime/audio

- Required desktop and mobile release journeys pass manual review in the supported verification browser.
- No new page/console errors, stuck voices, duplicate AudioNodes, leaked timers/listeners/animation frames or hidden-surface work.
- Live/public 48 kHz reference parity and production WAV 44.1 kHz parity/tolerances pass.
- Browser without Web Audio fails safely.

### Accessibility/manual

Before Beta: core keyboard note creation/edit/playback, primary switching, device edit, open/close/delete focus lifecycle and mobile Back stack pass; no serious/critical automated issue exists.

Before Stable:

- no automatically detectable WCAG 2.2 A/AA violation in required V2 surfaces except a narrowly documented false positive with manual evidence;
- keyboard-only and representative screen-reader journeys pass;
- 200% zoom, forced colours, reduced motion, contrast and orientation checks pass;
- no known keyboard-only or screen-reader blocker remains.

Severity labels prioritize repair; they do not narrow conformance scope.

### Performance/lifecycle

- Reference max-size Project remains responsive within budgets established before Beta.
- Scheduler look-ahead remains stable under UI load.
- Hidden surfaces perform no continuous visual work.
- Repeated Project/surface/device changes return runtime-owner counts to baseline.
- WAV limit is checked before allocation and Delay tails stay within declared caps.

## Beta exit / Stable entry gates

- All required PRDs accepted with their scope exclusions intact.
- V7 schema/rules/normalizers/player deployed in the safe order and dual-version telemetry is healthy.
- Migration fixture matrix and all required release journeys pass.
- Local, file, cloud, publish, public play, remix and WAV routes preserve V7.
- 1366Ã—768 visual review confirms one dominant surface and no page scroll.
- Accessibility Stable gate passes.
- No open P0/P1, data-loss, migration, stuck-audio or required-journey blocker.
- Recovery and emergency rollback exercises succeed on real V7 test records.

## Rollback and recovery

- Once the first V7 save exists, a pre-V2 application is not an acceptable emergency rollback target.
- The rollback Studio artifact may disable V2 editing, but it must still list V7 records, validate metadata where safe and download the untouched raw Project.
- It must never classify V7 as corrupt, silently omit it or overwrite it with V1 defaults.
- Never roll the public player below V7-read capability after a V7 publication exists.
- Dual-schema hosted rules remain available throughout the rollback window.
- Recovery runbooks name exact deploy artifacts, flags, ownership, user messaging and verification fixtures.
- Rollback tests prove V1 remains editable and V7 remains visible/downloadable without mutation.

## Out of scope

- In-place downgrade from V7 to V1
- Silent best-effort playback of unknown devices
- Redesign of accounts, collaboration, cloud library, publishing, remix, theme or help
- New analytics product or collection of musical content
- Support for native/third-party plug-ins
- Post-V2 feature work excluded by PRDs 26â€“31

## Resolved decisions

- Public V2 Project schema is V7 inside document envelope V1 and activates atomically only after the normative schema contract and every serialized component are final.
- No shipped version changes meaning in place or loses a migration path.
- Compatibility rules, recovery-capable Studio and V7-capable public player deploy before V7 writes/publication.
- Unsupported records remain visible and downloadable through a raw quarantine path; they never activate audio.
- Deep nested validation belongs to shared normalizers; hosted rules enforce feasible envelope/ownership/version/size/count boundaries.
- Default V2 authoring waits for all exposed persistence/output routes.
- Public/live/offline playback share occurrence and device definitions.
- The existing ten-minute WAV allocation boundary remains after bounded tails.
- Release journeys are verified by the release owner and recorded with the release evidence.
- Exactly one `V2 Beta` badge is shown during Beta.



