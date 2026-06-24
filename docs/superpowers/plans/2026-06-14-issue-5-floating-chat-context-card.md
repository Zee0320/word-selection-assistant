# Issue 5 Floating Chat Context Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Floating AI Chat must show selected text as a compact reference card that is easy to inspect, edit, clear before sending, and locked after the first message is sent.

**Architecture:** Keep the feature entirely inside the floating renderer. The card owns only UI state for the selected context; the existing `window.api.aiChatSend(selectedText, messages)` contract remains unchanged so issue #4 can later reuse the frozen context when syncing conversations.

**Tech Stack:** Electron renderer DOM, existing `src/renderer/floating/*` files, Node `vm` renderer harness in `tests/floating-renderer-ui.test.js`.

---

## Requirements From Clarification

- Scope is only the floating AI Chat UI.
- Default display is a two-line selected-text preview.
- Before the first user message, the user can expand, edit, and clear the selected text context.
- After the first user message, the context becomes locked and cannot be edited or cleared.
- A cleared context means normal chat with no selected-text reference.
- A new text selection resets the card to editable, collapsed, and populated with the new selected text.
- Do not save conversations in this issue; conversation sync belongs to issue #4.

## Files To Create Or Modify

- Modify: `tests/floating-renderer-ui.test.js`
  - Add DOM harness IDs for the context card controls.
  - Add tests for collapsed preview, expand/collapse, edit, clear, lock, and reset-on-new-selection.
- Modify: `src/renderer/floating/index.html`
  - Replace the current raw context textarea header with a reference-card header and explicit controls.
- Modify: `src/renderer/floating/script.js`
  - Add context-card state and event handlers.
  - Freeze context on first send.
  - Reset context on each non-pending `show-toolbar` event.
- Modify: `src/renderer/floating/style.css`
  - Add compact two-line card styles, expanded state, locked state, and empty state.
- Create: `docs/superpowers/verification/2026-06-14-issue-5.md`
  - Required reviewer handoff with test output and manual visual results.

## Acceptance Contract

The implementation is complete only when all of these are true:

- `npm test -- tests/floating-renderer-ui.test.js` passes.
- The card starts collapsed and two lines tall when selected text exists.
- The expand button toggles a larger editable view before first send.
- The clear button empties the context before first send.
- The first send freezes the context, hides the clear button, and shows the locked state.
- `window.api.aiChatSend` receives the frozen context, not later edits.
- A new `show-toolbar` event with new text resets the card to editable and collapsed.
- `docs/superpowers/verification/2026-06-14-issue-5.md` includes screenshots or absolute paths to screenshots for collapsed, expanded, empty, and locked states.

## Visual Contract

Use this structure:

```text
[paperclip icon] Selected text                      [expand/collapse] [clear]
Two-line preview textarea
```

Locked state:

```text
[paperclip icon] Selected text                      Locked
Two-line read-only preview
```

Empty state:

```text
[paperclip icon] No selected text context           [expand/collapse hidden]
Normal chat - no selected text context
```

### Task 1: Expand The Renderer Harness For Context Card Controls

**Files:**
- Modify: `tests/floating-renderer-ui.test.js`

- [ ] **Step 1: Add new element IDs to the harness**

In `createRendererHarness`, add these IDs to the `ids` array:

```js
'chat-context-header',
'chat-context-label',
'chat-context-toggle',
'chat-context-status',
```

Keep the existing IDs:

```js
'chat-context',
'chat-context-text',
'chat-context-clear',
'chat-context-lock',
```

- [ ] **Step 2: Make `dispatchEvent` return realistic event behavior**

Update `createElement().dispatchEvent` so tests can click buttons with default methods:

```js
dispatchEvent(type, event = {}) {
  const nextEvent = {
    stopPropagation() {},
    preventDefault() {},
    ...event
  };
  for (const listener of listeners.get(type) || []) {
    listener(nextEvent);
  }
}
```

- [ ] **Step 3: Capture chat send calls in the harness**

Replace the stubbed `aiChatSend()` with this implementation:

```js
aiChatSend(selectedText, messages) {
  calls.push({ type: 'aiChatSend', selectedText, messages });
}
```

- [ ] **Step 4: Run the existing renderer tests**

Run:

```bash
npm test -- tests/floating-renderer-ui.test.js
```

Expected: PASS. If this fails, fix only the harness change before adding feature tests.

- [ ] **Step 5: Commit**

```bash
git add tests/floating-renderer-ui.test.js
git commit -m "test: prepare floating renderer context card harness"
```

### Task 2: Define Context Card Behavior With Tests

**Files:**
- Modify: `tests/floating-renderer-ui.test.js`

- [ ] **Step 1: Add a test for default collapsed selected context**

Append this test:

```js
test('chat context card starts collapsed with selected text', () => {
  const { callbacks, elements } = createRendererHarness();

  callbacks.showToolbar({
    text: 'First line\nSecond line\nThird line',
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

  assert.equal(elements['chat-context-text'].value, 'First line\nSecond line\nThird line');
  assert.equal(elements['chat-context'].classList.contains('context-collapsed'), true);
  assert.equal(elements['chat-context'].classList.contains('context-expanded'), false);
  assert.equal(elements['chat-context-text'].readOnly, false);
  assert.equal(elements['chat-context-clear'].classList.contains('hidden'), false);
  assert.equal(elements['chat-context-lock'].classList.contains('hidden'), true);
});
```

- [ ] **Step 2: Add a test for expand and collapse**

Append this test:

```js
test('chat context card toggles expanded state before first send', () => {
  const { callbacks, elements } = createRendererHarness();

  callbacks.showToolbar({
    text: 'Selected paragraph',
    settings: { translationEnabled: true, aiChatEnabled: true },
    pending: false
  });
  elements['btn-chat'].dispatchEvent('click');

  elements['chat-context-toggle'].dispatchEvent('click');
  assert.equal(elements['chat-context'].classList.contains('context-expanded'), true);
  assert.equal(elements['chat-context-toggle'].getAttribute('aria-expanded'), 'true');

  elements['chat-context-toggle'].dispatchEvent('click');
  assert.equal(elements['chat-context'].classList.contains('context-collapsed'), true);
  assert.equal(elements['chat-context-toggle'].getAttribute('aria-expanded'), 'false');
});
```

- [ ] **Step 3: Add a test for clearing context before first send**

Append this test:

```js
test('chat context can be cleared before first send', () => {
  const { callbacks, elements } = createRendererHarness();

  callbacks.showToolbar({
    text: 'Selected paragraph',
    settings: { translationEnabled: true, aiChatEnabled: true },
    pending: false
  });
  elements['btn-chat'].dispatchEvent('click');
  elements['chat-context-clear'].dispatchEvent('click');

  assert.equal(elements['chat-context-text'].value, '');
  assert.equal(elements['chat-context'].classList.contains('context-empty'), true);
  assert.equal(elements['chat-context-text'].placeholder, 'Normal chat - no selected text context');
});
```

- [ ] **Step 4: Add a test for locking context on first send**

Append this test:

```js
test('first chat send freezes selected context and sends that context to main process', () => {
  const { callbacks, calls, elements } = createRendererHarness();

  callbacks.showToolbar({
    text: 'Original selected text',
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
  elements['chat-context-text'].value = 'Edited selected text';
  elements['chat-context-text'].dispatchEvent('input');
  elements['chat-input'].value = 'Explain this';
  elements['chat-send-btn'].dispatchEvent('click');

  const sendCall = calls.find(call => call.type === 'aiChatSend');
  assert.equal(sendCall.selectedText, 'Edited selected text');
  assert.equal(sendCall.messages.at(-1).content, 'Explain this');
  assert.equal(elements['chat-context-text'].readOnly, true);
  assert.equal(elements['chat-context-clear'].classList.contains('hidden'), true);
  assert.equal(elements['chat-context-lock'].classList.contains('hidden'), false);
});
```

- [ ] **Step 5: Add a test for new selection reset**

Append this test:

```js
test('new selected text resets context card after a frozen chat', () => {
  const { callbacks, elements } = createRendererHarness();

  callbacks.showToolbar({
    text: 'First selection',
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
  elements['chat-input'].value = 'Question';
  elements['chat-send-btn'].dispatchEvent('click');

  callbacks.showToolbar({
    text: 'Second selection',
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

  assert.equal(elements['chat-context-text'].value, 'Second selection');
  assert.equal(elements['chat-context-text'].readOnly, false);
  assert.equal(elements['chat-context-clear'].classList.contains('hidden'), false);
  assert.equal(elements['chat-context-lock'].classList.contains('hidden'), true);
  assert.equal(elements['chat-context'].classList.contains('context-collapsed'), true);
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run:

```bash
npm test -- tests/floating-renderer-ui.test.js
```

Expected: FAIL because `chat-context-toggle`, expanded/collapsed classes, and lock behavior are not implemented yet.

### Task 3: Update Floating Chat Markup

**Files:**
- Modify: `src/renderer/floating/index.html`
- Test: `tests/floating-renderer-ui.test.js`

- [ ] **Step 1: Replace the `#chat-context` block**

In `src/renderer/floating/index.html`, replace the current `<div id="chat-context">...</div>` with this exact block:

```html
<div id="chat-context" class="context-collapsed">
  <span id="chat-context-icon" aria-hidden="true">📎</span>
  <div id="chat-context-body">
    <div id="chat-context-header">
      <span id="chat-context-label">Selected text</span>
      <span id="chat-context-status" class="hidden">No selected text context</span>
      <button id="chat-context-toggle" type="button" title="Expand selected text" aria-label="Expand selected text" aria-expanded="false">⌄</button>
      <button id="chat-context-clear" type="button" title="Clear selected text context" aria-label="Clear selected text context">×</button>
      <span id="chat-context-lock" class="hidden">Locked</span>
    </div>
    <textarea id="chat-context-text" rows="2" spellcheck="false" aria-label="Selected text context"></textarea>
  </div>
</div>
```

- [ ] **Step 2: Run renderer tests**

Run:

```bash
npm test -- tests/floating-renderer-ui.test.js
```

Expected: still FAIL because script and CSS behavior are not implemented.

- [ ] **Step 3: Commit markup**

```bash
git add src/renderer/floating/index.html tests/floating-renderer-ui.test.js
git commit -m "feat: add floating selected text card controls"
```

### Task 4: Implement Context Card State In Floating Script

**Files:**
- Modify: `src/renderer/floating/script.js`
- Test: `tests/floating-renderer-ui.test.js`

- [ ] **Step 1: Add DOM references and state**

Near the existing chat context DOM references, add:

```js
const chatContextCard = document.getElementById('chat-context');
const chatContextToggle = document.getElementById('chat-context-toggle');
const chatContextStatus = document.getElementById('chat-context-status');
```

Near the existing state variables, add:

```js
let isChatContextExpanded = false;
```

- [ ] **Step 2: Add normalization and toggle helpers**

Add these functions near `updateChatContextUI`:

```js
function normalizeChatContext(text) {
  return String(text || '').trim();
}

function setChatContextExpanded(expanded) {
  isChatContextExpanded = Boolean(expanded);
  updateChatContextUI();
}

function getDisplayedChatContext() {
  return isChatContextFrozen ? activeChatContext : chatContext;
}
```

- [ ] **Step 3: Add the toggle click handler**

After the clear button handler, add:

```js
chatContextToggle.addEventListener('click', (e) => {
  window.api.notifyInteraction();
  e.stopPropagation();
  setChatContextExpanded(!isChatContextExpanded);
});
```

- [ ] **Step 4: Update the input handler**

Replace the existing `chatContextText.addEventListener('input', ...)` body with:

```js
chatContextText.addEventListener('input', () => {
  if (isChatContextFrozen) return;
  chatContext = chatContextText.value;
  updateChatContextUI();
});
```

This keeps exact user edits before send, including internal line breaks.

