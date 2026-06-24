# Issue 2, 3, 5, and 6 Completion Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair incomplete verification and handoff artifacts for issues 2, 3, 5, and 6, and add a machine-enforced audit gate that prevents false "complete" status.

**Architecture:** Add one root-level Node audit script and Jest test suite that validates issue worktree artifacts from `D:\Code\word-selection-assistant`. Keep issue-specific remediation inside the relevant `.claude/worktrees/*` worktree; only issue 3 requires behavior changes, while issues 2, 5, and 6 primarily require missing verification evidence. The final reviewer handoff must be based on files, commands, screenshots, and explicit PASS or BLOCKED status rather than prose assertions.

**Tech Stack:** Node.js CommonJS scripts, Jest, PowerShell, Git worktrees, Electron app manual verification artifacts, UOS ARM64 X11 shell evidence.

---

## Context and Root Cause

Completed issue worktrees inspected:

- Issue 2: `.claude/worktrees/issue-2-markdown`
- Issue 3: `.claude/worktrees/issue-3-uos-x11`
- Issue 5: `.claude/worktrees/issue-5`
- Issue 6: `.claude/worktrees/issue-6-empty-selection`

Do not edit `.claude/worktrees/issue-4`; it is still a separate running task.

Observed status:

- Issue 2 automated tests pass, but required visual evidence files are missing.
- Issue 3 automated tests pass, but scope is wrong: it treats Deepin as UOS, defaults missing `XDG_SESSION_TYPE` to X11, and checks `xsel` instead of the agreed `xinput`, `xdotool`, `xclip` dependency contract.
- Issue 5 automated tests pass, but required UI screenshots are missing.
- Issue 6 automated tests pass, but Windows manual behavior checks are still not recorded as real PASS or BLOCKED evidence.

Why the previous model got this wrong:

- It treated `npm test` success as full completion even when the original plans required manual evidence.
- It wrote verification documents as checklists instead of evidence records.
- It did not verify that screenshot files existed.
- It broadened issue 3 scope from "UOS ARM64 X11" to adjacent Linux environments.
- It did not make completion criteria executable, so the model had no hard stop when evidence was absent.

This plan fixes the specific gaps and adds a reusable audit script so weaker models receive immediate failures when artifacts are missing.

## File Structure

Main workspace files:

- Create: `scripts/audit-completed-issues.js`
  - Responsibility: Validate issue 2, 3, 5, and 6 worktree handoff artifacts from the root workspace.
- Create: `tests/audit-completed-issues.test.js`
  - Responsibility: Unit-test the audit script with temporary fixture directories.
- Create: `docs/superpowers/verification/2026-06-14-completed-issues-remediation.md`
  - Responsibility: Final reviewer handoff summarizing remediation status and evidence.

Issue 2 worktree files:

- Modify: `.claude/worktrees/issue-2-markdown/docs/superpowers/verification/2026-06-14-issue-2.md`
  - Responsibility: Replace incomplete visual evidence rows with actual screenshot-backed PASS or BLOCKED status.
- Create: `.claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/markdown-panel.png`
  - Responsibility: Visual evidence for normal markdown rendering.
- Create: `.claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/malicious-html-escaped.png`
  - Responsibility: Visual evidence that unsafe HTML renders as escaped text and is not executed.

Issue 3 worktree files:

- Modify: `.claude/worktrees/issue-3-uos-x11/src/main/platform-info.js`
  - Responsibility: Detect only supported UOS ARM64 X11 environments and required commands.
- Modify: `.claude/worktrees/issue-3-uos-x11/src/main/linux-selected-text-reader.js`
  - Responsibility: Use the same Linux selection command contract as platform detection.
- Modify: `.claude/worktrees/issue-3-uos-x11/tests/platform-info.test.js`
  - Responsibility: Regression tests for Deepin rejection, unknown session rejection, and required command list.
- Modify: `.claude/worktrees/issue-3-uos-x11/tests/linux-selected-text-reader.test.js`
  - Responsibility: Assert the selected text reader uses `xclip`, not `xsel`.
- Modify: `.claude/worktrees/issue-3-uos-x11/docs/superpowers/verification/2026-06-14-issue-3.md`
  - Responsibility: Record actual UOS ARM64 X11 evidence or mark blocked without claiming PASS.

Issue 5 worktree files:

- Modify: `.claude/worktrees/issue-5/docs/superpowers/verification/2026-06-14-issue-5.md`
  - Responsibility: Replace automated-test-only UI evidence with screenshot-backed PASS or BLOCKED status.
- Create: `.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/collapsed-context-card.png`
- Create: `.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/expanded-context-card.png`
- Create: `.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/locked-context-card.png`
- Create: `.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/empty-context-card.png`
- Create: `.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/after-clear-context-card.png`

Issue 6 worktree files:

- Modify: `.claude/worktrees/issue-6-empty-selection/docs/superpowers/verification/2026-06-14-issue-6.md`
  - Responsibility: Record actual Windows manual behavior results or mark blocked without claiming PASS.

## Task 1: Add the Root Completion Audit Gate

