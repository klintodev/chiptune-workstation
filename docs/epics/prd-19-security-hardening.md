# PRD 19 - Security Hardening

## Description

Klinto Studio is already local-first, denies unmatched Firestore access, renders user text safely and ships no third-party runtime package from npm. This release hardens the optional cloud and sharing boundary before wider use creates meaningful abuse, privacy or deployment risk.

The work keeps composing available without an account. Security controls must fail safely, preserve existing unlisted links and remain compatible with the static Firebase Hosting deployment. Controls that live only in Firebase or Google Cloud are documented separately from protections enforced by this repository.

## Requirements

- Firebase App Check can be initialised before Auth or Firestore from a public reCAPTCHA Enterprise site key, without breaking local-only use while the key is not configured.
- A verified account may own no more than 20 new public snapshots. The limit is enforced by Firestore rules rather than UI state.
- New public snapshots do not expose the owner's Firebase UID. Existing version-one snapshots continue to load and can be migrated by republishing.
- Cloud projects and publications enforce known formats, schema versions, title lengths, collection counts and core transport ranges in both client validation and Firestore rules.
- Project titles are limited to 100 characters. Track, pattern and visualiser-layer names are limited to 32 characters.
- Email sign-up validates against the Firebase password policy and requires at least 12 characters in the interface.
- Account responses do not confirm whether an email is already registered.
- A signed-in user can delete their account only after explicit typed confirmation and recent reauthentication. Private projects, publications, publication slots and the profile are removed before the Auth user.
- Unexpected Firebase and publication errors are logged for diagnosis but replaced with neutral user-facing messages.
- GitHub Actions are pinned to immutable commit SHAs and Dependabot monitors both Actions and npm build dependencies.
- Fonts are served from Klinto Studio rather than Google Fonts. The CSP allows only the Firebase, Google sign-in and App Check origins the app uses.
- Repository checks guard the security rules, action pins, public error fallbacks, local fonts and browser headers.
- Firebase console actions, budget alerts and an emergency abuse procedure are documented for the operator.

## Epic 64 - Protect the cloud boundary

### User stories

- As the product owner, I want genuine Klinto clients to attach App Check tokens so direct backend automation is harder.
- As the product owner, I want each account limited to 20 publication slots so one account cannot create unlimited public pages.
- As a listener, I want old share links to continue working after the storage model is hardened.

### Tangible requirements

- App Check initialises before Auth and Firestore when a site key is configured.
- Publication creation atomically claims a numbered private slot from `01` through `20`.
- Rules require a matching slot for a new publication and require the slot to be removed with the publication.
- A full account receives a clear quota message.
- Version-one publications remain anonymously readable; updates migrate them to the slot-backed version.

## Epic 65 - Validate stored music data

### User stories

- As the product owner, I want Firestore to reject records that cannot be valid Klinto projects.
- As a listener, I want malformed snapshots to fail safely rather than become broken public pages.

### Tangible requirements

- Rules validate record keys and the project document format.
- Rules require project schema version 5, one to eight tracks, one to 64 patterns, valid tempo and master-volume ranges, and bounded names.
- Client state applies the same name and collection limits.
- Publication and cloud-project normalisers enforce their 900 KB client-side ceiling.

## Epic 66 - Harden account privacy and lifecycle

### User stories

- As a new user, I want password requirements explained before account creation.
- As a user, I do not want account forms to reveal whether my email is registered.
- As a user, I want to permanently delete my cloud account and its associated remote data.

### Tangible requirements

- Account creation calls Firebase `validatePassword` before creating the credential.
- Email-existence and invalid-login failures use neutral wording.
- Account deletion is presented in a blocking modal, requires typing `DELETE`, and requires password or Google reauthentication.
- Local browser projects are explicitly excluded from remote account deletion.

## Epic 67 - Secure the delivery pipeline

### User stories

- As the product owner, I want deploy actions pinned to reviewed commits so a moved version tag cannot change production code.
- As a maintainer, I want safe automated update proposals for build and workflow dependencies.

### Tangible requirements

- Every workflow `uses:` value ends in a 40-character commit SHA with its human-readable version in a comment.
- Dependabot checks npm and GitHub Actions weekly.
- Workflow permissions remain minimal and preview secrets remain unavailable to fork pull requests.

## Epic 68 - Reduce browser and privacy exposure

### User stories

- As a visitor, I want the interface fonts loaded without sharing my IP address with Google Fonts.
- As the product owner, I want the browser to limit scripts, frames, images and network calls to known origins.
- As a maintainer, I want dynamic text kept out of HTML parsing sinks.

### Tangible requirements

- Silkscreen and VT323 are self-hosted and fingerprinted by the production build.
- Google Fonts links and CSP origins are removed.
- CSP separates trusted style elements from the inline style attributes required by the DAW layout.
- Dynamic labels use `textContent`; a source check rejects template interpolation assigned to `innerHTML`.

## Epic 69 - Operate security controls

### User stories

- As the product owner, I want a short launch checklist so console-only protection is not mistaken for deployed code.
- As the product owner, I want a response path for abnormal spend or abusive public content.

### Tangible requirements

- Setup documentation covers App Check registration, monitoring and enforcement order.
- Setup documentation covers password policy, email-enumeration protection and authorised domains.
- The runbook records publication removal, emergency read shutdown and billing-alert steps.

## Open questions

- Which reCAPTCHA Enterprise site key should be committed for `studio.klinto.dev`? Until supplied, App Check support remains dormant and enforcement must stay off.
- Who should receive Google Cloud budget and App Check anomaly alerts?
- Which public email address should receive abuse and security reports?
- Should the 20-publication limit later become a paid-plan entitlement?
- Should password policy require mixed character classes, or use length-only with a 12-character minimum for better passphrase support? This release assumes length-only unless Firebase is configured more strictly.
- Should existing version-one publications be batch-migrated, or migrate only when their owners republish them? This release uses lazy migration.
- A CSP reporting endpoint is not currently available. Should reports go to a future Cloud Function or a managed reporting service?
