# Issue 4 PR Integration Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebase issue #4 onto the accepted Windows integration baseline, preserve issue #2 and #5 behavior during conflict resolution, and turn Draft PR #10 into a fully tested reviewable PR.

**Architecture:** Keep issue #4's canonical conversation store and transient-history behavior. Resolve renderer conflicts semantically, not by choosing one side: the floating renderer must retain context-card editing, shared Markdown rendering, and conversation persistence in one send flow.

**Tech Stack:** Git, Electron IPC, Node.js `node:test`, GitHub CLI.

---

## Current State

- Worktree HEAD: `045aa40595fca0e2d3d726b285bcf8e018f6cafa`
- Remote PR head: `29edbfee7027c9894d799d2ea87191031390df98`
- Draft PR: `#10`, mergeable against current master, but missing local verification commit `045aa40`.
- Fresh tests: 127 passed twice.
- Pairwise integration conflicts exist in `src/renderer/floating/script.js` and `tests/floating-renderer-ui.test.js`.

## Files

- Modify during rebase: `src/renderer/floating/script.js`
- Modify during rebase: `src/renderer/chat/script.js`
- Modify during rebase: `src/renderer/chat/style.css`
- Modify during rebase: `tests/floating-renderer-ui.test.js`
- Modify: `tests/chat-renderer-ui.test.js`
- Modify: `docs/superpowers/verification/2026-06-14-issue-4.md`

### Task 1: Rebase Onto The Windows Integration Baseline

- [ ] **Step 1: Require the integration baseline SHA**

Do not rebase onto the dirty local `master`. Obtain the branch created by the Windows integration plan, for example `codex/windows-issues-2-4-5-6-integration`, and verify it contains the secured #2 and corrected #5 commits.

```powershell
git fetch origin
git merge-base --is-ancestor origin/worktree-issue-2-markdown origin/codex/windows-issues-2-4-5-6-integration
git merge-base --is-ancestor origin/worktree-issue-5 origin/codex/windows-issues-2-4-5-6-integration
```

Expected: both commands exit 0.

- [ ] **Step 2: Rebase issue #4**

```powershell
git -C .claude/worktrees/issue-4 rebase origin/codex/windows-issues-2-4-5-6-integration
```

When conflicts occur, preserve all of these behaviors:

- `activeChatContext` is frozen on first send.
- `createFloatingConversation()` runs before the first AI request.
- Later sends call `saveFloatingConversation()` before requesting AI.
- Persistence failure removes the unsent user bubble.
- Stream chunks render through `window.api.parseMarkdown()`.
- Stream completion appends the assistant message and saves the same conversation ID.
- Context-card expand, clear, lock, empty, and reset states remain intact.

### Task 2: Add A Combined Regression Test

- [ ] **Step 1: Add one end-to-end renderer test**

In `tests/floating-renderer-ui.test.js`, add a test that:

```js
test('edited selected context is frozen, persisted, rendered, and reused by the synced conversation', async () => {
  // Show toolbar with "Original context" and open chat.
  // Edit textarea to "Edited context".
  // Send "Explain this".
  // Assert createFloatingConversation receives edited context and user message.
  // Emit markdown chunks "**Answer**" and done.
  // Assert rendered assistant HTML contains <strong>Answer</strong>.
  // Assert saveFloatingConversation receives the same conversation id,
  // metadata.selectedContext === "Edited context", and user+assistant messages.
  // Assert context controls are locked after first send.
});
```

Use the existing fake DOM/API helpers. Do not use fixed sleeps; await the mocked promise/callback sequence.

- [ ] **Step 2: Run the combined tests**

```powershell
node --test tests/floating-renderer-ui.test.js tests/chat-renderer-ui.test.js tests/store-chat-sync.test.js tests/chat-history.test.js
```

Expected: PASS.

### Task 3: Verify Persistent And Transient Workflows

- [ ] **Step 1: Run full tests twice**

Run `npm test` twice. Both runs must pass with identical test counts.

- [ ] **Step 2: Perform manual checks**

With history enabled, create a floating conversation, continue it in standalone chat, restart, and confirm persistence. With history disabled, confirm the conversation exists in the same process and disappears after restart.

- [ ] **Step 3: Update verification**

Record the rebased SHA, integration baseline SHA, two test runs, combined renderer test, persistent/transient manual results, and exact changed files.

### Task 4: Update PR #10

- [ ] **Step 1: Push the rebased branch**

```powershell
git -C .claude/worktrees/issue-4 push --force-with-lease origin worktree-issue-4
gh pr view 10 --json headRefOid,baseRefOid,mergeStateStatus,statusCheckRollup
```

Expected: PR head equals local HEAD and merge state is clean.

- [ ] **Step 2: Mark ready only after checks**

If no GitHub Actions workflow exists, state that explicitly in the PR body and include local command evidence. Then run `gh pr ready 10`.

