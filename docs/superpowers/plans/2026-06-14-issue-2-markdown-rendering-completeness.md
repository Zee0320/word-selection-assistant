# Issue 2 Markdown Rendering Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI responses in floating translation/chat and standalone AI Chat must render the agreed Markdown subset completely and consistently.

**Architecture:** Keep Markdown parsing centralized in `src/main/markdown-renderer.js` through the existing synchronous `parse-markdown` IPC. Add contract tests for the supported CommonMark/GFM subset, then verify both renderer surfaces call the shared parser during normal and streamed rendering.

**Tech Stack:** `marked`, Electron IPC, floating renderer, standalone chat renderer, Node `node:test`, renderer `vm` harness tests.

---

## Requirements From Clarification

Supported Markdown subset:

- Headings.
- Paragraphs.
- Bold and italic.
- Links.
- Inline code.
- Fenced code blocks.
- Blockquotes.
- Ordered, unordered, and nested lists.
- Tables.
- Horizontal rules.

Streaming requirement:

- Intermediate streaming output may be imperfect while chunks are incomplete.
- Final output after stream completion must render correctly.

Security requirement:

- Raw HTML must stay escaped and must not execute script tags, image handlers, or arbitrary HTML.

## Files To Create Or Modify

- Modify: `tests/markdown-renderer.test.js`
  - Expand parser contract tests for every supported Markdown construct.
- Modify: `src/main/markdown-renderer.js`
  - Keep one shared parser with GFM enabled and raw HTML escaped.
- Modify: `tests/floating-renderer-ui.test.js`
  - Verify floating translation and chat use `window.api.parseMarkdown`.
- Create: `tests/chat-renderer-markdown.test.js`
  - Verify standalone AI Chat uses `window.api.parseMarkdown` for stored messages and final streamed messages.
- Modify: `src/renderer/floating/script.js`
  - Ensure final stream completion re-renders the full raw Markdown.
- Modify: `src/renderer/chat/script.js`
  - Ensure final stream completion re-renders the full raw Markdown.
- Modify: `src/renderer/floating/style.css`
  - Add compact table and horizontal-rule styles for floating Markdown.
- Modify: `src/renderer/chat/style.css`
  - Add horizontal-rule styles and keep table/code styles readable.
- Create: `docs/superpowers/verification/2026-06-14-issue-2.md`
  - Required reviewer handoff with parser test output and visual checks.

## Acceptance Contract

The implementation is complete only when all of these are true:

- `npm test -- tests/markdown-renderer.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-markdown.test.js` passes.
- `renderMarkdownToHtml` escapes raw HTML.
- Floating translation streamed output calls `parseMarkdown` for chunks and on final done.
- Floating AI chat streamed output calls `parseMarkdown` for chunks and on final done.
- Standalone AI Chat stored messages and final streamed replies call `parseMarkdown`.
- Tables do not overflow the standalone message bubble without horizontal scrolling.
- Floating tables remain readable in a narrow panel.
- `docs/superpowers/verification/2026-06-14-issue-2.md` includes screenshots or absolute paths for standalone and floating Markdown examples.

### Task 1: Expand Shared Markdown Parser Contract Tests

**Files:**
- Modify: `tests/markdown-renderer.test.js`
- Modify: `src/main/markdown-renderer.js`

- [ ] **Step 1: Replace or expand the supported subset test**

In `tests/markdown-renderer.test.js`, add this test. Keep the existing raw HTML escaping test.

