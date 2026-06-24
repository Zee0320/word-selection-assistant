# Issue 4 Floating Chat Conversation Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A floating AI Chat session must be saved as an AI Chat conversation so the user can open the standalone AI Chat window and continue the same conversation with the original selected text context preserved.

**Architecture:** Store selected text as conversation metadata, not as a visible chat message. The floating renderer creates a synced conversation on the first user send, persists the user message before the AI request, persists the assistant message on success, and the standalone AI Chat renderer passes metadata context back to the main process when continuing the conversation.

**Tech Stack:** Electron IPC, existing `chat-history.js` pure helpers, `store.js` history/transient storage, floating and standalone renderer scripts, Node `node:test` plus renderer `vm` harness tests.

---

## Requirements From Clarification

- On the first floating chat user message, create one AI Chat conversation.
- Every later message in the same floating chat panel updates that same conversation.
- The selected text is saved as metadata, not inserted as a normal user/assistant message.
- If standalone history is enabled, synced floating conversations persist in the same history list.
- If standalone history is disabled, synced floating conversations are transient and disappear after app restart.
- If the AI request fails after the user message was sent, the conversation still keeps the user message and selected context.
- Continuing the conversation in the standalone AI Chat interface must use the selected context metadata for future AI requests.
- This issue depends conceptually on issue #5's frozen context state, but implementation must still work if the current floating UI uses the existing textarea.

## Files To Create Or Modify

- Modify: `src/main/chat-history.js`
  - Preserve `metadata.selectedContext` and `metadata.source`.
  - Add helper to read selected context safely.
- Modify: `tests/chat-history.test.js`
  - Add pure tests for metadata normalization and preservation.
- Modify: `src/main/store.js`
  - Add floating conversation create/save helpers using existing persistent/transient history behavior.
- Modify: `src/main/index.js`
  - Add IPC handlers for floating conversation create/save.
  - Pass selected context metadata into standalone chat AI requests.
- Modify: `src/preload/floating-preload.js`
  - Expose floating conversation persistence APIs to the floating renderer.
- Modify: `src/preload/chat-preload.js`
  - Allow standalone `sendChat` to pass selected context.
- Modify: `src/renderer/floating/script.js`
  - Create and update the synced conversation.
- Modify: `src/renderer/chat/index.html`
  - Add a read-only selected context panel above messages.
- Modify: `src/renderer/chat/script.js`
  - Render the metadata context and send it when continuing a synced conversation.
- Modify: `src/renderer/chat/style.css`
  - Style the standalone context panel.
- Modify: `tests/floating-renderer-ui.test.js`
  - Assert floating chat calls create/save APIs correctly.
- Create: `tests/chat-renderer-ui.test.js`
  - Minimal standalone renderer harness for selected-context continuation.
- Create: `docs/superpowers/verification/2026-06-14-issue-4.md`
  - Required reviewer handoff with test output, saved conversation JSON, and manual scenario results.

## Acceptance Contract

The implementation is complete only when all of these are true:

- `npm test -- tests/chat-history.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-ui.test.js` passes.
- A floating chat first send calls the create-conversation IPC before `aiChatSend`.
- A floating chat AI error keeps the user message in the synced conversation.
- A floating chat AI success appends the assistant message to the same conversation.
- The standalone AI Chat list shows the synced conversation title derived from the first floating user message.
- The standalone AI Chat message list does not show selected text as a normal chat bubble.
- The standalone AI Chat context panel shows the selected text metadata.
- Continuing the conversation from standalone sends the selected context to `aiChat`.
- `docs/superpowers/verification/2026-06-14-issue-4.md` contains a sanitized JSON example of the saved conversation.

### Task 1: Preserve Conversation Metadata In Pure Helpers

**Files:**
- Modify: `src/main/chat-history.js`
- Modify: `tests/chat-history.test.js`

- [ ] **Step 1: Write metadata tests**

Append these tests to `tests/chat-history.test.js`:

