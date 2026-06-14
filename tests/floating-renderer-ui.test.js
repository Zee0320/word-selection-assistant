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
      for (const listener of listeners.get(type) || []) {
        listener(event);
      }
    },
    appendChild(child) {
      this.children.push(child);
      this.lastElementChild = child;
      return child;
    },
    remove() {},
    focus() {},
    closest() {
      return null;
    }
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

  const api = {
    onShowToolbar(cb) { callbacks.showToolbar = cb; },
    onSettingsUpdated(cb) { callbacks.settingsUpdated = cb; },
    onResetUI(cb) { callbacks.resetUI = cb; },
    onTranslateChunk() {},
    onTranslateDone() {},
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
    aiChatSend(selectedText, messages) { calls.push({ type: 'aiChatSend', selectedText, messages }); },
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
    parseMarkdown(text) { return text; }
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

  return { callbacks, calls, elements };
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
  elements['chat-send-btn'].dispatchEvent('click');

  // Wait for async operations
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls[0], 'notifyInteraction');
  assert.ok(calls.some(call => call.type === 'createFloatingConversation'));
  assert.ok(calls.some(call => call.type === 'aiChatSend'));

  const createCall = calls.find(call => call.type === 'createFloatingConversation');
  assert.equal(createCall.payload.selectedText, 'Selected context');
  assert.equal(createCall.payload.userMessage, 'Explain this');
});

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
  elements['chat-send-btn'].dispatchEvent('click');

  // Wait for async operations
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  callbacks.aiChatChunk('Answer');
  callbacks.aiChatDone();

  await new Promise(resolve => setImmediate(resolve));

  const saveCall = calls.find(call => call.type === 'saveFloatingConversation');
  assert.ok(saveCall);
  assert.equal(saveCall.conversation.id, 'conv-floating');
  assert.equal(saveCall.conversation.messages[0].role, 'user');
  assert.equal(saveCall.conversation.messages[1].role, 'assistant');
  assert.equal(saveCall.conversation.messages[1].content, 'Answer');
  assert.equal(saveCall.conversation.metadata.selectedContext, 'Selected context');
});
