# Issue 4 Completion Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the remaining issue 4 completion gaps so floating chat conversation sync is backed by durable tests and reviewable verification evidence.

**Architecture:** Keep the existing issue 4 design: selected text remains conversation metadata, floating chat creates and updates one synced conversation, and standalone chat sends metadata context when continuing. Add regression tests for the untested history-disabled transient path and floating persistence failure path, then make minimal renderer changes so the main process transient store stays in sync and failed persistence does not leave an unsent user bubble on screen.

**Tech Stack:** Electron renderer scripts, existing preload IPC APIs, Node `node:test`, renderer `vm` harness tests, PowerShell verification commands.

---

## Context

Issue 4 worktree:

```text
D:\Code\word-selection-assistant\.claude\worktrees\issue-4
```

Current observed status:

- `npm test` passes in the issue 4 worktree.
- The implementation covers the main happy paths from the original plan.
- The verification file claims manual PASS for all scenarios.

Remaining problems:

- The standalone chat renderer does not call `window.api.saveConversation()` when `saveHistory=false`. That means a continued floating conversation is updated only in the current renderer memory, not in the main process transient conversation store.
- The original acceptance says history-disabled synced floating conversations should be transient during the app session and disappear after restart. Transient means "stored in main process memory for this app session", not "only held in one renderer instance".
- The verification file says standalone continuation was verified through temporary local logging that was removed before commit. That is not durable review evidence.
- The floating chat renderer appends the user bubble before creating or saving the synced conversation. If that persistence step fails, it removes the message from `chatMessages` but leaves the already-rendered user bubble in the DOM, making the UI show a message that was not sent or saved.

Why the previous model missed this:

- It tested only `saveHistory=true` in `tests/chat-renderer-ui.test.js`.
- It treated a manual temporary log as equivalent to a lasting test artifact.
- It followed the issue plan's happy-path snippets too literally and did not add negative-path checks around persistence failure.

## File Structure

- Modify: `.claude/worktrees/issue-4/tests/chat-renderer-ui.test.js`
  - Add reusable standalone renderer harness options.
  - Add regression tests for `saveHistory=false` transient conversation sync.
- Modify: `.claude/worktrees/issue-4/src/renderer/chat/script.js`
  - Save standalone conversation updates through the existing API even when history is disabled; the main store already routes those writes to transient memory.
- Modify: `.claude/worktrees/issue-4/tests/floating-renderer-ui.test.js`
  - Add harness options for failing floating persistence.
  - Add a regression test that failed floating persistence removes the visible unsent user bubble and does not send the AI request.
- Modify: `.claude/worktrees/issue-4/src/renderer/floating/script.js`
  - Keep a reference to the appended user message DOM node and remove it if floating conversation persistence fails.
- Modify: `.claude/worktrees/issue-4/docs/superpowers/verification/2026-06-14-issue-4.md`
  - Replace temporary-log manual evidence with reproducible test evidence and final command output.

## Task 1: Add Standalone Transient Sync Regression Tests

**Files:**

- Modify: `.claude/worktrees/issue-4/tests/chat-renderer-ui.test.js`

- [ ] **Step 1: Replace the single-use standalone renderer test harness with a reusable harness**

Open `.claude/worktrees/issue-4/tests/chat-renderer-ui.test.js`.

Keep the existing imports and `createClassList()` function. Replace `createElement()` and the current test body with the code below. This keeps the existing selected-context test and adds history-disabled tests.

