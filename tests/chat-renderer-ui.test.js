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
