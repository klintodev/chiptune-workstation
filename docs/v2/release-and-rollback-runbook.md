# V2 release and rollback runbook

Status: Required release procedure for PRD 32
Applies to: V2 Beta, V2 Stable and every rollback after the first V7 write

This runbook turns [PRD 32](./32-v2-compatibility-and-release.md) into an operator procedure. It does not authorize a deployment by itself. Every command below is run from a clean, reviewed release commit, and every Firebase command targets the `klinto-studio` project only after the release commander verifies the active project.

## Non-negotiable invariants

1. No user-facing route may write Project schema V7 until dual-schema Firestore rules, the recovery-capable V1 Studio and the V7-capable public player are live and verified.
2. After the first V7 save or publication, an old pre-V2 build is never a valid rollback target.
3. The rollback Studio may edit V1, but V7, future-version and malformed records are recovery-only. It must list them, show safe metadata, and download the raw record without activating, editing, autosaving or deleting it.
4. Rollback never downgrades `dist/player.html` below V7 read/play capability. A V7 publication must remain playable or fail closed as unavailable; it must never be partially interpreted by a V1-only player.
5. Dual-schema `firestore.rules` remain deployed for the whole rollback window. A Studio rollback is a Hosting-only operation.
6. There is no V7-to-V1 conversion. A recovery download is evidence-preserving data, not an invitation to import it into a V1 editor.

Any failed invariant is a release stop, even if the ordinary smoke tests pass.

## Exact release artifacts and selector

`npm run build` must produce one coherent artifact set from one commit:

| Artifact | Purpose | Release rule |
| --- | --- | --- |
| `dist/index.html` | Default V2 Studio | Promote only after the compatibility deployment passes. |
| `dist/studio-v1-rollback.html` | Rollback-compatible V1 Studio | Must remain deployable for the entire rollback window. When promoted to `/`, copy this generated file over `dist/index.html` in a fresh build directory. |
| `dist/player.html` | Dual V1/V7 public player | Deploy before V7 writes and never replace with a V1-only player. |
| `dist/assets/**` | Fingerprinted Studio, rollback, player, CSS, font and static assets referenced by the HTML files | Deploy only as the set emitted by the same build. Never combine HTML and assets from different commits. |
| `dist/workbench.html` | Internal component workbench | Ship only from the same build; it is not a release selector or a substitute for release verification. |
| `dist/robots.txt`, `dist/sitemap.xml` | Generated Hosting metadata | Ship unchanged with the coherent Hosting directory. |
| `firestore.rules` | Authenticated, ownership-scoped dual V1/V7 envelope rules | Deploy first and leave in place during rollback. |
| `firestore.indexes.json` | Required Firestore indexes | Deploy with the compatibility rules. |
| `firebase.json` | Hosting/rules deployment manifest | Operator input; it is not served as a public artifact. |

The source-level Studio selector is `globalThis.__KLINTO_STUDIO_RELEASE_VARIANT__`:

- unset/default selects the V2 Studio used by `dist/index.html`;
- the rollback entry sets it to the exact value `"v1-recovery"` before loading the application, and `dist/studio-v1-rollback.html` references that entry.

This is an artifact selector, not a user preference or remotely mutable flag. Do not add a query-string, cookie or `localStorage` override that lets an ordinary browser enter the wrong authoring runtime.

## Release ownership

Record a named person and backup for every role in the release ticket. One person may hold more than one role on a small team, but the recovery verifier must independently confirm the raw-record hashes.

| Role | Owns | Stop/go authority |
| --- | --- | --- |
| Release commander | Timeline, target project, approvals, Firebase release IDs and final go/no-go | Sole authority to start promotion or declare rollback. |
| Rules owner | `firestore.rules`, indexes, emulator evidence and production dual-schema checks | Stops release on any V1/V7 ownership, read or write regression. |
| Studio owner | V2 and `v1-recovery` builds, local/cloud recovery UI and first-upgrade disclosure | Stops release on activation, autosave, delete or raw-download mutation risk. |
| Player/audio owner | V1/V7 public validation, occurrence/audio parity and unavailable-state behavior | Stops release if V7 playback regresses or malformed state reaches audio. |
| Recovery verifier | Fixture seeding, before/after raw hashes, browser matrix and rollback drill | Signs the compatibility and rollback invariants independently. |
| Incident and communications owner | Monitoring, user/status copy, support handoff and incident log | Publishes only the approved exact copy below. |

