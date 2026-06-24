# Issue 4 Chat Sync Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the completed floating-chat conversation synchronization safely, prove persistent and transient storage behavior, and prepare issue #4 for a reviewable PR.

**Architecture:** Keep selected text in conversation metadata and reuse the existing standalone history store. Strengthen the store-level contract with an isolated `electron-store` fake, resolve integration conflicts with issues #2 and #5 without dropping either feature, and verify the complete floating-to-standalone workflow before publishing.

**Tech Stack:** Electron IPC, Node.js `node:test`, CommonJS module mocking, Git worktrees, GitHub CLI.

---

## Current State

- Branch/worktree: `.claude/worktrees/issue-4`, HEAD `df7932f`, clean.
- Fresh full run: 124 passed, 0 failed.
- Transient continuation and failed-persistence cleanup regression tests exist.
- A previous parallel full-suite run exposed one timing-sensitive selection test failure; 10 isolated reruns passed. Treat this as a baseline flake owned by issue #6, not proof that issue #4 is broken.
- No PR exists; branch is not integrated with the issue #2/#5 work now on local master.

## Files

- Create: `.claude/worktrees/issue-4/tests/store-chat-sync.test.js`
- Modify only if tests expose defects: `src/main/store.js`, `src/main/chat-history.js`
- Resolve integration conflicts in: `src/renderer/floating/script.js`, `src/renderer/chat/script.js`, `src/renderer/chat/style.css`, related tests
- Modify: `.claude/worktrees/issue-4/docs/superpowers/verification/2026-06-14-issue-4.md`

### Task 1: Add Store-Level Persistent And Transient Tests

- [ ] **Step 1: Create an in-memory electron-store fake**

Create `tests/store-chat-sync.test.js`. Before requiring `src/main/store.js`, intercept `electron-store` and return a class with `get`, `set`, `has`, and `delete` backed by a Map. Clear `require.cache` between test cases.

The test helper must allow these initial settings:

```js
{
  standaloneChatSaveHistory: true,
  standaloneChatRestoreLastConversation: true,
  standaloneChatActiveConversationId: '',
  standaloneChatConversations: []
}
```

- [ ] **Step 2: Test persistent floating conversation creation**

```js
test('floating conversation persists selected context and user message when history is enabled', () => {
  const { storeModule, backingStore } = loadStore({ standaloneChatSaveHistory: true });
  const result = storeModule.createFloatingChatConversation({
    selectedText: 'Selected paragraph',
    userMessage: 'Explain this'
  });

  assert.equal(result.conversation.metadata.selectedContext, 'Selected paragraph');
  assert.equal(result.conversation.metadata.source, 'floating');
  assert.deepEqual(result.conversation.messages.map(message => message.content), ['Explain this']);
  assert.equal(backingStore.get('standaloneChatConversations').length, 1);
});
```

- [ ] **Step 3: Test transient behavior**

```js
test('history-disabled floating conversation stays in process memory and does not touch persistent history', () => {
  const { storeModule, backingStore } = loadStore({
    standaloneChatSaveHistory: false,
    standaloneChatConversations: [{ id: 'saved', title: 'Saved', messages: [] }]
  });
  const created = storeModule.createFloatingChatConversation({
    selectedText: 'Context',
    userMessage: 'Question'
  });
  const saved = storeModule.saveFloatingChatConversation({
    ...created.conversation,
    messages: [...created.conversation.messages, { role: 'assistant', content: 'Answer' }]
  });

  assert.deepEqual(saved.conversation.messages.map(message => message.role), ['user', 'assistant']);
  assert.deepEqual(backingStore.get('standaloneChatConversations').map(item => item.id), ['saved']);
  assert.equal(storeModule.getStandaloneChatState().conversations.length, 1);
});
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/store-chat-sync.test.js tests/chat-history.test.js`

Expected: PASS. If a test fails, fix only the demonstrated store defect.

- [ ] **Step 5: Commit store contract tests**

```powershell
git add tests/store-chat-sync.test.js src/main/store.js src/main/chat-history.js
git commit -m "test: cover floating chat store synchronization"
```

### Task 2: Rebase Onto The Integration Baseline

- [ ] **Step 1: Protect the dirty main workspace**

Do not rebase onto the current dirty `master`. Create or identify a clean integration branch containing accepted issue #2 and #5 commits first.

- [ ] **Step 2: Rebase the issue branch**

```powershell
git -C .claude/worktrees/issue-4 fetch origin
git -C .claude/worktrees/issue-4 rebase <clean-integration-branch>
```

Resolve only semantic conflicts:

- Preserve issue #5 context-card state and controls.
- Preserve issue #4 `floatingConversationId`, metadata, create/save IPC calls, error handling, and transient behavior.
- Preserve issue #2 final Markdown rendering calls and styles.

- [ ] **Step 3: Run conflict-sensitive tests**

```powershell
node --test tests/chat-history.test.js tests/store-chat-sync.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-ui.test.js tests/chat-renderer-markdown.test.js
```

Expected: all pass.

### Task 3: Perform End-to-End Workflow Verification

- [ ] **Step 1: Run full tests twice**

```powershell
npm test
npm test
```

Expected: both runs pass. If `text-capture-ignored-gesture.test.js` flakes, record it as the issue #6 prerequisite and do not hide the failure.

- [ ] **Step 2: Run the app and test persistent history**

1. Enable chat history.
2. Select text, open floating chat, send one user message, receive an assistant response.
3. Open standalone AI Chat.
4. Confirm one conversation exists, selected text appears as metadata rather than a message, and continuation sends the same context.
5. Restart the app and confirm the conversation remains.

- [ ] **Step 3: Test transient history**

1. Disable chat history.
2. Repeat the floating conversation.
3. Confirm it is visible in standalone chat during the same app process.
4. Restart the app and confirm it disappears.

### Task 4: Finalize Verification And Publish For Review

- [ ] **Step 1: Update verification**

Record the rebased commit, two full test runs, persistent and transient manual results, and exact changed files. Remove claims that rely on temporary logs.

- [ ] **Step 2: Confirm clean branch**

```powershell
git status --short
git log --oneline --decorate -8
```

Expected: clean worktree.

- [ ] **Step 3: Push and create a draft PR**

```powershell
git push -u origin worktree-issue-4
gh pr create --draft --base master --head worktree-issue-4 --title "Sync floating chat conversations with AI Chat" --body-file docs/superpowers/verification/2026-06-14-issue-4.md
```

Do not close issue #4 until the PR is merged.

