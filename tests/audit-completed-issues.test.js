/**
 * Tests for the Completed Issue Audit Gate
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  auditIssue,
  auditAll,
  ISSUE_CONFIG,
  FORBIDDEN_VERIFICATION_TEXT,
  fileExists,
  findForbiddenPattern,
  parseStatusSection,
  parseManualResultRows,
  classifyStructuredStatus,
  checkRequiredPatterns,
  readPngDimensions,
  validatePngEvidence
} = require('../scripts/audit-completed-issues.js');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Helper to create temp directories
function createTempDir() {
  const tempDir = path.join(__dirname, '.temp-audit-test-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function cleanupTempDir(tempDir) {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test('FORBIDDEN_VERIFICATION_TEXT contains expected markers', () => {
  assert.ok(Array.isArray(FORBIDDEN_VERIFICATION_TEXT));
  assert.ok(FORBIDDEN_VERIFICATION_TEXT.includes('PENDING'));
  assert.ok(FORBIDDEN_VERIFICATION_TEXT.includes('PARTIAL'));
  assert.ok(FORBIDDEN_VERIFICATION_TEXT.includes('IN_PROGRESS'));
  assert.ok(FORBIDDEN_VERIFICATION_TEXT.includes('TODO:'));
  assert.ok(FORBIDDEN_VERIFICATION_TEXT.includes('BLOCKED'));
});

test('ISSUE_CONFIG contains expected issues', () => {
  assert.ok(ISSUE_CONFIG['2']);
  assert.ok(ISSUE_CONFIG['3']);
  assert.ok(ISSUE_CONFIG['5']);
  assert.ok(ISSUE_CONFIG['6']);

  // Verify each has required files
  for (const config of Object.values(ISSUE_CONFIG)) {
    assert.ok(Array.isArray(config.requiredFiles));
    assert.ok(config.requiredFiles.length > 0);
    assert.ok(config.root);
    assert.ok(config.verificationFile);
    assert.ok(Array.isArray(config.requiredVerificationText));
  }
});

test('ISSUE_CONFIG issue 2 has correct worktree path', () => {
  assert.equal(ISSUE_CONFIG['2'].root, '.claude/worktrees/issue-2-markdown');
});

test('ISSUE_CONFIG issue 3 has correct worktree path', () => {
  assert.equal(ISSUE_CONFIG['3'].root, '.claude/worktrees/issue-3-uos-x11');
});

test('ISSUE_CONFIG issue 5 has correct worktree path', () => {
  assert.equal(ISSUE_CONFIG['5'].root, '.claude/worktrees/issue-5');
});

test('ISSUE_CONFIG issue 5 requires all context card screenshots', () => {
  assert.deepEqual(ISSUE_CONFIG['5'].requiredPngEvidence, [
    'docs/superpowers/verification/issue-5/collapsed-context-card.png',
    'docs/superpowers/verification/issue-5/expanded-context-card.png',
    'docs/superpowers/verification/issue-5/locked-context-card.png',
    'docs/superpowers/verification/issue-5/empty-context-card.png',
    'docs/superpowers/verification/issue-5/after-clear-context-card.png'
  ]);
});

test('ISSUE_CONFIG issue 6 has correct worktree path', () => {
  assert.equal(ISSUE_CONFIG['6'].root, '.claude/worktrees/issue-6-empty-selection');
});

test('findForbiddenPattern returns null for clean text', () => {
  assert.equal(findForbiddenPattern('This is complete and working'), null);
  assert.equal(findForbiddenPattern('All tests pass successfully'), null);
  assert.equal(findForbiddenPattern('Feature implemented correctly'), null);
});

test('findForbiddenPattern detects forbidden markers', () => {
  assert.equal(findForbiddenPattern('Status: PENDING'), 'PENDING');
  assert.equal(findForbiddenPattern('This is PARTIAL implementation'), 'PARTIAL');
  assert.equal(findForbiddenPattern('TODO: finish this'), 'TODO:');
  assert.equal(findForbiddenPattern('FIXME: broken code'), 'FIXME:');
  assert.equal(findForbiddenPattern('Status: BLOCKED'), 'BLOCKED');
});

test('findForbiddenPattern is case-insensitive', () => {
  assert.equal(findForbiddenPattern('status: pending'), 'PENDING');
  assert.equal(findForbiddenPattern('Status: Pending'), 'PENDING');
  assert.equal(findForbiddenPattern('TODO: something'), 'TODO:');
  assert.equal(findForbiddenPattern('todo: something'), 'TODO:');
});

test('findForbiddenPattern handles null and undefined', () => {
  assert.equal(findForbiddenPattern(null), null);
  assert.equal(findForbiddenPattern(undefined), null);
});

test('parseStatusSection returns only the first meaningful line under Status', () => {
  const markdown = [
    '# Verification',
    '',
    '## Status',
    '',
    '*PASS* - Manual checks complete',
    'Expected FAIL in prior run is now resolved.',
    '',
    '## Notes',
    'PENDING follow-up note from history'
  ].join('\n');

  assert.equal(parseStatusSection(markdown), 'PASS - Manual checks complete');
});

test('parseStatusSection ignores forbidden words outside Status', () => {
  const markdown = [
    'PENDING note from older run',
    '',
    '## Status',
    '',
    'PASS',
    '',
    '## Notes',
    'expected FAIL in historical prose'
  ].join('\n');

  assert.equal(parseStatusSection(markdown), 'PASS');
});

test('parseStatusSection detects blocked structured status', () => {
  const markdown = [
    '## Status',
    '',
    '`BLOCKED` waiting for device access'
  ].join('\n');

  assert.equal(parseStatusSection(markdown), 'BLOCKED waiting for device access');
  assert.equal(classifyStructuredStatus(parseStatusSection(markdown)), 'blocked');
});

test('parseManualResultRows extracts only Result column values', () => {
  const markdown = [
    '## Manual Checks',
    '',
    '| Scenario | Result | Notes |',
    '| --- | --- | --- |',
    '| Collapsed | PASS | ok |',
    '| Expanded | BLOCKED | waiting |',
    '| Locked | PASS | ok |'
  ].join('\n');

  assert.deepEqual(parseManualResultRows(markdown), ['PASS', 'BLOCKED', 'PASS']);
});

test('parseManualResultRows ignores non-table prose with forbidden words', () => {
  const markdown = [
    'Expected FAIL from old run.',
    'capture remains pending until screenshot upload.',
    '',
    '| Scenario | Result | Notes |',
    '| --- | --- | --- |',
    '| Manual verification | PASS | complete |'
  ].join('\n');

  assert.deepEqual(parseManualResultRows(markdown), ['PASS']);
});

test('parseManualResultRows marks blank Result cells as missing', () => {
  const markdown = [
    '## Manual Checks',
    '',
    '| Scenario | Result | Notes |',
    '| --- | --- | --- |',
    '| Windows capture |  | not done |'
  ].join('\n');

  assert.deepEqual(parseManualResultRows(markdown), ['MISSING']);
});

test('parseManualResultRows marks rows with missing Result cells as missing', () => {
  const markdown = [
    '## Manual Checks',
    '',
    '| Scenario | Result | Notes |',
    '| --- | --- | --- |',
    '| Windows capture |'
  ].join('\n');

  assert.deepEqual(parseManualResultRows(markdown), ['MISSING']);
});

test('fileExists returns correct results', () => {
  const tempDir = createTempDir();
  try {
    // Create a test file
    const testFile = path.join(tempDir, 'test.txt');
    fs.writeFileSync(testFile, 'test content');

    assert.equal(fileExists('test.txt', tempDir), true);
    assert.equal(fileExists('nonexistent.txt', tempDir), false);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('checkRequiredPatterns finds all patterns', () => {
  const text = 'Changed Files\nPASS\nnpm test';
  const patterns = ['Changed Files', 'PASS', 'npm test'];
  const result = checkRequiredPatterns(text, patterns);
  assert.deepEqual(result.found, patterns);
  assert.deepEqual(result.missing, []);
});

test('checkRequiredPatterns identifies missing patterns', () => {
  const text = 'Changed Files\nPASS';
  const patterns = ['Changed Files', 'PASS', 'npm test'];
  const result = checkRequiredPatterns(text, patterns);
  assert.deepEqual(result.found, ['Changed Files', 'PASS']);
  assert.deepEqual(result.missing, ['npm test']);
});

test('checkRequiredPatterns handles null text', () => {
  const patterns = ['test'];
  const result = checkRequiredPatterns(null, patterns);
  assert.deepEqual(result.found, []);
  assert.deepEqual(result.missing, ['test']);
});

test('auditIssue fails when worktree is missing', () => {
  const fakeConfig = {
    root: '.claude/worktrees/nonexistent',
    verificationFile: 'verification.md',
    requiredFiles: ['test.js'],
    requiredVerificationText: ['test']
  };
  const result = auditIssue('999', fakeConfig, PROJECT_ROOT);

  assert.equal(result.passed, false);
  assert.ok(result.errors.some(e => e.includes('Worktree not found')));
});

test('auditIssue fails when required files are missing', () => {
  const tempDir = createTempDir();
  try {
    // Create worktree
    const worktreePath = path.join(tempDir, 'issue-100');
    fs.mkdirSync(worktreePath, { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'docs/superpowers/verification'), { recursive: true });

    const config = {
      root: 'issue-100',
      verificationFile: 'docs/superpowers/verification/2026-06-14-issue-100.md',
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      requiredVerificationText: ['PASS']
    };

    fs.writeFileSync(
      path.join(worktreePath, 'docs/superpowers/verification/2026-06-14-issue-100.md'),
      '# Verification\nPASS\nnpm test'
    );

    const result = auditIssue('100', config, tempDir);

    assert.equal(result.passed, false);
    assert.ok(result.errors.some(e => e.includes('Required file missing')));
    assert.ok(result.errors.some(e => e.includes('src/main/code.js')));
    assert.ok(result.errors.some(e => e.includes('tests/code.test.js')));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue fails when verification contains BLOCKED', () => {
  const tempDir = createTempDir();
  try {
    const worktreePath = path.join(tempDir, 'issue-101');
    fs.mkdirSync(path.join(worktreePath, 'src/main'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'docs/superpowers/verification'), { recursive: true });

    fs.writeFileSync(
      path.join(worktreePath, 'src/main/code.js'),
      'module.exports = { feature: true };'
    );
    fs.writeFileSync(
      path.join(worktreePath, 'tests/code.test.js'),
      'Feature implementation complete'
    );
    fs.writeFileSync(
      path.join(worktreePath, 'docs/superpowers/verification/2026-06-14-issue-101.md'),
      '# Verification\n\n## Status\n\nBLOCKED\n\nNeed screenshots.'
    );

    const config = {
      root: 'issue-101',
      verificationFile: 'docs/superpowers/verification/2026-06-14-issue-101.md',
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      requiredVerificationText: ['PASS']
    };

    const result = auditIssue('101', config, tempDir);

    assert.equal(result.passed, false);
    assert.ok(result.errors.includes('Verification Status is not PASS: BLOCKED'));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue fails when manual Result contains PENDING', () => {
  const tempDir = createTempDir();
  try {
    const worktreePath = path.join(tempDir, 'issue-103');
    fs.mkdirSync(path.join(worktreePath, 'src/main'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'docs/superpowers/verification'), { recursive: true });

    fs.writeFileSync(path.join(worktreePath, 'src/main/code.js'), 'module.exports = { feature: true };');
    fs.writeFileSync(path.join(worktreePath, 'tests/code.test.js'), 'Feature implementation complete');
    fs.writeFileSync(
      path.join(worktreePath, 'docs/superpowers/verification/2026-06-14-issue-103.md'),
      [
        '# Verification',
        '',
        '## Status',
        '',
        'PASS',
        '',
        '## Manual Checks',
        '',
        '| Scenario | Result | Notes |',
        '| --- | --- | --- |',
        '| Windows capture | PENDING | waiting for device |'
      ].join('\n')
    );

    const config = {
      root: 'issue-103',
      verificationFile: 'docs/superpowers/verification/2026-06-14-issue-103.md',
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      requiredVerificationText: ['PASS']
    };

    const result = auditIssue('103', config, tempDir);

    assert.equal(result.passed, false);
    assert.ok(result.errors.includes('Verification manual Result contains incomplete marker: PENDING'));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue fails when manual Result cell is blank', () => {
  const tempDir = createTempDir();
  try {
    const worktreePath = path.join(tempDir, 'issue-105');
    fs.mkdirSync(path.join(worktreePath, 'src/main'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'docs/superpowers/verification'), { recursive: true });

    fs.writeFileSync(path.join(worktreePath, 'src/main/code.js'), 'module.exports = { feature: true };');
    fs.writeFileSync(path.join(worktreePath, 'tests/code.test.js'), 'Feature implementation complete');
    fs.writeFileSync(
      path.join(worktreePath, 'docs/superpowers/verification/2026-06-14-issue-105.md'),
      [
        '# Verification',
        '',
        '## Status',
        '',
        'PASS',
        '',
        '## Manual Checks',
        '',
        '| Scenario | Result | Notes |',
        '| --- | --- | --- |',
        '| Windows capture |  | not done |'
      ].join('\n')
    );

    const config = {
      root: 'issue-105',
      verificationFile: 'docs/superpowers/verification/2026-06-14-issue-105.md',
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      requiredVerificationText: ['PASS']
    };

    const result = auditIssue('105', config, tempDir);

    assert.equal(result.passed, false);
    assert.ok(result.errors.includes('Verification manual Result contains incomplete marker: MISSING'));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue fails when manual Result cell is missing from the row', () => {
  const tempDir = createTempDir();
  try {
    const worktreePath = path.join(tempDir, 'issue-106');
    fs.mkdirSync(path.join(worktreePath, 'src/main'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'docs/superpowers/verification'), { recursive: true });

    fs.writeFileSync(path.join(worktreePath, 'src/main/code.js'), 'module.exports = { feature: true };');
    fs.writeFileSync(path.join(worktreePath, 'tests/code.test.js'), 'Feature implementation complete');
    fs.writeFileSync(
      path.join(worktreePath, 'docs/superpowers/verification/2026-06-14-issue-106.md'),
      [
        '# Verification',
        '',
        '## Status',
        '',
        'PASS',
        '',
        '## Manual Checks',
        '',
        '| Scenario | Result | Notes |',
        '| --- | --- | --- |',
        '| Windows capture |'
      ].join('\n')
    );

    const config = {
      root: 'issue-106',
      verificationFile: 'docs/superpowers/verification/2026-06-14-issue-106.md',
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      requiredVerificationText: ['PASS']
    };

    const result = auditIssue('106', config, tempDir);

    assert.equal(result.passed, false);
    assert.ok(result.errors.includes('Verification manual Result contains incomplete marker: MISSING'));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue passes when all requirements are met', () => {
  const tempDir = createTempDir();
  try {
    const worktreePath = path.join(tempDir, 'issue-102');
    fs.mkdirSync(path.join(worktreePath, 'src/main'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'docs/superpowers/verification'), { recursive: true });

    // Write clean files without forbidden markers
    fs.writeFileSync(
      path.join(worktreePath, 'src/main/code.js'),
      'module.exports = { feature: true };'
    );
    fs.writeFileSync(
      path.join(worktreePath, 'tests/code.test.js'),
      'Feature implementation complete and verified'
    );
    fs.writeFileSync(
      path.join(worktreePath, 'docs/superpowers/verification/2026-06-14-issue-102.md'),
      [
        '# Verification',
        '',
        '## Status',
        '',
        'PASS',
        '',
        '## Changed Files',
        '',
        '- src/main/code.js',
        '',
        '## Tests',
        '',
        'npm test',
        '',
        '| Scenario | Result | Notes |',
        '| --- | --- | --- |',
        '| Manual verification | PASS | complete |'
      ].join('\n')
    );

    const config = {
      root: 'issue-102',
      verificationFile: 'docs/superpowers/verification/2026-06-14-issue-102.md',
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      requiredVerificationText: ['Changed Files', 'PASS', 'npm test']
    };

    const result = auditIssue('102', config, tempDir);

    assert.equal(result.passed, true);
    assert.equal(result.errors.length, 0);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue ignores forbidden words in historical prose when Status is PASS', () => {
  const tempDir = createTempDir();
  try {
    const worktreePath = path.join(tempDir, 'issue-104');
    fs.mkdirSync(path.join(worktreePath, 'src/main'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'docs/superpowers/verification'), { recursive: true });

    fs.writeFileSync(path.join(worktreePath, 'src/main/code.js'), 'module.exports = { feature: true };');
    fs.writeFileSync(path.join(worktreePath, 'tests/code.test.js'), 'Feature implementation complete');
    fs.writeFileSync(
      path.join(worktreePath, 'docs/superpowers/verification/2026-06-14-issue-104.md'),
      [
        '# Verification',
        '',
        '## Status',
        '',
        'PASS',
        '',
        '## Manual Checks',
        '',
        '| Scenario | Result | Notes |',
        '| --- | --- | --- |',
        '| Windows audit | PASS | complete |',
        '',
        '## Notes',
        '',
        'Historical note: capture remains pending in old environment.',
        'Historical note: expected FAIL before the fix landed.',
        '',
        '## Changed Files',
        '- src/main/code.js',
        '',
        '## Tests',
        'npm test'
      ].join('\n')
    );

    const config = {
      root: 'issue-104',
      verificationFile: 'docs/superpowers/verification/2026-06-14-issue-104.md',
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      requiredVerificationText: ['PASS', 'npm test']
    };

    const result = auditIssue('104', config, tempDir);

    assert.equal(result.passed, true);
    assert.deepEqual(result.errors, []);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue resolves configured worktree roots against the main repo from a linked worktree', () => {
  const tempDir = createTempDir();
  try {
    const mainRepoRoot = path.join(tempDir, 'repo');
    const linkedWorktreeRoot = path.join(mainRepoRoot, '.claude', 'worktrees', 'audit-structured-status-fix');
    const targetWorktree = path.join(mainRepoRoot, '.claude', 'worktrees', 'issue-200');

    fs.mkdirSync(path.join(targetWorktree, 'src/main'), { recursive: true });
    fs.mkdirSync(path.join(targetWorktree, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(targetWorktree, 'docs/superpowers/verification'), { recursive: true });

    fs.writeFileSync(path.join(targetWorktree, 'src/main/code.js'), 'module.exports = { feature: true };');
    fs.writeFileSync(path.join(targetWorktree, 'tests/code.test.js'), 'Feature implementation complete');
    fs.writeFileSync(
      path.join(targetWorktree, 'docs/superpowers/verification/2026-06-14-issue-200.md'),
      '# Verification\n\n## Status\n\nPASS\n\n## Tests\n\nnpm test'
    );

    fs.mkdirSync(linkedWorktreeRoot, { recursive: true });

    const result = auditIssue('200', {
      root: '.claude/worktrees/issue-200',
      verificationFile: 'docs/superpowers/verification/2026-06-14-issue-200.md',
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      requiredVerificationText: ['PASS', 'npm test']
    }, linkedWorktreeRoot);

    assert.equal(result.passed, true);
    assert.deepEqual(result.errors, []);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue prefers the main repo peer worktree over a stale nested worktree path', () => {
  const tempDir = createTempDir();
  try {
    const mainRepoRoot = path.join(tempDir, 'repo');
    const linkedWorktreeRoot = path.join(mainRepoRoot, '.claude', 'worktrees', 'audit-structured-status-fix');
    const nestedPeerPath = path.join(linkedWorktreeRoot, '.claude', 'worktrees', 'issue-201');
    const mainPeerPath = path.join(mainRepoRoot, '.claude', 'worktrees', 'issue-201');

    fs.mkdirSync(path.join(nestedPeerPath, 'docs/superpowers/verification'), { recursive: true });
    fs.writeFileSync(
      path.join(nestedPeerPath, 'docs/superpowers/verification/2026-06-14-issue-201.md'),
      '# Verification\n\n## Status\n\nPASS\n'
    );

    fs.mkdirSync(path.join(mainPeerPath, 'src/main'), { recursive: true });
    fs.mkdirSync(path.join(mainPeerPath, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(mainPeerPath, 'docs/superpowers/verification'), { recursive: true });
    fs.writeFileSync(path.join(mainPeerPath, 'src/main/code.js'), 'module.exports = { feature: true };');
    fs.writeFileSync(path.join(mainPeerPath, 'tests/code.test.js'), 'Feature implementation complete');
    fs.writeFileSync(
      path.join(mainPeerPath, 'docs/superpowers/verification/2026-06-14-issue-201.md'),
      '# Verification\n\n## Status\n\nPASS\n\n## Tests\n\nnpm test'
    );

    const result = auditIssue('201', {
      root: '.claude/worktrees/issue-201',
      verificationFile: 'docs/superpowers/verification/2026-06-14-issue-201.md',
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      requiredVerificationText: ['PASS', 'npm test']
    }, linkedWorktreeRoot);

    assert.equal(result.passed, true);
    assert.deepEqual(result.errors, []);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditAll returns aggregated results', () => {
  const result = auditAll(PROJECT_ROOT);

  assert.ok(result.results['2']);
  assert.ok(result.results['3']);
  assert.ok(result.results['5']);
  assert.ok(result.results['6']);
  assert.equal(typeof result.passed, 'boolean');
});

// Integration tests for real worktrees
test('issue 5 worktree audit passes (context card implementation)', () => {
  const result = auditIssue('5', ISSUE_CONFIG['5'], PROJECT_ROOT);
  assert.equal(result.passed, true);
});

test('issue 3 worktree audit reflects BLOCKED status (UOS ARM64 implementation)', () => {
  const result = auditIssue('3', ISSUE_CONFIG['3'], PROJECT_ROOT);
  // Issue 3 verification is BLOCKED - needs UOS ARM64 hardware for manual verification
  assert.equal(result.passed, false);
  assert.ok(result.errors.some(e => e.startsWith('Verification Status is not PASS: BLOCKED')));
});

test('issue 6 worktree audit passes (empty selection gate)', () => {
  const result = auditIssue('6', ISSUE_CONFIG['6'], PROJECT_ROOT);
  assert.equal(result.passed, true);
  assert.deepEqual(result.errors, []);
});

test('issue 2 worktree audit passes', () => {
  const result = auditIssue('2', ISSUE_CONFIG['2'], PROJECT_ROOT);
  assert.equal(result.passed, true);
  assert.deepEqual(result.errors, []);
});

test('validatePngEvidence rejects a 1x1 placeholder', () => {
  const tempDir = createTempDir();
  try {
    const pngPath = path.join(tempDir, 'placeholder.png');
    fs.writeFileSync(pngPath, Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
      'hex'
    ));

    const result = validatePngEvidence(pngPath, { minWidth: 320, minHeight: 180, minBytes: 1024 });
    assert.equal(result.valid, false);
    assert.match(result.reason, /dimensions|size/i);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue rejects invalid required PNG evidence', () => {
  const tempDir = createTempDir();
  try {
    const worktreePath = path.join(tempDir, 'issue-2');
    fs.mkdirSync(path.join(worktreePath, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(worktreePath, 'code.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(worktreePath, 'docs', 'verification.md'), 'Changed Files\nPASS\nnpm test');
    fs.writeFileSync(path.join(worktreePath, 'docs', 'evidence.png'), Buffer.alloc(67));

    const result = auditIssue('2', {
      root: 'issue-2',
      verificationFile: 'docs/verification.md',
      requiredFiles: ['code.js'],
      requiredVerificationText: ['Changed Files', 'PASS', 'npm test'],
      requiredPngEvidence: ['docs/evidence.png']
    }, tempDir);

    assert.equal(result.passed, false);
    assert.ok(result.errors.some(error => error.includes('Invalid PNG evidence')));
  } finally {
    cleanupTempDir(tempDir);
  }
});
