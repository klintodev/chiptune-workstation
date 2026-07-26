# PRD 24 Epics: Guided Creation and Remixing

These epics deliver [PRD 24: Guided Creation and Remixing](../product/24-guided-creation-and-remixing.md) as optional, local-first composition tools for users who already understand the core workstation.

## Epic 87 - Key and scale guidance

### Outcome

Users can choose a harmonic frame, see it on the existing editors, and constrain new notes without rewriting their music.

### User stories

#### US87.1 - See a useful harmonic frame

As a learner, I want to choose a tonic and scale so that compatible notes are easier to recognise on the keybed and pattern editor.

Requirements:

- Add validated tonic and scale guidance to the versioned project document.
- Support a small documented first-release scale set.
- Highlight scale tones and identify the tonic without relying on colour alone.
- Mark existing out-of-scale notes while leaving them audible and unchanged.
- Apply guidance consistently across octave offsets, persistence, publishing, and remix import.

#### US87.2 - Constrain new note entry

As a composer, I want an optional Scale lock so that new notes stay in the chosen scale while intentional chromatic notes remain possible.

Requirements:

- Apply lock to new pointer, computer-keyboard, and generated note edits.
- Snap to the nearest allowed effective MIDI pitch, choosing the lower pitch on an equal-distance tie, and preview the result before or as the edit is committed.
- Provide an explicit one-note bypass.
- Never scan and rewrite existing patterns when the guide changes.

### Acceptance and test coverage

- Unit tests cover every supported tonic and scale, octave boundaries, downward snapping ties, bypass, and instrument offsets.
- State tests cover validation, migration, history, deep immutability, and publication round trips.
- UI tests cover tonic, in-scale, out-of-scale, focus, selected, and playhead treatments in both themes.

## Epic 88 - Bounded musical recipes and variations

### Outcome

Users can apply understandable chord, arpeggio, rhythm, starter, and random-variation operations without surrendering control of the pattern.

### User stories

#### US88.1 - Apply a musical recipe

As a composer, I want chord, arpeggio, and rhythm recipes so that I can develop an idea with musically constrained building blocks.

Requirements:

- Represent recipes as versioned, validated data rather than executable code.
- Transpose scale degrees and chord qualities through the active key and scale.
- Unfold chord tones into monophonic pattern steps or an explicitly previewed multi-track plan.
- Bound arpeggio order, rate, octave span, and direction.
- Bound rhythm density, rests, accents, gates, and velocity.
- Show destination, affected range, replacement, and resulting length before apply.

#### US88.2 - Try a constrained variation

As an experimenter, I want random variation within rules I choose so that surprising results remain usable and reversible.

Requirements:

- Require an explicit property and step scope.
- Bound scale, pitch, density, leap, velocity, gate, octave, and unaffected fields.
- Keep rejected candidates in preview state only.
- Record a reproducible preview seed.
- Commit one accepted candidate as one undoable history operation.

#### US88.3 - Start from a reusable style recipe

As a returning user, I want optional starter and genre recipes so that I can begin from a musical structure rather than repeat a tutorial.

Requirements:

- Preview proposed tracks, patterns, instruments, tempo, scale, and sections.
- Offer explicit new-project, compatible-add, and protected-replace destinations.
- Use reusable, configurable transformations that remain separate from PRD 21's fixed whole-project teaching documents.
- Create a required recovery checkpoint before replacing the active project; block replacement if the checkpoint cannot be stored.
- Describe genre traits without imitating or naming living artists.
- Keep this library separate from PRD 21's first-session onboarding and blank-state guidance.

### Acceptance and test coverage

- Recipe tests cover transposition, monophonic output, all supported pattern lengths, track and pattern limits, and atomic failure.
- Randomisation tests exercise the full bounded option matrix and prove undeclared fields never change.
- History tests cover apply, undo, redo, duplicate variation, and rejected preview.
- Starter tests cover new, add, replace, required-checkpoint failure, recovery, recipe-version stability, and oversized plans.
- Playwright and axe cover keyboard and touch preview, apply, cancel, undo, random rejection, and destructive starter confirmation with PRD 21 focus and dialog behaviour.

## Epic 89 - Consent-based public remix import

### Outcome

A creator can permit remixing of a specific public snapshot, and a visitor can create a safe local copy without touching private or source state.

### User stories

#### US89.1 - Control remix permission

As a publisher, I want remixing off by default and explicitly enabled by me so that a public listening link is not silently treated as an editable source.

Requirements:

- Add a bounded `allowRemix` publication field that defaults to false and may be changed only by the verified publication owner.
- Let only the verified publication owner enable or disable future remix imports.
- Preserve anonymous playback of known URLs regardless of remix permission.
- Hide the remix action for removed, invalid, incompatible, or non-remixable publications.

#### US89.2 - Create a local remix

As a listener, I want **Remix in Klinto Studio** to create my own local project so that I can learn from an allowed snapshot without changing the original.

Requirements:

- Explain local-copy, attribution, source immutability, and privacy boundaries before import.
- Re-read the exact public revision and current `allowRemix` value immediately before import.
- Copy one exact immutable publication revision into a new local project and project identity.
- Retain only bounded public provenance.
- Strip UID, email, local and cloud IDs, private links, autosave identity, and owner-only fields.
- Do not upload, synchronize, or publish the new project automatically.
- Fail atomically when validation, quota, compatibility, or consent checks fail.

#### US89.3 - Publish a derivative intentionally

As a remixer, I want retained source context before publishing so that I understand the attribution and permission attached to my derivative.

Requirements:

- Show source title, creator display name, publication, and revision before derivative publishing.
- Keep republishing separate from local remix creation.
- Explain that in-product remix permission does not verify rights in external material.
- Prevent future imports through Klinto Studio after permission is disabled while preserving already-created local copies and acknowledging that anonymously delivered playback bytes cannot be revoked.

### Acceptance and test coverage

- Rules tests cover validated owner-only permission changes; service tests cover false-by-default UI, enable, disable, stale-button revalidation, exact revision, republish, and anonymous playback.
- Import tests cover exact revision cloning, new identity, source unpublishing, quota failure, and atomic rollback.
- Privacy tests assert the absence of authentication, cloud, private-link, and browser-local identifiers.
- Player tests cover action visibility, confirmation copy, loading, invalid, incompatible, and permission-changed states.

## Epic 90 - Immutable local checkpoints and recovery

### Outcome

Users can create, inspect, and restore meaningful checkpoints without adopting a full source-control workflow.

### User stories

#### US90.1 - Save a meaningful checkpoint

As a composer, I want named checkpoints so that I can experiment with recipes and arrangements without losing a strong earlier idea.

Requirements:

- Store validated immutable snapshots with unique `checkpointId`, time, bounded label, schema, `sourceProjectRevision`, and source-operation summary.
- Identify manual, recipe, randomisation, starter, remix, and restore origins.
- Bound checkpoint count and serialized size.
- Store checkpoints in a separate IndexedDB repository keyed by local project ID; never nest them in project documents, checkpoints, cloud records, or public snapshots.
- Keep checkpoints local unless a separately explained cloud capability includes them.

#### US90.2 - Recover without rewriting history

As a user, I want to restore an earlier checkpoint as new work so that the record of what happened remains trustworthy.

Requirements:

- Copy the selected snapshot into the mutable working document.
- Apply restore as one validated working-project command and revision rather than mutating the source checkpoint.
- Validate and migrate before replacing current work.
- Leave current work intact when migration, storage, or quota checks fail.

#### US90.3 - Understand storage and deletion

As a local-first user, I want clear checkpoint storage boundaries so that deleting a project or browser data has no surprising effect.

Requirements:

- Automatically checkpoint before active-project starter replacement and checkpoint restore; block either operation when the required checkpoint cannot be stored.
- Keep accepted recipe and randomisation edits as atomic undo operations with an optional manual checkpoint.
- Keep remix import atomic and separate from the current project rather than checkpointing or replacing current work.
- Explain whether deleting a project also removes its checkpoints.
- Report storage limits and quota failures without corrupting the working document.
- Keep checkpoint metadata free of account secrets and private publication ownership fields.
- State that PRD 20's active-project JSON download excludes checkpoints unless a separate archive feature is introduced.

### Acceptance and test coverage

- Repository tests cover append-only checkpoint records, bounded names, counts and bytes, separate storage, and duplicate-ID rejection.
- Restore tests cover migration, restore-as-new-work, invalid snapshots, quota failure, and history preservation.
- Integration tests cover required recovery around starter replacement and restore, atomic undo for accepted random variation, and non-destructive remix import.
- Deletion and export tests document checkpoint-retention boundaries and prove active-project JSON excludes checkpoint history.
- Existing project persistence, cloud, publication, security, and undo suites remain green.

## Delivery sequence

1. Epic 87 establishes the project-level harmonic contract.
2. Epic 90 delivers the separate checkpoint repository before Epic 88 enables active-project replacement.
3. Epic 88 adds recipes, randomisation, and starter transformations against the scale, undo, and checkpoint contracts.
4. Epic 89 adds consent-based remixing after the publication and privacy checks are ready.
