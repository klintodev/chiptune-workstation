# PRD 13 Epics: Email Verification

These epics deliver [PRD 13: Email Verification](../product/13-email-verification.md) without gating the local workstation.

## E48: Firebase verification lifecycle

### Outcome

Email/Password users receive a verification email and the application can obtain fresh verified identity state.

### User stories

#### US48.1 - Receive verification after sign-up

As a new account holder, I want a verification email sent immediately so that I can prove I own the address I entered.

Requirements:

- Successful Email/Password account creation calls Firebase email verification exactly once.
- The returned account projection includes Firebase's `emailVerified` value.
- A delivery failure leaves the created account and all local data intact while showing a useful error.

#### US48.2 - Refresh verification state

As a user returning from the verification email, I want the app to recognize completion without signing out.

Requirements:

- The Firebase user record is reloaded on request.
- A successful verification forces a fresh ID token before cloud access is attempted.
- The refreshed account projection is emitted through the existing account service.

## E49: Clear local-first verification experience

### Outcome

Unverified users understand what is required and can continue making music without interruption.

### User stories

#### US49.1 - Understand the restricted state

As an unverified user, I want a clear account state so that I know my music is safe locally and why cloud controls are unavailable.

Requirements:

- The account summary calls attention to verification.
- The account panel displays the destination email, resend, status-check, and sign-out actions.
- Private cloud controls are hidden until Firebase reports verification.
- Account or verification failures never disable local editing.

#### US49.2 - Complete verification

As an unverified user, I want to resend the email or check again so that I can recover from a missed message without recreating my account.

Requirements:

- Resend uses the current signed-in Firebase user.
- **I've verified** refreshes the user and clearly reports whether verification is complete.
- A verified account transitions to the existing cloud project UI immediately.

## E50: Verified cloud security boundary

### Outcome

Cloud data cannot be accessed or mutated by an identity that has not proven ownership of its email.

### User stories

#### US50.1 - Protect private cloud projects

As an account owner, I want verification enforced outside the UI so that bypassing controls cannot expose private projects.

Requirements:

- Cloud project service operations reject unverified accounts before network access.
- Automatic synchronization and retry scheduling remain stopped while unverified.
- Firestore profile and private-project reads and writes require a matching UID and verified email token.

#### US50.2 - Protect publication ownership

As a creator, I want publishing mutations restricted to verified identities so that unverified claimed addresses cannot control public pages.

Requirements:

- Publishing, republishing, and unpublishing reject unverified accounts.
- Firestore publication create, update, and delete rules require a verified email token.
- Anonymous `get` access to known publication documents remains unchanged.

#### US50.3 - Guard the boundary with minimal tests

As a maintainer, I want focused verification tests so that future account changes cannot silently reopen cloud access.

Requirements:

- Tests cover verification delivery and refreshed token state.
- Tests cover unverified cloud and publication rejection.
- Tests assert that checked-in rules contain the verified-email boundary.
- The existing application test suite remains green.
