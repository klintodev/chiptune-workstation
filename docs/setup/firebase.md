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
4. Set the Google provider support email.
5. In Firestore Database, create the default database in Production mode. Choose London (`europe-west2`) unless a location was already selected or the expected audience requires another region.
6. Publish the checked-in `firestore.rules` and `firestore.indexes.json`.
7. In Authentication > Settings > Authorized domains, add every deployed application domain. Keep `localhost` for local development.
8. Deploy Hosting so both `index.html` and `player.html` are available on the same origin.

The Firebase web API key is a public application identifier and may live in browser code. Do not add a service-account key, Admin SDK credential, refresh token, or other server secret to this repository.

## Data paths

- `/users/{uid}` contains the signed-in user's profile projection.
- `/users/{uid}/projects/{projectId}` contains private revisioned project backups and is accessible only to that user.
- `/publications/{publicationId}` contains an immutable-at-each-revision public snapshot. Anyone with its ID may read it, collection listing is denied, and only its owner may create, update, or delete it.

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
- Unpublish before deleting an account; automated account-deletion cleanup is not part of this release.
