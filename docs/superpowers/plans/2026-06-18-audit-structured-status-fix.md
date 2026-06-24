# Audit Structured Status Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the completed-issue audit false positive where issue 5 fails because ordinary prose contains the word `pending`, while preserving real BLOCKED/PENDING failure detection from structured status fields.

**Architecture:** Keep the existing `scripts/audit-completed-issues.js` public API and CLI shape, but change audit semantics from full-document forbidden-word scanning to structured evidence parsing. The audit should read `## Status` for document completion state and markdown table `Result` columns for manual matrices; historical TDD notes such as `expected FAIL` and descriptive text such as `capture remains pending` must not fail an otherwise PASS issue.

**Tech Stack:** Node.js CommonJS, `node:test`, filesystem/path modules, existing worktree verification files under `.claude/worktrees/*`.

---

## File Structure

- Modify `scripts/audit-completed-issues.js`
  - Add structured parsers:
    - `normalizeCell(value)`
    - `parseStatusSection(markdown)`
    - `parseManualResultRows(markdown)`
    - `classifyStructuredStatus(value)`
    - `hasFailingManualResult(markdown)`
  - Keep existing exports for compatibility:
    - `auditIssue`
    - `auditAll`
    - `ISSUE_CONFIG`
    - `FORBIDDEN_VERIFICATION_TEXT`
    - `fileExists`
    - `findForbiddenPattern`
    - `checkRequiredPatterns`
    - `readPngDimensions`
    - `validatePngEvidence`
  - Add new parser exports for direct tests.
  - Change only `auditIssue()` to stop calling `findForbiddenPattern()` on the full verification document.

- Modify `tests/audit-completed-issues.test.js`
  - Add parser tests proving only structured `## Status` is used.
  - Add manual `Result` table tests.
  - Update existing tests whose expected failure reason currently depends on full-text matching.
  - Keep the integration test `issue 5 worktree audit passes (context card implementation)` and make it pass without weakening PNG/file checks.

- Do not modify issue 5 verification documents to remove the word `pending`; the test should pass because the audit is fixed, not because evidence wording was sanitized.

---

### Task 1: Add Structured Parser Tests

**Files:**
- Modify: `tests/audit-completed-issues.test.js`

- [ ] **Step 1: Add parser imports to the existing require block**

Replace the current destructuring import at the top of `tests/audit-completed-issues.test.js` with this exact block:

```js
const {
  auditIssue,
  auditAll,
  ISSUE_CONFIG,
  FORBIDDEN_VERIFICATION_TEXT,
  fileExists,
  findForbiddenPattern,
  checkRequiredPatterns,
  readPngDimensions,
  validatePngEvidence,
  parseStatusSection,
  parseManualResultRows,
  classifyStructuredStatus
} = require('../scripts/audit-completed-issues.js');
```

- [ ] **Step 2: Add tests for structured status parsing**

Insert these tests after `checkRequiredPatterns handles null text`:

```js
test('parseStatusSection returns only the first meaningful line under Status', () => {
  const markdown = [
    '# Verification',
    '',
    '## Status',
    '',
    '**PASS** - current implementation is complete.',
    '',
    '## Notes',
    '',
    'Initial result: FAIL',
    'The original capture remains pending while the ignored gesture fires.'
  ].join('\n');

  assert.equal(parseStatusSection(markdown), 'PASS');
});

test('parseStatusSection ignores forbidden words outside Status', () => {
  const markdown = [
    '# Verification',
    '',
    '## Status',
    '',
    'PASS',
    '',
    '## Flake Remediation',
    '',
    '- The original capture remains pending while the ignored gesture fires.',
    '- Result: expected FAIL, 2 pass / 1 fail.'
  ].join('\n');

  assert.equal(parseStatusSection(markdown), 'PASS');
  assert.equal(classifyStructuredStatus(parseStatusSection(markdown)), 'pass');
});

test('parseStatusSection detects blocked structured status', () => {
  const markdown = [
    '# Verification',
    '',
    '## Status',
    '',
    '**AUTOMATED PASS / MANUAL BLOCKED** - hardware evidence still required.',
    '',
    '## Notes',
    '',
    'All automated tests pass.'
  ].join('\n');

  assert.equal(parseStatusSection(markdown), 'AUTOMATED PASS / MANUAL BLOCKED');
  assert.equal(classifyStructuredStatus(parseStatusSection(markdown)), 'blocked');
});
```

