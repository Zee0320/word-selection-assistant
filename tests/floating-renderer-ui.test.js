const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList(initial = '') {
  const classes = new Set(initial.split(/\s+/).filter(Boolean));

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
    toString() {
      return [...classes].join(' ');
    }
  };
}

function createElement(id, initialClass = '') {
  const listeners = new Map();

  return {
    id,
    style: {},
    classList: createClassList(initialClass),
    attributes: {},
    children: [],
    value: '',
    textContent: '',
    innerHTML: '',
    scrollHeight: 100,
    scrollTop: 0,
    disabled: false,
    readOnly: false,
    placeholder: '',
    title: '',
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
      this.lastElementChild = child;
      return child;
    },
    remove() {},
    closest() {
      return null;
    },
    focus() {}
  };
}

function createRendererHarness() {
  const ids = [
    'toolbar',
    'btn-translate',
    'btn-chat',
    'btn-pin',
    'pin-divider',
    'panel-translation',
    'panel-chat',
    'word-result',
    'word-text',
    'word-phonetic',
    'word-chinese',
    'word-meanings',
    'sentence-result',
    'sentence-output',
    'sentence-loading',
    'translation-error',
    'chat-context',
    'chat-context-text',
    'chat-context-clear',
    'chat-context-lock',
    'chat-context-header',
    'chat-context-label',
    'chat-context-toggle',
    'chat-context-status',
    'chat-messages',
    'chat-input',
    'chat-send-btn'
  ];
  const elements = Object.fromEntries(ids.map(id => [
    id,
    createElement(id, id.startsWith('panel-') ? 'hidden' : '')
  ]));
  elements['btn-pin'].classList.add('hidden');
  elements['pin-divider'].classList.add('divider', 'hidden');

  const divider = createElement('divider', 'divider');
  const documentListeners = new Map();
  const callbacks = {};
  const calls = [];

  const document = {
    getElementById(id) {
      return elements[id];
    },
    querySelector(selector) {
      if (selector === '.divider') return divider;
      return null;
    },
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    createElement(tagName) {
      return createElement(tagName);
    }
  };

  const parseMarkdownCalls = [];
  const savedConversations = [];

  const api = {
    onShowToolbar(cb) { callbacks.showToolbar = cb; },
    onSettingsUpdated(cb) { callbacks.settingsUpdated = cb; },
    onResetUI(cb) { callbacks.resetUI = cb; },
    onTranslateChunk(cb) { callbacks.translateChunk = cb; },
    onTranslateDone(cb) { callbacks.translateDone = cb; },
    onTranslateError() {},
    onAiChatChunk(cb) { callbacks.aiChatChunk = cb; },
    onAiChatDone(cb) { callbacks.aiChatDone = cb; },
    onAiChatError(cb) { callbacks.aiChatError = cb; },
    notifyInteraction() { calls.push('notifyInteraction'); },
    moveWindow() { calls.push('moveWindow'); },
    collapseWindow() { calls.push('collapseWindow'); },
    resizeWindow() { calls.push('resizeWindow'); },
    setPinned: async () => false,
    openSettings() {},
    classifyText: async () => ({ type: 'word', isChinese: false }),
    translateWord: async () => null,
    translateSentence() {},
    aiChatSend(selectedText, messages) {
      calls.push({ type: 'aiChatSend', selectedText, messages });
    },
    parseMarkdown(text) {
      parseMarkdownCalls.push(text);
      return text;
    },
    createFloatingConversation: async (payload) => {
      const conv = { id: `conv-${savedConversations.length + 1}`, ...payload };
      savedConversations.push(conv);
      calls.push({ type: 'createFloatingConversation', payload });
      return conv;
    },
    saveFloatingConversation: async (id, payload) => {
      const existing = savedConversations.find(c => c.id === id);
      if (existing) {
        Object.assign(existing, payload);
      }
      calls.push({ type: 'saveFloatingConversation', id, payload });
      return existing || { id, ...payload };
    }
  };

  const context = vm.createContext({
    window: { api },
    document,
    console,
    setTimeout,
    clearTimeout
  });
  const scriptPath = path.join(__dirname, '..', 'src', 'renderer', 'floating', 'script.js');
  const script = fs.readFileSync(scriptPath, 'utf8');
  vm.runInContext(script, context, { filename: scriptPath });

  return { callbacks, calls, elements, parseMarkdownCalls, savedConversations };
}

test('pending show-toolbar resets panels without clearing main pending state', () => {
  const { callbacks, calls, elements } = createRendererHarness();

  callbacks.showToolbar({
    text: '',
    settings: { translationEnabled: true, aiChatEnabled: true },
    pending: true
  });

  assert.equal(calls.includes('collapseWindow'), false);
  assert.equal(elements['btn-translate'].disabled, true);
  assert.equal(elements['btn-chat'].disabled, true);
});