```js
test('normalizes selected context metadata without creating a chat message', () => {
  const conversation = createConversation('Explain the selected code', {
    metadata: {
      selectedContext: '  const value = 1;  ',
      source: 'floating'
    }
  });

  assert.equal(conversation.metadata.selectedContext, 'const value = 1;');
  assert.equal(conversation.metadata.source, 'floating');
  assert.equal(conversation.messages.length, 1);
  assert.equal(conversation.messages[0].content, 'Explain the selected code');
});

test('upsert and append preserve conversation metadata', () => {
  const conversation = createConversation('Question', {
    metadata: {
      selectedContext: 'Selected paragraph',
      source: 'floating'
    }
  });
  const appended = appendMessages(conversation, [
    { role: 'assistant', content: 'Answer' }
  ]);
  const upserted = upsertConversation([], appended);

  assert.equal(appended.metadata.selectedContext, 'Selected paragraph');
  assert.equal(upserted[0].metadata.selectedContext, 'Selected paragraph');
  assert.equal(getConversationSelectedContext(upserted[0]), 'Selected paragraph');
});
```

Update the import destructuring at the top of `tests/chat-history.test.js`:

```js
const {
  appendMessages,
  applyHistoryUpdate,
  createConversation,
  deleteConversation,
  deriveTitle,
  getConversationSelectedContext,
  resolveActiveConversation,
  sortConversations,
  upsertConversation
} = require('../src/main/chat-history');
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/chat-history.test.js
```

Expected: FAIL because `createConversation` ignores the options object and `getConversationSelectedContext` is not exported.

- [ ] **Step 3: Implement metadata helpers**

In `src/main/chat-history.js`, add this helper near `normalizeMessage`:

```js
function normalizeConversationMetadata(metadata = {}) {
  const selectedContext = String(metadata.selectedContext || '').trim();
  const source = String(metadata.source || '').trim();
  const normalized = {};

  if (selectedContext) normalized.selectedContext = selectedContext;
  if (source) normalized.source = source;

  return normalized;
}
```

Update `normalizeConversation` so the returned object includes metadata:

```js
return {
  id: conversation.id || createId('conv'),
  title: conversation.title || deriveTitle(messages.find(msg => msg.role === 'user')?.content),
  createdAt,
  updatedAt: conversation.updatedAt || createdAt,
  messages,
  metadata: normalizeConversationMetadata(conversation.metadata)
};
```

Update `createConversation` signature and return value:

```js
function createConversation(messageContent = '', options = {}) {
  const timestamp = nowIso();
  const messages = messageContent
    ? [normalizeMessage({ role: 'user', content: messageContent, createdAt: timestamp })]
    : [];

  return {
    id: createId('conv'),
    title: messageContent ? deriveTitle(messageContent) : '新会话',
    createdAt: timestamp,
    updatedAt: timestamp,
    messages,
    metadata: normalizeConversationMetadata(options.metadata)
  };
}
```

Add this helper near `resolveActiveConversation`:

```js
function getConversationSelectedContext(conversation) {
  return normalizeConversationMetadata(conversation?.metadata).selectedContext || '';
}
```

Export the new helper:

```js
getConversationSelectedContext,
```

- [ ] **Step 4: Run metadata tests**

Run:

```bash
npm test -- tests/chat-history.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/chat-history.js tests/chat-history.test.js
git commit -m "feat: preserve selected context metadata"
```

### Task 2: Add Store Helpers For Floating Conversations

**Files:**
- Modify: `src/main/store.js`
- Modify: `tests/chat-history.test.js`

- [ ] **Step 1: Add a pure history test for floating metadata shape**

Append this test to `tests/chat-history.test.js`:

```js
test('floating conversations use source metadata and normal chat messages', () => {
  const conversation = createConversation('What does this mean?', {
    metadata: {
      selectedContext: 'Selected API response',
      source: 'floating'
    }
  });
  const updated = appendMessages(conversation, [
    { role: 'assistant', content: 'It means the request succeeded.' }
  ]);

  assert.deepEqual(updated.messages.map(message => message.role), ['user', 'assistant']);
  assert.deepEqual(updated.messages.map(message => message.content), [
    'What does this mean?',
    'It means the request succeeded.'
  ]);
  assert.equal(updated.metadata.selectedContext, 'Selected API response');
  assert.equal(updated.metadata.source, 'floating');
});
```

- [ ] **Step 2: Run the pure test**

Run:

```bash
npm test -- tests/chat-history.test.js
```

