# PRD 24: Guided Creation and Remixing

## Description

Help users turn a basic loop into a coherent chiptune by offering optional harmonic guides, reusable musical recipes, safe variation tools, consent-based remixing, and lightweight project checkpoints.

This is a later creative-workflow iteration. It assumes the user can already start audio, enter notes, create patterns, and place clips. PRD 21 owns first-session onboarding, contextual explanations, and blank-state guidance; this PRD provides reusable composition tools after that introduction rather than another tour or checklist.

Every generated change must remain inspectable, editable, and reversible through the existing project model. Recipes are bounded data and commands, not opaque audio generation. Remixing creates a new local project from a creator-approved public revision and never grants access to private source data.

## Dependencies

- PRDs 12, 13, and 19 provide public snapshots, verified publication ownership, and the hardened public-data boundary used by remixing.
- PRD 20 provides reliable project validation, bounded generated names, atomic local recovery, and the active-project emergency download.
- PRD 21 provides the keyboard, touch, dialog, responsive, terminology, and assistive-technology interaction baseline that every interface in this PRD must follow.
- PRD 23 provides proportional project commands and browser, accessibility, audio, and Firebase quality gates before recipes and checkpoints increase project complexity.

## Implementation epics

[PRD24/E87-E90](../epics/prd-24-guided-creation-and-remixing.md) separates harmonic guidance, musical transformations, consent-based remix import, and local checkpoint recovery.

## Requirements

### Key, scale, and harmonic guidance

- A project may declare one tonic and one supported scale as composition guidance.
- The first release must include a small documented set such as major, natural minor, major pentatonic, minor pentatonic, and chromatic.
- Pattern and keybed views must highlight in-scale notes and distinguish the tonic without relying on colour alone.
- Existing out-of-scale notes must remain visible, audible, editable, and explicitly marked; choosing a guide must never rewrite them automatically.
- A user may enable **Scale lock** for new pointer, computer-keyboard, and recipe note entry.
- Scale lock must snap only the new edit being made to the nearest allowed effective MIDI pitch and must clearly preview the resulting note.
- When two allowed pitches are equally near, the lower MIDI pitch must win so pointer, keyboard, and recipe input use one deterministic rule.
- Scale lock must be bypassable for an intentional chromatic note without disabling the whole project guide.
- Scale guidance must use sounding pitch class consistently across instrument octave offsets.
- Key, scale, and lock settings must be validated, serializable, migrated safely, and included in published or remixed project snapshots.

### Chord, arpeggio, and rhythm recipes

- A recipe must describe validated musical operations rather than executable code.
- Chord recipes must use scale degrees and named chord qualities that can be transposed to the current tonic and scale.
- Because the current pattern step is monophonic, the first release must unfold chord tones over steps or distribute an explicitly previewed result across existing tracks; it must not imply unsupported simultaneous notes in one step.
- Arpeggio recipes must expose bounded order, rate, octave span, direction, and destination range.
- Rhythm recipes must expose bounded density, accents, rests, gate, and velocity treatment.
- A user must see the destination pattern, affected step range, notes to replace, and resulting length before applying a recipe.
- Applying a recipe must be one atomic project-history operation.
- A user must be able to apply a recipe to a duplicate or new variation rather than overwrite the current pattern.
- Recipes must obey track, pattern, note-range, arrangement, and project-size limits before committing any change.

### Constrained randomisation

- Randomisation must always require an explicit scope such as pitch, rhythm, velocity, gate, octave, or a selected combination.
- The user must be able to bound note range, scale membership, density, maximum melodic leap, velocity range, gate choices, and affected steps.
- The result must be previewable before it replaces authoritative project state.
- Applying one randomised result must create one undoable history operation.
- A reproducible seed must be recorded with the preview so the same inputs can produce the same candidate during that interaction.
- **Try another** must create a new preview without filling project history with rejected candidates.
- Randomisation must not change tracks, clips, patterns, tempo, mixer values, or metadata outside the declared scope.

### Starter and genre recipes

