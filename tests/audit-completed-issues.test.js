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
  DEFAULT_CONFIG,
  FORBIDDEN_VERIFICATION_TEXT,
  findWorktree,
  fileExists,
  findForbiddenPattern
} = require('../scripts/audit-completed-issues.js');

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
});

test('DEFAULT_CONFIG contains expected issues', () => {
  assert.ok(DEFAULT_CONFIG[2]);
  assert.ok(DEFAULT_CONFIG[3]);
  assert.ok(DEFAULT_CONFIG[5]);
  assert.ok(DEFAULT_CONFIG[6]);

  // Verify each has required files
  for (const config of Object.values(DEFAULT_CONFIG)) {
    assert.ok(Array.isArray(config.requiredFiles));
    assert.ok(config.requiredFiles.length > 0);
  }
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
});

test('findForbiddenPattern is case-insensitive', () => {
  assert.equal(findForbiddenPattern('status: pending'), 'PENDING');
  assert.equal(findForbiddenPattern('Status: Pending'), 'PENDING');
  assert.equal(findForbiddenPattern('TODO: something'), 'TODO:');
  assert.equal(findForbiddenPattern('todo: something'), 'TODO:');
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

test('findWorktree returns null when worktree does not exist', () => {
  const tempDir = createTempDir();
  try {
    const result = findWorktree(999, tempDir);
    assert.equal(result, null);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('findWorktree finds worktree with various naming patterns', () => {
  const tempDir = createTempDir();
  try {
    // Test pattern: issue-{number}
    fs.mkdirSync(path.join(tempDir, 'issue-123'), { recursive: true });
    const result123 = findWorktree(123, tempDir);
    assert.ok(result123);
    assert.equal(path.basename(result123), 'issue-123');

    // Test pattern: issue{number}
    fs.mkdirSync(path.join(tempDir, 'issue456'), { recursive: true });
    const result456 = findWorktree(456, tempDir);
    assert.ok(result456);
    assert.equal(path.basename(result456), 'issue456');

    // Test pattern: {number}
    fs.mkdirSync(path.join(tempDir, '789'), { recursive: true });
    const result789 = findWorktree(789, tempDir);
    assert.ok(result789);
    assert.equal(path.basename(result789), '789');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue fails when worktree is missing', () => {
  const tempDir = createTempDir();
  try {
    const result = auditIssue(999, {
      requiredFiles: ['test.js'],
      verificationText: 'Test complete'
    }, { worktreesDir: tempDir });

    assert.equal(result.passed, false);
    assert.ok(result.errors.some(e => e.includes('Worktree not found')));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue fails when required artifact files are missing', () => {
  const tempDir = createTempDir();
  try {
    // Create worktree
    const worktreePath = path.join(tempDir, 'issue-100');
    fs.mkdirSync(worktreePath, { recursive: true });

    const result = auditIssue(100, {
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      verificationText: 'Feature complete'
    }, { worktreesDir: tempDir });

    assert.equal(result.passed, false);
    assert.ok(result.errors.some(e => e.includes('Required file missing')));
    assert.ok(result.errors.some(e => e.includes('src/main/code.js')));
    assert.ok(result.errors.some(e => e.includes('tests/code.test.js')));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue fails when verification text contains incomplete markers', () => {
  const tempDir = createTempDir();
  try {
    // Create worktree with all required files
    const worktreePath = path.join(tempDir, 'issue-101');
    fs.mkdirSync(path.join(worktreePath, 'src/main'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'tests'), { recursive: true });

    fs.writeFileSync(
      path.join(worktreePath, 'src/main/code.js'),
      '// Implementation is TODO: needs work'
    );
    fs.writeFileSync(
      path.join(worktreePath, 'tests/code.test.js'),
      'Feature complete'
    );

    const result = auditIssue(101, {
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      verificationText: null
    }, { worktreesDir: tempDir });

    assert.equal(result.passed, false);
    assert.ok(result.errors.some(e => e.includes('incomplete marker')));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue passes when all requirements are met', () => {
  const tempDir = createTempDir();
  try {
    // Create worktree with all required files
    const worktreePath = path.join(tempDir, 'issue-102');
    fs.mkdirSync(path.join(worktreePath, 'src/main'), { recursive: true });
    fs.mkdirSync(path.join(worktreePath, 'tests'), { recursive: true });

    // Write clean files without forbidden markers
    fs.writeFileSync(
      path.join(worktreePath, 'src/main/code.js'),
      'module.exports = { feature: true };'
    );
    fs.writeFileSync(
      path.join(worktreePath, 'tests/code.test.js'),
      'Feature implementation complete and verified'
    );

    const result = auditIssue(102, {
      requiredFiles: ['src/main/code.js', 'tests/code.test.js'],
      verificationText: 'complete and verified'
    }, { worktreesDir: tempDir });

    assert.equal(result.passed, true);
    assert.equal(result.errors.length, 0);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditAll returns aggregated results', () => {
  const tempDir = createTempDir();
  try {
    // Create one passing worktree
    const passingWorktree = path.join(tempDir, 'issue-200');
    fs.mkdirSync(path.join(passingWorktree, 'src/main'), { recursive: true });
    fs.writeFileSync(
      path.join(passingWorktree, 'src/main/code.js'),
      'Complete implementation'
    );

    // Create config for test issues
    const testConfig = {
      200: {
        requiredFiles: ['src/main/code.js'],
        verificationText: null
      },
      201: {
        requiredFiles: ['src/main/other.js'],
        verificationText: null
      }
    };

    const result = auditAll(testConfig, { worktreesDir: tempDir });

    assert.equal(result.passed, false); // 201 is missing
    assert.ok(result.results[200]);
    assert.ok(result.results[201]);
    assert.equal(result.results[200].passed, true);
    assert.equal(result.results[201].passed, false);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue handles test result file requirement', () => {
  const tempDir = createTempDir();
  try {
    const worktreePath = path.join(tempDir, 'issue-300');
    fs.mkdirSync(worktreePath, { recursive: true });
    fs.writeFileSync(
      path.join(worktreePath, 'code.js'),
      'complete'
    );

    // Config with test result file requirement
    const config = {
      requiredFiles: ['code.js'],
      verificationText: null,
      testResultFile: 'test-results.json'
    };

    const result = auditIssue(300, config, { worktreesDir: tempDir });

    assert.equal(result.passed, false);
    assert.ok(result.errors.some(e => e.includes('Test result file missing')));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('auditIssue passes when test result file exists', () => {
  const tempDir = createTempDir();
  try {
    const worktreePath = path.join(tempDir, 'issue-301');
    fs.mkdirSync(worktreePath, { recursive: true });
    fs.writeFileSync(path.join(worktreePath, 'code.js'), 'complete');
    fs.writeFileSync(path.join(worktreePath, 'test-results.json'), '{"passed": true}');

    const config = {
      requiredFiles: ['code.js'],
      verificationText: null,
      testResultFile: 'test-results.json'
    };

    const result = auditIssue(301, config, { worktreesDir: tempDir });

    assert.equal(result.passed, true);
  } finally {
    cleanupTempDir(tempDir);
  }
});