The Firebase deploy identity must have only the Hosting and Firestore deployment permissions described in [security operations](../security/operations.md). Do not use a committed service-account key.

## Exact user messaging

The following strings are release-controlled copy. Do not paraphrase them during Beta or rollback.

### First committed V1-to-V7 upgrade

Show once per Project per browser, only after the first successful committed V7 save:

> This project was upgraded to the Studio V2 format when it was first saved. Older Studio builds cannot edit it, but the recovery build can still list and download the raw V2 record.

The browser keys are:

- pending: `chiptune-workstation:v2-upgrade-pending:${encodeURIComponent(projectId)}`;
- shown: `chiptune-workstation:v2-upgrade-shown:${encodeURIComponent(projectId)}`.

In-memory migration, preview, validation failure and an uncommitted edit must not set either key. The pending key permits a committed cloud/local upgrade that reloads the page to deliver the notice; the shown key suppresses repeats in that browser. Clearing browser storage or using another browser is a new browser scope.

### Recovery-only Project row

> This project is unavailable for editing. Download its raw recovery copy to preserve the original.

The row exposes only `Download raw recovery copy`. It must not expose Open, Edit, Save, Delete or audio controls.

### Active rollback notice

Use this text in the incident banner or status notice while the recovery Studio is the default:

> Studio is temporarily in recovery mode while we investigate a V2 issue. V1 projects remain editable. V2 projects remain stored and can be downloaded unchanged, but cannot be edited in this build. Public playback remains on the V7-capable player.

Support must not ask a user to delete, rename, resave or import a V7 recovery copy through V1 Studio.

## Verification fixtures

Use a dedicated release-test account. Keep fixture Project IDs identical to their repository or Firestore document IDs. Never put malformed/future fixtures in a real user's account, and never write an unsupported fixture to production merely to test rejection.

| Fixture ID | Shape | Required contexts | Expected result |
| --- | --- | --- | --- |
| `ready-v1` | Valid outer document V1 with Project schema 6 | Local, emulator, production test account | Recovery Studio opens, edits and saves it as V1. V2 migrates it in memory and writes V7 only on the first committed save. |
| `native-v7` | Canonical outer document V1 with Project schema 7 | Local, emulator, production test account | V2 opens it. Recovery Studio lists it as unavailable and downloads raw JSON only. |
| `future` | Copy of `native-v7` with Project schema 8 | Local and emulator only | Every Studio lists it as unavailable; no activation, audio, mutation or deletion occurs. |
| `malformed` | V1 record with invalid `project.transport.bpm: 999` | Local and emulator only | Every Studio lists it as unavailable; safe metadata and raw download remain available. |
| `publication-compat` | Valid V1 public snapshot | Emulator and production test publication | V7 player migrates and plays it. |
| `publication-v7` | Canonical V7 public snapshot | Emulator and production test publication | V7 player validates and plays it natively. |
| `publication-malformed` | V7 snapshot with an unknown Instrument or Effect type | Local/emulator player only | Player displays unavailable state and never starts audio. |

The canonical programmatic definitions are in `tests/v2-migration-matrix.test.js`, `tests/v2-compatibility-adapters.test.js` and `tests/project-library-v1-recovery.test.js`. The migration matrix additionally generates Project schemas 1 through 6. Do not maintain a separate hand-edited interpretation of those fixtures for release approval.

Before exercising recovery, download/capture the raw text for `native-v7`, `future` and `malformed`, compute SHA-256, and record only the hashes in the release ticket. After every recovery action, capture and hash them again. The before/after hashes must match, and the local IndexedDB record or cloud record revision/timestamps must be unchanged. A JSON deep-equality check is also required; hashing alone does not replace validation that the expected record was selected.

## Preflight and evidence

Use a clean checkout of the approved commit. Do not deploy from a working tree containing generated or unrelated changes.

```powershell
git status --short
git rev-parse HEAD
npm ci
npm run check
npm run build
```

`git status --short` must be empty before and after the build except for intentionally ignored `dist/` output. `npm run check` must include the complete build and Node test suite. The release owner manually verifies the required desktop and approximately 390 x 844 journeys against the built artifact.

