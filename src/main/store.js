// src/main/store.js - 设置存储模块
const Store = require('electron-store');
const { inferConnectionMode } = require('./settings-migration');
const {
  appendMessages,
  applyHistoryUpdate,
  createConversation,
  deleteConversation,
  normalizeConversation,
  resolveActiveConversation,
  sortConversations,
  upsertConversation
} = require('./chat-history');

const schema = {
  connectionMode: {
    type: 'string',
    enum: ['direct', 'gateway'],
    default: 'direct'
  },
  connectionModeMigrated: {
    type: 'boolean',
    default: false
  },
  apiBaseUrl: {
    type: 'string',
    default: ''
  },
  apiKey: {
    type: 'string',
    default: ''
  },
  apiRequestPath: {
    type: 'string',
    default: ''
  },
  customHeaders: {
    type: 'object',
    default: {}
  },
  translateHeaders: {
    type: 'object',
    default: {}
  },
  chatHeaders: {
    type: 'object',
    default: {}
  },
  translateModel: {
    type: 'string',
    default: ''
  },
  chatModel: {
    type: 'string',
    default: ''
  },
  translationEnabled: {
    type: 'boolean',
    default: true
  },
  aiChatEnabled: {
    type: 'boolean',
    default: true
  },
  phraseThreshold: {
    type: 'number',
    default: 3,
    minimum: 1,
    maximum: 10
  },
  standaloneChatSaveHistory: {
    type: 'boolean',
    default: true
  },
  standaloneChatRestoreLastConversation: {
    type: 'boolean',
    default: true
  },
  standaloneChatActiveConversationId: {
    type: 'string',
    default: ''
  },
  standaloneChatConversations: {
    type: 'array',
    default: []
  }
};

const store = new Store({ schema });
let transientConversations = [];
let transientActiveConversationId = '';

// 迁移旧版配置
if (store.has('modelName')) {
  const oldModel = store.get('modelName');
  store.set('translateModel', oldModel);
  store.set('chatModel', oldModel);
  store.delete('modelName');
}

if (!store.get('connectionModeMigrated')) {
  store.set('connectionMode', inferConnectionMode({
    apiRequestPath: store.get('apiRequestPath'),
    customHeaders: store.get('customHeaders')
  }));
  store.set('connectionModeMigrated', true);
}

function getSettings() {
  return {
    connectionMode: store.get('connectionMode'),
    apiBaseUrl: store.get('apiBaseUrl'),
    apiKey: store.get('apiKey'),
    apiRequestPath: store.get('apiRequestPath'),
    customHeaders: store.get('customHeaders') || {},
    translateHeaders: store.get('translateHeaders') || {},
    chatHeaders: store.get('chatHeaders') || {},
    translateModel: store.get('translateModel'),
    chatModel: store.get('chatModel'),
    translationEnabled: store.get('translationEnabled'),
    aiChatEnabled: store.get('aiChatEnabled'),
    phraseThreshold: store.get('phraseThreshold'),
    standaloneChatSaveHistory: store.get('standaloneChatSaveHistory'),
    standaloneChatRestoreLastConversation: store.get('standaloneChatRestoreLastConversation')
  };
}

function saveSettings(settings) {
  if (settings.connectionMode !== undefined) store.set('connectionMode', settings.connectionMode);
  if (settings.apiBaseUrl !== undefined) store.set('apiBaseUrl', settings.apiBaseUrl);
  if (settings.apiKey !== undefined) store.set('apiKey', settings.apiKey);
  if (settings.apiRequestPath !== undefined) store.set('apiRequestPath', settings.apiRequestPath);
  if (settings.customHeaders !== undefined) store.set('customHeaders', settings.customHeaders);
  if (settings.translateHeaders !== undefined) store.set('translateHeaders', settings.translateHeaders);
  if (settings.chatHeaders !== undefined) store.set('chatHeaders', settings.chatHeaders);
  if (settings.translateModel !== undefined) store.set('translateModel', settings.translateModel);
  if (settings.chatModel !== undefined) store.set('chatModel', settings.chatModel);
  if (settings.translationEnabled !== undefined) store.set('translationEnabled', settings.translationEnabled);
  if (settings.aiChatEnabled !== undefined) store.set('aiChatEnabled', settings.aiChatEnabled);
  if (settings.phraseThreshold !== undefined) store.set('phraseThreshold', settings.phraseThreshold);
  if (settings.standaloneChatSaveHistory !== undefined) store.set('standaloneChatSaveHistory', settings.standaloneChatSaveHistory);
  if (settings.standaloneChatRestoreLastConversation !== undefined) store.set('standaloneChatRestoreLastConversation', settings.standaloneChatRestoreLastConversation);
  return getSettings();
}

