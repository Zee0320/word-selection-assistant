const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList(initial = '') {
  let classes = new Set(initial.split(/\s+/).filter(Boolean));

  return {
    add(...names) {
      names.forEach(name => classes.add(name));
    },
    remove(...names) {
      names.forEach(name => classes.delete(name));
    },
    contains(name) {
      return classes.has(name);
    },
    toggle(name, force) {
      const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
      if (shouldAdd) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
      return shouldAdd;
    },
    set(value) {
      classes = new Set(String(value || '').split(/\s+/).filter(Boolean));
    },
    toString() {
      return [...classes].join(' ');
    }
  };
}

function matchesSelector(element, selector) {
  if (!selector.startsWith('.')) return false;
  const classes = selector.slice(1).split('.').filter(Boolean);
  return classes.every(name => element.classList?.contains(name));
}

function findChild(element, selector) {
  for (const child of element.children || []) {
    if (matchesSelector(child, selector)) return child;
    const nested = findChild(child, selector);
    if (nested) return nested;
  }
  return null;
}

function createElement(id, initialClass = '') {
  const listeners = new Map();
  const classList = createClassList(initialClass);
  let parentNode = null;

  return {
    id,
    style: {},
    classList,
    attributes: {},
    children: [],
    value: '',
    textContent: '',
    innerHTML: '',
    scrollHeight: 100,
    clientHeight: 50,
    scrollTop: 0,
    disabled: false,
    readOnly: false,
    placeholder: '',
    title: '',
    type: '',
    get parentNode() {
      return parentNode;
    },
    set parentNode(value) {
      parentNode = value;
    },
    get className() {
      return classList.toString();
    },
    set className(value) {
      classList.set(value);
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatchEvent(type, event = {}) {
      const nextEvent = {
        stopPropagation() {},
        preventDefault() {},
        ...event
      };
      for (const listener of listeners.get(type) || []) {
        listener(nextEvent);
      }
    },
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      this.lastElementChild = child;
      return child;
    },
    append(...nodes) {
      nodes.forEach(node => {
        this.children.push(node);
        node.parentNode = this;
      });
      if (nodes.length > 0) {
        this.lastElementChild = nodes[nodes.length - 1];
      }
    },
    replaceChildren(...newChildren) {
      this.children = newChildren;
      newChildren.forEach(child => {
        child.parentNode = this;
      });
      this.lastElementChild = newChildren[newChildren.length - 1] || null;
    },
    remove() {
      if (!parentNode) return;
      parentNode.children = parentNode.children.filter(child => child !== this);
      parentNode.lastElementChild = parentNode.children[parentNode.children.length - 1] || null;
      parentNode = null;
    },
    closest() {
      return null;
    },
    focus() {},
    querySelector(selector) {
      return findChild(this, selector);
    }
  };
}

function createChatRendererHarness(search = '', options = {}) {
  const ids = [
    'conversation-list',
    'history-state',
    'conversation-title',
    'conversation-meta',
    'messages',
    'conversation-context',
    'conversation-context-text',
    'new-chat',
    'delete-chat',
    'open-floating-chat',
    'composer',
    'chat-input',
    'send-chat',
    'error-banner'
  ];
  const elements = Object.fromEntries(ids.map(id => [
    id,
    createElement(id, id === 'error-banner' || id === 'conversation-context' ? 'hidden' : '')
  ]));

  const documentListeners = new Map();
  const callbacks = {};
  const calls = [];

  const document = {
    getElementById(id) {
      return elements[id];
    },
    querySelector(selector) {
      return null;
    },
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    createElement(tagName) {
      return createElement(tagName);
    },
    createTextNode(text) {
      return { textContent: text, nodeValue: text };
    }
  };

  const parseMarkdownCalls = [];

  const api = {
    getSettings: async () => ({
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'test-key',
      chatModel: 'gpt-4',
      connectionMode: 'local'
    }),
    getChatState: async () => options.chatState || ({
      saveHistory: false,
      conversations: [],
      activeConversationId: ''
    }),
    selectConversation: async () => ({
      saveHistory: true,
      conversations: [],
      activeConversationId: ''
    }),
    newConversation: async () => ({
      saveHistory: true,
      conversations: [],
      activeConversationId: ''
    }),
    deleteConversation: async () => ({
      saveHistory: true,
      conversations: [],
      activeConversationId: ''
    }),
    saveConversation: async (conv) => {
      calls.push({ type: 'saveConversation', conversation: conv });
      return {
        saveHistory: true,
        conversations: [conv],
        activeConversationId: conv.id
      };
    },
    sendChat(conversationId, messages, selectedContext) {
      calls.push({ type: 'sendChat', conversationId, messages, selectedContext });
    },
    parseMarkdown(text) {
      parseMarkdownCalls.push(text);
      return text;
    },
    openFloatingConversation(conversation) {
      calls.push({ type: 'openFloatingConversation', conversation });
    },
    openSettings() {
      calls.push('openSettings');
    },
    onChatChunk(cb) { callbacks.chatChunk = cb; },
    onChatDone(cb) { callbacks.chatDone = cb; },
    onChatError(cb) { callbacks.chatError = cb; },
    onSettingsUpdated(cb) { callbacks.settingsUpdated = cb; },
    onPrefillChatInput(cb) { callbacks.prefillChatInput = cb; }
  };

  // Mock window.location.search
  const location = {
    search
  };

  const context = vm.createContext({
    window: { api, location },
    document,
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams
  });
  const scriptPath = path.join(__dirname, '..', 'src', 'renderer', 'chat', 'script.js');
  const script = fs.readFileSync(scriptPath, 'utf8');
  vm.runInContext(script, context, { filename: scriptPath });

  return { callbacks, calls, elements, parseMarkdownCalls };
}

