/**
 * Completed Issue Audit Script
 *
 * Verifies that completed issues have all required artifacts:
 * - Required files exist in the worktree
 * - Verification file exists and contains required text
 * - No forbidden incomplete markers in verification file
 */

const fs = require('fs');
const path = require('path');

/**
 * List of forbidden text patterns that indicate incomplete work
 */
const FORBIDDEN_VERIFICATION_TEXT = [
  'BLOCKED',
  'PENDING',
  'PARTIAL',
  'IN_PROGRESS',
  'TODO:',
  'FIXME:',
  'NOT_IMPLEMENTED',
  'FAILED',
  'SKIPPED'
];

/**
 * Configuration for issues to audit
 * Keys are issue numbers, values are audit configurations
 */
const ISSUE_CONFIG = {
  '2': {
    root: '.claude/worktrees/issue-2-markdown',
    verificationFile: 'docs/superpowers/verification/2026-06-14-issue-2.md',
    requiredFiles: [
      'src/main/markdown-renderer.js',
      'src/renderer/floating/script.js',
      'src/renderer/floating/style.css',
      'tests/markdown-renderer.test.js',
      'tests/floating-renderer-ui.test.js',
      'tests/chat-renderer-markdown.test.js'
    ],
    requiredVerificationText: [
      'Changed Files',
      'PASS',
      'npm test'
    ],
    requiredPngEvidence: [
      'docs/superpowers/verification/issue-2/markdown-panel.png',
      'docs/superpowers/verification/issue-2/malicious-html-escaped.png'
    ]
  },
  '3': {
    root: '.claude/worktrees/issue-3-uos-x11',
    verificationFile: 'docs/superpowers/verification/2026-06-14-issue-3.md',
    requiredFiles: [
      'src/main/platform-info.js',
      'src/main/linux-selected-text-reader.js',
      'src/main/linux-x11-selection-watcher.js',
      'src/main/text-capture.js',
      'tests/platform-info.test.js',
      'tests/linux-selected-text-reader.test.js',
      'tests/linux-x11-selection-watcher.test.js',
      'tests/text-capture-platform-route.test.js'
    ],
    requiredVerificationText: [
      'Changed Files',
      'PASS',
      'npm test'
    ]
  },
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
    ]
  },
  '6': {
    root: '.claude/worktrees/issue-6-empty-selection',
    verificationFile: 'docs/superpowers/verification/2026-06-14-issue-6.md',
    requiredFiles: [
      'src/main/text-capture.js',
      'src/main/index.js',
      'tests/text-capture.test.js',
      'tests/floating-renderer-ui.test.js'
    ],
    requiredVerificationText: [
      'Changed Files',
      'PASS',
      'npm test'
    ]
  }
};

/**
 * Read PNG dimensions from file
 * @param {string} filePath - Path to PNG file
 * @returns {{ bytes: number, width: number, height: number }}
 * @throws {Error} if file is not a valid PNG
 */