function getHistorySettings() {
  return {
    saveHistory: store.get('standaloneChatSaveHistory'),
    restoreLastConversation: store.get('standaloneChatRestoreLastConversation')
  };
}

function readConversations() {
  const settings = getHistorySettings();
  return settings.saveHistory
    ? sortConversations(store.get('standaloneChatConversations') || [])
    : sortConversations(transientConversations);
}

function writeConversations(conversations, activeConversationId) {
  const settings = getHistorySettings();
  const sorted = sortConversations(conversations);
  const next = applyHistoryUpdate({
    saveHistory: settings.saveHistory,
    persistentConversations: store.get('standaloneChatConversations') || [],
    persistentActiveConversationId: store.get('standaloneChatActiveConversationId'),
    transientConversations,
    transientActiveConversationId,
    conversations: sorted,
    activeConversationId
  });

  if (settings.saveHistory) {
    store.set('standaloneChatConversations', next.persistentConversations);
    store.set('standaloneChatActiveConversationId', next.persistentActiveConversationId);
  } else {
    transientConversations = next.transientConversations;
    transientActiveConversationId = next.transientActiveConversationId;
  }
}

function getStoredActiveConversationId() {
  const settings = getHistorySettings();
  return settings.saveHistory
    ? store.get('standaloneChatActiveConversationId')
    : transientActiveConversationId;
}

function getStandaloneChatState() {
  const settings = getHistorySettings();
  const conversations = readConversations();
  const activeConversationId = resolveActiveConversation(
    conversations,
    getStoredActiveConversationId(),
    settings.restoreLastConversation
  );

  if (activeConversationId !== getStoredActiveConversationId()) {
    writeConversations(conversations, activeConversationId);
  }

  return {
    ...settings,
    conversations,
    activeConversationId
  };
}

function createStandaloneConversation(initialMessage = '') {
  const conversation = createConversation(initialMessage);
  const conversations = upsertConversation(readConversations(), conversation);
  writeConversations(conversations, conversation.id);
  return getStandaloneChatState();
}

function saveStandaloneConversation(conversation) {
  const normalized = normalizeConversation(conversation);
  const conversations = upsertConversation(readConversations(), normalized);
  writeConversations(conversations, normalized.id);
  return getStandaloneChatState();
}

function appendStandaloneMessages(conversationId, messages) {
  const conversations = readConversations();
  const current = conversations.find(item => item.id === conversationId) || createConversation();
  const updated = appendMessages({ ...current, id: conversationId || current.id }, messages);
  writeConversations(upsertConversation(conversations, updated), updated.id);
  return getStandaloneChatState();
}

function selectStandaloneConversation(conversationId) {
  const conversations = readConversations();
  const activeConversationId = conversations.some(item => item.id === conversationId) ? conversationId : '';
  writeConversations(conversations, activeConversationId);
  return getStandaloneChatState();
}

function deleteStandaloneConversation(conversationId) {
  const remaining = deleteConversation(readConversations(), conversationId);
  const activeConversationId = resolveActiveConversation(
    remaining,
    getStoredActiveConversationId() === conversationId ? '' : getStoredActiveConversationId(),
    true
  );
  writeConversations(remaining, activeConversationId);
  return getStandaloneChatState();
}

module.exports = {
  appendStandaloneMessages,
  createStandaloneConversation,
  deleteStandaloneConversation,
  getSettings,
  getStandaloneChatState,
  saveSettings,
  saveStandaloneConversation,
  selectStandaloneConversation
};