function waitForLoad() {
  return new Promise(resolve => setTimeout(resolve, 20));
}

test('standalone chat header includes transfer to floating window action', () => {
  const htmlPath = path.join(__dirname, '..', 'src', 'renderer', 'chat', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.match(html, /id="open-floating-chat"[\s\S]*转为浮窗/);
  assert.match(html, /aria-label="转为浮窗"/);
});

test('transfer button sends current active conversation to floating window', async () => {
  const conversation = {
    id: 'conv-active',
    title: 'Active chat',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [{ id: 'msg-1', role: 'user', content: 'Hello', createdAt: '2026-01-01T00:00:00.000Z' }]
  };
  const { calls, elements } = createChatRendererHarness('', {
    chatState: {
      saveHistory: true,
      conversations: [conversation],
      activeConversationId: conversation.id
    }
  });

  await waitForLoad();

  assert.equal(elements['open-floating-chat'].disabled, false);
  elements['open-floating-chat'].dispatchEvent('click');

  const transferCall = calls.find(call => call.type === 'openFloatingConversation');
  assert.ok(transferCall, 'openFloatingConversation should be called');
  assert.deepEqual(transferCall.conversation, conversation);
});

test('transfer to floating preserves selected context from URL', async () => {
  const conversation = {
    id: 'conv-selected',
    title: 'Selected chat',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [{ id: 'msg-1', role: 'user', content: 'Explain this', createdAt: '2026-01-01T00:00:00.000Z' }]
  };
  const { calls, elements } = createChatRendererHarness('?text=Selected%20context', {
    chatState: {
      saveHistory: true,
      conversations: [conversation],
      activeConversationId: conversation.id
    }
  });

  await waitForLoad();

  elements['open-floating-chat'].dispatchEvent('click');

  const transferCall = calls.find(call => call.type === 'openFloatingConversation');
  assert.ok(transferCall, 'openFloatingConversation should be called');
  assert.equal(transferCall.conversation.metadata.selectedContext, 'Selected context');
  assert.equal(transferCall.conversation.id, conversation.id);
  assert.equal(transferCall.conversation.messages[0].content, 'Explain this');
});

test('transfer button is disabled and no-ops while active conversation streams', async () => {
  const conversation = {
    id: 'conv-streaming',
    title: 'Streaming chat',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: []
  };
  const { calls, elements } = createChatRendererHarness('', {
    chatState: {
      saveHistory: false,
      conversations: [conversation],
      activeConversationId: conversation.id
    }
  });

  await waitForLoad();

  elements['chat-input'].value = 'Start stream';
  elements['composer'].dispatchEvent('submit');
  await waitForLoad();

  assert.equal(elements['open-floating-chat'].disabled, true);
  elements['open-floating-chat'].dispatchEvent('click');
  assert.equal(calls.some(call => call.type === 'openFloatingConversation'), false);
});

test('streaming follows bottom only until user scrolls upward', async () => {
  const conversation = {
    id: 'conv-scroll',
    title: 'Scroll chat',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [{ id: 'msg-1', role: 'user', content: 'Existing', createdAt: '2026-01-01T00:00:00.000Z' }]
  };
  const { callbacks, calls, elements } = createChatRendererHarness('', {
    chatState: {
      saveHistory: false,
      conversations: [conversation],
      activeConversationId: conversation.id
    }
  });

  await waitForLoad();

  const messages = elements.messages;
  messages.scrollHeight = 1000;
  messages.clientHeight = 200;
  messages.scrollTop = 800;
  messages.dispatchEvent('scroll');

  elements['chat-input'].value = 'Continue';
  elements['composer'].dispatchEvent('submit');
  await waitForLoad();

  const sendCall = calls.find(call => call.type === 'sendChat');
  assert.ok(sendCall, 'sendChat should be called');

  messages.scrollHeight = 1200;
  messages.scrollTop = 200;
  messages.dispatchEvent('scroll');
  callbacks.chatChunk({ conversationId: sendCall.conversationId, chunk: 'First chunk' });

  assert.equal(messages.scrollTop, 200);

  messages.scrollTop = 1000;
  messages.dispatchEvent('scroll');
  messages.scrollHeight = 1300;
  callbacks.chatChunk({ conversationId: sendCall.conversationId, chunk: ' second chunk' });

  assert.equal(messages.scrollTop, 1300);
});

test('conversation context panel is hidden when no selected text in URL', async () => {
  const { elements } = createChatRendererHarness('');

  // Wait for initial load
  await waitForLoad();

  assert.equal(elements['conversation-context'].classList.contains('hidden'), true);
});

test('conversation context panel shows selected text from URL parameter', async () => {
  const { elements } = createChatRendererHarness('?text=Hello%20world');

  // Wait for initial load
  await waitForLoad();

  assert.equal(elements['conversation-context'].classList.contains('hidden'), false);
  assert.equal(elements['conversation-context-text'].textContent, 'Hello world');
});

test('conversation context panel decodes URL-encoded text', async () => {
  const { elements } = createChatRendererHarness('?text=First%20line%0ASecond%20line');

  // Wait for initial load
  await waitForLoad();

  assert.equal(elements['conversation-context-text'].textContent, 'First line\nSecond line');
});

test('conversation context panel shows selected context from active conversation metadata', async () => {
  const conversation = {
    id: 'conv-metadata-context',
    title: 'Metadata context',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
    metadata: {
      selectedContext: 'Saved selected context'
    }
  };
  const { elements } = createChatRendererHarness('', {
    chatState: {
      saveHistory: true,
      conversations: [conversation],
      activeConversationId: conversation.id
    }
  });

  await waitForLoad();

  assert.equal(elements['conversation-context'].classList.contains('hidden'), false);
  assert.equal(elements['conversation-context-text'].textContent, 'Saved selected context');
});

test('sendChat includes selected context when sending message', async () => {
  const { calls, elements } = createChatRendererHarness('?text=Selected%20text%20context', {
    chatState: {
      saveHistory: true,
      conversations: [],
      activeConversationId: ''
    }
  });

  // Wait for initial load
  await waitForLoad();

  // Simulate sending a message
  elements['chat-input'].value = 'What is this about?';
  elements['composer'].dispatchEvent('submit');

  // Wait for async operations
  await waitForLoad();

  const sendCall = calls.find(call => call.type === 'sendChat');
  assert.ok(sendCall, 'sendChat should be called');
  assert.equal(sendCall.selectedContext, 'Selected text context');
  assert.ok(sendCall.messages.length > 0, 'Should have messages');
  assert.equal(sendCall.messages[0].content, 'What is this about?');

  const saveCall = calls.find(call => call.type === 'saveConversation');
  assert.ok(saveCall, 'saveConversation should be called');
  assert.equal(saveCall.conversation.metadata.selectedContext, 'Selected text context');
});

test('sendChat passes empty string when no selected context', async () => {
  const { calls, elements } = createChatRendererHarness('');

  // Wait for initial load
  await waitForLoad();

  // Simulate sending a message
  elements['chat-input'].value = 'Hello';
  elements['composer'].dispatchEvent('submit');

  // Wait for async operations
  await waitForLoad();

  const sendCall = calls.find(call => call.type === 'sendChat');
  assert.ok(sendCall, 'sendChat should be called');
  assert.equal(sendCall.selectedContext, '');
});