```js
function createElement(id, initialClass = '') {
  const listeners = new Map();
  const element = {
    id,
    className: initialClass,
    classList: createClassList(initialClass),
    style: {},
    children: [],
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    scrollHeight: 48,
    scrollTop: 0,
    parentElement: null,
    setAttribute() {},
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      this.lastElementChild = child;
      return child;
    },
    append(...children) {
      for (const child of children) {
        this.appendChild(child);
      }
    },
    replaceChildren(...children) {
      this.children = [];
      this.lastElementChild = null;
      this.append(...children);
    },
    querySelector(selector) {
      if (selector === '.message.streaming') {
        return this.children.find(child => child.classList?.contains('message') && child.classList?.contains('streaming')) || null;
      }
      if (selector === '.empty-state') {
        return this.children.find(child => child.classList?.contains('empty-state')) || null;
      }
      return null;
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatchEvent(type, event = {}) {
      const nextEvent = { preventDefault() {}, stopPropagation() {}, ...event };
      for (const listener of listeners.get(type) || []) listener(nextEvent);
    },
    remove() {
      if (!this.parentElement) return;
      this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      this.parentElement.lastElementChild = this.parentElement.children.at(-1) || null;
      this.parentElement = null;
    },
    focus() {}
  };
  return element;
}

function floatingConversation() {
  return {
    id: 'conv-floating',
    title: 'Explain this',
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
    metadata: { selectedContext: 'Selected paragraph', source: 'floating' },
    messages: [{ role: 'user', content: 'Explain this' }]
  };
}

async function createChatRendererHarness({
  saveHistory = true,
  conversations = [floatingConversation()],
  activeConversationId = 'conv-floating'
} = {}) {
  const ids = [
    'conversation-list',
    'history-state',
    'conversation-title',
    'conversation-meta',
    'conversation-context',
    'conversation-context-text',
    'messages',
    'new-chat',
    'delete-chat',
    'composer',
    'chat-input',
    'send-chat',
    'error-banner'
  ];
  const elements = Object.fromEntries(ids.map(id => [
    id,
    createElement(id, id === 'conversation-context' || id === 'error-banner' ? 'hidden' : '')
  ]));
  const calls = [];
  const callbacks = {};
  const api = {
    getSettings: async () => ({
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'key',
      chatModel: 'model'
    }),
    getChatState: async () => ({
      saveHistory,
      activeConversationId,
      conversations
    }),
    saveConversation: async (conversation) => {
      calls.push({ type: 'saveConversation', conversation });
      return {
        saveHistory,
        activeConversationId: conversation.id,
        conversations: [conversation]
      };
    },
    selectConversation: async (conversationId) => {
      calls.push({ type: 'selectConversation', conversationId });
      return {
        saveHistory,
        activeConversationId: conversationId,
        conversations
      };
    },
    deleteConversation: async () => ({}),
    newConversation: async () => ({}),
    sendChat(conversationId, messages, selectedText) {
      calls.push({ type: 'sendChat', conversationId, messages, selectedText });
    },
    onChatChunk(cb) { callbacks.chatChunk = cb; },
    onChatDone(cb) { callbacks.chatDone = cb; },
    onChatError(cb) { callbacks.chatError = cb; },
    onPrefillChatInput() {},
    onSettingsUpdated() {},
    openSettings() {},
    parseMarkdown(text) { return text; }
  };
  const document = {
    getElementById(id) { return elements[id]; },
    createElement(tagName) { return createElement(tagName); },
    createTextNode(text) { return { textContent: text }; }
  };
  const context = vm.createContext({
    window: { api },
    document,
    console,
    setTimeout: (fn) => fn(),
    clearTimeout
  });
  const scriptPath = path.join(__dirname, '..', 'src', 'renderer', 'chat', 'script.js');
  const script = fs.readFileSync(scriptPath, 'utf8');
  vm.runInContext(script, context, { filename: scriptPath });

  await new Promise(resolve => setImmediate(resolve));
  return { callbacks, calls, elements };
}
```

- [ ] **Step 2: Keep the selected-context continuation test using the new harness**

Add this test below the harness:

```js
test('standalone chat renders selected context metadata and sends it with continued messages', async () => {
  const { calls, elements } = await createChatRendererHarness();

  assert.equal(elements['conversation-context'].classList.contains('hidden'), false);
  assert.equal(elements['conversation-context-text'].textContent, 'Selected paragraph');

  elements['chat-input'].value = 'Continue';
  elements.composer.dispatchEvent('submit');
  await new Promise(resolve => setImmediate(resolve));

  const sendCall = calls.find(call => call.type === 'sendChat');
  assert.equal(sendCall.selectedText, 'Selected paragraph');
  assert.equal(sendCall.messages.at(-1).content, 'Continue');
});
```

- [ ] **Step 3: Add a failing test for history-disabled transient user-message sync**

Append this test:

```js
test('history disabled still saves continued floating conversation to transient store before sending', async () => {
  const { calls, elements } = await createChatRendererHarness({ saveHistory: false });

  elements['chat-input'].value = 'Continue';
  elements.composer.dispatchEvent('submit');
  await new Promise(resolve => setImmediate(resolve));

  const saveCall = calls.find(call => call.type === 'saveConversation');
  assert.ok(saveCall);
  assert.equal(saveCall.conversation.id, 'conv-floating');
  assert.equal(saveCall.conversation.metadata.selectedContext, 'Selected paragraph');
  assert.deepEqual(saveCall.conversation.messages.map(message => message.content), [
    'Explain this',
    'Continue'
  ]);

  const sendCall = calls.find(call => call.type === 'sendChat');
  assert.equal(sendCall.selectedText, 'Selected paragraph');
});
```

