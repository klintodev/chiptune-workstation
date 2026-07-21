# PRD 08 Epics: Optional Accounts and Cloud Projects

These epics deliver [PRD 08: Optional Accounts and Cloud Projects](../product/08-optional-accounts-and-cloud-projects.md) without making Firebase a prerequisite for composing.

## Scope decisions

- Guests keep the complete IndexedDB workflow; Firebase Anonymous Authentication is not used.
- Email/Password and Google are the first authentication providers.
- A project is cloud-backed only after an explicit user action.
- Local IndexedDB saves remain immediate and authoritative for editing.
- Firestore stores validated project documents inside a small ownership and cloud-revision envelope.
- Cloud revisions are separate from local document revisions so optimistic concurrency is explicit.
- Temporary failures queue the newest validated snapshot and retry after connectivity returns.
- A revision conflict preserves the remote version as an independent local conflict copy and pauses automatic overwrite.
- Cloud deletion and local deletion remain separate, clearly named actions.
- Public publishing remains deferred to PRD 12.

## E26: Optional Firebase identity

### Outcome

Users can keep working as guests or sign in without Firebase concerns leaking into music features.

### User stories

#### US26.1 - Continue without an account

As a visitor, I want the workstation to start even when Firebase is unavailable so that account infrastructure never blocks music creation.

Requirements:

- Local startup does not wait for a network request.
- Missing configuration, blocked SDK delivery, and authentication failure degrade only the account feature.
- No guest Firebase account is created silently.
- Existing local projects and portable project files remain available.

#### US26.2 - Use an optional account

As a user, I want to sign up or sign in with email/password or Google so that I can opt into cloud features.

Requirements:

- The account panel explains what sign-in adds.
- Email account creation, email sign-in, Google sign-in, session restoration, and sign-out are supported.
- Cancellation and failure do not alter project state.
- The signed-in identity is visible and sign-out does not delete any data.

## E27: Private cloud repository and security boundary

### Outcome

Private projects use a replaceable repository contract and cannot be accessed across accounts.

### User stories

#### US27.1 - Store a valid private project

As a signed-in user, I want my selected project stored privately so that I can retrieve it on another device.

Requirements:

- Firestore paths are scoped to `/users/{uid}/projects/{projectId}`.
- Each record contains owner ID, project ID, cloud revision, summary fields, and one validated project document.
- Oversized and invalid documents fail before a network write.
- Music features do not import Firebase APIs.

#### US27.2 - Enforce ownership

As a user, I want private project data readable and writable only by my account.

Requirements:

- Checked-in Firestore rules deny access by default.
- Profile and private-project access require the matching authenticated UID.
- Project ownership, IDs, revisions, and document shape are validated on writes.
- Focused tests protect repository and rule assumptions.

## E28: Explicit local-first synchronization

### Outcome

A user knowingly enables cloud backup for one project and receives clear sync feedback while local saves remain fast.

### User stories

#### US28.1 - Enable cloud backup

As a signed-in user, I want to choose which project becomes cloud-backed so that sign-in never uploads my whole library.

Requirements:

- Enabling backup is an explicit action on the active project.
- The first successful upload records the remote cloud revision locally.
- Existing local saves do not wait for Firestore.
- The UI distinguishes local-only, syncing, synced, offline, conflict, and failed states.

#### US28.2 - Synchronize later edits

As a user, I want later saved edits backed up automatically without a write for every slider event.

Requirements:

- Synchronization listens to completed local-save events.
- A debounce collapses rapid saved revisions into one remote write.
- The newest pending validated snapshot replaces older queued snapshots.
- Signing out stops sync work without deleting links or data.

## E29: Offline retry and conflict preservation

### Outcome

Network and concurrency failures preserve every version and never block further local work.

### User stories

#### US29.1 - Retry interrupted synchronization

As a user, I want a failed cloud write retried when connectivity returns so that temporary outages need no recovery ritual.

Requirements:

- The pending snapshot is kept locally.
- Network failures report offline/retrying rather than local save failure.
- Browser online events and an explicit retry can resume synchronization.
- Repeated failures use bounded backoff and never create concurrent writers.

#### US29.2 - Preserve concurrent work

As a user, I want both versions retained when another device changed the same project.

Requirements:

- Every write compares the expected cloud revision transactionally.
- A mismatch does not overwrite the remote document.
- The remote version is copied into the local project library with a clear conflict title and independent ID.
- Automatic sync pauses for that link and tells the user how to inspect the preserved copy.

## E30: Cloud library lifecycle

### Outcome

Signed-in users can find, open, and deliberately remove compatible cloud projects.

### User stories

#### US30.1 - Open a cloud project safely

As a user on another device, I want to list and open my cloud projects without risking the local project already present.

Requirements:

- Cloud summaries are listed without loading every project body.
- Opening validates and caches the remote document before activation.
- A colliding divergent local project is preserved as an independent copy.
- Incompatible or oversized remote data cannot replace active state.

#### US30.2 - Delete only the intended copy

As a user, I want local and cloud removal to be distinct so I cannot accidentally erase every copy.

Requirements:

- Cloud rows expose a clearly named cloud-delete action.
- Cloud deletion uses an application-owned blocking confirmation dialog.
- The safer cancellation action receives initial and visual emphasis.
- Deleting from cloud does not delete the local project.
- Deleting locally does not delete the cloud project.

## E31: Focused cloud regression coverage

### Outcome

The highest-risk authentication and synchronization boundaries stay protected by a small test suite.

### User stories

#### US31.1 - Protect failure-prone behavior

As a maintainer, I want concise tests around cloud orchestration so later sharing work cannot corrupt private projects.

Requirements:

- Tests cover guest degradation, auth state, first upload, remote loading, and owner scoping.
- Tests cover debouncing, offline retry, expected-revision writes, and conflict-copy preservation.
- Tests cover oversized document rejection and distinct local/cloud deletion.
- Existing state, persistence, scheduler, input, and audio tests remain green.