- The application may provide a curated starter library for structures such as pulse lead, bass ostinato, noise drums, call-and-response, arpeggiated harmony, and common chiptune song sections.
- Genre-oriented recipes must describe musical traits rather than imitate or name a living artist.
- A starter recipe must show the tracks, patterns, instruments, tempo, scale guide, and arrangement sections it proposes.
- Applying a starter must require an explicit choice to create a new project, add compatible content, or replace the current working project.
- Replace must use the existing project-replacement safety boundary and preserve a recoverable checkpoint.
- Starter recipes must remain available after onboarding and must not duplicate PRD 21's first-session tour, tooltips, or “make your first loop” flow.
- PRD 21 starter assets are fixed whole-project teaching documents. This PRD exclusively owns reusable, configurable, versioned transformations and genre recipes.
- Built-in recipes must be versioned data so a saved project does not silently change when the recipe library is updated.

### Consent-based remixing

- A publication owner must explicitly enable **Allow remixing**; new and existing publications default to not remixable.
- The public player must show **Remix in Klinto Studio** only for a remix-enabled, valid, known publication revision.
- Starting a remix must explain that it creates a new local project, leaves the source unchanged, and does not give the remixer access to the creator's account or private project.
- A remix must copy one immutable public snapshot revision into a newly identified local project.
- The new project must not reuse the source project's local ID, cloud-project ID, Firebase UID, private link metadata, autosave identity, or owner-only publication fields.
- Provenance may retain only the public publication identifier, immutable revision, public title, public creator name, and the fact that remix permission was granted.
- The working copy belongs to the remixer's local library and does not automatically upload, synchronize, or publish.
- Republishing a derivative must be a separate explicit action and must display retained source attribution before confirmation.
- Unpublishing or disabling future remixing must prevent new in-product imports but cannot erase local remixes already created from an earlier permitted revision.
- Invalid, removed, incompatible, oversized, or non-remixable publications must fail without creating a partial local project.
- Immediately before import, the publication service must re-read the exact public revision and current `allowRemix` value; a stale player button must not authorize an import.
- Disabling remixing prevents future imports through Klinto Studio but cannot revoke bytes already delivered through anonymous playback or erase local copies already created.

### Lightweight immutable checkpoints

- A user must be able to create a named checkpoint containing a validated immutable project-document snapshot.
- A starter operation that replaces the active project and every checkpoint restore must create a recovery checkpoint before changing the working document.
- If that required checkpoint cannot be stored because of quota or repository failure, the destructive replacement or restore must not proceed.
- Applying a recipe or accepted random variation to existing content remains one atomic undoable command and may offer a manual checkpoint; it does not require an automatic checkpoint.
- Remix import creates a new project atomically and therefore does not checkpoint or replace the current project.
- Checkpoint records must use a unique immutable `checkpointId`, creation time, optional bounded label, schema version, `sourceProjectRevision`, and source-operation summary.
- Restoring a checkpoint must copy it into the mutable working document as one validated project command and create a new working-project revision; it must never rewrite the historical checkpoint.
- The checkpoint list must identify current work, manual checkpoints, recipe or remix origins, and restored states without presenting a full source-control interface.
- Version storage must be bounded by count and serialized size and must fail without damaging the working project when browser quota is unavailable.
- Checkpoints must live in a separate IndexedDB repository keyed by local project ID and must not be nested inside the project document, another checkpoint, cloud-project records, or public snapshots.
- Local checkpoints must remain in the browser unless the user explicitly enables a future or existing cloud capability that clearly includes them.
- Deleting a working project or clearing local storage must explain whether its local checkpoints will also be removed.
- PRD 20's **Download project** action exports only the active versioned project document. Checkpoint history requires a separate future archive action and must never be inserted recursively into that JSON file.

### Privacy and ownership boundaries

- Scale guidance, recipe previews, randomisation, and local checkpointing must run locally and must not send musical data to a new service.
- Built-in recipes must contain no user data and require no account.
- Remixing must read only the same validated public snapshot available to a visitor with the known URL.
- Firestore rules must allow only the verified owner to change a validated `allowRemix` field. The publication service must enforce current permission and exact revision during the in-product import flow rather than relying only on a visible button.
- Public provenance must not expose authentication identifiers, private cloud paths, email addresses, or browser-local identifiers.
- Klinto Studio must describe source attribution and in-product remix permission plainly without claiming to decide copyright ownership beyond that permission.
- A remixer must be warned that permission to remix in Klinto Studio does not automatically grant rights to external samples, trademarks, or material the source creator did not own.
- Account sign-in must remain optional for recipes, local checkpoints, and creating a local remix.

