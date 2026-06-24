# Audit Structured Status Fix Verification

## Status

PASS

## Root Cause

The previous completed-issue audit scanned full verification documents for forbidden words such as `PENDING` and `FAILED`. That caused a false positive for issue 5 even though its structured `## Status` section was `PASS`, because historical prose still contained phrases such as expected `FAIL` and pending capture notes.

## Implementation Summary

- Added structured `## Status` parsing so the audit reads only the first meaningful line under the `Status` section.
- Added Markdown table parsing for the `Result` column so manual verification rows are evaluated structurally instead of scanning unrelated prose.
- Updated `auditIssue()` to fail only when the structured verification status is not `PASS` or when any manual `Result` cell is not `PASS`.
- Preserved existing script exports and API surface, including `findForbiddenPattern`.
- Added issue 5 screenshot evidence validation for all five required context card PNG files.
- Fixed linked worktree root resolution so `.claude/worktrees/issue-*` paths resolve against the main repository when the audit runs from another linked worktree.

## Verification Commands

- `node --test tests/audit-completed-issues.test.js`
  - Result: PASS (`39` tests, `39` pass, `0` fail)
- `node scripts/audit-completed-issues.js 5`
  - Result: PASS
  - Output:
    - `Issue #5: PASSED`
    - `Overall: ALL PASSED`
- `npm test`
  - Result: PASS (`171` tests, `171` pass, `0` fail)

## Notes

- Issue 5 now passes without editing issue 5 verification prose.
- Historical expected `FAIL` / pending prose is allowed when the structured `## Status` is `PASS`.
- A real non-`PASS` structured `## Status` still fails the audit.
- A non-`PASS` manual verification `Result` cell still fails the audit.
- Blank or missing manual verification `Result` cells now fail as `MISSING`.
- Linked-worktree peer resolution now prefers the main repository peer worktree for `.claude/worktrees/...` targets.