```js
test('renders the supported CommonMark and GFM subset', () => {
  const html = renderMarkdownToHtml([
    '# H1',
    '## H2',
    '',
    'Paragraph with **bold**, *italic*, `inline code`, and [link](https://example.com).',
    '',
    '> quoted text',
    '',
    '- Parent',
    '  - Child',
    '',
    '1. First',
    '2. Second',
    '',
    '```js',
    'console.log("ok");',
    '```',
    '',
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | 1 |',
    '',
    '---'
  ].join('\n'));

  assert.match(html, /<h1[^>]*>H1<\/h1>/);
  assert.match(html, /<h2[^>]*>H2<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>inline code<\/code>/);
  assert.match(html, /<a href="https:\/\/example\.com">link<\/a>/);
  assert.match(html, /<blockquote>\s*<p>quoted text<\/p>\s*<\/blockquote>/);
  assert.match(html, /<ul>\s*<li>Parent\s*<ul>\s*<li>Child<\/li>\s*<\/ul>\s*<\/li>\s*<\/ul>/);
  assert.match(html, /<ol>\s*<li>First<\/li>\s*<li>Second<\/li>\s*<\/ol>/);
  assert.match(html, /<pre><code class="language-js">console\.log\(&quot;ok&quot;\);\n<\/code><\/pre>/);
  assert.match(html, /<table>/);
  assert.match(html, /<th>Name<\/th>/);
  assert.match(html, /<td>Alpha<\/td>/);
  assert.match(html, /<hr>/);
});
```

- [ ] **Step 2: Add a final streamed Markdown test**

Add this test:

```js
test('renders final accumulated streamed Markdown split across incomplete chunks', () => {
  const chunks = [
    '## Streamed',
    ' result\n\n```js\ncon',
    'sole.log(1)\n```\n\n',
    '| A | B |\n| - | - |\n',
    '| one | two |\n\n',
    '[Open',
    'AI](https://openai.com)\n\n---'
  ];

  const html = renderMarkdownToHtml(chunks.join(''));

  assert.match(html, /<h2[^>]*>Streamed result<\/h2>/);
  assert.match(html, /<pre><code class="language-js">console\.log\(1\)\n<\/code><\/pre>/);
  assert.match(html, /<table>/);
  assert.match(html, /<td>one<\/td>/);
  assert.match(html, /<a href="https:\/\/openai\.com">OpenAI<\/a>/);
  assert.match(html, /<hr>/);
});
```

- [ ] **Step 3: Run parser tests**

Run:

```bash
npm test -- tests/markdown-renderer.test.js
```

Expected: PASS if the current parser already supports the subset. If it fails, continue to Step 4.

- [ ] **Step 4: Keep the shared renderer implementation minimal**

If tests fail due to parser configuration, update `src/main/markdown-renderer.js` so it stays equivalent to this:

```js
const { Marked } = require('marked');

const markdown = new Marked({
  async: false,
  breaks: false,
  gfm: true
});

function escapeRawHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMarkdownToHtml(text) {
  if (!text) return '';
  return markdown.parse(escapeRawHtml(text));
}