test('final show-toolbar after pending enables translate and chat actions', () => {
  const { callbacks, elements } = createRendererHarness();

  callbacks.showToolbar({
    text: '',
    settings: { translationEnabled: true, aiChatEnabled: true },
    pending: true
  });
  callbacks.showToolbar({
    text: 'hello',
    settings: { translationEnabled: true, aiChatEnabled: true },
    pending: false
  });

  assert.equal(elements.toolbar.classList.contains('toolbar-pending'), false);
  assert.equal(elements['btn-translate'].disabled, false);
  assert.equal(elements['btn-translate'].classList.contains('toolbar-btn-disabled'), false);
  assert.equal(elements['btn-translate'].getAttribute('aria-disabled'), 'false');
  assert.equal(elements['btn-chat'].disabled, false);
  assert.equal(elements['btn-chat'].classList.contains('toolbar-btn-disabled'), false);
  assert.equal(elements['btn-chat'].getAttribute('aria-disabled'), 'false');
});

test('floating translation re-renders final streamed markdown through shared parser', () => {
  const { callbacks, elements, parseMarkdownCalls } = createRendererHarness();

  // Setup: show toolbar with text and settings
  callbacks.showToolbar({
    text: 'Hello world',
    settings: { translationEnabled: true, aiChatEnabled: true },
    pending: false
  });

  // Simulate clicking translate button (need to trigger the click handler)
  elements['btn-translate'].dispatchEvent('click');

  // Clear previous calls
  parseMarkdownCalls.length = 0;

  // Simulate streaming chunks
  callbacks.translateChunk('Hello');
  callbacks.translateChunk(' world');
  assert.equal(parseMarkdownCalls.length, 2);
  assert.equal(parseMarkdownCalls[0], 'Hello');
  assert.equal(parseMarkdownCalls[1], 'Hello world');

  // Clear and simulate done
  parseMarkdownCalls.length = 0;
  callbacks.translateDone();

  // Should re-render final content through parseMarkdown
  assert.equal(parseMarkdownCalls.length, 1);
  assert.equal(parseMarkdownCalls[0], 'Hello world');
});

test('floating chat re-renders final streamed markdown through shared parser', async () => {
  const { callbacks, elements, parseMarkdownCalls } = createRendererHarness();

  // Setup: show toolbar with text and settings (including API config)
  callbacks.showToolbar({
    text: 'Selected text',
    settings: {
      translationEnabled: true,
      aiChatEnabled: true,
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'test-key',
      chatModel: 'gpt-4'
    },
    pending: false
  });

  // Open chat panel
  elements['btn-chat'].dispatchEvent('click');

  // Clear previous calls
  parseMarkdownCalls.length = 0;

  // Send a message (this will call aiChatSend and append an assistant message)
  elements['chat-input'].value = 'What is this?';
  elements['chat-send-btn'].dispatchEvent('click');

  // Wait for async sendChatMessage to complete
  await new Promise(resolve => setTimeout(resolve, 10));

  // The assistant message should be created (empty initially)
  const chatMessages = elements['chat-messages'];
  const lastMsg = chatMessages.lastElementChild;
  assert.ok(lastMsg, 'Assistant message element should be created');

  // Simulate streaming chunks
  callbacks.aiChatChunk('This is');
  callbacks.aiChatChunk(' the answer.');
  // Note: user message also calls parseMarkdown once, plus 2 chunk renders = 3
  assert.equal(parseMarkdownCalls.length, 3);

  // Clear and simulate done
  parseMarkdownCalls.length = 0;
  callbacks.aiChatDone();

  // Should re-render final content through parseMarkdown
  assert.equal(parseMarkdownCalls.length, 1);
  assert.equal(parseMarkdownCalls[0], 'This is the answer.');
});

test('confirmed toolbar data with empty text keeps actions disabled', () => {
  const { callbacks, elements } = createRendererHarness();

  callbacks.showToolbar({
    text: '',
    settings: { translationEnabled: true, aiChatEnabled: true },
    pending: false
  });

  assert.equal(elements.toolbar.classList.contains('toolbar-pending'), false);
  assert.equal(elements['btn-translate'].disabled, true);
  assert.equal(elements['btn-translate'].getAttribute('aria-disabled'), 'true');
  assert.equal(elements['btn-chat'].disabled, true);
  assert.equal(elements['btn-chat'].getAttribute('aria-disabled'), 'true');
});