- [ ] **Step 3: Add tests for manual Result table parsing**

Insert these tests immediately after the structured status tests:

```js
test('parseManualResultRows extracts only Result column values', () => {
  const markdown = [
    '| Application | Scenario | Expected | Result |',
    '| --- | --- | --- | --- |',
    '| Notepad | Empty click | No toolbar | PASS |',
    '| Browser | Empty drag | No toolbar | PENDING |'
  ].join('\n');

  assert.deepEqual(parseManualResultRows(markdown), ['PASS', 'PENDING']);
});

test('parseManualResultRows ignores non-table prose with forbidden words', () => {
  const markdown = [
    'The original capture remains pending while the ignored gesture fires.',
    '',
    '| Scenario | Result |',
    '| --- | --- |',
    '| Context card collapsed | PASS |'
  ].join('\n');

  assert.deepEqual(parseManualResultRows(markdown), ['PASS']);
});
```

- [ ] **Step 4: Run parser tests and verify they fail because exports do not exist**

Run:

```powershell
node --test tests/audit-completed-issues.test.js
```

Expected:

```text
TypeError or AssertionError involving parseStatusSection / parseManualResultRows / classifyStructuredStatus
```

If the only failure is still `issue 5 worktree audit passes`, confirm the new tests were inserted and the parser functions are imported.

- [ ] **Step 5: Commit the failing tests**

```powershell
git add tests/audit-completed-issues.test.js
git commit -m "test: cover structured audit status parsing"
```

---

### Task 2: Implement Structured Status Helpers

**Files:**
- Modify: `scripts/audit-completed-issues.js`

- [ ] **Step 1: Add helper functions after `readFile()`**

Insert this exact code after the existing `readFile()` function:

```js
function normalizeCell(value) {
  return String(value || '')
    .replace(/[*_`]/g, '')
    .trim();
}

