# Issue 5 Context Card Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish issue #5 with real visual evidence and a verification status that cannot pass on placeholder images.

**Architecture:** Preserve the existing floating-only context-card behavior agreed during clarification. Add deterministic Electron screenshot capture for each required state, use the shared PNG audit introduced by issue #2, and mark PASS only after both behavior tests and actual images are valid.

**Tech Stack:** Electron BrowserWindow capture, existing floating preload and renderer, Node.js, `node:test`, PNG audit.

---

## Current State

- Branch/worktree: `.claude/worktrees/issue-5`, HEAD `b38ff27`.
- Fresh `npm test`: 120 passed, 0 failed.
- Branch is two commits ahead of `origin/worktree-issue-5`.
- Verification says PASS, but all five screenshots are 1×1 files of 70 bytes.
- The feature scope remains the floating AI Chat UI; standalone selected-context display is owned by issue #4.

## Files

- Create: `.claude/worktrees/issue-5/scripts/capture-context-card-evidence.js`
- Create: `.claude/worktrees/issue-5/tests/context-card-evidence-script.test.js`
- Replace: five PNG files under `docs/superpowers/verification/issue-5/`
- Modify: `.claude/worktrees/issue-5/docs/superpowers/verification/2026-06-14-issue-5.md`
- Use prerequisite: issue #2 PNG evidence validation in `scripts/audit-completed-issues.js`

### Task 1: Add A Deterministic Capture Script Contract

- [ ] **Step 1: Write a structure test**

Create `tests/context-card-evidence-script.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('capture script produces all required context card screenshots', () => {
  const script = fs.readFileSync('scripts/capture-context-card-evidence.js', 'utf8');
  for (const name of [
    'collapsed-context-card.png',
    'expanded-context-card.png',
    'locked-context-card.png',
    'empty-context-card.png',
    'after-clear-context-card.png'
  ]) {
    assert.match(script, new RegExp(name.replace('.', '\\.')));
  }
});
```

- [ ] **Step 2: Create the capture script**

The script must start Electron, create a visible 420×620 BrowserWindow using the real `src/preload/floating-preload.js`, load `src/renderer/floating/index.html`, and send `show-toolbar` with real settings and selected text.

Register no-op IPC handlers for every preload method the renderer may call. Use `webContents.executeJavaScript()` to click the actual controls and `capturePage()` after each state settles.

State sequence:

```text
1. selected text shown, collapsed -> collapsed-context-card.png
2. click #chat-context-toggle -> expanded-context-card.png
3. send first message with aiChatSend stubbed -> locked-context-card.png
4. reset UI with empty text -> empty-context-card.png
5. reset with text, click #chat-context-clear -> after-clear-context-card.png
```

Each image must capture the BrowserWindow content, not a generated color block.

- [ ] **Step 3: Run the structure test**

Run: `node --test tests/context-card-evidence-script.test.js`

Expected: PASS.

### Task 2: Capture And Validate Real Evidence

- [ ] **Step 1: Run the capture script**

```powershell
Push-Location .claude/worktrees/issue-5
npx electron scripts/capture-context-card-evidence.js
Pop-Location
```

- [ ] **Step 2: Run PNG validation**

From the repository root:

```powershell
node scripts/audit-completed-issues.js 5
```

Expected: no invalid PNG error. Required minimum is 320×180 and 1024 bytes.

- [ ] **Step 3: Inspect all five images**

Confirm:

- Collapsed state shows a two-line preview.
- Expanded state shows editable longer content without button overlap.
- Locked state is read-only and clear control is unavailable.
- Empty state contains no stale selected text.
- After-clear state sends/represents empty context.

If any image is visually wrong, fix only the demonstrated CSS or state transition and add/update a renderer test before changing code.

### Task 3: Correct The Verification Status

- [ ] **Step 1: Run focused and full tests**

```powershell
Push-Location .claude/worktrees/issue-5
node --test tests/floating-renderer-ui.test.js tests/context-card-evidence-script.test.js
npm test
Pop-Location
```

Expected: 120 or more tests pass, 0 fail.

- [ ] **Step 2: Rewrite verification evidence**

Record actual screenshot dimensions and byte sizes. Remove the existing PASS claim until images are replaced. The document must not describe automated state tests as a substitute for visual evidence.

- [ ] **Step 3: Run final audit**

Run: `node scripts/audit-completed-issues.js 5`

Expected: `Issue #5: PASSED` only with real screenshots.

- [ ] **Step 4: Commit and push**

```powershell
git -C .claude/worktrees/issue-5 add scripts/capture-context-card-evidence.js tests/context-card-evidence-script.test.js docs/superpowers/verification
git -C .claude/worktrees/issue-5 commit -m "docs: capture real context card evidence"
git -C .claude/worktrees/issue-5 push
```

Do not close issue #5 before the branch is reviewed and merged.