- [ ] **Step 5: Replace the clear handler body**

Use this body for `chatContextClear.addEventListener('click', ...)`:

```js
chatContextClear.addEventListener('click', (e) => {
  window.api.notifyInteraction();
  e.stopPropagation();
  if (isChatContextFrozen) return;
  chatContext = '';
  chatContextText.value = '';
  setChatContextExpanded(false);
  updateChatContextUI();
  chatContextText.focus();
});
```

- [ ] **Step 6: Freeze normalized context on first send**

Inside `sendChatMessage`, replace the first-freeze block with:

```js
if (!isChatContextFrozen) {
  activeChatContext = normalizeChatContext(chatContextText.value);
  chatContext = activeChatContext;
  isChatContextFrozen = true;
  setChatContextExpanded(false);
  updateChatContextUI();
}
```

- [ ] **Step 7: Reset card state on each new toolbar text**

In `resetChatState`, add `isChatContextExpanded = false;` and make the full function body match this shape:

```js
function resetChatState() {
  chatMessages = [];
  chatMessages$.innerHTML = '';
  chatContext = currentText;
  activeChatContext = '';
  isChatContextFrozen = false;
  isChatContextExpanded = false;
  updateChatContextUI();
  chatInput.value = '';
  isStreaming = false;
  chatSendBtn.disabled = false;
}
```

- [ ] **Step 8: Replace `updateChatContextUI`**

Replace the whole function with:

```js
function updateChatContextUI() {
  const displayContext = getDisplayedChatContext();
  if (chatContextText.value !== displayContext) {
    chatContextText.value = displayContext;
  }

  const isEmpty = normalizeChatContext(displayContext) === '';
  chatContextText.readOnly = isChatContextFrozen;
  chatContextText.placeholder = isEmpty ? 'Normal chat - no selected text context' : '';

  chatContextCard.classList.toggle('context-empty', isEmpty);
  chatContextCard.classList.toggle('context-frozen', isChatContextFrozen);
  chatContextCard.classList.toggle('context-expanded', isChatContextExpanded);
  chatContextCard.classList.toggle('context-collapsed', !isChatContextExpanded);

  chatContextClear.classList.toggle('hidden', isChatContextFrozen || isEmpty);
  chatContextLock.classList.toggle('hidden', !isChatContextFrozen);
  chatContextStatus.classList.toggle('hidden', !isEmpty);

  chatContextToggle.disabled = isChatContextFrozen || isEmpty;
  chatContextToggle.classList.toggle('hidden', isEmpty);
  chatContextToggle.textContent = isChatContextExpanded ? '⌃' : '⌄';
  chatContextToggle.title = isChatContextExpanded ? 'Collapse selected text' : 'Expand selected text';
  chatContextToggle.setAttribute('aria-label', chatContextToggle.title);
  chatContextToggle.setAttribute('aria-expanded', String(isChatContextExpanded));
}
```

- [ ] **Step 9: Run renderer tests**

Run:

```bash
npm test -- tests/floating-renderer-ui.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit script changes**

```bash
git add src/renderer/floating/script.js tests/floating-renderer-ui.test.js
git commit -m "feat: manage floating selected text card state"
```

### Task 5: Style The Compact Reference Card

**Files:**
- Modify: `src/renderer/floating/style.css`
- Test: manual visual verification plus renderer tests

- [ ] **Step 1: Replace the context card CSS block**

In `src/renderer/floating/style.css`, replace the rules from `#chat-context {` through `#chat-context.context-empty #chat-context-text { ... }` with this block:

```css
#chat-context {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  flex-shrink: 0;
}

#chat-context-icon {
  font-size: 13px;
  line-height: 20px;
  flex-shrink: 0;
}

#chat-context-body {
  flex: 1;
  min-width: 0;
}

#chat-context-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  min-height: 20px;
}

#chat-context-label,
#chat-context-lock,
#chat-context-status {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0;
  color: var(--text-dim);
}

#chat-context-status {
  margin-left: auto;
  text-transform: none;
}

#chat-context-toggle,
#chat-context-clear {
  width: 22px;
  height: 20px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 13px;
  line-height: 18px;
  flex-shrink: 0;
}

#chat-context-toggle {
  margin-left: auto;
}

#chat-context-toggle:hover,
#chat-context-clear:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--border);
}

#chat-context-toggle:disabled {
  cursor: default;
  opacity: 0.45;
}

#chat-context-text {
  width: 100%;
  resize: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.18);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
  padding: 7px 8px;
  outline: none;
  overflow: hidden;
}

#chat-context.context-collapsed #chat-context-text {
  min-height: 50px;
  max-height: 50px;
}

#chat-context.context-expanded #chat-context-text {
  min-height: 118px;
  max-height: 118px;
  overflow-y: auto;
}

#chat-context-text:focus {
  border-color: rgba(108, 99, 255, 0.4);
}

#chat-context-text::placeholder {
  color: var(--text-dim);
}

#chat-context.context-frozen #chat-context-text {
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-dim);
}

#chat-context.context-empty #chat-context-text {
  min-height: 38px;
  max-height: 38px;
  color: var(--text-dim);
}
```

- [ ] **Step 2: Run renderer tests**

Run:

```bash
npm test -- tests/floating-renderer-ui.test.js
```

Expected: PASS.

- [ ] **Step 3: Start the app for visual verification**

Run:

```bash
npm start
```

Manual checks:

```text
1. Select a 3+ line paragraph and open AI Chat.
2. Confirm the context card shows only two lines by default.
3. Click expand and confirm a larger editable area appears.
4. Edit the selected text and send a message.
5. Confirm the card becomes read-only, collapsed, and locked.
6. Select different text and open AI Chat again.
7. Confirm the card resets to editable collapsed state with the new text.
```

- [ ] **Step 4: Commit styles**

```bash
git add src/renderer/floating/style.css
git commit -m "style: polish floating selected text card"
```

### Task 6: Full Verification And Reviewer Handoff

**Files:**
- Create: `docs/superpowers/verification/2026-06-14-issue-5.md`

- [ ] **Step 1: Run automated verification**

Run:

```bash
npm test -- tests/floating-renderer-ui.test.js
npm test
```

Expected: both commands PASS.

- [ ] **Step 2: Capture visual evidence**

Take screenshots during `npm start` and save them under `docs/superpowers/verification/issue-5/`:

```text
collapsed.png
expanded.png
empty.png
locked.png
reset-new-selection.png
```

Use absolute paths in the verification file so the reviewer can open them from the Codex app.

- [ ] **Step 3: Create the verification handoff file**

Create `docs/superpowers/verification/2026-06-14-issue-5.md`:

```markdown
# Issue 5 Verification

## Automated Commands

- `npm test -- tests/floating-renderer-ui.test.js`
  - Result: PASS
- `npm test`
  - Result: PASS

## Manual Visual Checks

| Scenario | Result | Evidence |
| --- | --- | --- |
| Collapsed two-line selected text card | PASS | `docs/superpowers/verification/issue-5/collapsed.png` |
| Expanded editable context card | PASS | `docs/superpowers/verification/issue-5/expanded.png` |
| Cleared context empty state | PASS | `docs/superpowers/verification/issue-5/empty.png` |
| Locked context after first send | PASS | `docs/superpowers/verification/issue-5/locked.png` |
| New selection resets card | PASS | `docs/superpowers/verification/issue-5/reset-new-selection.png` |

## Behavior Notes

- Automated test value for first `aiChatSend` selectedText: `Edited selected text`
- Manual clear-before-send result: empty selectedText sent
- Manual locked-state result: clear button hidden and textarea read-only

## Changed Files For Review

- `src/renderer/floating/index.html`
- `src/renderer/floating/script.js`
- `src/renderer/floating/style.css`
- `tests/floating-renderer-ui.test.js`
```

- [ ] **Step 4: Commit verification**

```bash
git add docs/superpowers/verification/2026-06-14-issue-5.md docs/superpowers/verification/issue-5
git commit -m "docs: record floating context card verification"
```