module.exports = {
  renderMarkdownToHtml
};
```

- [ ] **Step 5: Run parser tests again**

Run:

```bash
npm test -- tests/markdown-renderer.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/markdown-renderer.test.js src/main/markdown-renderer.js
git commit -m "test: cover supported markdown subset"
```

### Task 2: Verify Floating Renderer Uses The Shared Parser

**Files:**
- Modify: `tests/floating-renderer-ui.test.js`
- Modify: `src/renderer/floating/script.js`

- [ ] **Step 1: Extend the floating harness parse stub**

In `createRendererHarness`, replace:

```js
parseMarkdown(text) { return text; }
```

with:

```js
parseMarkdown(text) {
  calls.push({ type: 'parseMarkdown', text });
  return `<p>${text}</p>`;
}
```

Also expose stream callbacks if they are not already stored:

```js
onTranslateChunk(cb) { callbacks.translateChunk = cb; },
onTranslateDone(cb) { callbacks.translateDone = cb; },
onAiChatChunk(cb) { callbacks.aiChatChunk = cb; },
onAiChatDone(cb) { callbacks.aiChatDone = cb; },
```

- [ ] **Step 2: Add floating translation stream test**

Append:

```js
test('floating translation re-renders final streamed markdown through shared parser', () => {
  const { callbacks, calls, elements } = createRendererHarness();

  callbacks.showToolbar({
    text: 'Translate this sentence.',
    settings: {
      translationEnabled: true,
      aiChatEnabled: true,
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'key',
      translateModel: 'model'
    },
    pending: false
  });

  elements['btn-translate'].dispatchEvent('click');
  callbacks.translateChunk('## Title\n');
  callbacks.translateChunk('\n| A | B |\n| - | - |\n| 1 | 2 |');
  callbacks.translateDone();

  const parseCalls = calls.filter(call => call.type === 'parseMarkdown');
  assert.equal(parseCalls.at(-1).text, '## Title\n\n| A | B |\n| - | - |\n| 1 | 2 |');
});
```

- [ ] **Step 3: Add floating AI chat stream test**

Append:

```js
test('floating chat re-renders final streamed markdown through shared parser', () => {
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
  elements['chat-input'].value = 'Answer in markdown';
  elements['chat-send-btn'].dispatchEvent('click');
  callbacks.aiChatChunk('```js\ncon');
  callbacks.aiChatChunk('sole.log(1)\n```');
  callbacks.aiChatDone();

  const parseCalls = calls.filter(call => call.type === 'parseMarkdown');
  assert.equal(parseCalls.at(-1).text, '```js\nconsole.log(1)\n```');
});
```

- [ ] **Step 4: Run tests to verify failure or pass**

Run:

```bash
npm test -- tests/floating-renderer-ui.test.js
```

Expected: FAIL if final done handlers do not re-render the accumulated raw Markdown. PASS is acceptable if current code already does this.

- [ ] **Step 5: Ensure final translation stream re-renders raw text**

In `src/renderer/floating/script.js`, update `window.api.onTranslateDone`:

```js
window.api.onTranslateDone(() => {
  sentenceLoading.classList.add('hidden');
  const rawText = sentenceOutput.getAttribute('data-raw') || '';
  sentenceOutput.innerHTML = window.api.parseMarkdown(rawText);
  resizePanelForContent();
});
```

- [ ] **Step 6: Ensure final chat stream re-renders raw text**

In `window.api.onAiChatDone`, inside the streaming element block, use:

```js
const rawText = lastMsg.getAttribute('data-raw') || lastMsg.textContent;
lastMsg.innerHTML = window.api.parseMarkdown(rawText);
chatMessages.push({ role: 'assistant', content: rawText });
```

- [ ] **Step 7: Run floating tests**

Run:

```bash
npm test -- tests/floating-renderer-ui.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tests/floating-renderer-ui.test.js src/renderer/floating/script.js
git commit -m "fix: render final floating streamed markdown"
```

### Task 3: Verify Standalone Chat Markdown Rendering

**Files:**
- Create: `tests/chat-renderer-markdown.test.js`
- Modify: `src/renderer/chat/script.js`

- [ ] **Step 1: Create standalone Markdown harness test**

Create `tests/chat-renderer-markdown.test.js`:

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
    scrollHeight: 80,
    scrollTop: 0,
    setAttribute() {},
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    querySelector(selector) {
      if (selector === '.message.streaming') {
        return this.children.find(child => child.classList?.contains('streaming')) || null;
      }
      if (selector === '.empty-state') {
        return this.children.find(child => child.className === 'empty-state') || null;
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
    }
  };
}

test('standalone chat parses stored and final streamed markdown through shared parser', async () => {
  const ids = [
    'conversation-list',
    'history-state',
    'conversation-title',
    'conversation-meta',
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
    createElement(id, id === 'error-banner' ? 'hidden' : '')
  ]));
  const callbacks = {};
  const calls = [];
  const api = {
    getSettings: async () => ({
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'key',
      chatModel: 'model'
    }),
    getChatState: async () => ({
      saveHistory: true,
      activeConversationId: 'conv-1',
      conversations: [{
        id: 'conv-1',
        title: 'Markdown',
        createdAt: '2026-06-14T00:00:00.000Z',
        updatedAt: '2026-06-14T00:00:00.000Z',
        messages: [{ role: 'assistant', content: '## Stored\n\n| A | B |\n| - | - |\n| 1 | 2 |' }]
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
    sendChat(conversationId) { calls.push({ type: 'sendChat', conversationId }); },
    onChatChunk(cb) { callbacks.chatChunk = cb; },
    onChatDone(cb) { callbacks.chatDone = cb; },
    onChatError() {},
    onPrefillChatInput() {},
    onSettingsUpdated() {},
    openSettings() {},
    parseMarkdown(text) {
      calls.push({ type: 'parseMarkdown', text });
      return `<parsed>${text}</parsed>`;
    }
  };
  const document = {
    getElementById(id) { return elements[id]; },
    createElement(tagName) { return createElement(tagName); }
  };
  const context = vm.createContext({
    window: { api },
    document,
    console,
    setTimeout: fn => fn(),
    clearTimeout
  });
  const scriptPath = path.join(__dirname, '..', 'src', 'renderer', 'chat', 'script.js');
  const script = fs.readFileSync(scriptPath, 'utf8');
  vm.runInContext(script, context, { filename: scriptPath });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.some(call => call.type === 'parseMarkdown' && call.text.startsWith('## Stored')), true);

  elements['chat-input'].value = 'Stream markdown';
  elements.composer.dispatchEvent('submit');
  callbacks.chatChunk({ conversationId: 'conv-1', chunk: '```js\ncon' });
  callbacks.chatChunk({ conversationId: 'conv-1', chunk: 'sole.log(1)\n```' });
  await callbacks.chatDone({ conversationId: 'conv-1' });

  assert.equal(calls.at(-1).type, 'parseMarkdown');
  assert.equal(calls.at(-1).text, '```js\nconsole.log(1)\n```');
});
```

- [ ] **Step 2: Run test to verify failure or pass**

Run:

```bash
npm test -- tests/chat-renderer-markdown.test.js
```

Expected: FAIL if final streamed content is not re-rendered on done. PASS is acceptable if current code already satisfies this.

- [ ] **Step 3: Ensure standalone finish re-renders final content**

In `src/renderer/chat/script.js`, inside `finishStreaming`, before persisting the assistant message, make sure the raw `streamingText` is the stored content and the visible message is rendered from that raw content. The final assistant message block should use:

```js
const assistantMessage = {
  id: createId('msg'),
  role: 'assistant',
  content: streamingText,
  createdAt: nowIso()
};
```

The visible streaming element is already rendered through `renderStreamingMessage(streamingText)`. If the test still fails, update the end of `finishStreaming` to call `render()` after `streamingText` is cleared only after the assistant message has been persisted.

- [ ] **Step 4: Run standalone Markdown test**

Run:

```bash
npm test -- tests/chat-renderer-markdown.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/chat-renderer-markdown.test.js src/renderer/chat/script.js
git commit -m "test: assert standalone chat markdown rendering"
```

### Task 4: Add Missing Markdown Styles

**Files:**
- Modify: `src/renderer/floating/style.css`
- Modify: `src/renderer/chat/style.css`

- [ ] **Step 1: Add floating table and horizontal rule styles**

In `src/renderer/floating/style.css`, add after existing `.markdown-body a:hover`:

```css
.markdown-body table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  margin: 8px 0;
}

