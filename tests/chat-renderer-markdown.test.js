const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { renderMarkdownToHtml } = require('../src/main/markdown-renderer');

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
    getAttribute() { return null; },
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
    },
    focus() {},
    remove() { this.children = []; }
  };
}

test('standalone chat parses stored and final streamed markdown through shared parser', async () => {
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
        messages: [{
          role: 'assistant',
          content: '## Stored\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n[unsafe](javascript:alert(1))'
        }]
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
    onChatStateUpdated() {},
    onPrefillChatInput() {},
    onSettingsUpdated() {},
    openSettings() {},
    parseMarkdown(text) {
      calls.push({ type: 'parseMarkdown', text });
      return renderMarkdownToHtml(text);
    }
  };
  const document = {
    getElementById(id) { return elements[id]; },
    createElement(tagName) { return createElement(tagName); },
    createTextNode(text) { return { textContent: text, nodeValue: text }; }
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
  const storedMessage = elements.messages.children[0];
  assert.match(storedMessage.innerHTML, />unsafe</);
  assert.doesNotMatch(storedMessage.innerHTML, /href="javascript:/i);

  elements['chat-input'].value = 'Stream markdown';
  elements.composer.dispatchEvent('submit');
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  callbacks.chatChunk({ conversationId: 'conv-1', chunk: '```js\ncon' });
  callbacks.chatChunk({ conversationId: 'conv-1', chunk: 'sole.log(1)\n```\n\n[unsafe](javascript:alert(1))' });
  const streamingMessage = elements.messages.querySelector('.message.streaming');
  assert.match(streamingMessage.innerHTML, />unsafe</);
  assert.doesNotMatch(streamingMessage.innerHTML, /href="javascript:/i);
  callbacks.chatDone({ conversationId: 'conv-1' });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.at(-1).type, 'parseMarkdown');
  assert.equal(calls.at(-1).text, '```js\nconsole.log(1)\n```\n\n[unsafe](javascript:alert(1))');
});
