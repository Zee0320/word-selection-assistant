const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  auditCompletedIssues,
  parseManualResultRows,
  parseStatusSection
} = require('../scripts/audit-completed-issues');

const repoRoot = path.join(__dirname, '..');

function writeFile(rootDir, relativePath, content) {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createFixtureRoot({ issue6Result = 'PASS' } = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsa-audit-'));
  for (const issue of [2, 4, 5, 6]) {
    writeFile(rootDir, `docs/superpowers/verification/2026-06-14-issue-${issue}.md`, [
      `# Issue ${issue}`,
      '',
      '## Status',
      '',
      'PASS',
      '',
      '## Notes',
      '',
      'Initial result: FAIL is historical TDD evidence.',
      'A malicious link is blocked as non-clickable text.'
    ].join('\n'));
  }
  writeFile(rootDir, 'docs/superpowers/verification/issue-6/manual-windows-results.md', [
    '# Issue 6 Manual Windows Verification',
    '',
    '## Status',
    '',
    'PASS',
    '',
    '| Application | Scenario | Repetitions | Expected | Result |',
    '| --- | --- | --- | --- | --- |',
    `| Notepad | Empty click | 5 | No toolbar | ${issue6Result} |`,
    `| Browser | Real selection | 5 | Toolbar opens | ${issue6Result} |`
  ].join('\n'));
  return rootDir;
}

test('parseStatusSection reads only the structured Status section', () => {
  const markdown = [
    '# Verification',
    '',
    '## Status',
    '',
    '**PASS** - current state is complete.',
    '',
    '## TDD Notes',
    '',
    'Initial result: FAIL',
    'blocked as non-clickable text'
  ].join('\n');

  assert.equal(parseStatusSection(markdown), 'PASS');
});

test('parseManualResultRows extracts Result column values from markdown tables', () => {
  const rows = parseManualResultRows([
    '| Application | Scenario | Result | Notes |',
    '| --- | --- | --- | --- |',
    '| Notepad | Empty click | PASS | No window |',
    '| Browser | Empty drag | BLOCKED | Not run |'
  ].join('\n'));

  assert.deepEqual(rows, ['PASS', 'BLOCKED']);
});

test('fixture audit ignores historical FAIL text and only fails structured manual rows', () => {
  const passingRoot = createFixtureRoot();
  const passingAudit = auditCompletedIssues({ rootDir: passingRoot });

  assert.equal(passingAudit.windowsComplete, true);
  assert.equal(passingAudit.issues.get(2).status, 'pass');
  assert.equal(passingAudit.issues.get(6).status, 'pass');

  const failingRoot = createFixtureRoot({ issue6Result: 'FAIL' });
  const failingAudit = auditCompletedIssues({ rootDir: failingRoot });

  assert.equal(failingAudit.windowsComplete, false);
  assert.equal(failingAudit.issues.get(6).status, 'failed');
});

test('repository audit treats issues 2, 4, 5, and 6 as Windows gates and issue 3 as UOS manual gate', () => {
  const audit = auditCompletedIssues({ rootDir: repoRoot });

  assert.equal(audit.windowsComplete, true);
  for (const issue of [2, 4, 5, 6]) {
    assert.equal(audit.issues.get(issue).status, 'pass', `issue ${issue} should pass`);
    assert.equal(audit.issues.get(issue).blocksWindowsRelease, true);
  }

  assert.equal(audit.issues.get(3).status, 'manual_blocked');
  assert.equal(audit.issues.get(3).blocksWindowsRelease, false);
});