.markdown-body th,
.markdown-body td {
  border: 1px solid var(--border);
  padding: 4px 6px;
  text-align: left;
  white-space: nowrap;
}

.markdown-body th {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-weight: 600;
}

.markdown-body hr {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 10px 0;
}
```

- [ ] **Step 2: Add standalone horizontal rule styles**

In `src/renderer/chat/style.css`, add near the existing `.message table` rules:

```css
.message hr {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 12px 0;
}
```

If `.message table` is not horizontally scrollable, update it to:

```css
.message table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  margin: 10px 0;
}
```

- [ ] **Step 3: Run syntax and tests**

Run:

```bash
npm test -- tests/markdown-renderer.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-markdown.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit styles**

```bash
git add src/renderer/floating/style.css src/renderer/chat/style.css
git commit -m "style: support complete markdown subset"
```

### Task 5: Full Verification And Reviewer Handoff

**Files:**
- Create: `docs/superpowers/verification/2026-06-14-issue-2.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/markdown-renderer.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-markdown.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Manual visual verification**

Use this exact Markdown sample in standalone AI Chat and in floating AI Chat:

````markdown
# Heading

Paragraph with **bold**, *italic*, `inline code`, and [link](https://example.com).

> quoted text

- Parent
  - Child

1. First
2. Second

```js
console.log("ok");
```

| Name | Value |
| --- | --- |
| Alpha | 1 |

---
````

Manual checks:

```text
1. Headings render with visible hierarchy.
2. Bold, italic, link, and inline code render inline.
3. Fenced code keeps line breaks and monospace font.
4. Nested unordered list is nested, not flattened.
5. Ordered list numbers are visible.
6. Table cells and headers are visible.
7. Horizontal rule is visible.
8. Raw HTML typed as <script>alert(1)</script> appears escaped, not executed.
```

- [ ] **Step 4: Save screenshots**

Save screenshots under `docs/superpowers/verification/issue-2/`:

```text
standalone-markdown.png
floating-chat-markdown.png
floating-translation-markdown.png
html-escaped.png
```

- [ ] **Step 5: Create verification file**

Create `docs/superpowers/verification/2026-06-14-issue-2.md`:

```markdown
# Issue 2 Verification

## Automated Commands

- `npm test -- tests/markdown-renderer.test.js tests/floating-renderer-ui.test.js tests/chat-renderer-markdown.test.js`
  - Result: PASS
- `npm test`
  - Result: PASS

## Manual Visual Evidence

| Surface | Result | Evidence |
| --- | --- | --- |
| Standalone AI Chat Markdown | PASS | `docs/superpowers/verification/issue-2/standalone-markdown.png` |
| Floating AI Chat Markdown | PASS | `docs/superpowers/verification/issue-2/floating-chat-markdown.png` |
| Floating Translation Markdown | PASS | `docs/superpowers/verification/issue-2/floating-translation-markdown.png` |
| Escaped raw HTML | PASS | `docs/superpowers/verification/issue-2/html-escaped.png` |

## Supported Subset Confirmed

- Headings: PASS
- Paragraphs: PASS
- Bold and italic: PASS
- Links: PASS
- Inline code: PASS
- Fenced code: PASS
- Blockquotes: PASS
- Ordered, unordered, and nested lists: PASS
- Tables: PASS
- Horizontal rules: PASS
- Raw HTML escaped: PASS

## Changed Files For Review

- `src/main/markdown-renderer.js`
- `src/renderer/floating/script.js`
- `src/renderer/chat/script.js`
- `src/renderer/floating/style.css`
- `src/renderer/chat/style.css`
- `tests/markdown-renderer.test.js`
- `tests/floating-renderer-ui.test.js`
- `tests/chat-renderer-markdown.test.js`
```

- [ ] **Step 6: Commit verification**

```bash
git add docs/superpowers/verification/2026-06-14-issue-2.md docs/superpowers/verification/issue-2
git commit -m "docs: record markdown rendering verification"
```
