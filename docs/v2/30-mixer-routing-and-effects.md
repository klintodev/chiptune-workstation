# PRD 30: Mixer, routing and first-party effects

Status: Draft  
Release: Klinto Studio V2  
Depends on: PRDs 27â€“29

## Description

Move V1's Track/master mix controls into a dedicated Mixer and add bounded serial first-party insert chains. Launch with Klinto Filter and Klinto Delay only.

This is a deliberately small routing model: one channel per Track, one master, no sends, buses, sidechains or graph patching.

## Product outcome

A user can switch to Mixer, balance up to eight Tracks, add and edit a Filter or Delay, reorder/bypass/remove it, and hear the same routing in live Song playback, WAV export and public playback. Mixer is never stacked below Piano Roll.

## Authoritative signal model

Each audible Track feeds one shared master summing bus. The compact route below continues through that bus; the Master chain is instantiated and processed exactly once, not once per Track:

```text
per Track:
scheduled voices
â†’ Instrument output gain
â†’ Track serial insert chain (0â€“4)
â†’ Track volume/mute/solo gain
â†’ Track pan
â†’ Track post-fader meter tap
â†’ shared Master summing bus

once after all Tracks are summed:
Master summing bus
â†’ one Master serial insert chain (0â€“4)
â†’ Master volume
â†’ Master meter tap
â†’ output
```

- Mute and solo resolve through one pure audible-Track selector before gain updates.
- Effects run once in their stored order. There is no persistent parallel duplicate signal path.
- A short owned transition graph is allowed during click-safe add/remove/reorder/bypass/time changes; it is disposed immediately after a maximum 50 ms crossfade.
- Track and master chains persist through Pattern/Song loop wrap. Looping does not clear delay buffers or restart effects.
- Stop follows existing transport voice-stop behaviour; effect tails may drain naturally unless the Audio runtime/Project is disposed.
- Project switch/delete, audio shutdown and runtime disposal cut tails safely and release every node.

The same declarative graph builder and device definitions serve live, offline and public runtimes. Adapters may differ in clock/output ownership, not routing order or parameter meaning.

## Canonical serialized Mixer/effect state

The complete normative V7 Project and document shape is [the V2 schema contract](./v2-project-schema-contract.md). No abbreviated example in a feature PRD overrides it.

This PRD owns these Mixer rules:

- V1 `transport.masterVolume` moves to `project.mixer.master.volume`; transport no longer owns master state.
- Each Track owns `mixer = { volume, pan, muted, solo, effects }`.
- Project owns `mixer.master = { volume, effects }`.
- Track and master `effects` arrays contain 0â€“4 instances in processing order.
- Instrument/Effect instance IDs share Project-wide uniqueness and the schema contract's grammar.
- Launch types are the closed enum `klinto-chip | klinto-filter | klinto-delay`; versions and parameter keys are exact.
- Unknown type/version/key, duplicate ID, invalid range or oversized chain fails deep normalization before activation.
- The default values and canonical serialization order in the schema contract are binding.
- A persisted schema version never changes shape or meaning in place.

Playlist's per-Instrument Mute and Solo switches are alternate views of the owning Track Mixer fields. They call the same Track Mixer command and reflect the same persisted state as the Mixer surface; they never add device-local mute/solo keys or a second audio path. Changes apply to the live graph without restarting transport, multiple solo selections remain valid and mute continues to override solo.

## Closed Effect registry

The internal registry mirrors the Instrument contract: stable type/version, exact defaults/bounds, validation/migration, shared live/offline/public processor factory, UI factory and idempotent disposal. Lookup is side-effect free and never loads remote/project code.

Adding an Effect creates validated defaults and a globally unique instance ID. Effect window identity follows instance ID even after reorder; owner Track/master and current slot are presentation context.

## Mixer surface

### Desktop

Mixer is one full-workspace primary surface with Track channels in Project order and Master. Each channel exposes:

- contextual name and Instrument identity for Tracks;
- volume, pan, mute and solo (no solo on Master);
- post-fader level/clip indication;
- four ordered insert slots;
- explicit open-Instrument route on Track channels.

Eight Track channels plus Master may scroll internally. The page does not scroll. Keyboard users can jump directly through a channel selector rather than tabbing every control in every intervening strip.

### Narrow widths and 200% zoom

Mixer switches to a channel list/selector plus one complete selected-channel detail surface. It does not squeeze nine unusable strips across the viewport. Track 1, Track 8 and Master are directly selectable; every level, pan, state and insert action remains reachable.

