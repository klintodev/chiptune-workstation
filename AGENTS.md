# Repository instructions

## Unit-test failures

Investigate and fix routine test failures autonomously; Jack's approval is not required for each failure. Determine whether the failure reveals a production bug, a test defect, or an intentional change in behavior before editing.

- Fix production bugs in production code. Update expectations only when the intended behavior is supported by the task and the implementation.
- Preserve meaningful regression coverage. Do not delete or skip tests, weaken assertions, or suppress errors merely to make the suite pass.
- Run the relevant checks after a fix and the full `npm run check` gate before handing off implementation work. Report the cause, changes, validation results, and any remaining failures or blockers.
- Keep changes focused and recoverable in Git, preserve unrelated user edits, and follow the user's current scope for pushing or deploying.