Expected: PASS after Task 1.

- [ ] **Step 3: Import metadata helper in store**

In `src/main/store.js`, extend the `chat-history` destructuring:

```js
const {
  appendMessages,
  applyHistoryUpdate,
  createConversation,
  deleteConversation,
  getConversationSelectedContext,
  normalizeConversation,
  resolveActiveConversation,
  sortConversations,
  upsertConversation
} = require('./chat-history');
```

- [ ] **Step 4: Add store helpers**

Add these functions after `appendStandaloneMessages`:

```js
function createFloatingChatConversation({ selectedText = '', userMessage = '' } = {}) {
  const conversation = createConversation(userMessage, {
    metadata: {
      selectedContext: selectedText,
      source: 'floating'
    }
  });
  const conversations = upsertConversation(readConversations(), conversation);
  writeConversations(conversations, conversation.id);
  return {
    ...getStandaloneChatState(),
    conversation: normalizeConversation(conversation)
  };
}

function saveFloatingChatConversation(conversation) {
  const normalized = normalizeConversation({
    ...conversation,
    metadata: {
      ...(conversation?.metadata || {}),
      selectedContext: getConversationSelectedContext(conversation),
      source: 'floating'
    }
  });
  const conversations = upsertConversation(readConversations(), normalized);
  writeConversations(conversations, normalized.id);
  return {
    ...getStandaloneChatState(),
    conversation: normalized
  };
}
```

Export both functions:

```js
createFloatingChatConversation,
saveFloatingChatConversation,
```

- [ ] **Step 5: Run related tests**

Run:

```bash
npm test -- tests/chat-history.test.js tests/settings-migration.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/store.js tests/chat-history.test.js
git commit -m "feat: add floating chat conversation store helpers"
```

### Task 3: Expose Floating Conversation IPC

**Files:**
- Modify: `src/main/index.js`
- Modify: `src/preload/floating-preload.js`
- Modify: `src/preload/chat-preload.js`

- [ ] **Step 1: Import store helpers in main**

In `src/main/index.js`, extend the store import:

```js
const {
  createFloatingChatConversation,
  createStandaloneConversation,
  deleteStandaloneConversation,
  getSettings,
  getStandaloneChatState,
  saveFloatingChatConversation,
  saveSettings,
  saveStandaloneConversation,
  selectStandaloneConversation
} = require('./store');
```

- [ ] **Step 2: Add floating IPC handlers**

Add these handlers near the standalone chat handlers:

```js
ipcMain.handle('floating-chat-create-conversation', (event, payload) => {
  return createFloatingChatConversation(payload);
});

ipcMain.handle('floating-chat-save-conversation', (event, conversation) => {
  return saveFloatingChatConversation(conversation);
});
```

- [ ] **Step 3: Add floating preload APIs**

In `src/preload/floating-preload.js`, add:

```js
createFloatingConversation: (payload) => ipcRenderer.invoke('floating-chat-create-conversation', payload),
saveFloatingConversation: (conversation) => ipcRenderer.invoke('floating-chat-save-conversation', conversation),
```

Place them next to `aiChatSend`.

- [ ] **Step 4: Update standalone `sendChat` preload signature**

In `src/preload/chat-preload.js`, replace:

```js
sendChat: (conversationId, messages) => ipcRenderer.send('standalone-chat-send', { conversationId, messages }),
```

with:

```js
sendChat: (conversationId, messages, selectedText = '') => ipcRenderer.send('standalone-chat-send', { conversationId, messages, selectedText }),
```

- [ ] **Step 5: Update main standalone AI request to use selected context**

In `src/main/index.js`, replace:

```js
ipcMain.on('standalone-chat-send', (event, { conversationId, messages }) => {
```

with:

```js
ipcMain.on('standalone-chat-send', (event, { conversationId, messages, selectedText = '' }) => {
```

Then replace the `aiChat` call's first argument:

```js
aiChat(
  selectedText,
  messages,
```

- [ ] **Step 6: Run a syntax smoke test**

Run:

```bash
node --check src/main/index.js
node --check src/preload/floating-preload.js
node --check src/preload/chat-preload.js
```