## Insert actions and focus

- Empty slot â†’ Add Effect picker containing Filter and Delay only.
- Add fills the slot as one undoable command but does not auto-open the Effect.
- Open Effect is a separate explicit action and uses PRD 27's one-device model.
- Bypass is one undoable state change.
- Reorder is keyboard/pointer operable and keeps focus/window identity on the same Effect instance, not an old slot number.
- Remove closes that Effect's visible editor first, disposes its processor after the transition and focuses the now-empty slot.
- Undo restores a removed Effect and its state but does not reopen its editor.
- Cancelling Add makes no mutation and restores focus to the invoking empty slot.
- Reset restores that Effect's defaults as one undoable command without confirmation.

## Klinto Filter

Stable type: `klinto-filter`, version 1. Launch processor: low-pass only.

| Key | Range/default | Behaviour |
| --- | --- | --- |
| `cutoffHz` | 20â€¦20,000; default 12,000 | Finite frequency clamped below Nyquist by runtime adapter |
| `q` | 0.1â€¦20; default 0.7 | Resonance/Q |

Parameter changes use bounded AudioParam smoothing. It has no drive, envelope, LFO, mode selector or analyser. Filter contributes no declared export tail beyond normal processor settling.

## Klinto Delay

Stable type: `klinto-delay`, version 1. Tempo-synchronized delay only.

| Key | Values/range/default | Behaviour |
| --- | --- | --- |
| `timeDivision` | `1/32`, `1/16`, `1/8`, `1/4`, `1/2`; default `1/8` | Recomputed from current constant BPM |
| `feedback` | 0â€¦0.85; default 0.3 | Bounded below self-oscillation |
| `mix` | 0â€¦1; default 0.2 | Equal-power dry/wet balance |

- Equal-power mix is normative: `dryGain = cos(mix * Ï€ / 2)`; `wetGain = sin(mix * Ï€ / 2)`.
- Tempo changes use a maximum 50 ms owned crossfade into a fresh delay line; the old buffer is disposed after the fade.
- Bypass crossfades to unity dry over 20 ms and cuts/disposes the existing Delay tail after that fade. Un-bypass starts a fresh buffer.
- Remove and reorder use the same bounded transition and clear that instance's buffered state after the fade.
- Normal Pattern/Song loop wrap does not clear buffers.
- Preallocation uses a deliberately conservative pure function based on equal-power `wetGain`, never raw `mix`. Let `d = (60 / bpm) * ratio`, where ratios for `1/32|1/16|1/8|1/4|1/2` are `0.125|0.25|0.5|1|2`. If bypassed or `wetGain = 0`, tail is 0. If `feedback = 0`, tail is `min(10, d + 0.25)`. For any `feedback > 0` and `wetGain > 0`, reserve the full 10-second cap.
- Every live/offline/public Delay enforces that same absolute cap: 10 seconds after its last non-silent input, the wet feedback path ramps to silence over the final 20 ms and resets. Therefore allocation cannot underestimate output at tiny mix/high feedback. Boundary fixtures cover mix 0/near-zero/1, feedback 0/0.85 and BPM/division extremes; the âˆ’60 dBFS-for-250-ms observation is a QA measurement, not an allocation decision.

## Serial tail and export policy

- Track Instrument release plus serial Track Effect tails feed serial master Effect tails; conservative bounded durations add in routing order.
- WAV renders the arrangement exactly once and ignores transport-loop repetition, matching V1.
- Include the bounded computed tail, then apply the existing ten-minute absolute render limit before allocating `OfflineAudioContext`/buffers. WAV remains 44,100 Hz as in V1. If arrangement plus tail exceeds the limit, reject safely with no allocation.
- Public visitor volume is transient post-master output gain. It is never persisted and is not applied to WAV export.
- Live/public/offline tests pin the same route and tail policy.

## History and live graph changes

- Mixer values, add, bypass, reorder, remove, Effect parameters and Reset are Project commands.
- One continuous gesture creates one undo entry; no-op edits create none.
- Automation is not recorded.
- Undo/redo applies one graph transition without doubling persistent processors or losing instance identity.
- Changing Delay time clears/replaces only that Delay buffer through the transition; Filter/gain/pan changes preserve unrelated state.
- Effect edits never stop transport or mutate Pattern/clip data.

## Metering

