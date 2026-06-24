/**
 * Completed Issue Audit Script
 *
 * Verifies that completed issues have all required artifacts:
 * - Required files exist in the worktree
 * - Verification file exists and contains required text
 * - Structured Status is PASS and manual Result table rows are all PASS
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
    ],
    requiredPngEvidence: [
      'docs/superpowers/verification/issue-5/collapsed-context-card.png',
      'docs/superpowers/verification/issue-5/expanded-context-card.png',
      'docs/superpowers/verification/issue-5/locked-context-card.png',
      'docs/superpowers/verification/issue-5/empty-context-card.png',
      'docs/superpowers/verification/issue-5/after-clear-context-card.png'
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

function normalizeCell(value) {
  return String(value || '')
    .replace(/[*_`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) {
    return [];
  }

  let content = trimmed;
  if (content.startsWith('|')) {
    content = content.slice(1);
  }
  if (content.endsWith('|')) {
    content = content.slice(0, -1);
  }

  return content.split('|').map(cell => normalizeCell(cell));
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function parseStatusSection(markdown) {
  if (!markdown) {
    return null;
  }

  const lines = String(markdown).split(/\r?\n/);
  let inStatusSection = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!inStatusSection) {
      if (/^##\s+Status\b/i.test(trimmed)) {
        inStatusSection = true;
      }
      continue;
    }

    if (/^##\s+/.test(trimmed)) {
      return null;
    }

    if (!trimmed) {
      continue;
    }

    const normalized = normalizeCell(trimmed);
    const match = normalized.match(/^(PASS|FAILED|FAIL|BLOCKED|PENDING|PARTIAL|IN_PROGRESS|SKIPPED)\b(?:\s*[:\-]?\s*(.*))?$/i);
    if (!match) {
      return normalized || null;
    }

    const token = match[1].toUpperCase();
    return normalized.replace(/^[A-Za-z_]+/, token);
  }

  return null;
}

function classifyStructuredStatus(value) {
  const normalized = normalizeCell(value);
  if (!normalized) {
    return 'missing';
  }

  const upper = normalized.toUpperCase();
  if (upper === 'PASS' || upper.startsWith('PASS ')) {
    return 'pass';
  }
  if (upper === 'FAIL' || upper.startsWith('FAIL ') || upper === 'FAILED' || upper.startsWith('FAILED ')) {
    return 'failed';
  }
  if (
    upper === 'BLOCKED' || upper.startsWith('BLOCKED ') ||
    upper === 'PENDING' || upper.startsWith('PENDING ') ||
    upper === 'PARTIAL' || upper.startsWith('PARTIAL ') ||
    upper === 'IN_PROGRESS' || upper.startsWith('IN_PROGRESS ') ||
    upper === 'SKIPPED' || upper.startsWith('SKIPPED ')
  ) {
    return 'blocked';
  }
  return 'unknown';
}

function parseManualResultRows(markdown) {
  if (!markdown) {
    return [];
  }

  const lines = String(markdown).split(/\r?\n/);
  const results = [];

  for (let index = 0; index < lines.length; index += 1) {
    const headerCells = splitTableRow(lines[index]);
    if (headerCells.length === 0) {
      continue;
    }

    const resultColumnIndex = headerCells.findIndex(cell => cell.toUpperCase() === 'RESULT');
    if (resultColumnIndex === -1) {
      continue;
    }

    const separatorCells = splitTableRow(lines[index + 1] || '');
    if (!isSeparatorRow(separatorCells)) {
      continue;
    }

    index += 2;
    for (; index < lines.length; index += 1) {
      const rowCells = splitTableRow(lines[index]);
      if (rowCells.length === 0) {
        index -= 1;
        break;
      }
      if (isSeparatorRow(rowCells)) {
        continue;
      }

      const resultValue = normalizeCell(rowCells[resultColumnIndex]);
      results.push(resultValue || 'MISSING');
    }
  }

  return results;
}

function hasFailingManualResult(markdown) {
  for (const value of parseManualResultRows(markdown)) {
    if (classifyStructuredStatus(value) !== 'pass') {
      return value;
    }
  }
  return null;
}

function resolveAuditRoot(projectRoot, configuredRoot) {
  const normalizedProjectRoot = path.resolve(projectRoot);
  const marker = `${path.sep}.claude${path.sep}worktrees${path.sep}`;
  const markerIndex = normalizedProjectRoot.lastIndexOf(marker);
  const normalizedConfiguredRoot = String(configuredRoot || '').replace(/[\\/]+/g, '/');
  const isPeerWorktreeRoot = normalizedConfiguredRoot.startsWith('.claude/worktrees/');

  if (markerIndex !== -1 && isPeerWorktreeRoot) {
    const mainRepoRoot = normalizedProjectRoot.slice(0, markerIndex);
    const preferredRoot = path.resolve(mainRepoRoot, configuredRoot);
    if (fs.existsSync(preferredRoot)) {
      return preferredRoot;
    }
  }

  const resolvedRoot = path.resolve(projectRoot, configuredRoot);
  if (fs.existsSync(resolvedRoot)) {
    return resolvedRoot;
  }

  if (markerIndex === -1) {
    return resolvedRoot;
  }

  const mainRepoRoot = normalizedProjectRoot.slice(0, markerIndex);
  return path.resolve(mainRepoRoot, configuredRoot);
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

  const worktreePath = resolveAuditRoot(projectRoot, config.root);

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
    // Check 3: Structured verification status is PASS
    const verificationStatus = parseStatusSection(verificationContent);
    if (classifyStructuredStatus(verificationStatus) !== 'pass') {
      errors.push(`Verification Status is not PASS: ${verificationStatus || 'MISSING'}`);
    }

    // Check 4: Manual Result tables contain only PASS values
    const failingManualResult = hasFailingManualResult(verificationContent);
    if (failingManualResult) {
      errors.push(`Verification manual Result contains incomplete marker: ${failingManualResult}`);
    }

    // Check 5: Required verification text present
    const { missing } = checkRequiredPatterns(verificationContent, config.requiredVerificationText);
    if (missing.length > 0) {
      warnings.push(`Verification file missing required text: ${missing.join(', ')}`);
    }
  }

  // Check 6: Required files exist
  for (const file of config.requiredFiles) {
    if (!fileExists(file, worktreePath)) {
      errors.push(`Required file missing: ${file}`);
    }
  }

  // Check 7: Required PNG evidence exists and is valid
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
  parseStatusSection,
  parseManualResultRows,
  classifyStructuredStatus,
  checkRequiredPatterns,
  readPngDimensions,
  validatePngEvidence
};