## Out of scope

- Replacing PRD 21 onboarding, first-run education, or blank-state guidance.
- AI-generated audio, remote model inference, prompt-to-song, or uploading compositions for analysis.
- Arbitrary user-authored recipe code, plugins, or executable publication content.
- Polyphonic notes inside one pattern step, audio samples, MIDI import, or a full chord staff.
- Automatic correction or deletion of existing out-of-scale notes.
- Real-time multi-user collaboration, comments, pull requests, merges, or branch graphs.
- A public remix gallery, popularity ranking, search, follows, or social feed.
- Legal adjudication, rights verification, content licensing beyond explicit in-product remix consent, or automated plagiarism detection.
- Silent cloud upload of local checkpoints or remixes.

## Acceptance and test coverage

- Scale tests must cover pitch classes, octave boundaries, instrument offsets, lock bypass, out-of-scale preservation, migration, and publication round trips.
- Recipe tests must cover transposition, pattern bounds, monophonic output, destination previews, atomic apply, duplicate variation, and rejection before partial writes.
- Property-based or bounded matrix tests must prove random outputs stay inside selected scale, pitch, density, leap, gate, velocity, and scope constraints.
- History tests must prove one accepted recipe or random result is undone and redone atomically while rejected previews create no history entries.
- Starter tests must cover new, add, and replace destinations, recipe-version stability, project limits, and recovery checkpoints.
- Remix tests must cover default-denied consent, owner enable and disable, exact immutable revision import, source removal, incompatible records, and no partial local project.
- Privacy tests must assert that cloned documents and provenance omit UID, email, cloud IDs, private links, autosave identity, and owner-only publication fields.
- Version tests must cover immutability, bounded labels and counts, quota failure, restore-as-new-work, schema migration, and working-project deletion semantics.
- Version tests must prove checkpoints are stored separately, required-checkpoint failure blocks destructive replacement, recipe/random changes remain atomic undo operations, remix import leaves the current project unchanged, and active-project download excludes checkpoint history.
- Security rules must cover owner-only `allowRemix` mutation, while publication-service tests must cover current-permission and exact-revision checks immediately before import and retain account-free reads of known public snapshots.
- Playwright and axe journeys must cover keyboard and touch scale selection, recipe preview/apply/cancel/undo, destructive starter confirmation and checkpoint failure, random preview rejection, remix confirmation, and checkpoint restore with the PRD 21 dialog and focus rules.
- The existing project validation, history, persistence, cloud, publication, and player suites must remain green.

## Open questions

Resolved for this release:

- Scale lock snaps to the nearest allowed effective MIDI pitch and resolves an equal-distance tie downward.
- PRD 21 owns fixed first-run teaching documents; PRD 24 owns reusable configurable recipes.
- Required checkpoints precede active-project replacement and checkpoint restore. Recipe and randomisation edits use atomic undo, and remix import creates a separate project.
- Checkpoints live in a separate local repository and are excluded from PRD 20's active-project JSON download.
- Remix permission is an in-product consent boundary, not technical revocation of anonymously readable snapshot bytes.

Deferred:

- Which scales and named chord qualities are small enough for the first release while remaining useful across common chiptune styles?
- Should recipe previews play automatically after an audio gesture, or require a separate Preview action?
- Should starter recipes be entirely bundled with the application, or can a later signed recipe catalogue update independently?
- What bounded checkpoint count and byte budget fit typical IndexedDB quota without making recovery unreliable?
- Should cloud project synchronization eventually include checkpoints, or should they remain explicitly device-local?
- What exact in-product permission text and derivative attribution are appropriate when a creator enables remixing?
- Should a source creator be able to require visible attribution on every derivative publication, and how should that interact with later unpublishing?
