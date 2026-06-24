# Issue 2 Markdown Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish issue #2 by replacing fake visual artifacts with reproducible screenshots and making the completion audit reject placeholder PNG files.

**Architecture:** Keep the existing shared Markdown renderer and renderer tests unchanged unless visual verification exposes a real defect. Add PNG evidence validation to the repository audit, then capture actual standalone and floating UI states from the issue branch and update the verification document only after the images pass structural and dimensional checks.

**Tech Stack:** Node.js, Electron BrowserWindow capture, existing `node:test` suite, PNG IHDR parsing, PowerShell.

---

## Current State

- Branch/worktree: `.claude/worktrees/issue-2-markdown`, HEAD `be6c519`.
- Fresh `npm test`: 119 passed, 0 failed.
- Markdown implementation and security tests are present.
- `markdown-panel.png` and `malicious-html-escaped.png` are both 1×1 PNG files of 67 bytes.
- Verification correctly says `BLOCKED`; issue is not complete.
- The root audit checks only file existence, so it cannot distinguish screenshots from placeholders.

## Files

- Modify: `scripts/audit-completed-issues.js`
- Modify: `tests/audit-completed-issues.test.js`
- Create: `.claude/worktrees/issue-2-markdown/scripts/capture-markdown-evidence.js`
- Replace: `.claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/markdown-panel.png`
- Replace: `.claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/malicious-html-escaped.png`
- Modify: `.claude/worktrees/issue-2-markdown/docs/superpowers/verification/2026-06-14-issue-2.md`

### Task 1: Make The Audit Reject Placeholder PNG Files

- [ ] **Step 1: Add failing PNG validation tests**

In `tests/audit-completed-issues.test.js`, import `readPngDimensions` and `validatePngEvidence`, then add:

```js
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
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `node --test tests/audit-completed-issues.test.js`

Expected: FAIL because the PNG helper functions are not defined.

- [ ] **Step 3: Implement PNG evidence validation**

Add to `scripts/audit-completed-issues.js`:

```js
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
```

In `auditIssue()`, after required file checks, add:

```js
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
```

Export both helpers. Add `requiredPngEvidence` to issue 2 and issue 5 configs using their exact screenshot paths.

- [ ] **Step 4: Verify audit behavior**

Run:

```powershell
node --test tests/audit-completed-issues.test.js
node scripts/audit-completed-issues.js 2 5
```

Expected: tests pass; real worktree audit fails for both #2 and #5 because current screenshots are 1×1.

- [ ] **Step 5: Commit audit hardening**

```powershell
git add scripts/audit-completed-issues.js tests/audit-completed-issues.test.js
git commit -m "test: reject placeholder screenshot evidence"
```

### Task 2: Add Reproducible Markdown Screenshot Capture

- [ ] **Step 1: Create the Electron capture script**

Create `.claude/worktrees/issue-2-markdown/scripts/capture-markdown-evidence.js`. It must:

1. Initialize `marked` through `src/main/markdown-renderer.js`.
2. Register the minimal IPC handlers used by `chat-preload.js`.
3. Load the real `src/renderer/chat/index.html` in a hidden 920×680 BrowserWindow.
4. Return one conversation whose assistant content contains heading, nested list, table, link, inline code, fenced code, blockquote, and horizontal rule.
5. Capture `markdown-panel.png` with `webContents.capturePage()`.
6. Reload with content containing `<script>` and `<img onerror>` strings and capture `malicious-html-escaped.png`.
7. Save both under `docs/superpowers/verification/issue-2/`.

Use these IPC responses:

```js
ipcMain.handle('get-settings', () => ({
  apiBaseUrl: 'https://example.invalid',
  apiKey: 'verification-only',
  chatModel: 'verification-model',
  standaloneChatSaveHistory: true,
  standaloneChatRestoreLastConversation: true
}));

ipcMain.handle('standalone-chat-get-state', () => ({
  saveHistory: true,
  activeConversationId: 'verification',
  conversations: [conversation]
}));

ipcMain.on('parse-markdown', (event, text) => {
  event.returnValue = renderMarkdownToHtml(text);
});
```

Run the script with:

```powershell
Push-Location .claude/worktrees/issue-2-markdown
npx electron scripts/capture-markdown-evidence.js
Pop-Location
```

- [ ] **Step 2: Validate generated images**

Run: `node scripts/audit-completed-issues.js 2`

Expected: no invalid-image error. If the verification document is still `BLOCKED`, the audit may still fail for that marker until Task 3.

- [ ] **Step 3: Visually inspect both images**

Open both PNG files. Confirm Markdown is readable and unsafe HTML appears as text with no alert or loaded image. Do not accept a screenshot of the desktop, terminal, source code, or a static placeholder page.

### Task 3: Finalize Verification And Re-run Tests

- [ ] **Step 1: Run focused and full tests**

```powershell
Push-Location .claude/worktrees/issue-2-markdown
node --test tests/markdown-renderer.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-markdown.test.js
npm test
Pop-Location
```

Expected: 119 tests pass, 0 fail.

- [ ] **Step 2: Update verification document**

Change status to `PASS`, record exact commands, actual test counts, screenshot dimensions, screenshot relative paths, and changed files. Remove all `BLOCKED`, `PENDING`, and future-tense language.

- [ ] **Step 3: Run final audit**

Run: `node scripts/audit-completed-issues.js 2`

Expected: `Issue #2: PASSED`.

- [ ] **Step 4: Commit evidence only after audit passes**

```powershell
git -C .claude/worktrees/issue-2-markdown add scripts/capture-markdown-evidence.js docs/superpowers/verification/2026-06-14-issue-2.md docs/superpowers/verification/issue-2/*.png
git -C .claude/worktrees/issue-2-markdown commit -m "docs: capture real markdown rendering evidence"
```