Confirm the generated entry selection:

```powershell
Select-String -Path dist/index.html -Pattern 'app-[A-Za-z0-9_-]+\.js'
Select-String -Path dist/studio-v1-rollback.html -Pattern 'rollback-app-[A-Za-z0-9_-]+\.js'
Select-String -Path dist/player.html -Pattern 'player-[A-Za-z0-9_-]+\.js'
Select-String -Path firestore.rules -Pattern 'project\.schemaVersion in \[6, 7\]'
```

Record the exact commit and hashes:

```powershell
Get-FileHash -Algorithm SHA256 dist/index.html,dist/studio-v1-rollback.html,dist/player.html,firestore.rules,firestore.indexes.json
Get-ChildItem -File -Recurse dist/assets | Sort-Object FullName | Get-FileHash -Algorithm SHA256
```

Attach to the release ticket:

- commit SHA and reviewer approvals;
- Node, npm, verification-browser and Firebase CLI versions;
- test/check logs and the required PRD 32 journey results;
- HTML/rules/index/assets hashes;
- compatibility and final Hosting release IDs plus the Firestore ruleset ID;
- named role assignments;
- fixture raw hashes before and after compatibility, V2 and rollback verification;
- screenshots of recovery-only rows, the one-time upgrade disclosure and malformed public unavailable state;
- monitoring baseline and the go/no-go decision.

Evidence and telemetry must not contain Project JSON, note data or other musical content.

## Release order

Firebase Hosting publishes the contents of `dist/` as one version. Therefore the recovery Studio and V7 player ship together as one compatibility Hosting release before the V2 entry is promoted.

### 1. Deploy dual-schema rules and indexes

The rules owner runs:

```powershell
npx --yes firebase-tools@latest use klinto-studio
npx --yes firebase-tools@latest deploy --only firestore:rules,firestore:indexes
```

Verify authenticated ownership, V1 and V7 bounds, denial of unmatched access, and successful V1 reads/writes. Before the compatibility Hosting release is live, verify bounded V7 writes in the emulator only. Seed the dedicated production test account's `native-v7` record in step 2, after the recovery Studio and V7 player are live. Do not deploy Hosting yet.

Stop if rules reject valid V1, admit an unsupported schema write, expose another owner's record or no longer deny unmatched paths.

### 2. Deploy the compatibility Hosting release

Start from a fresh `npm run build`. Promote the generated recovery entry to the root without changing `dist/player.html` or any asset:

```powershell
npm run build
Copy-Item -LiteralPath dist/studio-v1-rollback.html -Destination dist/index.html -Force
npx --yes firebase-tools@latest deploy --only hosting
```

This Hosting version must contain:

- the `v1-recovery` Studio at `/`;
- the same recovery artifact at `/studio-v1-rollback.html`;
- the V7-capable player at `/player.html`;
- their same-build fingerprinted assets.

Record the Hosting release ID as the emergency rollback target. Do not use a Hosting release created from a pre-V7-player commit.

Verify in this order:

1. `ready-v1` opens, edits, saves and reloads as V1.
2. `native-v7`, `future` and `malformed` remain visible in local/emulator recovery lists with only raw download.
3. `native-v7` is visible in the production test account's cloud list and downloads without changing its revision, timestamps or raw hash.
4. Attempts to activate, autosave or delete an unavailable row are impossible in the UI and rejected by the underlying action boundary.
5. `publication-compat` and `publication-v7` play through `/player.html`; `publication-malformed` fails closed without audio in the emulator/local player.
6. Reload and repeat the raw hashes. All must match.

No user-facing V7 authoring/write route is live at this point.

### 3. Run hosted dual-version integration checks

With the compatibility release still at `/`, verify local, cloud and public reads for V1/V7; V1 cloud writes; ownership denial; raw recovery; and V1/V7 public playback. Confirm there are no uncaught page errors, unhandled rejections or unexpected console errors.

The release commander and recovery verifier sign the compatibility gate. If either does not sign, stop here; the deployed recovery Studio and player are a safe holding state.

### 4. Promote the V2 Studio

Rebuild to restore the canonical V2 `dist/index.html`; do not restore it from an untracked backup. Confirm that the player and rules hashes still match the approved artifact set, then deploy Hosting only:

```powershell
npm run build
npx --yes firebase-tools@latest deploy --only hosting
```

Verify all four focused PRD 32 journeys: compose/save/reload, arrange/mix/effects, V1 migration/import/export/hosted parity, and the mobile surface smoke. Then verify:

1. Opening `ready-v1` does not modify its stored source before a committed command.
2. The first committed save writes canonical V7 and shows the exact upgrade disclosure once for `ready-v1` in that browser.
3. Subsequent saves, reloads and opens do not repeat the disclosure; a second browser is an independent scope.
4. V7 local save/reload/download/import/cloud save/publication/remix/WAV paths preserve the complete canonical state.
5. `/studio-v1-rollback.html` still lists the newly written `native-v7` recovery record and downloads it without mutation.
6. `/player.html` still plays both V1 and V7 publications and fails closed for malformed state.

Only now may the release commander declare V7 writes enabled and start the opt-in Beta cohort.

### 5. Observe before expanding

Monitor counts and rates for migration, open, committed save, cloud save, publication, playback failure and recovery download without recording Project content. Stop expansion on any P0/P1, data-loss, migration, stuck-audio or required-journey blocker, or on any unexpected raw-record mutation. Record the observation window and baseline comparison in the release ticket before each cohort expansion.

## Emergency rollback

### Rollback triggers

The release commander initiates rollback for confirmed or credible data loss/corruption, unsafe migration, repeated V7 open/save failure, ownership exposure, a P0/P1 required-journey regression, or a V2 issue whose containment requires disabling authoring. A player-only problem does not authorize downgrading the player; fix or fail closed while retaining V7 validation.

### Rollback procedure

1. Freeze cohort expansion and open the incident log. Assign the incident/communications owner.
2. Select the recorded compatibility Hosting release or build the exact approved commit that contains dual-schema rules, `studio-v1-rollback.html` and the V7 player. Never select an older whole-site release merely because its V1 editor is known to work.
3. If rebuilding, run the complete preflight, then promote only the recovery HTML and deploy Hosting:

   ```powershell
   npm run build
   Copy-Item -LiteralPath dist/studio-v1-rollback.html -Destination dist/index.html -Force
   npx --yes firebase-tools@latest deploy --only hosting
   ```

4. Do not deploy or revert `firestore.rules`, `firestore.indexes.json` or the player separately. The recovery artifact set already contains the approved V7 player.
5. Publish the exact active rollback notice above.
6. Run the rollback verification below before declaring containment complete.

Do not use a Firebase whole-project rollback, a pre-V2 Git tag or a V1-only `dist/` directory. Those options can silently downgrade rules or the public player and hide V7 data.

### Rollback verification

The recovery verifier confirms:

- `/` and `/studio-v1-rollback.html` select `v1-recovery`;
- `ready-v1` remains editable and saves/reloads as V1;
- every `native-v7` local/cloud row remains visible, recovery-only and raw-downloadable;
- `future` and `malformed` remain visible/recovery-only locally and in the emulator;
- unavailable records cannot activate Project/audio state and have no Open/Edit/Save/Delete control;
- raw hashes, cloud revisions and timestamps match the pre-action evidence;
- `/player.html` still validates/plays `publication-compat` and `publication-v7`;
- malformed/unsupported publications show unavailable state and do not start audio;
- deployed Firestore rules still admit only supported V1/V7 bounded writes and retain ownership checks;
- no recovery action created a V1 replacement, downgrade copy or implicit delete.

The release commander records the Hosting release ID, time, fixture evidence and monitoring state. Keep the incident open if any recovery invariant cannot be proven.

## Forward recovery after rollback

Repair on top of a V7-capable commit. Repeat the entire preflight and compatibility verification, including the rollback drill against real `native-v7` local and production test-account records. Promote canonical `dist/index.html` with a Hosting-only deploy as in release step 4. Do not ask users to re-import recovery files until the fixed V2 Studio is live and the file validates as V7.

Keep the recovery artifact, dual-schema rules and V7 player deployable until the declared rollback window closes. Closing the incident requires healthy dual-version telemetry, unchanged fixture evidence, successful release-journey verification and no open P0/P1, data-loss, migration, stuck-audio or required-journey blocker.