Expected: each command exits successfully with no output.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.js src/preload/floating-preload.js src/preload/chat-preload.js
git commit -m "feat: expose floating chat conversation persistence"
```

### Task 4: Persist Floating Chat Messages

**Files:**
- Modify: `tests/floating-renderer-ui.test.js`
- Modify: `src/renderer/floating/script.js`

- [ ] **Step 1: Extend the harness API**

In `tests/floating-renderer-ui.test.js`, add these stubs to the `api` object:

```js
createFloatingConversation: async (payload) => {
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
saveFloatingConversation: async (conversation) => {
  calls.push({ type: 'saveFloatingConversation', conversation });
  return { conversation };
},
```

- [ ] **Step 2: Add a test for first-send persistence before AI send**

Append:

```js
test('floating chat creates synced conversation before sending AI request', async () => {
  const { callbacks, calls, elements } = createRendererHarness();

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
  await elements['chat-send-btn'].dispatchEvent('click');

  assert.equal(calls[0].type, 'notifyInteraction');
  assert.equal(calls.some(call => call.type === 'createFloatingConversation'), true);
  assert.equal(calls.some(call => call.type === 'aiChatSend'), true);

  const createCall = calls.find(call => call.type === 'createFloatingConversation');
  assert.deepEqual(createCall.payload, {
    selectedText: 'Selected context',
    userMessage: 'Explain this'
  });
});
```

- [ ] **Step 3: Add a test for assistant persistence on success**

Append:

```js
test('floating chat saves assistant message to the synced conversation on done', async () => {
  const { callbacks, calls, elements } = createRendererHarness();

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
  await elements['chat-send-btn'].dispatchEvent('click');
  callbacks.aiChatChunk('Answer');
  await callbacks.aiChatDone();

  const saveCall = calls.find(call => call.type === 'saveFloatingConversation');
  assert.equal(saveCall.conversation.id, 'conv-floating');
  assert.deepEqual(saveCall.conversation.messages.map(message => message.role), ['user', 'assistant']);
  assert.equal(saveCall.conversation.messages[1].content, 'Answer');
  assert.equal(saveCall.conversation.metadata.selectedContext, 'Selected context');
});
```

If the current harness stores stream callbacks under different names, update `api.onAiChatChunk`, `api.onAiChatDone`, and `api.onAiChatError` so they assign:

```js
onAiChatChunk(cb) { callbacks.aiChatChunk = cb; },
onAiChatDone(cb) { callbacks.aiChatDone = cb; },
onAiChatError(cb) { callbacks.aiChatError = cb; },
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```bash
npm test -- tests/floating-renderer-ui.test.js
```

Expected: FAIL because floating persistence is not wired.

- [ ] **Step 5: Add floating conversation state**

In `src/renderer/floating/script.js`, add state variables:

```js
let floatingConversationId = '';
let floatingConversationMetadata = {};
```

Reset them in `resetChatState`:

```js
floatingConversationId = '';
floatingConversationMetadata = {};
```

- [ ] **Step 6: Add a helper to build the synced conversation payload**

Add near `sendChatMessage`:

```js
function buildFloatingConversationPayload() {
  return {
    id: floatingConversationId,
    metadata: floatingConversationMetadata,
    messages: chatMessages.map(message => ({
      role: message.role,
      content: message.content
    }))
  };
}
```

- [ ] **Step 7: Make `sendChatMessage` async and persist before AI send**

Change the function declaration:

```js
async function sendChatMessage() {
```

After appending the user message and before creating the assistant streaming element, add:

```js
try {
  if (!floatingConversationId) {
    const result = await window.api.createFloatingConversation({
      selectedText: activeChatContext,
      userMessage: content
    });
    floatingConversationId = result.conversation.id;
    floatingConversationMetadata = result.conversation.metadata || {
      selectedContext: activeChatContext,
      source: 'floating'
    };
  } else {
    await window.api.saveFloatingConversation(buildFloatingConversationPayload());
  }
} catch (err) {
  chatMessages.pop();
  appendChatError(err.message || '保存浮窗会话失败，请重试。');
  return;
}
```

- [ ] **Step 8: Save the assistant message on done**

In `window.api.onAiChatDone`, after pushing the assistant message into `chatMessages`, add:

```js
if (floatingConversationId) {
  window.api.saveFloatingConversation(buildFloatingConversationPayload())
    .catch(err => appendChatError(err.message || '保存浮窗回复失败，请重试。'));
}
```

- [ ] **Step 9: Keep user message on AI error**

Do not remove the last user message in `onAiChatError`. The existing code removes only the streaming assistant placeholder and pops the last message. Change that pop so it only removes an assistant placeholder when one was pushed. The desired error branch is:

```js
if (lastMsg?.classList.contains('streaming')) {
  lastMsg.remove();
}
```

Do not call `chatMessages.pop()` in the AI error handler.

- [ ] **Step 10: Run renderer tests**

Run:

```bash
npm test -- tests/floating-renderer-ui.test.js
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/floating/script.js tests/floating-renderer-ui.test.js
git commit -m "feat: sync floating chat messages to history"
```

### Task 5: Show And Reuse Selected Context In Standalone AI Chat

**Files:**
- Modify: `src/renderer/chat/index.html`
- Modify: `src/renderer/chat/script.js`
- Modify: `src/renderer/chat/style.css`
- Create: `tests/chat-renderer-ui.test.js`

- [ ] **Step 1: Add context panel markup**

In `src/renderer/chat/index.html`, insert this section between the chat header and `#messages`:

```html
<section id="conversation-context" class="conversation-context hidden" aria-label="Selected text context">
  <div class="conversation-context-label">Selected text</div>
  <div id="conversation-context-text" class="conversation-context-text"></div>
</section>
```

- [ ] **Step 2: Add DOM references and helper in chat script**

In `src/renderer/chat/script.js`, add DOM references:

```js
const conversationContext = document.getElementById('conversation-context');
const conversationContextText = document.getElementById('conversation-context-text');
```

Add helper:

```js
function getSelectedContext(conversation) {
  return String(conversation?.metadata?.selectedContext || '').trim();
}
```

- [ ] **Step 3: Render the context panel**

Add this function:

```js
function renderConversationContext() {
  const selectedContext = getSelectedContext(getActiveConversation());
  conversationContext.classList.toggle('hidden', !selectedContext);
  conversationContextText.textContent = selectedContext;
}
```

Call it inside `render()` between `renderHistory()` and `renderMessages()`:

```js
function render() {
  renderHistory();
  renderConversationContext();
  renderMessages();
  updateControls();
}
```

- [ ] **Step 4: Send selected context when continuing standalone chat**

In `sendMessage`, before `window.api.sendChat(...)`, add:

```js
const selectedContext = getSelectedContext(conversation);
```

Replace the send call with:

```js
window.api.sendChat(conversation.id, messages, selectedContext);
```

- [ ] **Step 5: Add standalone renderer test harness**

Create `tests/chat-renderer-ui.test.js` with this starting harness:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList(initial = '') {
  const classes = new Set(initial.split(/\s+/).filter(Boolean));
  return {
    add(...names) { names.forEach(name => classes.add(name)); },
    remove(...names) { names.forEach(name => classes.delete(name)); },
    contains(name) { return classes.has(name); },
    toggle(name, force) {
      const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
      if (shouldAdd) classes.add(name);
      else classes.delete(name);
      return shouldAdd;
    }
  };
}

function createElement(id, initialClass = '') {
  const listeners = new Map();
  return {
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
    setAttribute() {},
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    querySelector() { return null; },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatchEvent(type, event = {}) {
      const nextEvent = { preventDefault() {}, stopPropagation() {}, ...event };
      for (const listener of listeners.get(type) || []) listener(nextEvent);
    }
  };
}
```

Then add the test:

```js
test('standalone chat renders selected context metadata and sends it with continued messages', async () => {
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
  const api = {
    getSettings: async () => ({
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'key',
      chatModel: 'model'
    }),
    getChatState: async () => ({
      saveHistory: true,
      activeConversationId: 'conv-floating',
      conversations: [{
        id: 'conv-floating',
        title: 'Explain this',
        createdAt: '2026-06-14T00:00:00.000Z',
        updatedAt: '2026-06-14T00:00:00.000Z',
        metadata: { selectedContext: 'Selected paragraph', source: 'floating' },
        messages: [{ role: 'user', content: 'Explain this' }]
      }]
    }),
    saveConversation: async (conversation) => ({
      saveHistory: true,
      activeConversationId: conversation.id,
      conversations: [conversation]
    }),
    selectConversation: async () => ({}),
    deleteConversation: async () => ({}),
    newConversation: async () => ({}),
    sendChat(conversationId, messages, selectedText) {
      calls.push({ type: 'sendChat', conversationId, messages, selectedText });
    },
    onChatChunk() {},
    onChatDone() {},
    onChatError() {},
    onPrefillChatInput() {},
    onSettingsUpdated() {},
    openSettings() {},
    parseMarkdown(text) { return text; }
  };
  const document = {
    getElementById(id) { return elements[id]; },
    createElement(tagName) { return createElement(tagName); }
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

- [ ] **Step 6: Add context panel styles**

In `src/renderer/chat/style.css`, add near `.messages`:

```css
.conversation-context {
  margin: 12px 18px 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
}

.conversation-context-label {
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0;
}

.conversation-context-text {
  max-height: 96px;
  overflow: auto;
  white-space: pre-wrap;
  color: var(--muted-strong);
  font-size: 13px;
  line-height: 1.5;
}
```

- [ ] **Step 7: Run standalone renderer test**

Run:

```bash
npm test -- tests/chat-renderer-ui.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/chat/index.html src/renderer/chat/script.js src/renderer/chat/style.css tests/chat-renderer-ui.test.js
git commit -m "feat: continue synced chat with selected context"
```

### Task 6: Full Verification And Reviewer Handoff

**Files:**
- Create: `docs/superpowers/verification/2026-06-14-issue-4.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/chat-history.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-ui.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Manual verification**

Run:

```bash
npm start
```

Manual scenarios:

```text
1. Select text and open floating AI Chat.
2. Send "Explain this".
3. Force an AI error by using an invalid chat model, then open standalone AI Chat.
4. Confirm the conversation exists with one user message and selected context panel.
5. Restore a valid chat model, continue the same conversation in standalone AI Chat.
6. Confirm the next AI request uses the selected context.
7. Disable standalone history, repeat a floating chat, close and reopen the chat window.
8. Confirm the transient conversation is available during the app session but is not written to persistent history.
```

- [ ] **Step 4: Create the verification file**

Create `docs/superpowers/verification/2026-06-14-issue-4.md`:

````markdown
# Issue 4 Verification

## Automated Commands

- `npm test -- tests/chat-history.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-ui.test.js`
  - Result: PASS
- `npm test`
  - Result: PASS

## Saved Conversation Shape

```json
{
  "id": "conv-floating-example",
  "title": "Explain this",
  "metadata": {
    "selectedContext": "Selected paragraph used for manual verification.",
    "source": "floating"
  },
  "messages": [
    { "role": "user", "content": "Explain this" },
    { "role": "assistant", "content": "Manual verification answer." }
  ]
}
```

## Manual Checks

| Scenario | Result | Notes |
| --- | --- | --- |
| Floating first send creates AI Chat conversation | PASS | Conversation appeared in standalone list. |
| Selected text is metadata, not normal message | PASS | Message list did not contain a selected-text bubble. |
| AI error preserves user message | PASS | User message remained after failed request. |
| AI success saves assistant message | PASS | Assistant reply appeared after stream completion. |
| Standalone continuation sends metadata context | PASS | Verified through temporary local logging removed before commit. |
| History disabled uses transient conversation | PASS | Persistent history did not receive the transient conversation. |

## Changed Files For Review

- `src/main/chat-history.js`
- `src/main/store.js`
- `src/main/index.js`
- `src/preload/floating-preload.js`
- `src/preload/chat-preload.js`
- `src/renderer/floating/script.js`
- `src/renderer/chat/index.html`
- `src/renderer/chat/script.js`
- `src/renderer/chat/style.css`
- `tests/chat-history.test.js`
- `tests/floating-renderer-ui.test.js`
- `tests/chat-renderer-ui.test.js`
````

- [ ] **Step 5: Commit verification**

```bash
git add docs/superpowers/verification/2026-06-14-issue-4.md
git commit -m "docs: record floating chat sync verification"
```
