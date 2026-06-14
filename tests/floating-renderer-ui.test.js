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
    'chat-context-header',
    'chat-context-label',
    'chat-context-toggle',
    'chat-context-status',
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
    onAiChatChunk() {},
    onAiChatDone() {},
    onAiChatError() {},
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