- [ ] **Step 4: Add a failing test for history-disabled transient assistant-message sync**

Append this test:

```js
test('history disabled saves streamed assistant reply to transient store', async () => {
  const { callbacks, calls, elements } = await createChatRendererHarness({ saveHistory: false });

  elements['chat-input'].value = 'Continue';
  elements.composer.dispatchEvent('submit');
  await new Promise(resolve => setImmediate(resolve));

  const sendCall = calls.find(call => call.type === 'sendChat');
  callbacks.chatChunk({ conversationId: sendCall.conversationId, chunk: 'Answer' });
  callbacks.chatDone({ conversationId: sendCall.conversationId });
  await new Promise(resolve => setImmediate(resolve));

  const saveCalls = calls.filter(call => call.type === 'saveConversation');
  assert.equal(saveCalls.length, 2);
  assert.deepEqual(saveCalls.at(-1).conversation.messages.map(message => message.role), [
    'user',
    'user',
    'assistant'
  ]);
  assert.equal(saveCalls.at(-1).conversation.messages.at(-1).content, 'Answer');
  assert.equal(saveCalls.at(-1).conversation.metadata.selectedContext, 'Selected paragraph');
});
```

- [ ] **Step 5: Run the standalone renderer tests and confirm the new tests fail**

Run:

```powershell
Push-Location .claude/worktrees/issue-4
npm test -- tests/chat-renderer-ui.test.js
Pop-Location
```

Expected result before implementation:

```text
FAIL tests/chat-renderer-ui.test.js
```

The failure must show that `saveConversation` was not called when `saveHistory=false`.

## Task 2: Save Standalone Updates Through the Transient Store

**Files:**

- Modify: `.claude/worktrees/issue-4/src/renderer/chat/script.js`

- [ ] **Step 1: Change `persistConversation()` to always call the save API**

Open `.claude/worktrees/issue-4/src/renderer/chat/script.js`.

Replace the current `persistConversation()` implementation with:

```js
async function persistConversation(conversation) {
  upsertLocalConversation(conversation);
  activeConversationId = conversation.id;
  const state = await window.api.saveConversation(conversation);
  applyState(state);
  render();
}
```

Reason: `window.api.saveConversation()` calls the main process store helper. The main store already decides whether to write persistent history or transient in-memory history based on `standaloneChatSaveHistory`. The renderer should not skip the API call.

- [ ] **Step 2: Run standalone renderer tests**

Run:

```powershell
Push-Location .claude/worktrees/issue-4
npm test -- tests/chat-renderer-ui.test.js
Pop-Location
```

Expected result:

```text
PASS tests/chat-renderer-ui.test.js
```

- [ ] **Step 3: Run the focused issue 4 tests**

Run:

```powershell
Push-Location .claude/worktrees/issue-4
npm test -- tests/chat-history.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-ui.test.js
Pop-Location
```

Expected result:

```text
All focused issue 4 tests pass.
```

- [ ] **Step 4: Commit the standalone transient fix**

Run:

```powershell
Push-Location .claude/worktrees/issue-4
git add src/renderer/chat/script.js tests/chat-renderer-ui.test.js
git commit -m "fix: sync standalone transient chat updates"
Pop-Location
```

## Task 3: Add Floating Persistence Failure Regression Test

**Files:**

- Modify: `.claude/worktrees/issue-4/tests/floating-renderer-ui.test.js`

- [ ] **Step 1: Make floating harness configurable**

Open `.claude/worktrees/issue-4/tests/floating-renderer-ui.test.js`.

Change:

```js
function createRendererHarness() {
```

to:

```js
function createRendererHarness(options = {}) {
```

In `createElement()`, replace the current `remove()` method with this implementation and update `appendChild()` to set `parentElement`:

```js
appendChild(child) {
  child.parentElement = this;
  this.children.push(child);
  this.lastElementChild = child;
  return child;
},
remove() {
  if (!this.parentElement) return;
  this.parentElement.children = this.parentElement.children.filter(child => child !== this);
  this.parentElement.lastElementChild = this.parentElement.children.at(-1) || null;
  this.parentElement = null;
},
```

