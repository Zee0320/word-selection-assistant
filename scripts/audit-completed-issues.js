/**
 * Completed Issue Audit Script
 *
 * Verifies that completed issues have all required artifacts:
 * - Required files exist in the worktree
 * - Verification text doesn't contain incomplete markers
 * - npm test result is recorded
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * List of forbidden text patterns that indicate incomplete work
 */
const FORBIDDEN_VERIFICATION_TEXT = [
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
 * Default configuration for issues to audit
 * Keys are issue numbers, values are audit configurations
 */
const DEFAULT_CONFIG = {
  2: {
    requiredFiles: [
      'src/main/selected-context.js',
      'tests/selected-context.test.js'
    ],
    verificationText: 'SelectedContext class captures surrounding lines',
    testResultFile: null
  },
  3: {
    requiredFiles: [
      'src/main/chat-history.js',
      'tests/chat-history.test.js'
    ],
    verificationText: 'Chat history persistence with SQLite',
    testResultFile: null
  },
  5: {
    requiredFiles: [
      'src/main/chat-prompt.js',
      'tests/chat-prompt.test.js'
    ],
    verificationText: 'Chat prompt templates with context injection',
    testResultFile: null
  },
  6: {
    requiredFiles: [
      'src/main/api-request-config.js',
      'tests/api-request-config.test.js'
    ],
    verificationText: 'API request configuration with custom headers',
    testResultFile: null
  }
};

/**
 * Check if a worktree exists for the given issue number
 * @param {number} issueNumber - The issue number
 * @param {string} worktreesDir - Path to worktrees directory
 * @returns {string|null} - Path to worktree or null if not found
 */
function findWorktree(issueNumber, worktreesDir = '.claude/worktrees') {
  const possibleNames = [
    `issue-${issueNumber}`,
    `issue${issueNumber}`,
    `${issueNumber}`
  ];

  for (const name of possibleNames) {
    const worktreePath = path.join(worktreesDir, name);
    if (fs.existsSync(worktreePath)) {
      return worktreePath;
    }
  }

  return null;
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

  const upperText = text.toUpperCase();
  for (const pattern of FORBIDDEN_VERIFICATION_TEXT) {
    if (upperText.includes(pattern.toUpperCase())) {
      return pattern;
    }
  }
  return null;
}

/**
 * Run npm test in a directory and return the result
 * @param {string} dir - Directory to run tests in
 * @returns {{ success: boolean, output: string }}
 */
function runNpmTest(dir) {
  try {
    const output = execSync('npm test', {
      cwd: dir,
      encoding: 'utf8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || error.stderr || error.message
    };
  }
}

/**
 * Audit a single issue
 * @param {number} issueNumber - Issue number to audit
 * @param {object} config - Audit configuration for the issue
 * @param {object} options - Additional options
 * @param {string} options.worktreesDir - Path to worktrees directory
 * @param {boolean} options.runTests - Whether to actually run tests
 * @returns {{ passed: boolean, errors: string[], warnings: string[] }}
 */
function auditIssue(issueNumber, config = null, options = {}) {
  const {
    worktreesDir = '.claude/worktrees',
    runTests = false
  } = options;

  const issueConfig = config || DEFAULT_CONFIG[issueNumber];

  if (!issueConfig) {
    return {
      passed: false,
      errors: [`No configuration found for issue #${issueNumber}`],
      warnings: []
    };
  }

  const errors = [];
  const warnings = [];

  // Check 1: Worktree exists
  const worktreePath = findWorktree(issueNumber, worktreesDir);
  if (!worktreePath) {
    errors.push(`Worktree not found for issue #${issueNumber}`);
    return { passed: false, errors, warnings };
  }

  // Check 2: Required files exist
  const basePath = path.resolve(worktreesDir, worktreePath);
  for (const file of issueConfig.requiredFiles) {
    if (!fileExists(file, basePath)) {
      errors.push(`Required file missing: ${file}`);
    }
  }

  // Check 3: Scan all required files for forbidden patterns
  for (const file of issueConfig.requiredFiles) {
    const content = readFile(file, basePath);
    if (content) {
      const forbiddenPattern = findForbiddenPattern(content);
      if (forbiddenPattern) {
        errors.push(`File ${file} contains incomplete marker: ${forbiddenPattern}`);
      }
    }
  }

  // Also check verification files if they exist
  const verificationLocations = [
    'VERIFICATION.md',
    'docs/verification.md',
    '.claude/verification.md',
    'README.md'
  ];

  for (const location of verificationLocations) {
    const content = readFile(location, basePath);
    if (content) {
      const forbiddenPattern = findForbiddenPattern(content);
      if (forbiddenPattern) {
        errors.push(`Verification file ${location} contains incomplete marker: ${forbiddenPattern}`);
      }
      break;
    }
  }

  // Check 4: npm test result (optional, only if runTests is true)
  if (runTests) {
    const testResult = runNpmTest(basePath);
    if (!testResult.success) {
      errors.push('npm test failed');
      warnings.push(`Test output: ${testResult.output.slice(0, 200)}...`);
    }
  } else if (issueConfig.testResultFile) {
    // Check for recorded test result file
    if (!fileExists(issueConfig.testResultFile, basePath)) {
      errors.push(`Test result file missing: ${issueConfig.testResultFile}`);
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
 * @param {object} config - Configuration object mapping issue numbers to audit configs
 * @param {object} options - Additional options
 * @returns {{ passed: boolean, results: object }}
 */
function auditAll(config = DEFAULT_CONFIG, options = {}) {
  const results = {};
  let allPassed = true;

  for (const issueNumber of Object.keys(config)) {
    const result = auditIssue(parseInt(issueNumber), config[issueNumber], options);
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
  const runTests = args.includes('--run-tests');

  // Parse issue numbers from args
  const issueNumbers = args
    .filter(arg => /^\d+$/.test(arg))
    .map(n => parseInt(n));

  const config = DEFAULT_CONFIG;
  const issuesToAudit = issueNumbers.length > 0
    ? issueNumbers
    : Object.keys(config).map(n => parseInt(n));

  console.log('Completed Issue Audit');
  console.log('=====================\n');

  let allPassed = true;

  for (const issueNumber of issuesToAudit) {
    const result = auditIssue(issueNumber, config[issueNumber], { runTests });

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
  DEFAULT_CONFIG,
  FORBIDDEN_VERIFICATION_TEXT,
  findWorktree,
  fileExists,
  findForbiddenPattern
};
