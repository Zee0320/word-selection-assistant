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
    },
    focus() {}
  };
}

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