function readPngDimensions(filePath) {
  const bytes = fs.readFileSync(filePath);
  const signature = bytes.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error('not a PNG file');
  }
  if (bytes.length < 24 || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('missing PNG IHDR');
  }
  return {
    bytes: bytes.length,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

/**
 * Validate PNG evidence file meets minimum requirements
 * @param {string} filePath - Path to PNG file
 * @param {object} limits - Minimum dimension requirements
 * @param {number} limits.minWidth - Minimum width (default 320)
 * @param {number} limits.minHeight - Minimum height (default 180)
 * @param {number} limits.minBytes - Minimum file size in bytes (default 1024)
 * @returns {{ valid: boolean, reason?: string, bytes?: number, width?: number, height?: number }}
 */
function validatePngEvidence(filePath, limits = {}) {
  const minWidth = limits.minWidth || 320;
  const minHeight = limits.minHeight || 180;
  const minBytes = limits.minBytes || 1024;
  try {
    const info = readPngDimensions(filePath);
    if (info.bytes < minBytes) return { valid: false, reason: `file size ${info.bytes} < ${minBytes}` };
    if (info.width < minWidth || info.height < minHeight) {
      return { valid: false, reason: `dimensions ${info.width}x${info.height} below ${minWidth}x${minHeight}` };
    }
    return { valid: true, ...info };
  } catch (error) {
    return { valid: false, reason: error.message };
  }
}

/**
 * Check if a file exists
 * @param {string} filePath - Path to check
 * @param {string} basePath - Base path to resolve relative paths
 * @returns {boolean}
 */
function fileExists(filePath, basePath = '.') {
  const fullPath = path.resolve(basePath, filePath);
  return fs.existsSync(fullPath);
}

/**
 * Read file content
 * @param {string} filePath - Path to read
 * @param {string} basePath - Base path to resolve relative paths
 * @returns {string|null} - File content or null if not found
 */
function readFile(filePath, basePath = '.') {
  const fullPath = path.resolve(basePath, filePath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Check if text contains forbidden patterns
 * @param {string} text - Text to check
 * @returns {string|null} - First forbidden pattern found, or null
 */
function findForbiddenPattern(text) {
  if (!text) return null;

  for (const pattern of FORBIDDEN_VERIFICATION_TEXT) {
    // Use simple case-insensitive string matching
    // This handles patterns like "TODO:" correctly
    if (text.toUpperCase().includes(pattern.toUpperCase())) {
      return pattern;
    }
  }
  return null;
}

/**
 * Check if text contains all required patterns
 * @param {string} text - Text to check
 * @param {string[]} requiredPatterns - Array of required patterns
 * @returns {{ found: string[], missing: string[] }}
 */
function checkRequiredPatterns(text, requiredPatterns) {
  const found = [];
  const missing = [];

  for (const pattern of requiredPatterns) {
    if (text && text.includes(pattern)) {
      found.push(pattern);
    } else {
      missing.push(pattern);
    }
  }

  return { found, missing };
}

/**
 * Audit a single issue
 * @param {string} issueNumber - Issue number to audit
 * @param {object} config - Audit configuration for the issue
 * @param {string} projectRoot - Project root directory
 * @returns {{ passed: boolean, errors: string[], warnings: string[] }}
 */
function auditIssue(issueNumber, config, projectRoot = '.') {
  const errors = [];
  const warnings = [];

  const worktreePath = path.resolve(projectRoot, config.root);

  // Check 1: Worktree exists
  if (!fs.existsSync(worktreePath)) {
    errors.push(`Worktree not found: ${config.root}`);
    return { passed: false, errors, warnings };
  }

  // Check 2: Verification file exists
  const verificationPath = path.resolve(worktreePath, config.verificationFile);
  const verificationContent = readFile(config.verificationFile, worktreePath);

  if (!verificationContent) {
    errors.push(`Verification file missing: ${config.verificationFile}`);
  } else {
    // Check 3: No forbidden patterns in verification file
    const forbiddenPattern = findForbiddenPattern(verificationContent);
    if (forbiddenPattern) {
      errors.push(`Verification file contains incomplete marker: ${forbiddenPattern}`);
    }

    // Check 4: Required verification text present
    const { missing } = checkRequiredPatterns(verificationContent, config.requiredVerificationText);
    if (missing.length > 0) {
      warnings.push(`Verification file missing required text: ${missing.join(', ')}`);
    }
  }

  // Check 5: Required files exist
  for (const file of config.requiredFiles) {
    if (!fileExists(file, worktreePath)) {
      errors.push(`Required file missing: ${file}`);
    }
  }

  // Check 6: Required PNG evidence exists and is valid
  for (const file of config.requiredPngEvidence || []) {
    const fullPath = path.resolve(worktreePath, file);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Required PNG evidence missing: ${file}`);
      continue;
    }
    const validation = validatePngEvidence(fullPath);
    if (!validation.valid) {
      errors.push(`Invalid PNG evidence ${file}: ${validation.reason}`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Audit all configured issues
 * @param {string} projectRoot - Project root directory
 * @returns {{ passed: boolean, results: object }}
 */
function auditAll(projectRoot = '.') {
  const results = {};
  let allPassed = true;

  for (const issueNumber of Object.keys(ISSUE_CONFIG)) {
    const result = auditIssue(issueNumber, ISSUE_CONFIG[issueNumber], projectRoot);
    results[issueNumber] = result;
    if (!result.passed) {
      allPassed = false;
    }
  }

  return {
    passed: allPassed,
    results
  };
}

/**
 * CLI entry point
 */
function main() {
  const args = process.argv.slice(2);

  // Parse issue numbers from args
  const issueNumbers = args
    .filter(arg => /^\d+$/.test(arg));

  const issuesToAudit = issueNumbers.length > 0
    ? issueNumbers
    : Object.keys(ISSUE_CONFIG);

  console.log('Completed Issue Audit');
  console.log('=====================\n');

  let allPassed = true;

  for (const issueNumber of issuesToAudit) {
    if (!ISSUE_CONFIG[issueNumber]) {
      console.log(`Issue #${issueNumber}: SKIPPED (no configuration)`);
      console.log('');
      continue;
    }

    const result = auditIssue(issueNumber, ISSUE_CONFIG[issueNumber]);

    console.log(`Issue #${issueNumber}: ${result.passed ? 'PASSED' : 'FAILED'}`);

    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.log(`  ERROR: ${error}`);
      }
    }

    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.log(`  WARNING: ${warning}`);
      }
    }

    if (!result.passed) {
      allPassed = false;
    }

    console.log('');
  }

  console.log('=====================');
  console.log(`Overall: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);

  process.exit(allPassed ? 0 : 1);
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  auditIssue,
  auditAll,
  ISSUE_CONFIG,
  FORBIDDEN_VERIFICATION_TEXT,
  fileExists,
  findForbiddenPattern,
  checkRequiredPatterns,
  readPngDimensions,
  validatePngEvidence
};
