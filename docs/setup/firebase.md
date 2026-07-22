# Firebase setup

The workstation is local-first. Firebase adds optional accounts, private cloud project backups, and unlisted public playback pages; it is not required to compose, save locally, export WAV, or use visuals.

## Project

- Firebase project ID: `klinto-studio`
- Firebase project number: `466489590439`
- Web app name: `Chiptune Workstation`
- Authentication providers: Email/Password and Google
- Database: Cloud Firestore
- Intended Firestore location: London (`europe-west2`), if the project does not already have a database location

## Console setup

1. Open the existing Firebase project and register a Web app named `Chiptune Workstation`. Firebase Hosting setup may remain unchecked during registration.
2. Copy the generated `firebaseConfig` values into `src/firebase/firebase-config.js`. The required values are `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId`.
3. In Authentication > Sign-in method, enable Email/Password and Google.
   - In Authentication > Templates, review the email-address verification template and ensure its sender name and reply-to address are appropriate for the workstation.
   - In Authentication > Settings > Password policy, choose **Require**, set the minimum length to **12**, and leave force-upgrade-on-sign-in off for existing users. Add character-class requirements only if the product wants them; the client reads the configured policy before sign-up.
   - In Authentication > Settings > User actions, enable **Email enumeration protection**. Account copy is intentionally neutral for existing-email failures.
4. Set the Google provider support email.
5. In Firestore Database, create the default database in Production mode. Choose London (`europe-west2`) unless a location was already selected or the expected audience requires another region.
6. Publish the checked-in `firestore.rules` and `firestore.indexes.json`.
7. In Authentication > Settings > Authorized domains, add every deployed application domain. Keep `localhost` for local development.
8. Deploy Hosting so both `index.html` and `player.html` are available on the same origin.

## App Check rollout

App Check code is present but remains dormant while `FIREBASE_APP_CHECK_CONFIG.siteKey` is empty. Do not enable enforcement first or every cloud request will fail.

1. In Google Cloud, create a score-based reCAPTCHA Enterprise website key for `studio.klinto.dev`.
2. In Firebase > App Check, register the existing web app with the reCAPTCHA Enterprise provider and that site key.
3. Put the public site key in `src/firebase/firebase-config.js` under `FIREBASE_APP_CHECK_CONFIG.siteKey`.
4. For local development, use Firebase's App Check debug provider and register the generated debug token in the console. Never commit a debug token.
5. Deploy the configured build. Confirm that valid requests appear in App Check metrics for Authentication and Firestore.
6. After at least one normal usage window shows legitimate traffic as valid, enable enforcement for Firestore and then Authentication.
7. Test email sign-in, Google sign-in, cloud backup, publish, anonymous playback and account deletion on `studio.klinto.dev`.

reCAPTCHA Enterprise assessments may incur usage charges above its free quota. Keep the token auto-refresh and billing dashboards under review.

The Firebase web API key is a public application identifier and may live in browser code. Do not add a service-account key, Admin SDK credential, refresh token, or other server secret to this repository.

## Data paths

- `/users/{uid}` contains the signed-in user's profile projection.
- `/users/{uid}/projects/{projectId}` contains private revisioned project backups and is accessible only to that user.
- `/users/{uid}/publicationSlots/{slotId}` contains up to 20 private ownership slots used to enforce the publication quota without exposing the UID publicly.
- `/publications/{publicationId}` contains an immutable-at-each-revision public snapshot. Anyone with its ID may read it, general collection listing is denied, and slot-backed ownership controls changes.

## CLI deployment

After signing the Firebase CLI into an account with access to the project, run:

```powershell
npx --yes firebase-tools@latest use klinto-studio
npx --yes firebase-tools@latest deploy --only firestore:rules,firestore:indexes,hosting
```

The checked-in rules deny unmatched access by default. Test sign-in, private backup, an anonymous player URL, republishing, and unpublishing after deployment.

## Current release limits

- Accounts remain optional until cloud backup or publishing is used.
- Email/Password accounts must verify their address before private cloud access or publication changes; local work remains available while verification is pending.
- Shared pages are unlisted links; there is no public gallery or collection query.
- Published snapshots do not expose downloads or remix actions.
- Account deletion reauthenticates the user and removes their profile, private projects, publication slots and owned public pages. Local browser projects remain under the user's control.

See `docs/security/operations.md` for billing alerts, abusive-content removal and emergency controls.
