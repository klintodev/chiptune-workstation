# PRD 8: Optional Accounts and Cloud Projects

## Description

Add optional Firebase accounts and cloud project synchronization without turning sign-in into a prerequisite for making music.

The workstation remains local-first. A visitor can open the application, create complete projects, save them in the browser, and import or export project files without creating an account or contacting Firebase. Signing in adds identity, cross-device access, and the ownership required to publish projects in a later sharing release.

Application events continue to update local domain state. That state is serialized into the versioned project document introduced in PRD 7, stored immediately in IndexedDB, and synchronized through a replaceable cloud repository. Firebase must not become the application's source of truth or leak into editing features and UI components.

## Requirements

- All composing, arranging, playback, local saving, import, and export features must work without an account.
- The application must not silently create a Firebase anonymous account for a guest.
- Firebase being unavailable, blocked, or misconfigured must not prevent the local workstation from starting.
- The user must be able to create an account and sign in with email/password or Google from a clearly optional account control.
- The interface must explain that signing in enables cloud projects and future publishing rather than unlocking the editor itself.
- Authentication state must survive an ordinary page reload until the user signs out or the session becomes invalid.
- The signed-in state must identify the current account and provide a clear sign-out action.
- Authentication cancellation or failure must leave the active local project unchanged.
- Signing out must stop cloud synchronization without deleting local projects or remote projects.
- Signing in alone must not upload every existing local project without the user's knowledge.
- A signed-in user must be able to make an individual local project cloud-backed.
- A cloud-backed project must remain available locally through the existing IndexedDB repository.
- A cloud-backed project must use the same versioned, validated project document as local persistence and portable project files.
- Cloud documents must retain stable project IDs, revisions, creation timestamps, update timestamps, and ownership metadata.
- Private cloud projects must be stored beneath the authenticated user's Firebase UID.
- A user must only be able to read, create, update, and delete their own private project documents.
- Cloud synchronization must be implemented behind the existing project repository boundary; editing features must not import Firebase APIs.
- Local saves must complete without waiting for a network request.
- Cloud writes must be debounced so rapid editing does not produce a remote write for every state event.
- Pending cloud changes must retry after temporary connection failure without blocking further local work.
- The interface must distinguish local-only, syncing, synced, offline, and failed cloud states.
- A signed-in user on another device must be able to list and open their compatible cloud projects.
- Opening a cloud project must validate and cache it locally before it replaces active state.
- Unsupported, invalid, or oversized remote documents must be rejected without damaging the local project library.
- A project must remain below Firestore's one-megabyte document limit while represented as a single cloud document.
- Concurrent edits from different devices must never silently discard either version. An unresolved conflict must preserve an independent conflict copy.
- Deleting a cloud-backed project must clearly distinguish removing the local copy from deleting the owner's cloud copy everywhere.
- Destructive cloud deletion must use an application-owned confirmation dialog.
- Undo and redo history must remain local and session-only; it must not be synchronized as project content.
- The design must not provide live multi-user collaboration or merge simultaneous note-level edits.
- Publishing must require an authenticated owner, but private cloud synchronization must not make a project public.
- Public sharing must use a separate read-only publication snapshot rather than exposing the mutable private project document.
- Opening and playing a published project must not require an account.
- Security rules must be stored with the codebase and deny access by default.
- Focused automated tests must cover authentication-independent startup, repository synchronization, first cloud upload, remote loading, offline retry, conflict preservation, and owner-only security rules.

## Open questions

Resolved for the first implementation:

- Firebase Authentication supplies identity, with Email/Password and Google as the initial sign-in providers.
- Guests use the existing local mode without Firebase Anonymous Authentication.
- Cloud Firestore stores structured private project documents.
- IndexedDB remains the immediate local persistence layer and offline source.
- Cloud synchronization is enabled explicitly per project; sign-in does not bulk-upload a user's local library.
- The existing serialized project document is the synchronization unit. Firebase-specific objects are not added to domain state.
- A concurrent conflict creates a preserved copy instead of silently selecting a winner.
- Accounts are required to publish, update, or remove a shared project. They are not required to view one.
- Published snapshots remain separate from private editable projects and are delivered by the later sharing PRD.
- Cloud Storage is deferred until audio renders, images, or other binary assets exist.
- Live collaboration, event-log synchronization, and cloud undo history are out of scope.

Deferred:

- Additional authentication providers such as GitHub or email link.
- Public creator profiles, handles, avatars, and profile discovery.
- Self-service account deletion and the final retention policy for associated cloud data.
- Retained cloud revision history and project recovery after deletion.
- User-managed storage quotas, paid plans, and usage limits.
- End-to-end encryption of private project documents.
- Organization, team, or collaborative project ownership.
