# PRD 10: Sharing and Playback Pages

## Description

Allow a creator to publish a fixed version of a composition and its custom visualiser, then share a URL that anyone can open as a read-only audiovisual experience.

Publishing must create a reproducible snapshot rather than exposing a creator's mutable local working state. The playback page should prioritize immediate understanding, reliable playback, and clear attribution.

## Requirements

- A user must be able to publish a supported project snapshot.
- Publishing must include the composition, required instrument state, arrangement, mix, and visualiser configuration.
- The system must generate a stable, shareable URL for the published snapshot.
- A visitor must be able to open the URL without needing the creator's local browser data.
- The playback page must not begin audible playback without a permitted user gesture.
- The visitor must be able to play, pause, restart, and control playback volume.
- The page must reproduce the published music and visualiser consistently within supported-browser constraints.
- The page must display the project title and creator attribution supplied at publication time.
- The page must clearly distinguish a published snapshot from an editable source project.
- Publishing changes to an existing project must have defined versioning or replacement semantics.
- The creator must be able to unpublish content they control.
- Missing, removed, invalid, or incompatible publications must display a clear state rather than a broken player.
- Published data must be validated and treated as untrusted input by the playback client.
- Visualiser configurations must not permit arbitrary script execution.
- The system must define basic limits and moderation/reporting expectations before public discovery is offered.
- Shared pages must provide usable metadata and preview information when linked on common platforms, where feasible.

## Open questions

- Is authentication required for publishing, or can ownership use another mechanism for the hackathon version?
- What backend and storage approach best fits the delivery window?
- Does republishing update the same URL, create a new immutable version, or offer both choices?
- Can visitors download audio or project data?
- Can visitors remix or copy a published project into their own workspace?
- Is a public gallery or discovery feed in scope, or only unlisted links?
- What creator profile or attribution information is collected?
- What content reporting, moderation, rate limiting, and abuse prevention are required?
- Are published projects retained indefinitely, and what happens after account or project deletion?
- How are older project and visualiser format versions rendered after the application evolves?
