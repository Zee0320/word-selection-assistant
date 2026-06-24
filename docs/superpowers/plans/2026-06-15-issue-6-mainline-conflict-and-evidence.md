# Issue 6 Mainline Conflict And Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate issue #6's non-empty-selection gate with current Windows master, explicitly remove the conflicting pre-capture pending design, and add durable Windows evidence.

**Architecture:** The clarified issue #6 contract wins over the older capture-pending behavior currently in `origin/master`: unresolved/empty capture keeps the window hidden; action readiness may be pending only after valid text exists. Preserve normal resolved-window hit testing and outside-click hiding, but remove empty `showPendingWindow` paths and their tests.

**Tech Stack:** Git, Electron clipboard/window management, Node.js `node:test`, Windows manual verification.

---

## Current State

- Issue #6 HEAD: `9ff5f97fcbf7a9bf941a1bf12b4409e1d1974a54`
- Fresh tests: 135 passed twice.
- Branch is local only.
- Verification claims PASS but lacks `manual-windows-results.md` and `manual-run.log`.
- Merging into `origin/master` conflicts in `floating-window.js`, `text-capture.js`, and `floating-window.test.js` because master contains capture-before-text pending behavior from issues #8/fast-toolbar.

## Files

- Modify during conflict resolution: `src/main/text-capture.js`
- Modify during conflict resolution: `src/main/floating-window.js`
- Modify during conflict resolution: `src/main/index.js`
- Modify: `tests/text-capture.test.js`
- Modify: `tests/text-capture-ignored-gesture.test.js`
- Modify: `tests/floating-window.test.js`
- Create: `docs/superpowers/verification/issue-6/manual-windows-results.md`
- Generate: `docs/superpowers/verification/issue-6/manual-run.log`
- Modify: `docs/superpowers/verification/2026-06-14-issue-6.md`

### Task 1: Rebase And Resolve The Product Conflict

- [ ] **Step 1: Rebase onto the current integration branch**

```powershell
git fetch origin
git -C .claude/worktrees/issue-6-empty-selection rebase origin/codex/windows-issues-2-4-5-6-integration
```

- [ ] **Step 2: Resolve `text-capture.js` using issue #6 semantics**

Keep sentinel clipboard capture, stale-capture protection, drag/double-click detection, and trimmed-text gate. Remove `onCapturePending`, `onCaptureMissed`, `createPendingCaptureSession`, and any timer that displays before text is known.

The only renderer callback after capture must follow this shape:

```js
const trimmedText = String(selectedText || '').trim();
if (!shouldShowToolbarForCapturedText(trimmedText)) return;
onTextCaptured?.(trimmedText, e.x, e.y, activeWindowHandle, captureId);
```

- [ ] **Step 3: Resolve `floating-window.js`**

Keep `isPhysicalPointInsideWindow()` and normal inside/outside behavior. Remove `showPendingWindow`, `hidePendingWindow`, pending watchdogs, and pending-interaction holds. Keep the defensive boundary:

```js
const normalizedText = String(text || '').trim();
if (!normalizedText) return false;
```

Do not preserve `showWindow('', ..., { pending: true })` from master.

- [ ] **Step 4: Resolve tests**

Delete tests expecting an unresolved capture to show a toolbar. Preserve tests for resolved-window hit testing and outside-click hiding. Add one test proving an outside click hides a valid resolved toolbar, so issue #8's useful resolved behavior is not lost.

### Task 2: Prove The Conflict Resolution

- [ ] **Step 1: Run focused tests**

```powershell
node --test tests/text-capture.test.js tests/text-capture-ignored-gesture.test.js tests/floating-window.test.js tests/floating-window-hit-test.test.js tests/floating-renderer-ui.test.js
```

Expected: PASS and test logs contain no `showWindow text=` call with an empty string.

- [ ] **Step 2: Search for forbidden production paths**

```powershell
rg -n "showPendingWindow|onCapturePending|onCaptureMissed|pending:\s*true|showWindow\(['\"]['\"]" src/main
```

Expected: no matches.

### Task 3: Produce Durable Windows Evidence

- [ ] **Step 1: Run the exact rebased commit**

```powershell
Get-Process electron,word-selection-assistant -ErrorAction SilentlyContinue | Stop-Process
git rev-parse HEAD | Tee-Object docs/superpowers/verification/issue-6/verified-sha.txt
npm run rebuild
npm start 2>&1 | Tee-Object docs/superpowers/verification/issue-6/manual-run.log
```

- [ ] **Step 2: Record the matrix**

Create `manual-windows-results.md` with three Notepad repetitions and one browser repetition for: single click, blank drag, whitespace selection, double-click word, drag sentence, blocked Copy, and rapid valid-then-empty gesture. Record exact PASS/FAIL; any visible flash is FAIL.

- [ ] **Step 3: Correlate logs**

For every empty case, verify the log contains no subsequent `[showWindow] Window shown`. Use known non-sensitive strings only.

### Task 4: Finalize And Publish

- [ ] **Step 1: Run full tests twice**

Run `npm test` twice. Both runs must pass with the same count.

- [ ] **Step 2: Fix verification wording for the audit**

The root audit rejects the word `PENDING` anywhere in a PASS document. Describe the removed behavior as “pre-capture waiting state” and ensure the status document contains no `BLOCKED`, `PENDING`, unchecked boxes, or future-tense claims.

- [ ] **Step 3: Commit and push**

```powershell
git add src/main tests docs/superpowers/verification
git commit -m "fix: integrate non-empty selection gate"
git push -u origin worktree-issue-6-empty-selection
```

Comment on issue #8 that capture-before-text pending was superseded by the clarified issue #6 requirement; do not close #8 silently.

