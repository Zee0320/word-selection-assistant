#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ISSUE_CONFIGS = [
  {
    number: 2,
    label: 'Markdown rendering and navigation safety',
    verificationPath: 'docs/superpowers/verification/2026-06-14-issue-2.md',
    blocksWindowsRelease: true
  },
  {
    number: 3,
    label: 'UOS ARM64 X11 support',
    verificationPath: 'docs/superpowers/verification/2026-06-14-issue-3.md',
    manualResultPaths: ['docs/superpowers/verification/issue-3/uos-arm64-x11-manual-matrix.md'],
    blocksWindowsRelease: false,
    uosManualGate: true
  },
  {
    number: 4,
    label: 'Floating chat to AI Chat sync',
    verificationPath: 'docs/superpowers/verification/2026-06-14-issue-4.md',
    manualResultPaths: ['docs/superpowers/verification/2026-06-14-issue-4.md'],
    blocksWindowsRelease: true
  },
  {
    number: 5,
    label: 'Context card evidence',
    verificationPath: 'docs/superpowers/verification/2026-06-14-issue-5.md',
    blocksWindowsRelease: true
  },
  {
    number: 6,
    label: 'Empty selection toolbar gate',
    verificationPath: 'docs/superpowers/verification/2026-06-14-issue-6.md',
    manualResultPaths: ['docs/superpowers/verification/issue-6/manual-windows-results.md'],
    requireManualResults: true,
    blocksWindowsRelease: true
  }
];

function readOptionalFile(rootDir, relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  return fs.readFileSync(absolutePath, 'utf8');
}

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
    const leadingStatus = statusLine.match(/^(PASS|FAIL|FAILED|BLOCKED|PENDING)\b/i);
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
  return cells.every(cell => /^:?-{3,}:?$/.test(cell));
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

function classifyStatus(value) {
  const text = normalizeCell(value).toUpperCase();
  if (!text) return 'missing';
  if (/\b(FAIL|FAILED)\b/.test(text)) return 'failed';
  if (/\b(BLOCKED|PENDING)\b/.test(text)) return 'manual_blocked';
  if (/\bPASS\b/.test(text)) return 'pass';
  return 'unknown';
}

function combineStatus(currentStatus, nextStatus) {
  const priority = ['failed', 'missing', 'unknown', 'manual_blocked', 'pass'];
  return priority.indexOf(nextStatus) < priority.indexOf(currentStatus)
    ? nextStatus
    : currentStatus;
}

function auditIssue(rootDir, config) {
  const verificationMarkdown = readOptionalFile(rootDir, config.verificationPath);
  if (!verificationMarkdown) {
    return {
      ...config,
      status: config.uosManualGate ? 'manual_blocked' : 'missing',
      statusLine: '',
      problems: [`Missing ${config.verificationPath}`]
    };
  }

  const statusLine = parseStatusSection(verificationMarkdown);
  let status = classifyStatus(statusLine);
  const problems = [];
  if (status !== 'pass') {
    problems.push(`Status section is ${statusLine || '(missing)'}`);
  }

  for (const manualPath of config.manualResultPaths || []) {
    const manualMarkdown = readOptionalFile(rootDir, manualPath);
    if (!manualMarkdown) {
      if (config.requireManualResults || config.uosManualGate) {
        status = combineStatus(status, 'manual_blocked');
        problems.push(`Missing manual result file ${manualPath}`);
      }
      continue;
    }

    const resultRows = parseManualResultRows(manualMarkdown);
    if (config.requireManualResults && resultRows.length === 0) {
      status = combineStatus(status, 'manual_blocked');
      problems.push(`No manual Result rows in ${manualPath}`);
      continue;
    }

    for (const result of resultRows) {
      const resultStatus = classifyStatus(result);
      if (resultStatus !== 'pass') {
        status = combineStatus(status, resultStatus);
        problems.push(`${manualPath} has Result ${result}`);
      }
    }
  }

  return {
    ...config,
    status,
    statusLine,
    problems
  };
}

function auditCompletedIssues({ rootDir = process.cwd() } = {}) {
  const issues = new Map();
  for (const config of ISSUE_CONFIGS) {
    issues.set(config.number, auditIssue(rootDir, config));
  }

  const windowsComplete = [...issues.values()]
    .filter(issue => issue.blocksWindowsRelease)
    .every(issue => issue.status === 'pass');

  return {
    windowsComplete,
    issues
  };
}

function formatAuditSummary(audit) {
  const lines = [
    `Windows issues complete: ${audit.windowsComplete ? 'PASS' : 'FAIL'}`
  ];

  for (const issue of audit.issues.values()) {
    const gate = issue.blocksWindowsRelease ? 'windows-gate' : 'non-windows-gate';
    const suffix = issue.problems.length ? ` - ${issue.problems.join('; ')}` : '';
    lines.push(`Issue #${issue.number}: ${issue.status.toUpperCase()} (${gate})${suffix}`);
  }

  return lines.join('\n');
}

if (require.main === module) {
  const audit = auditCompletedIssues({ rootDir: path.join(__dirname, '..') });
  console.log(formatAuditSummary(audit));
  process.exitCode = audit.windowsComplete ? 0 : 1;
}

module.exports = {
  auditCompletedIssues,
  classifyStatus,
  formatAuditSummary,
  parseManualResultRows,
  parseStatusSection
};