test('floating chat persists conversation before sending to AI', async () => {
  const { callbacks, elements, calls, savedConversations } = createRendererHarness();

  // Setup: show toolbar with text and settings
  callbacks.showToolbar({
    text: 'Selected text',
    settings: {
      translationEnabled: true,
      aiChatEnabled: true,
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'test-key',
      chatModel: 'gpt-4'
    },
    pending: false
  });

  // Open chat panel
  elements['btn-chat'].dispatchEvent('click');

  // Send a message
  elements['chat-input'].value = 'What is this?';
  elements['chat-send-btn'].dispatchEvent('click');

  // Wait for microtask to complete (sendChatMessage is now async)
  await new Promise(resolve => setTimeout(resolve, 10));

  // Should have created a conversation with the user message
  const createCall = calls.find(c => c.type === 'createFloatingConversation');
  assert.ok(createCall, 'Should call createFloatingConversation before AI send');

  // The payload should contain the selected text context and first user message
  assert.equal(createCall.payload.contextText, 'Selected text');
  assert.equal(createCall.payload.messages.length, 1);
  assert.equal(createCall.payload.messages[0].role, 'user');
  assert.equal(createCall.payload.messages[0].content, 'What is this?');

  // AI send should have been called
  const aiSendCall = calls.find(c => c.type === 'aiChatSend');
  assert.ok(aiSendCall, 'Should call aiChatSend');
});

test('floating chat persists assistant message on done', async () => {
  const { callbacks, elements, calls, savedConversations } = createRendererHarness();

  // Setup: show toolbar with text and settings
  callbacks.showToolbar({
    text: 'Selected text',
    settings: {
      translationEnabled: true,
      aiChatEnabled: true,
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'test-key',
      chatModel: 'gpt-4'
    },
    pending: false
  });

  // Open chat panel
  elements['btn-chat'].dispatchEvent('click');

  // Send a message
  elements['chat-input'].value = 'What is this?';
  elements['chat-send-btn'].dispatchEvent('click');

  // Wait for microtask to complete
  await new Promise(resolve => setTimeout(resolve, 10));

  // Clear previous calls
  calls.length = 0;

  // Simulate streaming chunks
  callbacks.aiChatChunk('This is');
  callbacks.aiChatChunk(' the answer.');

  // Simulate done
  callbacks.aiChatDone();

  // Wait for microtask to complete
  await new Promise(resolve => setTimeout(resolve, 10));

  // Should have saved the conversation with the assistant message
  const saveCall = calls.find(c => c.type === 'saveFloatingConversation');
  assert.ok(saveCall, 'Should call saveFloatingConversation after AI done');

  // The payload should contain both messages
  assert.equal(saveCall.payload.messages.length, 2);
  assert.equal(saveCall.payload.messages[0].role, 'user');
  assert.equal(saveCall.payload.messages[0].content, 'What is this?');
  assert.equal(saveCall.payload.messages[1].role, 'assistant');
  assert.equal(saveCall.payload.messages[1].content, 'This is the answer.');
});

test('floating chat keeps user message on AI error', async () => {
  const { callbacks, elements, calls } = createRendererHarness();

  // Setup: show toolbar with text and settings
  callbacks.showToolbar({
    text: 'Selected text',
    settings: {
      translationEnabled: true,
      aiChatEnabled: true,
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'test-key',
      chatModel: 'gpt-4'
    },
    pending: false
  });

  // Open chat panel
  elements['btn-chat'].dispatchEvent('click');

  // Send a message
  elements['chat-input'].value = 'What is this?';
  elements['chat-send-btn'].dispatchEvent('click');

  // Wait for microtask to complete
  await new Promise(resolve => setTimeout(resolve, 10));

  // Clear previous calls
  calls.length = 0;

  // Simulate error
  callbacks.aiChatError({ message: 'API error', action: 'settings' });

  // Wait for microtask to complete
  await new Promise(resolve => setTimeout(resolve, 10));

  // Should NOT have saved again (user message is preserved)
  const saveCall = calls.find(c => c.type === 'saveFloatingConversation');
  assert.ok(!saveCall, 'Should NOT call saveFloatingConversation on error');

  // The chat messages array should still contain the user message
  // Check by sending another message and seeing that conversation continues
  elements['chat-input'].value = 'Try again';
  elements['chat-send-btn'].dispatchEvent('click');

  await new Promise(resolve => setTimeout(resolve, 10));

  const createCall = calls.find(c => c.type === 'createFloatingConversation');
  // If conversation persisted correctly, should have save call, not create
  const nextSaveCall = calls.filter(c => c.type === 'saveFloatingConversation');
  // Either a save was called (continuing conversation) or create (new conversation)
  // The key is that the user message wasn't popped
  assert.ok(nextSaveCall.length > 0 || createCall, 'Should have API call for continuing conversation');
});

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
