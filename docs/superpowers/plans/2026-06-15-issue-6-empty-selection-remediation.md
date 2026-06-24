# Issue 6 Empty Selection Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:systematic-debugging first, then superpowers:test-driven-development and superpowers:executing-plans. Execute tasks in order and keep every checkbox current.

**Goal:** Make non-empty selected text the only condition that permits the floating window to appear, while preserving normal drag selection and double-click selection on Windows.

**Architecture:** Separate two states that the previous implementation conflated. Text capture determines whether a window may exist; translation/AI initialization determines whether actions inside an already valid window are pending. Never show an empty shell while text capture is unresolved. Harden clipboard capture with a unique sentinel, then call the floating window only after one normalized non-empty string is available.

**Tech Stack:** Electron clipboard, `@mukea/uiohook-napi`, Node.js `node:test`, Windows PowerShell.

---

## Corrected Requirement

The remote issue body still says slow text capture may display a pending toolbar. That wording is superseded by the later product clarification:

- No selected text: the floating window must not appear, even briefly.
- Valid selected text: show the floating window as soon as capture confirms the text.
- Translation and AI buttons may remain disabled/pending until their own prerequisites are ready.
- Pending action state is not permission to show a textless window.

The issue body must be updated before implementation so another model does not restore the old behavior.

## Current State And Why The Earlier Attempt Was Incomplete

- Branch/worktree: `.claude/worktrees/issue-6-empty-selection`, HEAD `1d1a2f8`, clean.
- Fresh `npm test`: 118 passed, 0 failed.
- Latest manual verification is `PARTIAL PASS`: blank drag and whitespace selection produced a visible flash.
- The branch no longer wires `onCapturePending` in `src/main/index.js`, but `createPendingCaptureSession`, pending callbacks, and tests that expect unresolved capture to show a toolbar remain in `text-capture.js` and its tests.
- Those dead tests encode the obsolete requirement and can mislead a later model into reconnecting it.
- Manual evidence did not identify the exact running commit/build, so the flash may also have come from an older process or build.
- Clipboard fallback clears to `''`; timeout returns a final clipboard read without proving Copy replaced the pre-capture value.

## Required Deliverables

- Updated issue wording saved in `docs/superpowers/verification/issue-6/clarified-requirements.md` and applied to GitHub issue #6.
- Regression tests that fail if any unresolved or empty capture shows the window.
- Exact-build manual results in `docs/superpowers/verification/issue-6/manual-windows-results.md`.
- Captured application log in `docs/superpowers/verification/issue-6/manual-run.log` using known non-sensitive test text.
- Updated `docs/superpowers/verification/2026-06-14-issue-6.md` with exact commands, test counts, SHA, and changed files.

## Files

- Modify: `.claude/worktrees/issue-6-empty-selection/src/main/text-capture.js`
- Modify: `.claude/worktrees/issue-6-empty-selection/src/main/index.js`
- Modify: `.claude/worktrees/issue-6-empty-selection/src/main/floating-window.js`
- Modify: `.claude/worktrees/issue-6-empty-selection/tests/text-capture.test.js`
- Modify: `.claude/worktrees/issue-6-empty-selection/tests/floating-window.test.js`
- Modify: `.claude/worktrees/issue-6-empty-selection/tests/text-capture-ignored-gesture.test.js`
- Create: `.claude/worktrees/issue-6-empty-selection/docs/superpowers/verification/issue-6/clarified-requirements.md`
- Create: `.claude/worktrees/issue-6-empty-selection/docs/superpowers/verification/issue-6/manual-windows-results.md`
- Generate: `.claude/worktrees/issue-6-empty-selection/docs/superpowers/verification/issue-6/manual-run.log`
- Modify: `.claude/worktrees/issue-6-empty-selection/docs/superpowers/verification/2026-06-14-issue-6.md`

### Task 1: Lock The Requirement And Build Provenance

- [ ] **Step 1: Write the clarified requirement artifact**

Create `clarified-requirements.md` with the four rules above plus this state table:

| Captured text | Action readiness | Window | Buttons |
|---|---|---|---|
| Unknown/unresolved | Any | Hidden | Not applicable |
| Empty/whitespace | Any | Hidden | Not applicable |
| Non-empty | Pending | Visible with selected text | Disabled/loading |
| Non-empty | Ready | Visible with selected text | Enabled |

- [ ] **Step 2: Update GitHub issue #6 before coding**

Use `gh issue edit 6 --body-file <prepared-body-file>` and preserve the original background/history. Replace only the conflicting pending statement and acceptance criteria. Add a note dated 2026-06-15 that action pending is separate from text-capture eligibility.

- [ ] **Step 3: Record exact baseline**

```powershell
git -C .claude/worktrees/issue-6-empty-selection rev-parse HEAD
git -C .claude/worktrees/issue-6-empty-selection status --short
```

Expected: SHA `1d1a2f8...` and a clean worktree before changes.

### Task 2: Delete The Obsolete Pre-Capture Pending Contract

- [ ] **Step 1: Replace tests that bless the wrong behavior**

In `tests/text-capture.test.js`, remove tests asserting that an unresolved capture calls `onPending` after a delay. Add tests proving:

1. Unresolved capture produces no window callback.
2. Empty result produces no window callback.
3. Whitespace-only result produces no window callback.
4. Non-empty drag result produces one callback with trimmed text.
5. Non-empty double-click result produces one callback with trimmed text.
6. A stale earlier capture cannot show after a newer capture starts.

