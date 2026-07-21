# PRD 13: Email Verification

## Description

Verify ownership of email/password accounts before they can use private cloud projects or publish a public snapshot.

The workstation remains local-first. Creating an account does not interrupt composing, playback, local persistence, project import/export, WAV export, or visualiser editing. An unverified user may remain signed in while checking their inbox, but Firebase-backed data access stays unavailable until Firebase reports that the address is verified.

Verification is a security boundary rather than a decorative UI state. The client must explain and enforce the restriction, while Firestore Security Rules independently reject cloud access from an unverified identity.

## Requirements

- Creating an Email/Password account must immediately request a Firebase verification email.
- A newly created account must remain signed in and visibly identify that verification is still required.
- The account panel must explain that local work remains available while cloud backup and sharing are locked.
- The user must be able to resend the verification email.
- The user must be able to ask the application to check the latest Firebase verification state without signing out.
- Checking verification must reload the Firebase user and force-refresh the ID token when verification succeeds.
- Verification state must be restored from Firebase after an ordinary page reload.
- The application must use Firebase's `emailVerified` value for every authentication provider rather than inferring verification from the email address or provider name.
- Verified Google identities must continue directly to the normal account experience.
- An unverified account must not list, open, create, update, synchronize, or delete private cloud projects.
- An unverified account must not publish, republish, or unpublish a public snapshot.
- Public playback of an existing known publication must remain account-free.
- Firestore Security Rules must require `request.auth.token.email_verified == true` for private user data and all publication mutations.
- Client-side cloud and publication services must reject unverified accounts before contacting Firestore and provide a useful message.
- A failed verification send, resend, or status refresh must not alter or discard local project state.
- Repeated verification-email requests must surface Firebase throttling as a useful, non-destructive message.
- Verification state, action codes, and email addresses must not be written into project documents or synchronized musical state.
- Focused automated tests must cover initial verification delivery, refreshed verification state, client-side cloud gates, publication gates, and checked-in Firestore rules.

## Open questions

Resolved for this release:

- Verification uses Firebase's hosted email action flow and existing Authentication email template.
- Email/Password users remain signed in while unverified; they are not forced through a sign-out/sign-in loop.
- Verification is checked when Firebase restores the session and when the user selects **I've verified**.
- The UI provides an explicit resend action instead of automatic repeated email delivery.
- Local features remain fully usable and no local project is uploaded while the account is unverified.
- Both client services and Firestore rules enforce the cloud boundary.
- Existing public player links remain readable because verification protects owner mutations, not anonymous playback.

Deferred:

- Custom verification-email branding or a custom email delivery provider.
- Email-address changes, provider linking, and re-verification after an address change.
- Password reset and passwordless email-link authentication.
- Automatic deletion or expiry of accounts that never verify.
- Administrative verification overrides or support tooling.
