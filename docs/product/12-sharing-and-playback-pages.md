# PRD 12: Sharing and Playback Pages

## Description

Allow a creator to publish a fixed version of a composition and its custom visualiser, then share a URL that anyone can open as a read-only audiovisual experience.

Publishing creates a reproducible snapshot rather than exposing mutable local or private cloud state. The playback page prioritizes immediate understanding, reliable playback, and clear attribution.

## Requirements

- Publishing, republishing, and unpublishing must require Firebase Authentication.
- A publication must be a separate validated snapshot containing composition, instruments, arrangement, mix, and visualiser data.
- The mutable local and private cloud documents must never be exposed through the public path.
- Each local project must receive one stable unlisted URL; republishing must update that URL and increment its snapshot revision.
- Viewing a known publication URL must not require an account, but listing the publication collection must be denied.
- The player must not start audio without a visitor gesture.
- The visitor must be able to play, pause, restart, and control playback volume.
- The page must render the saved preset or custom visualiser and respect reduced-motion preferences.
- The page must display the project title, creator-supplied public name, and publication revision.
- The page must clearly identify itself as a read-only published snapshot.
- The creator must be able to unpublish through an app-owned confirmation dialog that makes keeping the page the safe action.
- Unpublishing must not remove local or private cloud projects.
- Missing, removed, invalid, oversized, or incompatible publications must display a clear state without exposing implementation details.
- Published data must pass the same project and visualiser validation as editable documents.
- Firestore rules must allow public document reads, deny collection discovery, and restrict writes and deletes to the owner.
- The first release must not expose project download, remix, public gallery, reporting, or arbitrary visualiser code.
- The static player must provide generic link metadata and update its document title and description after loading the snapshot.
- Publication model, stable-link behaviour, owner rules, and optional-account boundary must have focused tests.

## Open questions

None for the first release. Immutable version URLs, downloads, remixing, public discovery, profiles, reporting/moderation, richer social cards, and long-term archival policy are deferred. Publications remain available until their owner explicitly unpublishes them; account deletion is outside the current account scope.
