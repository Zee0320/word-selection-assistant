# Windows Issues 2 4 5 6 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one remote Windows integration branch in which issues #2, #4, #5, and #6 coexist, all tests pass, evidence is reproducible, and the result can be merged to `master`.

**Architecture:** Start from clean `origin/master`, merge corrected issue branches in dependency order, and resolve shared renderer tests by combining behavior rather than choosing a branch wholesale. Issue #6's clarified selection eligibility replaces capture-before-text pending; issue #4 owns conversation persistence; issue #5 owns context-card interaction; issue #2 owns shared Markdown security/rendering.

**Tech Stack:** Git worktrees, Electron, Node.js `node:test`, GitHub CLI, PowerShell.

---

## Preconditions

- `origin/worktree-issue-2-markdown` includes unsafe-link remediation.
- `origin/worktree-issue-5` includes tracked `capture-mock-preload.js` and deterministic timing test.
- `origin/worktree-issue-4` contains store contract tests.
- `origin/worktree-issue-6-empty-selection` contains durable Windows evidence.
- UOS branch is excluded from this integration.

## Files Most Likely To Conflict

- `src/renderer/floating/script.js`
- `src/renderer/floating/style.css`
- `src/renderer/chat/script.js`
- `src/renderer/chat/style.css`
- `src/main/index.js`
- `src/main/text-capture.js`
- `src/main/floating-window.js`
- `tests/floating-renderer-ui.test.js`
- `tests/floating-window.test.js`

### Task 1: Create A Clean Integration Worktree

- [ ] **Step 1: Create branch and worktree**

```powershell
git fetch origin --prune
git worktree add .codex/worktrees/windows-issues-2-4-5-6 -b codex/windows-issues-2-4-5-6-integration origin/master
```

- [ ] **Step 2: Verify baseline**

Run `npm test` in the new worktree. Expected: current master suite passes before merges.

### Task 2: Merge Issue #2 And Verify Security

- [ ] **Step 1: Merge**

Run: `git merge --no-ff origin/worktree-issue-2-markdown -m "merge: secure markdown rendering"`

- [ ] **Step 2: Verify**

```powershell
node --test tests/markdown-renderer.test.js tests/chat-renderer-markdown.test.js tests/floating-renderer-ui.test.js
node -e "const {renderMarkdownToHtml}=require('./src/main/markdown-renderer'); console.log(renderMarkdownToHtml('[x](javascript:alert(1))'))"
```

Expected: tests pass; output has no unsafe `href`.

### Task 3: Merge Issue #5 And Combine Renderer Tests

- [ ] **Step 1: Merge and resolve conflicts**

Run: `git merge --no-ff origin/worktree-issue-5 -m "merge: add selected context card"`

In `tests/floating-renderer-ui.test.js`, retain both Markdown tests and context-card tests. Do not resolve by accepting `--ours` or `--theirs` for the whole file.

- [ ] **Step 2: Verify**

```powershell
node --test tests/floating-renderer-ui.test.js tests/context-card-evidence-script.test.js tests/text-capture-ignored-gesture.test.js
npx electron scripts/capture-context-card-evidence.js
```

Expected: tests pass and all five screenshots regenerate.

### Task 4: Merge Issue #4 And Combine The Send Flow

- [ ] **Step 1: Merge**

Run: `git merge --no-ff origin/worktree-issue-4 -m "merge: sync floating conversations"`

- [ ] **Step 2: Resolve floating renderer semantics**

The final first-send sequence must be:

```text
normalize input -> freeze edited context -> append user bubble
-> create canonical floating conversation
-> append streaming assistant bubble -> send AI request
-> render chunks through shared Markdown parser
-> append assistant message -> save same conversation
```

On create/save failure before AI request, remove the new user bubble and do not send. Preserve context-card lock/reset behavior.

- [ ] **Step 3: Verify**

```powershell
node --test tests/floating-renderer-ui.test.js tests/chat-renderer-ui.test.js tests/store-chat-sync.test.js tests/chat-history.test.js tests/chat-renderer-markdown.test.js
```

Expected: PASS.

### Task 5: Merge Issue #6 And Resolve Pending Semantics

- [ ] **Step 1: Merge**

Run: `git merge --no-ff origin/worktree-issue-6-empty-selection -m "merge: require selected text before toolbar"`

- [ ] **Step 2: Resolve main-process conflicts**

Use issue #6 versions for capture eligibility and sentinel clipboard logic. Preserve generic hit testing from master, but remove every pre-capture empty-window path. The final source search must return no production matches:

```powershell
rg -n "showPendingWindow|onCapturePending|onCaptureMissed|pending:\s*true" src/main
```

- [ ] **Step 3: Resolve tests by retaining all valid contracts**

Keep Markdown, context-card, persistence, resolved hit-test, empty-selection, sentinel, and deterministic ignored-gesture tests. Delete only tests that expect a textless pending toolbar.

### Task 6: Harden The Completion Audit

- [ ] **Step 1: Add issue #4 configuration**

In `scripts/audit-completed-issues.js`, add issue #4 required files and verification markers so it is no longer `SKIPPED`.

- [ ] **Step 2: Test only the verification status section for incomplete status**

Add `readVerificationStatus(markdown)` that extracts text under `## Status` until the next `##`. Reject `BLOCKED`, `PENDING`, or `PARTIAL` there, while allowing those words in historical/root-cause prose.

Add tests proving a PASS document may say “removed the old pending state” outside Status, but a Status of PENDING fails.

- [ ] **Step 3: Run audit tests**

```powershell
node --test tests/audit-completed-issues.test.js
node scripts/audit-completed-issues.js 2 4 5 6
```

Expected: all four report PASSED.

### Task 7: Final Windows Verification

- [ ] **Step 1: Run full suite twice**

Run `npm test` twice. Record exact count and duration for each run.

- [ ] **Step 2: Build Windows artifact**

```powershell
npm run rebuild
npm run build:win:x64
Get-FileHash dist/* -Algorithm SHA256
```

Expected: portable artifact exists and hash is recorded.

- [ ] **Step 3: Execute combined manual matrix**

Verify in one built artifact:

- Markdown table/code/nested list/safe link and unsafe-link neutralization.
- Context card collapsed/expanded/edited/cleared/locked/reset.
- Floating conversation appears in standalone chat, persists when enabled, is transient when disabled.
- Empty click/blank drag/whitespace never flashes a window.
- Double-click and drag selection still work.

Record results in `docs/superpowers/verification/2026-06-15-windows-integration.md` with branch SHA and artifact SHA256.

### Task 8: Publish For Final Review

- [ ] **Step 1: Push integration branch**

```powershell
git push -u origin codex/windows-issues-2-4-5-6-integration
```

- [ ] **Step 2: Create draft PR**

```powershell
gh pr create --draft --base master --head codex/windows-issues-2-4-5-6-integration --title "Integrate issues 2, 4, 5, and 6" --body-file docs/superpowers/verification/2026-06-15-windows-integration.md
```

- [ ] **Step 3: Final review gate**

Do not close issues #2, #4, #5, or #6 until the integration PR is reviewed and merged. Do not merge the UOS branch into this PR.