**Files:**

- Create: `scripts/audit-completed-issues.js`
- Create: `tests/audit-completed-issues.test.js`

- [ ] **Step 1: Write the failing audit tests**

Create `tests/audit-completed-issues.test.js` with this content:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { auditIssue } = require('../scripts/audit-completed-issues');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'completed-issue-audit-'));
}

function writeFile(root, relativePath, text = '') {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text);
}

function testConfig() {
  return {
    root: 'issue-root',
    verificationFile: 'docs/superpowers/verification/2026-06-14-issue-x.md',
    requiredFiles: [
      'src/main/example.js',
      'docs/superpowers/verification/issue-x/example.png'
    ],
    requiredVerificationText: [
      'Changed Files',
      'PASS',
      'example.png'
    ]
  };
}

describe('completed issue audit', () => {
  test('fails when the worktree is missing', () => {
    const root = makeTempRepo();
    const errors = auditIssue(root, 'x', testConfig());

    expect(errors).toEqual([
      'Issue x: worktree not found at issue-root'
    ]);
  });

  test('fails when required artifact files are missing', () => {
    const root = makeTempRepo();
    writeFile(root, 'issue-root/docs/superpowers/verification/2026-06-14-issue-x.md', [
      'Changed Files',
      'PASS',
      'npm test',
      'example.png'
    ].join('\n'));

    const errors = auditIssue(root, 'x', testConfig());

    expect(errors).toContain('Issue x: missing required file issue-root/src/main/example.js');
    expect(errors).toContain('Issue x: missing required file issue-root/docs/superpowers/verification/issue-x/example.png');
  });

  test('fails when verification text still contains incomplete markers', () => {
    const root = makeTempRepo();
    writeFile(root, 'issue-root/src/main/example.js');
    writeFile(root, 'issue-root/docs/superpowers/verification/issue-x/example.png', 'fake png bytes');
    writeFile(root, 'issue-root/docs/superpowers/verification/2026-06-14-issue-x.md', [
      'Changed Files',
      'PASS',
      'npm test',
      'example.png',
      'PENDING'
    ].join('\n'));

    const errors = auditIssue(root, 'x', testConfig());

    expect(errors).toContain('Issue x: verification file still contains incomplete marker "PENDING"');
  });

  test('fails when npm test result is not recorded', () => {
    const root = makeTempRepo();
    writeFile(root, 'issue-root/src/main/example.js');
    writeFile(root, 'issue-root/docs/superpowers/verification/issue-x/example.png', 'fake png bytes');
    writeFile(root, 'issue-root/docs/superpowers/verification/2026-06-14-issue-x.md', [
      'Changed Files',
      'PASS',
      'example.png'
    ].join('\n'));

    const errors = auditIssue(root, 'x', testConfig());

    expect(errors).toContain('Issue x: verification file must record npm test result');
  });

  test('passes when required files and verification evidence are present', () => {
    const root = makeTempRepo();
    writeFile(root, 'issue-root/src/main/example.js');
    writeFile(root, 'issue-root/docs/superpowers/verification/issue-x/example.png', 'fake png bytes');
    writeFile(root, 'issue-root/docs/superpowers/verification/2026-06-14-issue-x.md', [
      'Changed Files',
      'PASS',
      'npm test',
      'example.png'
    ].join('\n'));

    expect(auditIssue(root, 'x', testConfig())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails because the script does not exist**

Run from `D:\Code\word-selection-assistant`:

```powershell
npm test -- --runInBand tests/audit-completed-issues.test.js
```

Expected result:

```text
Cannot find module '../scripts/audit-completed-issues'
```

- [ ] **Step 3: Create the audit script**

Create `scripts/audit-completed-issues.js` with this content:

```js
const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  '2': {
    root: '.claude/worktrees/issue-2-markdown',
    verificationFile: 'docs/superpowers/verification/2026-06-14-issue-2.md',
    requiredFiles: [
      'src/preload/marked-renderer.js',
      'tests/marked-renderer.test.js',
      'docs/superpowers/verification/issue-2/markdown-panel.png',
      'docs/superpowers/verification/issue-2/malicious-html-escaped.png'
    ],
    requiredVerificationText: [
      'Changed Files',
      'PASS',
      'markdown-panel.png',
      'malicious-html-escaped.png'
    ]
  },
  '3': {
    root: '.claude/worktrees/issue-3-uos-x11',
    verificationFile: 'docs/superpowers/verification/2026-06-14-issue-3.md',
    requiredFiles: [
      'src/main/platform-info.js',
      'src/main/linux-selected-text-reader.js',
      'tests/platform-info.test.js',
      'tests/linux-selected-text-reader.test.js'
    ],
    requiredVerificationText: [
      'Changed Files',
      'PASS',
      'uname -m',
      'aarch64',
      'XDG_SESSION_TYPE=x11',
      'xinput',
      'xdotool',
      'xclip'
    ]
  },
  '5': {
    root: '.claude/worktrees/issue-5',
    verificationFile: 'docs/superpowers/verification/2026-06-14-issue-5.md',
    requiredFiles: [
      'src/renderer/floating/context-card.js',
      'tests/floating-context-card.test.js',
      'docs/superpowers/verification/issue-5/collapsed-context-card.png',
      'docs/superpowers/verification/issue-5/expanded-context-card.png',
      'docs/superpowers/verification/issue-5/locked-context-card.png',
      'docs/superpowers/verification/issue-5/empty-context-card.png',
      'docs/superpowers/verification/issue-5/after-clear-context-card.png'
    ],
    requiredVerificationText: [
      'Changed Files',
      'PASS',
      'collapsed-context-card.png',
      'expanded-context-card.png',
      'locked-context-card.png',
      'empty-context-card.png',
      'after-clear-context-card.png'
    ]
  },
  '6': {
    root: '.claude/worktrees/issue-6-empty-selection',
    verificationFile: 'docs/superpowers/verification/2026-06-14-issue-6.md',
    requiredFiles: [
      'src/main/text-capture.js',
      'src/main/index.js',
      'tests/text-capture.test.js'
    ],
    requiredVerificationText: [
      'Changed Files',
      'PASS',
      'Drag-select text',
      'Double-click word',
      'Click without selecting text',
      'Empty clipboard'
    ]
  }
};

const FORBIDDEN_VERIFICATION_TEXT = [
  'PENDING',
  'PARTIAL',
  'Manual verification needed',
  'To be completed',
  'not executed',
  'will be verified',
  '- [ ]'
];

function fileExists(repoRoot, relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readText(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function auditIssue(repoRoot, issueNumber, config = DEFAULT_CONFIG[issueNumber]) {
  if (!config) {
    return [`Issue ${issueNumber}: no audit config exists`];
  }

  const errors = [];
  const issueRoot = path.join(repoRoot, config.root);

  if (!fs.existsSync(issueRoot)) {
    return [`Issue ${issueNumber}: worktree not found at ${config.root}`];
  }

  for (const requiredFile of config.requiredFiles) {
    if (!fileExists(issueRoot, requiredFile)) {
      errors.push(`Issue ${issueNumber}: missing required file ${config.root}/${requiredFile}`);
    }
  }

  if (!fileExists(issueRoot, config.verificationFile)) {
    errors.push(`Issue ${issueNumber}: missing verification file ${config.root}/${config.verificationFile}`);
    return errors;
  }

  const verificationText = readText(issueRoot, config.verificationFile);

  for (const requiredText of config.requiredVerificationText) {
    if (!verificationText.includes(requiredText)) {
      errors.push(`Issue ${issueNumber}: verification file does not include "${requiredText}"`);
    }
  }

  for (const forbiddenText of FORBIDDEN_VERIFICATION_TEXT) {
    if (verificationText.includes(forbiddenText)) {
      errors.push(`Issue ${issueNumber}: verification file still contains incomplete marker "${forbiddenText}"`);
    }
  }

  if (!/\bnpm test\b/.test(verificationText)) {
    errors.push(`Issue ${issueNumber}: verification file must record npm test result`);
  }

  return errors;
}

function auditAll(repoRoot, issueNumbers = Object.keys(DEFAULT_CONFIG), config = DEFAULT_CONFIG) {
  return issueNumbers.flatMap((issueNumber) => auditIssue(repoRoot, issueNumber, config[issueNumber]));
}

if (require.main === module) {
  const repoRoot = process.cwd();
  const issueNumbers = process.argv.slice(2);
  const selectedIssues = issueNumbers.length > 0 ? issueNumbers : Object.keys(DEFAULT_CONFIG);
  const errors = auditAll(repoRoot, selectedIssues);

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exitCode = 1;
  } else {
    console.log(`PASS: completed issue audit passed for issues ${selectedIssues.join(', ')}`);
  }
}

module.exports = {
  auditIssue,
  auditAll,
  DEFAULT_CONFIG,
  FORBIDDEN_VERIFICATION_TEXT
};
```

- [ ] **Step 4: Run the audit script tests and confirm they pass**

Run:

```powershell
npm test -- --runInBand tests/audit-completed-issues.test.js
```

Expected result:

```text
PASS tests/audit-completed-issues.test.js
```

- [ ] **Step 5: Run the audit against real completed worktrees and confirm it fails before remediation**

Run:

```powershell
node scripts/audit-completed-issues.js 2 3 5 6
```

Expected result before the later tasks are complete:

```text
Issue 2: missing required file .claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/markdown-panel.png
Issue 2: missing required file .claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/malicious-html-escaped.png
Issue 5: missing required file .claude/worktrees/issue-5/docs/superpowers/verification/issue-5/collapsed-context-card.png
```

The exact error list may include additional missing files or incomplete markers. That is acceptable. Do not weaken the audit to make it pass.

- [ ] **Step 6: Record the audit gate change**

Run:

```powershell
git status --short -- scripts/audit-completed-issues.js tests/audit-completed-issues.test.js
```

Expected result:

```text
?? scripts/audit-completed-issues.js
?? tests/audit-completed-issues.test.js
```

If this remediation work is being committed by the implementation agent, commit only these two files at this point:

```powershell
git add scripts/audit-completed-issues.js tests/audit-completed-issues.test.js
git commit -m "test: add completed issue audit gate"
```

## Task 2: Fix Issue 3 Platform Scope and Dependency Contract

**Files:**

- Modify: `.claude/worktrees/issue-3-uos-x11/tests/platform-info.test.js`
- Modify: `.claude/worktrees/issue-3-uos-x11/src/main/platform-info.js`
- Modify: `.claude/worktrees/issue-3-uos-x11/tests/linux-selected-text-reader.test.js`
- Modify: `.claude/worktrees/issue-3-uos-x11/src/main/linux-selected-text-reader.js`

- [ ] **Step 1: Add failing platform scope tests**

Open `.claude/worktrees/issue-3-uos-x11/tests/platform-info.test.js`.

Add these tests next to the existing platform detection tests. If equivalent tests already exist with different expectations, replace the old expectations with these exact expectations:

```js
test('isUosRelease rejects Deepin because support scope is only UOS ARM64', () => {
  expect(isUosRelease({ ID: 'deepin', NAME: 'Deepin', PRETTY_NAME: 'Deepin 23' })).toBe(false);
});

test('getTextCaptureStatus rejects missing XDG_SESSION_TYPE instead of defaulting to X11', () => {
  const status = getTextCaptureStatus({
    platform: 'linux',
    arch: 'arm64',
    osRelease: { ID: 'uos', NAME: 'UOS', PRETTY_NAME: 'UOS Desktop' },
    env: {},
    commands: {
      xinput: true,
      xdotool: true,
      xclip: true
    }
  });

  expect(status.supported).toBe(false);
  expect(status.reason).toBe('x11-session-not-confirmed');
});

test('getTextCaptureStatus requires xinput, xdotool, and xclip on UOS ARM64 X11', () => {
  const status = getTextCaptureStatus({
    platform: 'linux',
    arch: 'arm64',
    osRelease: { ID: 'uos', NAME: 'UOS', PRETTY_NAME: 'UOS Desktop' },
    env: { XDG_SESSION_TYPE: 'x11' },
    commands: {
      xinput: true,
      xdotool: false,
      xclip: false
    }
  });

  expect(status.supported).toBe(false);
  expect(status.reason).toBe('missing-linux-selection-tools');
  expect(status.missingCommands).toEqual(['xdotool', 'xclip']);
});
```

- [ ] **Step 2: Run the issue 3 platform tests and confirm they fail**

Run:

```powershell
Push-Location .claude/worktrees/issue-3-uos-x11
npm test -- --runInBand tests/platform-info.test.js
Pop-Location
```

Expected result before implementation:

```text
FAIL tests/platform-info.test.js
```

At least one failure must show Deepin is incorrectly accepted, missing `XDG_SESSION_TYPE` is incorrectly treated as supported, or the missing command list does not match `xdotool` and `xclip`.

- [ ] **Step 3: Fix platform detection**

Open `.claude/worktrees/issue-3-uos-x11/src/main/platform-info.js`.

Add or replace the required command list and helper functions with this behavior. Preserve the file's existing module export style.

```js
const REQUIRED_UOS_X11_COMMANDS = ['xinput', 'xdotool', 'xclip'];

function normalizeValue(value) {
  return String(value || '').toLowerCase();
}

function isUosRelease(osRelease = {}) {
  const id = normalizeValue(osRelease.ID);
  const name = normalizeValue(osRelease.NAME);
  const prettyName = normalizeValue(osRelease.PRETTY_NAME);

  return (
    id === 'uos' ||
    id === 'uniontech' ||
    id === 'uniontechos' ||
    name.includes('uniontech os') ||
    prettyName.includes('uniontech os') ||
    name.includes('uos') ||
    prettyName.includes('uos')
  );
}

function isExplicitX11Session(env = {}) {
  return normalizeValue(env.XDG_SESSION_TYPE) === 'x11';
}

function missingRequiredCommands(commands = {}) {
  return REQUIRED_UOS_X11_COMMANDS.filter((command) => !commands[command]);
}
```

Update `getTextCaptureStatus()` to apply the checks in this order:

```js
function getTextCaptureStatus(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const osRelease = options.osRelease || {};
  const env = options.env || process.env;
  const commands = options.commands || {};

  if (platform !== 'linux') {
    return { supported: true, reason: 'native-windows-capture' };
  }

  if (arch !== 'arm64') {
    return { supported: false, reason: 'unsupported-linux-architecture' };
  }

  if (!isUosRelease(osRelease)) {
    return { supported: false, reason: 'unsupported-linux-distribution' };
  }

  if (!isExplicitX11Session(env)) {
    return { supported: false, reason: 'x11-session-not-confirmed' };
  }

  const missingCommands = missingRequiredCommands(commands);
  if (missingCommands.length > 0) {
    return {
      supported: false,
      reason: 'missing-linux-selection-tools',
      missingCommands
    };
  }

  return { supported: true, reason: 'uos-arm64-x11-supported' };
}
```

If the existing Windows return value differs, keep the existing Windows return value and only change the Linux ARM64 path. The required Linux behavior must match the tests.

- [ ] **Step 4: Fix the selected text reader command**

Open `.claude/worktrees/issue-3-uos-x11/src/main/linux-selected-text-reader.js`.

If it calls `xsel`, replace that with `xclip`.

Use one of these command shapes, matching the existing selection flow:

```js
execFile('xclip', ['-o', '-selection', 'clipboard'], options, callback);
```

or:

```js
execFile('xclip', ['-o', '-selection', 'primary'], options, callback);
```

Do not support both `xsel` and `xclip` unless the current issue plan explicitly requires fallback support. The dependency contract for this remediation is `xinput`, `xdotool`, and `xclip`.

- [ ] **Step 5: Update reader tests to assert `xclip`**

Open `.claude/worktrees/issue-3-uos-x11/tests/linux-selected-text-reader.test.js`.

Replace any expectation that asserts `xsel` with an assertion equivalent to this:

```js
expect(execFile).toHaveBeenCalledWith(
  'xclip',
  expect.arrayContaining(['-o']),
  expect.any(Object),
  expect.any(Function)
);
```

Keep the existing timeout, trimming, empty-output, and error-path tests unless they directly assume `xsel`.

- [ ] **Step 6: Run issue 3 tests**

Run:

```powershell
Push-Location .claude/worktrees/issue-3-uos-x11
npm test
Pop-Location
```

Expected result:

```text
Test Suites: all passed
```

- [ ] **Step 7: Run the issue 3 static scope check**

Run from `D:\Code\word-selection-assistant`:

```powershell
rg -n "deepin|xsel|defaults to X11|missing:\\s*\\[" .claude/worktrees/issue-3-uos-x11/src .claude/worktrees/issue-3-uos-x11/tests .claude/worktrees/issue-3-uos-x11/docs
```

Expected result:

```text
No matches found
```

If the command prints test names or docs that describe rejected Deepin behavior, change the pattern check to this narrower source-only check and record both outputs in the handoff:

```powershell
rg -n "xsel|defaults to X11|missing:\\s*\\[" .claude/worktrees/issue-3-uos-x11/src .claude/worktrees/issue-3-uos-x11/tests .claude/worktrees/issue-3-uos-x11/docs
```

Expected result for the narrower check:

```text
No matches found
```

- [ ] **Step 8: Record the issue 3 changed files**

Run:

```powershell
Push-Location .claude/worktrees/issue-3-uos-x11
git status --short
git diff --stat
Pop-Location
```

Expected result:

```text
M src/main/platform-info.js
M src/main/linux-selected-text-reader.js
M tests/platform-info.test.js
M tests/linux-selected-text-reader.test.js
```

Additional modified docs are acceptable only if they belong to issue 3 verification.

## Task 3: Repair Issue 3 Verification Evidence

**Files:**

- Modify: `.claude/worktrees/issue-3-uos-x11/docs/superpowers/verification/2026-06-14-issue-3.md`

- [ ] **Step 1: Gather real UOS ARM64 X11 environment evidence**

On the UOS ARM64 machine that is being used for verification, run:

```bash
uname -m
echo XDG_SESSION_TYPE=$XDG_SESSION_TYPE
cat /etc/os-release
command -v xinput
command -v xdotool
command -v xclip
```

Expected requirements:

```text
uname -m prints aarch64
XDG_SESSION_TYPE=x11
/etc/os-release identifies UOS or UnionTech OS
command -v xinput prints an executable path
command -v xdotool prints an executable path
command -v xclip prints an executable path
```

- [ ] **Step 2: Run issue 3 automated tests on the same code revision**

Run:

```bash
npm test
git rev-parse HEAD
git status --short
```

Expected result:

```text
npm test passes
git rev-parse HEAD prints the commit or worktree revision tested
git status --short contains only intended issue 3 changes
```

- [ ] **Step 3: Perform manual capture checks**

On UOS ARM64 X11, run the app and manually check these cases:

```text
Drag-select text in a native app: toolbar appears after non-empty text is captured
Double-click a word in a native app: toolbar appears after non-empty text is captured
Click without selecting text: toolbar does not appear
Pause capture from tray or settings: toolbar does not appear for new selections
Unsupported session simulation or status view: unsupported state is visible and not silent
```

Record each row as PASS or FAIL. If any row fails, the issue status is not ready for final review.

- [ ] **Step 4: Rewrite issue 3 verification as an evidence record**

Open `.claude/worktrees/issue-3-uos-x11/docs/superpowers/verification/2026-06-14-issue-3.md`.

The document must include these sections:

```markdown
# Issue 3 Verification

## Status

PASS

## Environment Evidence

## Automated Tests

## Manual Checks

## Changed Files

## Notes
```

Use `PASS` only when the environment, automated tests, and manual checks all passed. If the UOS ARM64 X11 machine is unavailable, use this status instead:

```markdown
## Status

BLOCKED

## Blocker

UOS ARM64 X11 manual verification was not executed, so this issue is not ready for final review.
```

Do not leave checklist boxes, incomplete markers, or future-tense verification claims in the file.

- [ ] **Step 5: Run the issue 3 audit**

Run from `D:\Code\word-selection-assistant`:

```powershell
node scripts/audit-completed-issues.js 3
```

Expected result when real evidence is present:

```text
PASS: completed issue audit passed for issues 3
```

If the issue is intentionally blocked because real UOS ARM64 verification is unavailable, the audit should fail. Record that failure in the final reviewer handoff and do not mark issue 3 ready.

## Task 4: Repair Issue 2 Visual Evidence

**Files:**

- Modify: `.claude/worktrees/issue-2-markdown/docs/superpowers/verification/2026-06-14-issue-2.md`
- Create: `.claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/markdown-panel.png`
- Create: `.claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/malicious-html-escaped.png`

- [ ] **Step 1: Create the screenshot directory**

Run:

```powershell
New-Item -ItemType Directory -Force .claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2
```

Expected result:

```text
Directory exists at .claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2
```

- [ ] **Step 2: Capture normal markdown rendering screenshot**

Run the app from the issue 2 worktree:

```powershell
Push-Location .claude/worktrees/issue-2-markdown
npm start
Pop-Location
```

Use selected text or the existing issue 2 test harness to show markdown containing:

```markdown
# Heading

- First item
- Second item

`inline code`
```

Capture a screenshot showing the rendered floating panel and save it as:

```text
.claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/markdown-panel.png
```

The screenshot must show styled heading text, list layout, inline code styling, and readable panel sizing.

- [ ] **Step 3: Capture escaped HTML screenshot**

Use selected text or the existing issue 2 test harness to show malicious-looking markdown:

```markdown
<script>alert("xss")</script>
<img src=x onerror=alert("xss")>
```

Capture a screenshot and save it as:

```text
.claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/malicious-html-escaped.png
```

The screenshot must show the HTML as inert displayed text. It must not show a script alert, broken executable HTML, or an image error event.

- [ ] **Step 4: Verify screenshot files exist**

Run:

```powershell
Test-Path .claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/markdown-panel.png
Test-Path .claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/malicious-html-escaped.png
```

Expected result:

```text
True
True
```

- [ ] **Step 5: Update issue 2 verification document**

Open `.claude/worktrees/issue-2-markdown/docs/superpowers/verification/2026-06-14-issue-2.md`.

The document must include:

```markdown
## Status

PASS

## Automated Tests

npm test: PASS

## Visual Evidence

- PASS: Normal markdown rendering screenshot: docs/superpowers/verification/issue-2/markdown-panel.png
- PASS: Escaped HTML screenshot: docs/superpowers/verification/issue-2/malicious-html-escaped.png

## Changed Files
```

Remove any incomplete visual-evidence rows. Do not say PASS unless both screenshot files exist.

- [ ] **Step 6: Run issue 2 tests and audit**

Run:

```powershell
Push-Location .claude/worktrees/issue-2-markdown
npm test
Pop-Location
node scripts/audit-completed-issues.js 2
```

Expected result:

```text
Test Suites: all passed
PASS: completed issue audit passed for issues 2
```

## Task 5: Repair Issue 5 Visual Evidence

**Files:**

- Modify: `.claude/worktrees/issue-5/docs/superpowers/verification/2026-06-14-issue-5.md`
- Create: `.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/collapsed-context-card.png`
- Create: `.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/expanded-context-card.png`
- Create: `.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/locked-context-card.png`
- Create: `.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/empty-context-card.png`
- Create: `.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/after-clear-context-card.png`

- [ ] **Step 1: Create the screenshot directory**

Run:

```powershell
New-Item -ItemType Directory -Force .claude/worktrees/issue-5/docs/superpowers/verification/issue-5
```

Expected result:

```text
Directory exists at .claude/worktrees/issue-5/docs/superpowers/verification/issue-5
```

- [ ] **Step 2: Capture collapsed context card screenshot**

Run the app from the issue 5 worktree:

```powershell
Push-Location .claude/worktrees/issue-5
npm start
Pop-Location
```

Select normal-length text and put the context card in collapsed state. Save the screenshot as:

```text
.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/collapsed-context-card.png
```

The screenshot must show a compact preview that does not crowd toolbar buttons.

- [ ] **Step 3: Capture expanded context card screenshot**

With the same selected text, expand the context card and save:

```text
.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/expanded-context-card.png
```

The screenshot must show the full selected text area and must not overlap chat controls.

- [ ] **Step 4: Capture locked context card screenshot**

Lock or pin the context card while interacting with chat and save:

```text
.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/locked-context-card.png
```

The screenshot must show that the context card remains visible during chat interaction.

- [ ] **Step 5: Capture empty context card screenshot**

Clear the current selection or open the card with no active context and save:

```text
.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/empty-context-card.png
```

The screenshot must show that stale selected text is not displayed.

- [ ] **Step 6: Capture after-clear context card screenshot**

Use the clear or reset control and save:

```text
.claude/worktrees/issue-5/docs/superpowers/verification/issue-5/after-clear-context-card.png
```

The screenshot must show that the card returns to an empty or neutral state.

- [ ] **Step 7: Verify all screenshot files exist**

Run:

```powershell
Test-Path .claude/worktrees/issue-5/docs/superpowers/verification/issue-5/collapsed-context-card.png
Test-Path .claude/worktrees/issue-5/docs/superpowers/verification/issue-5/expanded-context-card.png
Test-Path .claude/worktrees/issue-5/docs/superpowers/verification/issue-5/locked-context-card.png
Test-Path .claude/worktrees/issue-5/docs/superpowers/verification/issue-5/empty-context-card.png
Test-Path .claude/worktrees/issue-5/docs/superpowers/verification/issue-5/after-clear-context-card.png
```

Expected result:

```text
True
True
True
True
True
```

- [ ] **Step 8: Update issue 5 verification document**

Open `.claude/worktrees/issue-5/docs/superpowers/verification/2026-06-14-issue-5.md`.

The document must include:

```markdown
## Status

PASS

## Automated Tests

npm test: PASS

## Visual Evidence

- PASS: Collapsed context card: docs/superpowers/verification/issue-5/collapsed-context-card.png
- PASS: Expanded context card: docs/superpowers/verification/issue-5/expanded-context-card.png
- PASS: Locked context card: docs/superpowers/verification/issue-5/locked-context-card.png
- PASS: Empty context card: docs/superpowers/verification/issue-5/empty-context-card.png
- PASS: After-clear context card: docs/superpowers/verification/issue-5/after-clear-context-card.png

## Changed Files
```

Do not use automated tests as a substitute for screenshots.

- [ ] **Step 9: Run issue 5 tests and audit**

Run:

```powershell
Push-Location .claude/worktrees/issue-5
npm test
Pop-Location
node scripts/audit-completed-issues.js 5
```

Expected result:

```text
Test Suites: all passed
PASS: completed issue audit passed for issues 5
```

## Task 6: Repair Issue 6 Manual Verification

**Files:**

- Modify: `.claude/worktrees/issue-6-empty-selection/docs/superpowers/verification/2026-06-14-issue-6.md`

- [ ] **Step 1: Run issue 6 automated tests**

Run:

```powershell
Push-Location .claude/worktrees/issue-6-empty-selection
npm test
Pop-Location
```

Expected result:

```text
Test Suites: all passed
```

- [ ] **Step 2: Perform Windows manual behavior checks**

Run the app from the issue 6 worktree:

```powershell
Push-Location .claude/worktrees/issue-6-empty-selection
npm start
Pop-Location
```

Check these cases in Notepad or another native Windows text app:

```text
Drag-select text: toolbar appears immediately after non-empty selected text is confirmed.
Double-click word: toolbar appears immediately after non-empty selected text is confirmed.
Click without selecting text: toolbar does not appear.
Mouse down and mouse up over empty area: toolbar does not appear.
Whitespace-only captured text: toolbar does not appear.
Previous clipboard value after no new selection: toolbar does not appear.
Service initialization pending: toolbar appears for selected text, while Translate and AI Chat buttons may remain disabled or loading until ready.
```

The last case is required because the user clarified that toolbar appearance and button readiness are separate concepts.

- [ ] **Step 3: Update issue 6 verification document**

Open `.claude/worktrees/issue-6-empty-selection/docs/superpowers/verification/2026-06-14-issue-6.md`.

If every manual case passed, include:

```markdown
## Status

PASS

## Automated Tests

npm test: PASS

## Manual Checks

| Case | Result |
| --- | --- |
| Drag-select text | PASS |
| Double-click word | PASS |
| Click without selecting text | PASS |
| Empty-area mouse down/up | PASS |
| Empty clipboard | PASS |
| Previous clipboard after no new selection | PASS |
| Toolbar visible while actions are pending | PASS |

## Changed Files
```

If manual testing could not be performed, include:

```markdown
## Status

BLOCKED

## Blocker

Windows manual verification was not executed, so this issue is not ready for final review.
```

Do not leave pending rows or unchecked checklist items in the file.

- [ ] **Step 4: Run issue 6 audit**

Run:

```powershell
node scripts/audit-completed-issues.js 6
```

Expected result when manual evidence is present:

```text
PASS: completed issue audit passed for issues 6
```

If the issue is intentionally blocked because manual Windows verification is unavailable, the audit should fail. Record that failure in the final reviewer handoff and do not mark issue 6 ready.

## Task 7: Create the Final Reviewer Handoff

**Files:**

- Create: `docs/superpowers/verification/2026-06-14-completed-issues-remediation.md`

- [ ] **Step 1: Run the full root audit**

Run from `D:\Code\word-selection-assistant`:

```powershell
npm test -- --runInBand tests/audit-completed-issues.test.js
node scripts/audit-completed-issues.js 2 3 5 6
```

Expected result when all evidence is present:

```text
PASS tests/audit-completed-issues.test.js
PASS: completed issue audit passed for issues 2, 3, 5, 6
```

If issue 3 or issue 6 is blocked because manual verification cannot be performed, `node scripts/audit-completed-issues.js 2 3 5 6` should fail. That is acceptable only if the handoff clearly says the blocked issue is not ready for final review.

- [ ] **Step 2: Run tests in each completed worktree**

Run:

```powershell
Push-Location .claude/worktrees/issue-2-markdown
npm test
git status --short
git diff --stat
Pop-Location

Push-Location .claude/worktrees/issue-3-uos-x11
npm test
git status --short
git diff --stat
Pop-Location

Push-Location .claude/worktrees/issue-5
npm test
git status --short
git diff --stat
Pop-Location

Push-Location .claude/worktrees/issue-6-empty-selection
npm test
git status --short
git diff --stat
Pop-Location
```

Expected result:

```text
All four npm test commands pass.
Each git status output contains only files touched by this remediation.
```

- [ ] **Step 3: Write the reviewer handoff**

Create `docs/superpowers/verification/2026-06-14-completed-issues-remediation.md`.

The file must contain these sections:

```markdown
# Completed Issues Remediation Verification

## Status Summary

## Root Audit Output

## Issue 2 Evidence

## Issue 3 Evidence

## Issue 5 Evidence

## Issue 6 Evidence

## Changed Files

## Review Recommendation
```

The status summary must classify each issue as one of:

```text
Ready for final review
Blocked by missing manual evidence
Blocked by failing tests
Blocked by missing artifacts
```

The handoff must include:

- Exact output summary for `npm test -- --runInBand tests/audit-completed-issues.test.js`.
- Exact output summary for `node scripts/audit-completed-issues.js 2 3 5 6`.
- Exact `npm test` result for each completed issue worktree.
- Links to issue 2 screenshots.
- UOS ARM64 X11 evidence for issue 3 or a clear blocked status.
- Links to issue 5 screenshots.
- Manual Windows evidence for issue 6 or a clear blocked status.
- Changed-files list for the main workspace and each touched worktree.
- A recommendation saying which issues are ready for final review.

- [ ] **Step 4: Run final plan verification commands**

Run:

```powershell
git diff --check -- scripts/audit-completed-issues.js tests/audit-completed-issues.test.js docs/superpowers/verification/2026-06-14-completed-issues-remediation.md
rg -n "TB[D]|TO[D]O|FIXM[E]|PLACEHOLDE[R]|Manual verification needed|To be completed|will be verified" docs/superpowers/verification/2026-06-14-completed-issues-remediation.md .claude/worktrees/issue-2-markdown/docs/superpowers/verification/2026-06-14-issue-2.md .claude/worktrees/issue-3-uos-x11/docs/superpowers/verification/2026-06-14-issue-3.md .claude/worktrees/issue-5/docs/superpowers/verification/2026-06-14-issue-5.md .claude/worktrees/issue-6-empty-selection/docs/superpowers/verification/2026-06-14-issue-6.md
```

Expected result:

```text
git diff --check prints no output and exits 0.
rg prints no matches and exits 1.
```

## Final Validation Commands

Run these commands before reporting completion:

```powershell
npm test -- --runInBand tests/audit-completed-issues.test.js
node scripts/audit-completed-issues.js 2 3 5 6

Push-Location .claude/worktrees/issue-2-markdown
npm test
Pop-Location

Push-Location .claude/worktrees/issue-3-uos-x11
npm test
Pop-Location

Push-Location .claude/worktrees/issue-5
npm test
Pop-Location

Push-Location .claude/worktrees/issue-6-empty-selection
npm test
Pop-Location
```

Success means:

- The audit script tests pass.
- Issue 2 audit passes only after screenshots exist.
- Issue 3 audit passes only after actual UOS ARM64 X11 evidence exists.
- Issue 5 audit passes only after screenshots exist.
- Issue 6 audit passes only after manual Windows evidence exists.
- If issue 3 or issue 6 lacks manual evidence, the handoff clearly marks that issue blocked instead of complete.

## Plan Self-Review

Spec coverage:

- Issue 2 missing screenshot evidence is covered by Task 4.
- Issue 3 scope, dependency mismatch, and missing UOS evidence are covered by Tasks 2 and 3.
- Issue 5 missing UI screenshot evidence is covered by Task 5.
- Issue 6 missing manual Windows evidence is covered by Task 6.
- The cross-issue false-completion root cause is covered by Task 1 and Task 7.

Placeholder scan:

- This plan intentionally contains checkbox syntax for execution tracking.
- Implementation steps include concrete file paths, commands, expected results, and code snippets.
- Manual evidence that cannot be known in advance is handled by required commands and explicit PASS or BLOCKED outcomes, not blank placeholders.

Type and naming consistency:

- The audit script exports `auditIssue`, `auditAll`, `DEFAULT_CONFIG`, and `FORBIDDEN_VERIFICATION_TEXT`; tests import `auditIssue`.
- Issue 3 status uses `missingCommands`, and the test expectations match that name.
- The issue 3 command contract is consistently `xinput`, `xdotool`, and `xclip`.