Tests must observe the callback passed to `textCapture.init()` or a small extracted capture-result helper. A static source-string assertion alone is insufficient.

- [ ] **Step 2: Run tests and preserve the failure**

Run: `node --test tests/text-capture.test.js tests/floating-window.test.js`

Expected: at least one new test fails before obsolete pending code is removed or the new helper is implemented.

- [ ] **Step 3: Remove the obsolete API and dead state**

From `src/main/text-capture.js`, remove:

- `onCapturePending` and `onCaptureMissed` handler fields.
- `createPendingCaptureSession` and its timing constants.
- Its `_private` export.
- Any path that calls a window callback before `String(selectedText || '').trim()` is non-empty.

From `src/main/index.js`, retain only the non-empty `onTextCaptured` integration. From `floating-window.js`, remove `showPendingWindow` and capture-pending watchdog state if no post-selection caller remains. Do not remove renderer button loading/disabled state.

- [ ] **Step 4: Add a defensive window boundary check**

At the start of the public window-show function, normalize the text and return without showing when it is empty:

```js
const normalizedText = String(text || '').trim();
if (!normalizedText) return false;
```

Send `normalizedText` to the renderer and return `true` only when a show was scheduled. Add direct `floating-window.test.js` cases for `''`, whitespace, and valid text.

- [ ] **Step 5: Run focused tests**

```powershell
node --test tests/text-capture.test.js tests/floating-window.test.js
```

Expected: PASS.

### Task 3: Make Clipboard Capture Distinguish Success From Timeout

- [ ] **Step 1: Add failing sentinel tests**

In `tests/text-capture.test.js`, cover:

1. Clipboard remains equal to the sentinel after Copy: return `''`.
2. Clipboard changes from sentinel to whitespace: return `''` after trim.
3. Clipboard changes from sentinel to selected text: return trimmed text.
4. Clipboard changes after a short delay: return selected text.
5. Original text/image clipboard data is restored on success, timeout, empty result, and Copy exception.

- [ ] **Step 2: Implement one clipboard transaction**

Use a unique sentinel instead of `''`:

```js
const sentinel = `__WSA_CAPTURE_${Date.now()}_${Math.random().toString(16).slice(2)}__`;
clipboardApi.writeText(sentinel);
copySelection();
const copied = await waitForClipboardChange(sentinel, waitTimeout, clipboardApi);
return copied === sentinel ? '' : String(copied || '').trim();
```

Change `waitForClipboardChange()` to return the sentinel/previous value on timeout. Always restore the snapshot in `finally`. Keep the helper internal except for the existing `_private` test surface if needed.

- [ ] **Step 3: Run focused capture tests**

Run: `node --test tests/text-capture.test.js`

Expected: PASS.

### Task 4: Remove The Timing-Flaky Test Pattern

- [ ] **Step 1: Replace elapsed-time assertions with a controlled deferred promise**

In `tests/text-capture-ignored-gesture.test.js`, do not assert “finished within 200ms”. Keep clipboard capture unresolved, trigger the ignored gesture, prove the ignored path completes without resolving capture, then resolve the deferred promise during cleanup.

- [ ] **Step 2: Stress the test**

```powershell
1..20 | ForEach-Object { node --test tests/text-capture-ignored-gesture.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Expected: 20 consecutive passes.

### Task 5: Run The Exact Branch And Execute Manual Verification

- [ ] **Step 1: Prevent stale-process evidence**

Close all Electron/word-selection-assistant processes. From the issue worktree, record SHA, rebuild native modules, and start that exact source tree:

```powershell
Get-Process electron,word-selection-assistant -ErrorAction SilentlyContinue | Stop-Process
Push-Location .claude/worktrees/issue-6-empty-selection
git rev-parse HEAD
npm run rebuild
npm start 2>&1 | Tee-Object docs/superpowers/verification/issue-6/manual-run.log
```

Do not test a packaged binary unless its package SHA and source commit are recorded separately.

- [ ] **Step 2: Execute the manual matrix**

Run each at least three times in Notepad and once in a browser:

| Case | Expected |
|---|---|
| Single click with no selection | Window never appears |
| Drag over blank area | Window never appears |
| Select spaces/tabs only | Window never appears |
| Double-click a word | Window appears with exact word |
| Drag-select a sentence | Window appears with exact sentence |
| Copy blocked/unavailable | Window never appears; clipboard restored |
| Rapid valid selection then empty gesture | Old capture does not appear or overwrite current state |

Use screen recording or frame-by-frame observation for the first three cases. “Appears then disappears” is a failure.

- [ ] **Step 3: Correlate log and UI**

For empty cases, the log may show `Selected text: (empty)` but must have no later `[showWindow]` line for that gesture. Use only known test strings because current logging prints selected text.

### Task 6: Final Verification And Handoff

- [ ] **Step 1: Run the full suite twice**

Run `npm test` twice. Both runs must pass.

- [ ] **Step 2: Update verification honestly**

Set status to `PASS` only if every manual case passes from the recorded SHA. Include exact counts, the seven-case matrix, 20-run stress result, requirement artifact, log path, and changed-files list. Otherwise keep `PARTIAL PASS` and name the failing case.

- [ ] **Step 3: Commit and publish**

```powershell
git add src/main tests docs/superpowers/verification
git commit -m "fix: require selected text before showing toolbar"
git push -u origin worktree-issue-6-empty-selection
```

Do not close issue #6 until the manual evidence comes from the pushed commit.