Replace the API's `createFloatingConversation` with:

```js
createFloatingConversation: async (payload) => {
  if (options.createFloatingConversation) {
    return options.createFloatingConversation(payload, calls);
  }
  calls.push({ type: 'createFloatingConversation', payload });
  return {
    conversation: {
      id: 'conv-floating',
      title: payload.userMessage,
      metadata: { selectedContext: payload.selectedText, source: 'floating' },
      messages: [{ role: 'user', content: payload.userMessage }]
    }
  };
},
```

Replace the API's `saveFloatingConversation` with:

```js
saveFloatingConversation: async (conversation) => {
  if (options.saveFloatingConversation) {
    return options.saveFloatingConversation(conversation, calls);
  }
  calls.push({ type: 'saveFloatingConversation', conversation });
  return { conversation };
},
```

- [ ] **Step 2: Add a failing persistence failure test**

Append this test:

```js
test('floating chat removes unsent user bubble when synced conversation creation fails', async () => {
  const { calls, elements, callbacks } = createRendererHarness({
    createFloatingConversation: async (payload, callLog) => {
      callLog.push({ type: 'createFloatingConversation', payload });
      throw new Error('store failed');
    }
  });

  callbacks.showToolbar({
    text: 'Selected context',
    settings: {
      translationEnabled: true,
      aiChatEnabled: true,
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'key',
      chatModel: 'model'
    },
    pending: false
  });
  elements['btn-chat'].dispatchEvent('click');
  elements['chat-input'].value = 'Explain this';
  elements['chat-send-btn'].dispatchEvent('click');

  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.some(call => call.type === 'aiChatSend'), false);
  assert.equal(elements['chat-messages'].children.some(child => child.classList.contains('user')), false);
  assert.equal(elements['chat-messages'].children.some(child => child.classList.contains('error')), true);
});
```

- [ ] **Step 3: Run the floating renderer test and confirm it fails**

Run:

```powershell
Push-Location .claude/worktrees/issue-4
npm test -- tests/floating-renderer-ui.test.js
Pop-Location
```

Expected result before implementation:

```text
FAIL tests/floating-renderer-ui.test.js
```

The failure should show that a user bubble remains after the persistence error.

## Task 4: Remove the Unsent Floating User Bubble on Persistence Failure

**Files:**

- Modify: `.claude/worktrees/issue-4/src/renderer/floating/script.js`

- [ ] **Step 1: Keep the user message element returned by `appendChatMessage()`**

Open `.claude/worktrees/issue-4/src/renderer/floating/script.js`.

In `sendChatMessage()`, replace:

```js
chatMessages.push({ role: 'user', content });
appendChatMessage('user', content);
```

with:

```js
chatMessages.push({ role: 'user', content });
const userMessageEl = appendChatMessage('user', content);
```

- [ ] **Step 2: Remove that user bubble in the persistence error branch**

In the same function, replace the persistence `catch` block with:

```js
  } catch (err) {
    chatMessages.pop();
    userMessageEl.remove();
    appendChatError(err.message || '保存浮窗会话失败，请重试。');
    return;
  }
```

Use the existing localized error style if the file already contains mojibake text from the current encoding. The important behavior is `userMessageEl.remove()` before returning.

- [ ] **Step 3: Run floating renderer tests**

Run:

```powershell
Push-Location .claude/worktrees/issue-4
npm test -- tests/floating-renderer-ui.test.js
Pop-Location
```

Expected result:

```text
PASS tests/floating-renderer-ui.test.js
```

- [ ] **Step 4: Run focused issue 4 tests**

Run:

```powershell
Push-Location .claude/worktrees/issue-4
npm test -- tests/chat-history.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-ui.test.js
Pop-Location
```

Expected result:

```text
All focused issue 4 tests pass.
```

- [ ] **Step 5: Commit the floating failure fix**

Run:

```powershell
Push-Location .claude/worktrees/issue-4
git add src/renderer/floating/script.js tests/floating-renderer-ui.test.js
git commit -m "fix: clean up failed floating chat persistence"
Pop-Location
```

## Task 5: Repair Issue 4 Verification Evidence

**Files:**

- Modify: `.claude/worktrees/issue-4/docs/superpowers/verification/2026-06-14-issue-4.md`

- [ ] **Step 1: Run full issue 4 verification commands**

Run:

```powershell
Push-Location .claude/worktrees/issue-4
npm test -- tests/chat-history.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-ui.test.js
npm test
git status --short
git diff --stat HEAD
Pop-Location
```

Expected result:

```text
Focused tests pass.
Full npm test passes.
git status --short contains only intended issue 4 remediation changes before commit, or is clean after commit.
```

- [ ] **Step 2: Rewrite the verification document**

Open `.claude/worktrees/issue-4/docs/superpowers/verification/2026-06-14-issue-4.md`.

The document must include:

```markdown
# Issue 4 Verification

## Status

PASS

## Automated Commands

- `npm test -- tests/chat-history.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-ui.test.js`
  - Result: PASS
- `npm test`
  - Result: PASS

## Regression Evidence

- PASS: `standalone chat renders selected context metadata and sends it with continued messages`
- PASS: `history disabled still saves continued floating conversation to transient store before sending`
- PASS: `history disabled saves streamed assistant reply to transient store`
- PASS: `floating chat creates synced conversation before sending AI request`
- PASS: `floating chat saves assistant message to the synced conversation on done`
- PASS: `floating chat removes unsent user bubble when synced conversation creation fails`

## Saved Conversation Shape

## Manual Checks

## Changed Files For Review
```

Keep the sanitized saved conversation JSON from the current file.

In `Manual Checks`, remove any note that relies on temporary local logging that was removed before commit. Replace that row with:

```markdown
| Standalone continuation sends metadata context | PASS | Covered by `standalone chat renders selected context metadata and sends it with continued messages`. |
```

Add this row:

```markdown
| History disabled uses main-process transient conversation store | PASS | Covered by the two `history disabled` renderer regression tests. |
```

- [ ] **Step 3: Scan the verification document for incomplete evidence wording**

Run:

```powershell
rg -n "PENDIN[G]|PARTIA[L]|Manual verification neede[d]|To be complete[d]|not executed|will be verified|temporary local logging|\\[ \\]" .claude/worktrees/issue-4/docs/superpowers/verification/2026-06-14-issue-4.md
```

Expected result:

```text
No matches found.
```

- [ ] **Step 4: Commit verification repair**

Run:

```powershell
Push-Location .claude/worktrees/issue-4
git add docs/superpowers/verification/2026-06-14-issue-4.md
git commit -m "docs: strengthen issue 4 verification evidence"
Pop-Location
```

## Task 6: Final Review Handoff

**Files:**

- Modify only files listed in previous tasks.

- [ ] **Step 1: Run final commands**

Run:

```powershell
Push-Location .claude/worktrees/issue-4
npm test -- tests/chat-history.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-ui.test.js
npm test
git status --short
git log --oneline -5
Pop-Location
```

Expected result:

```text
Focused tests pass.
Full npm test passes.
git status --short is clean unless the implementation agent intentionally leaves uncommitted verification artifacts for reviewer inspection.
Recent log contains the issue 4 remediation commits.
```

- [ ] **Step 2: Report exact final status**

The implementation handoff must state:

```text
Issue 4 status: ready for final review
Focused tests: PASS
Full npm test: PASS
Verification file: docs/superpowers/verification/2026-06-14-issue-4.md
Key fixes:
- saveHistory=false standalone continuations now save through the main-process transient store
- floating persistence failure removes the unsent user bubble and does not call aiChatSend
- temporary local logging evidence was replaced with durable automated regression evidence
```

If any test fails or verification wording remains incomplete, the status must be:

```text
Issue 4 status: blocked
```

## Plan Self-Review

Spec coverage:

- Floating first send and assistant sync remain covered by existing tests and Task 4.
- Standalone continuation with selected metadata remains covered by Task 1.
- History-disabled transient behavior is directly covered by the new Task 1 tests and Task 2 implementation.
- Failure after user message remains covered by existing AI error behavior and the new persistence failure cleanup in Tasks 3 and 4.
- Verification evidence is strengthened in Task 5.

Red flag scan:

- Manual evidence that cannot be known inside this plan is converted into required test names and exact command output.
- No implementation step asks the worker to invent unspecified behavior.
- All touched files and commands are explicit.

Type and naming consistency:

- The renderer tests call `window.api.saveConversation`, matching `src/preload/chat-preload.js`.
- The saved conversation still uses `metadata.selectedContext` and `metadata.source`.
- The floating renderer still uses `createFloatingConversation`, `saveFloatingConversation`, and `aiChatSend` exactly as exposed by `src/preload/floating-preload.js`.
