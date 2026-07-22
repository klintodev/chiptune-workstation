# Security operations

This runbook covers the controls that cannot be guaranteed by browser code or Firestore rules alone.

## Launch checklist

- Enable Firebase Authentication email-enumeration protection.
- Enforce a minimum 12-character Firebase password policy without forcing existing users to upgrade on sign-in.
- Register and deploy the App Check site key, monitor valid traffic, then enforce App Check for Firestore and Authentication.
- Confirm the Firebase deploy service account has only the roles needed for Hosting and Firestore rules deployment.
- In Google Cloud Billing, set budget alerts at 50%, 80% and 100% of the monthly amount the owner is willing to spend. Add a low forecast threshold during the hackathon.
- In Firebase usage dashboards, review Firestore document reads/writes and Authentication sign-ups at least daily during public launch.
- Add the person responsible for the project as the alert recipient. Record a second recipient before handing the project to a team.

## Remove an abusive publication

1. Extract the publication ID from the `player.html?id=...` URL.
2. In Firestore, inspect `/publications/{publicationId}` and record the title and timestamps needed for the incident note.
3. Delete `/publications/{publicationId}` with an Admin-authorised console or script.
4. If the version-two document has an `ownerSlot`, locate the matching `publicationId` under the owner's private publication slots and delete that slot. The normal owner-facing unpublish flow removes both atomically.
5. Verify the public URL now displays the unpublished message.

The public version-two document deliberately contains no Firebase UID. If administrative ownership lookup becomes necessary, use an Admin SDK query across `publicationSlots`; never make those private slot documents publicly readable.

## Emergency denial-of-wallet response

1. Confirm the spike in Google Cloud Billing and Firebase usage dashboards.
2. If anonymous publication reads are the cause, temporarily change the publication `allow get` rule to `false` and deploy Firestore rules. This disables shared players but preserves private data.
3. If authenticated writes are the cause, enable or tighten App Check enforcement and temporarily disable the affected Auth provider or publication creates.
4. Preserve timestamps, request metrics and affected publication IDs before cleanup.
5. Rotate or revoke deployment credentials only if CI or a service account may be involved.
6. Restore access gradually and watch the metrics after the cause is understood.

## Reporting

The product owner still needs to choose a public abuse/security contact. Once chosen, add it to the shared-player footer and `/.well-known/security.txt`, then monitor it during launch.