- Meters are post-fader UI telemetry, not persisted Project state or undo history.
- Hidden Mixer stops animation-frame work and may release UI-only analyser resources without changing audio.
- Meter animation is not a live region.
- A simple visual clip indication may show the current over-range state; V2 does not add latched peak state or a Reset Peaks workflow. It is never repeatedly announced.

## Accessibility requirements

- Every control exposes channel/effect/parameter context, value, bound and unit.
- Decorative knobs/meters never form the only input/output representation.
- Insert Add â†’ Open â†’ parameter change â†’ Bypass â†’ Reorder â†’ Remove â†’ Undo is keyboard-only operable with visible focus after every mutation.
- At 200% zoom/narrow width, channel selector/detail makes Track 1, Track 8 and Master directly reachable.
- Effect window Close restores its connected owning slot; mobile Back does likewise.
- No meter frame causes repeated assistive announcements.

## Acceptance criteria

### V1 mix parity

- With no Effects, migrated volume/pan/mute/solo/master settings produce the V1 route and audible-Track selection.
- V1 `transport.masterVolume` moves exactly to `project.mixer.master.volume`; V1 Track mix fields move exactly to `track.mixer`.
- Pattern and Song transport continue while Mixer/device surfaces open and close.

### Effect workflow

- Add does not auto-open; Open focuses the correct stable instance.
- Filter/Delay parameter, bypass, reorder, remove, Reset and undo/redo update audio once and persist.
- Reorder retains focus on the Effect identity; remove closes/focuses empty slot; undo does not reopen.
- Bypass/reorder/time changes follow the declared crossfade/tail-reset policy without persistent double-processing or leaked nodes.

### Output and layout

- Live, WAV and public playback use the same device order/parameters and bounded tails.
- The ten-minute guard runs after tails and before 44,100 Hz allocation; WAV ignores loop repetition; public visitor volume remains transient.
- 1366Ã—768 has no page scroll; narrow/200% channel detail remains complete; 390Ã—844 parameter edit/Back smoke passes.

## Verification coverage

- Schema/registry tests for exact keys/enums/ranges, unique IDs, chain caps and unknown state
- Pure V1 Mixer/master migration fixtures and no-Effect parity
- Graph topology tests for mute/solo, order, Trackâ†’master composition and idempotent disposal, including a two-Track proof that each Master Effect is constructed and processed once
- Offline Filter/Delay parameter, equal-power mix, pure tail-formula/cap and 44,100 Hz ten-minute-allocation tests
- Undo/redo and focus tests for every insert mutation
- Manual keyboard Mixer/effect journey, 1366Ã—768 layout, 200% channel-detail and 390Ã—844 smoke review
- Live/offline/public shared-definition and output-route tests

## Delivery slices

1. **Canonical state/registries:** exact Mixer/master/effect shapes, validators and pure V1 migration fixtures.
2. **Shared graph builder:** V1 no-Effect route, mute/solo and disposal tests.
3. **Mixer primary surface:** channel selection/strips, V1 controls, metering and responsive detail.
4. **Filter:** processor, Effect window and live/offline/public parity.
5. **Delay:** synchronized processor, transition/tail policy and parity.
6. **Insert/history/focus:** add/open/bypass/reorder/remove/reset/undo journeys.
7. **Export/public closure:** bounded tail and ten-minute preallocation guard.
8. **Persistence hand-off:** contribute final Mixer/effect shape/rule fixtures to PRD 32; do not activate an intermediate schema.

## Out of scope

- More effects, presets or effect marketplace
- Sends, returns, buses, groups, sidechains or arbitrary routing
- Parallel wet/dry branches beyond each Effect's own bounded mix and temporary transition graph
- Automation lanes, modulation, macros or MIDI learn
- Third-party/native plug-ins or project-provided DSP
- Spectrum analyser, oscilloscope or decorative visualiser
- Per-clip effects or Mixer scenes

## Resolved decisions

- Canonical master is `project.mixer.master`; master volume leaves `transport`.
- Maximum four serial inserts per Track and four on Master.
- Launch registry contains only `klinto-filter` and `klinto-delay`.
- Effect identity follows instance ID, not slot.
- Temporary crossfade graphs are allowed for at most 50 ms; persistent double-processing is not.
- Bypass cuts a Delay tail after a 20 ms fade; add/remove/reorder/time changes reset only affected buffered state.
- Loop wrap preserves Effect state; disposal cuts it safely.
- Offline tails are bounded and included before the existing ten-minute allocation guard.







