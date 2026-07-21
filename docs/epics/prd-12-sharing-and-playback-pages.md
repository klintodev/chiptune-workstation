# PRD 12 Epics: Sharing and Playback Pages

These epics deliver [PRD 12: Sharing and Playback Pages](../product/12-sharing-and-playback-pages.md) as unlisted, owner-controlled Firebase snapshots.

## E44: Validated publication snapshots

- Serialize the complete project and visualiser into a bounded publication record.
- Keep publication identity, source project, owner, attribution, timestamps, and revision explicit.
- Reject malformed, incompatible, and oversized records before rendering or writing.

## E45: Stable owner-controlled publishing

- Let a signed-in creator publish from the project library with a public creator name.
- Reuse one stable URL and advance its revision on republish.
- Store only the local project-to-publication link in browser metadata.
- Unpublish behind a safe app-owned confirmation without deleting private data.

## E46: Account-free audiovisual player

- Load a known public document without authentication.
- Require a gesture before audio, then provide play, pause, restart, and visitor volume.
- Reproduce the snapshot's arrangement, mix, and visualiser in a read-only page.
- Display clear attribution, revision, loading, missing, and incompatible states.

## E47: Security and release setup

- Permit public `get` but deny publication collection `list` in Firestore rules.
- Restrict create, revisioned update, and delete to the authenticated owner.
- Configure Firebase Hosting for the workstation and player without publishing docs or tests.
- Document console setup, deployment, authorized domains, and current scope limits.
- Cover publication shape, stable links, account boundaries, and rules with focused tests.