function parseStatusSection(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const statusIndex = lines.findIndex(line => /^##\s+Status\s*$/i.test(line.trim()));
  if (statusIndex < 0) return '';

  for (let index = statusIndex + 1; index < lines.length; index++) {
    const line = lines[index].trim();
    if (/^##\s+/.test(line)) return '';
    if (!line) continue;

    const statusLine = normalizeCell(line).replace(/^[-:]\s*/, '');
    const leadingStatus = statusLine.match(/^(PASS|FAILED|FAIL|BLOCKED|PENDING|PARTIAL|IN_PROGRESS|SKIPPED)\b/i);
    return leadingStatus ? leadingStatus[1].toUpperCase() : statusLine;
  }

  return '';
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => normalizeCell(cell));
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function parseManualResultRows(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const results = [];
  let resultIndex = -1;

  for (const line of lines) {
    if (!line.trim().startsWith('|')) {
      resultIndex = -1;
      continue;
    }

    const cells = splitTableRow(line);
    if (isSeparatorRow(cells)) continue;

    const headerResultIndex = cells.findIndex(cell => cell.toLowerCase() === 'result');
    if (headerResultIndex >= 0) {
      resultIndex = headerResultIndex;
      continue;
    }

    if (resultIndex >= 0 && cells.length > resultIndex) {
      results.push(cells[resultIndex]);
    }
  }

  return results;
}

function classifyStructuredStatus(value) {
  const text = normalizeCell(value).toUpperCase();
  if (!text) return 'missing';
  if (/\b(FAILED|FAIL)\b/.test(text)) return 'failed';
  if (/\b(BLOCKED|PENDING|PARTIAL|IN_PROGRESS|SKIPPED)\b/.test(text)) return 'blocked';
  if (/\bPASS\b/.test(text)) return 'pass';
  return 'unknown';
}

function hasFailingManualResult(markdown) {
  return parseManualResultRows(markdown)
    .map(classifyStructuredStatus)
    .some(status => status !== 'pass');
}
```

- [ ] **Step 2: Export the new helper functions**

At the bottom of `scripts/audit-completed-issues.js`, replace the existing `module.exports = { ... }` with:

```js
module.exports = {
  auditIssue,
  auditAll,
  ISSUE_CONFIG,
  FORBIDDEN_VERIFICATION_TEXT,
  fileExists,
  findForbiddenPattern,
  checkRequiredPatterns,
  readPngDimensions,
  validatePngEvidence,
  parseStatusSection,
  parseManualResultRows,
  classifyStructuredStatus
};
```

- [ ] **Step 3: Run the audit tests**

Run:

```powershell
node --test tests/audit-completed-issues.test.js
```

Expected:

```text
Parser tests pass.
Existing issue 5 worktree audit may still fail until Task 3 changes auditIssue().
```

- [ ] **Step 4: Commit helper implementation**

```powershell
git add scripts/audit-completed-issues.js
git commit -m "feat: add structured audit parsers"
```

---

### Task 3: Change `auditIssue()` To Use Structured Evidence

**Files:**
- Modify: `scripts/audit-completed-issues.js`
- Modify: `tests/audit-completed-issues.test.js`

- [ ] **Step 1: Replace full-document forbidden scan in `auditIssue()`**

In `scripts/audit-completed-issues.js`, find this block inside `auditIssue()`:

```js
    // Check 3: No forbidden patterns in verification file
    const forbiddenPattern = findForbiddenPattern(verificationContent);
    if (forbiddenPattern) {
      errors.push(`Verification file contains incomplete marker: ${forbiddenPattern}`);
    }
```

Replace it with:

```js
    // Check 3: Structured completion state from the Status section.
    const statusText = parseStatusSection(verificationContent);
    const structuredStatus = classifyStructuredStatus(statusText);
    if (structuredStatus !== 'pass') {
      errors.push(`Verification Status is not PASS: ${statusText || '(missing)'}`);
    }

    // Check 3b: Manual verification tables, when present, must not contain failing Result rows.
    const manualResults = parseManualResultRows(verificationContent);
    const failingManualResults = manualResults
      .filter(result => classifyStructuredStatus(result) !== 'pass');
    if (failingManualResults.length > 0) {
      errors.push(`Verification manual Result contains incomplete marker: ${failingManualResults[0]}`);
    }
```

This keeps `findForbiddenPattern()` available for old unit tests and helper compatibility, but stops using it for whole-file verification.

- [ ] **Step 2: Update the BLOCKED unit test expected error**

In `tests/audit-completed-issues.test.js`, find:

```js
assert.ok(result.errors.some(e => e.includes('BLOCKED')));
```

inside the test named `auditIssue fails when verification contains BLOCKED`.

Replace that assertion with:

```js
assert.ok(result.errors.some(e => e.includes('Verification Status is not PASS')));
assert.ok(result.errors.some(e => e.includes('BLOCKED')));
```

- [ ] **Step 3: Add regression test for issue 5 prose**

Insert this test before `auditIssue passes when all requirements are met`:

```js
test('auditIssue ignores forbidden words in historical prose when Status is PASS', () => {
  const tempDir = createTempDir();
  try {
    const worktreePath = path.join(tempDir, 'issue-103');
    fs.mkdirSync(path.join(worktreePath, 'src/main'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'docs/superpowers/verification'), { recursive: true });

    fs.writeFileSync(
      path.join(worktreePath, 'src/main/code.js'),
      'module.exports = { feature: true };'
    );
    fs.writeFileSync(
      path.join(worktreePath, 'tests/code.test.js'),
      'Feature implementation complete and verified'
    );
    fs.writeFileSync(
      path.join(worktreePath, 'docs/superpowers/verification/2026-06-14-issue-103.md'),
      [
        '# Verification',
        '',
        '## Status',
        '',
        'PASS',
        '',
        '## Flake Remediation',
        '',
        '- The original capture remains pending while the ignored gesture fires.',
        '- Result: expected FAIL, 2 pass / 1 fail.',
        '',
        '## Changed Files',
        '',
        '- src/main/code.js',
        '',
        '## Tests',
        '',
        'npm test',
        'Result: PASS'
      ].join('\n')
    );

    const config = {
      root: 'issue-103',
      verificationFile: 'docs/superpowers/verification/2026-06-14-issue-103.md',
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      requiredVerificationText: ['Changed Files', 'PASS', 'npm test']
    };

    const result = auditIssue('103', config, tempDir);

    assert.equal(result.passed, true);
    assert.deepEqual(result.errors, []);
  } finally {
    cleanupTempDir(tempDir);
  }
});
```

- [ ] **Step 4: Run audit tests**

Run:

```powershell
node --test tests/audit-completed-issues.test.js
```

Expected:

```text
All tests in tests/audit-completed-issues.test.js pass.
The issue 5 worktree audit passes.
Issue 3/6/2 blocked or pending tests may now fail if their assertions still expect old error wording; fix them in Step 5.
```

- [ ] **Step 5: Update issue 3, issue 6, and issue 2 integration assertions if needed**

If any of these tests fail only because error wording changed:

```js
test('issue 3 worktree audit reflects BLOCKED status (UOS ARM64 implementation)', ...)
test('issue 6 worktree audit reflects PENDING status (empty selection gate)', ...)
test('issue 2 worktree audit reflects BLOCKED status', ...)
```

Use this assertion pattern:

```js
assert.equal(result.passed, false);
assert.ok(result.errors.some(e => e.includes('Verification Status is not PASS')));
assert.ok(result.errors.some(e => /BLOCKED|PENDING/i.test(e)));
```

For issue 6, if the actual structured status is `PASS` but a manual table `Result` column contains `PENDING`, use:

```js
assert.equal(result.passed, false);
assert.ok(result.errors.some(e => e.includes('manual Result')));
assert.ok(result.errors.some(e => e.includes('PENDING')));
```

- [ ] **Step 6: Commit structured audit behavior**

```powershell
git add scripts/audit-completed-issues.js tests/audit-completed-issues.test.js
git commit -m "fix: audit structured verification status"
```

---

### Task 4: Add Issue 5 Screenshot Evidence To Audit Config

**Files:**
- Modify: `scripts/audit-completed-issues.js`
- Modify: `tests/audit-completed-issues.test.js`

- [ ] **Step 1: Extend issue 5 config with required PNG evidence**

In `scripts/audit-completed-issues.js`, inside `ISSUE_CONFIG['5']`, add this property after `requiredVerificationText`:

```js
    requiredPngEvidence: [
      'docs/superpowers/verification/issue-5/collapsed-context-card.png',
      'docs/superpowers/verification/issue-5/expanded-context-card.png',
      'docs/superpowers/verification/issue-5/locked-context-card.png',
      'docs/superpowers/verification/issue-5/empty-context-card.png',
      'docs/superpowers/verification/issue-5/after-clear-context-card.png'
    ]
```

The full issue 5 config should look like:

```js
  '5': {
    root: '.claude/worktrees/issue-5',
    verificationFile: 'docs/superpowers/verification/2026-06-14-issue-5.md',
    requiredFiles: [
      'src/renderer/floating/script.js',
      'src/renderer/floating/index.html',
      'src/renderer/floating/style.css',
      'tests/floating-renderer-ui.test.js'
    ],
    requiredVerificationText: [
      'Changed Files',
      'PASS',
      'npm test'
    ],
    requiredPngEvidence: [
      'docs/superpowers/verification/issue-5/collapsed-context-card.png',
      'docs/superpowers/verification/issue-5/expanded-context-card.png',
      'docs/superpowers/verification/issue-5/locked-context-card.png',
      'docs/superpowers/verification/issue-5/empty-context-card.png',
      'docs/superpowers/verification/issue-5/after-clear-context-card.png'
    ]
  },
```

- [ ] **Step 2: Add a config test for issue 5 PNG evidence**

Insert this test after `ISSUE_CONFIG issue 5 has correct worktree path`:

```js
test('ISSUE_CONFIG issue 5 requires all context card screenshots', () => {
  assert.deepEqual(ISSUE_CONFIG['5'].requiredPngEvidence, [
    'docs/superpowers/verification/issue-5/collapsed-context-card.png',
    'docs/superpowers/verification/issue-5/expanded-context-card.png',
    'docs/superpowers/verification/issue-5/locked-context-card.png',
    'docs/superpowers/verification/issue-5/empty-context-card.png',
    'docs/superpowers/verification/issue-5/after-clear-context-card.png'
  ]);
});
```

- [ ] **Step 3: Run audit tests**

Run:

```powershell
node --test tests/audit-completed-issues.test.js
```

Expected:

```text
All audit tests pass.
Issue 5 worktree audit passes with screenshot evidence validation.
```

- [ ] **Step 4: Commit issue 5 evidence gate**

```powershell
git add scripts/audit-completed-issues.js tests/audit-completed-issues.test.js
git commit -m "test: require issue 5 screenshot evidence in audit"
```

---

### Task 5: Final Verification And Handoff

**Files:**
- Create: `docs/superpowers/verification/2026-06-18-audit-structured-status-fix.md`

- [ ] **Step 1: Run focused audit test**

Run:

```powershell
node --test tests/audit-completed-issues.test.js
```

Expected:

```text
All tests pass.
The output includes: issue 5 worktree audit passes (context card implementation)
```

- [ ] **Step 2: Run full test suite**

Run:

```powershell
npm test
```

Expected:

```text
All tests pass.
No failure remains in tests/audit-completed-issues.test.js.
```

- [ ] **Step 3: Run CLI audit for issue 5**

Run:

```powershell
node scripts/audit-completed-issues.js 5
```

Expected:

```text
Issue #5: PASSED
Overall: ALL PASSED
```

- [ ] **Step 4: Create verification document**

Create `docs/superpowers/verification/2026-06-18-audit-structured-status-fix.md` with this content, replacing only the test counts with the actual counts from your command output:

```md
# Audit Structured Status Fix Verification

## Status

PASS

## Root Cause

`scripts/audit-completed-issues.js` previously scanned the entire verification document for forbidden words such as `PENDING` and `FAILED`. Issue 5 correctly had `## Status` set to `PASS`, but its historical test notes included prose such as "capture remains pending" and "expected FAIL", causing a false failure.

## Implementation

- Added structured `## Status` parsing.
- Added markdown table `Result` column parsing for manual verification matrices.
- Changed `auditIssue()` to fail on structured status or manual result rows, not arbitrary full-document prose.
- Kept existing helper exports for compatibility.
- Added issue 5 screenshot evidence validation to the audit config.

## Verification

- `node --test tests/audit-completed-issues.test.js`
  - Result: PASS
- `npm test`
  - Result: PASS
- `node scripts/audit-completed-issues.js 5`
  - Result: PASS

## Notes

- Issue 5 worktree audit now passes without editing issue 5 verification prose.
- Historical TDD notes containing `expected FAIL` remain allowed when structured status is `PASS`.
- Descriptive prose containing `pending` remains allowed when structured status is `PASS`.
- Real `BLOCKED`, `PENDING`, `FAILED`, or non-PASS status in `## Status` still fails.
- Manual matrix `Result` cells that are not `PASS` still fail.
```

- [ ] **Step 5: Commit verification document**

```powershell
git add docs/superpowers/verification/2026-06-18-audit-structured-status-fix.md
git commit -m "docs: verify structured audit status fix"
```

---

## Self-Review Checklist

- [ ] The plan fixes the actual issue 5 failure without changing issue 5 evidence wording.
- [ ] `auditIssue()` no longer calls `findForbiddenPattern()` on the full verification document.
- [ ] Existing exported helper names remain available.
- [ ] Tests prove `pending` and `expected FAIL` in prose do not fail a PASS status.
- [ ] Tests prove `BLOCKED/PENDING/FAILED` in structured `## Status` still fails.
- [ ] Tests prove non-PASS manual `Result` table cells still fail.
- [ ] Issue 5 screenshot evidence is explicitly validated.
- [ ] Final verification includes focused audit test, full `npm test`, and CLI audit for issue 5.

