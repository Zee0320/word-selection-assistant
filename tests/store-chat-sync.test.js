const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadStore(initialSettings = {}) {
  // Clear require cache to reset store state
  const storePath = require.resolve(path.join(__dirname, '..', 'src', 'main', 'store.js'));
  const chatHistoryPath = require.resolve(path.join(__dirname, '..', 'src', 'main', 'chat-history.js'));
  const settingsMigrationPath = require.resolve(path.join(__dirname, '..', 'src', 'main', 'settings-migration.js'));

  Object.keys(require.cache).forEach(key => {
    if (key.includes('store.js') || key.includes('chat-history.js') || key.includes('settings-migration.js')) {
      delete require.cache[key];
    }
  });

  // Create in-memory store backing
  const backingStore = new Map();

  // Set defaults
  const defaults = {
    connectionMode: 'direct',
    connectionModeMigrated: true,
    apiBaseUrl: '',
    apiKey: '',
    apiRequestPath: '',
    customHeaders: {},
    translateHeaders: {},
    chatHeaders: {},
    translateModel: '',
    chatModel: '',
    translationEnabled: true,
    aiChatEnabled: true,
    phraseThreshold: 3,
    standaloneChatSaveHistory: true,
    standaloneChatRestoreLastConversation: true,
    standaloneChatActiveConversationId: '',
    standaloneChatConversations: [],
    ...initialSettings
  };

  Object.entries(defaults).forEach(([key, value]) => {
    backingStore.set(key, value);
  });

  // Mock electron-store
  const MockStore = class {
    constructor() {
      this._data = backingStore;
    }
    get(key) { return this._data.get(key); }
    set(key, value) { this._data.set(key, value); }
    has(key) { return this._data.has(key); }
    delete(key) { this._data.delete(key); }
  };

  // Inject mock before requiring store
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron-store') {
      return MockStore;
    }
    return originalLoad.apply(this, arguments);
  };

  const storeModule = require(path.join(__dirname, '..', 'src', 'main', 'store.js'));

  return { storeModule, backingStore };
}

test('floating conversation persists selected context and user message when history is enabled', () => {
  const { storeModule, backingStore } = loadStore({ standaloneChatSaveHistory: true });
  const result = storeModule.createFloatingChatConversation({
    selectedText: 'Selected paragraph',
    userMessage: 'Explain this'
  });

  assert.equal(result.conversation.metadata.selectedContext, 'Selected paragraph');
  assert.equal(result.conversation.metadata.source, 'floating');
  assert.deepEqual(result.conversation.messages.map(message => message.content), ['Explain this']);
  assert.equal(backingStore.get('standaloneChatConversations').length, 1);
});

test('history-disabled floating conversation stays in process memory and does not touch persistent history', () => {
  const { storeModule, backingStore } = loadStore({
    standaloneChatSaveHistory: false,
    standaloneChatConversations: [{ id: 'saved', title: 'Saved', messages: [] }]
  });
  const created = storeModule.createFloatingChatConversation({
    selectedText: 'Context',
    userMessage: 'Question'
  });
  const saved = storeModule.saveFloatingChatConversation({
    ...created.conversation,
    messages: [...created.conversation.messages, { role: 'assistant', content: 'Answer' }]
  });

  assert.deepEqual(saved.conversation.messages.map(message => message.role), ['user', 'assistant']);
  assert.deepEqual(backingStore.get('standaloneChatConversations').map(item => item.id), ['saved']);
  assert.equal(storeModule.getStandaloneChatState().conversations.length, 1);
});

test('floating conversation selected context is preserved through save', () => {
  const { storeModule } = loadStore({ standaloneChatSaveHistory: true });
  const created = storeModule.createFloatingChatConversation({
    selectedText: 'Code snippet',
    userMessage: 'What does this do?'
  });

  const updated = storeModule.saveFloatingChatConversation({
    ...created.conversation,
    messages: [...created.conversation.messages, { role: 'assistant', content: 'It defines a variable.' }]
  });

  assert.equal(updated.conversation.metadata.selectedContext, 'Code snippet');
  assert.equal(updated.conversation.metadata.source, 'floating');
});
