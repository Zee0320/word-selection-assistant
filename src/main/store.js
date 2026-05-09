// src/main/store.js - 设置存储模块
const Store = require('electron-store');

const schema = {
  apiBaseUrl: {
    type: 'string',
    default: ''
  },
  apiKey: {
    type: 'string',
    default: ''
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
  }
};

const store = new Store({ schema });

// 迁移旧版配置
if (store.has('modelName')) {
  const oldModel = store.get('modelName');
  store.set('translateModel', oldModel);
  store.set('chatModel', oldModel);
  store.delete('modelName');
}

function getSettings() {
  return {
    apiBaseUrl: store.get('apiBaseUrl'),
    apiKey: store.get('apiKey'),
    translateModel: store.get('translateModel'),
    chatModel: store.get('chatModel'),
    translationEnabled: store.get('translationEnabled'),
    aiChatEnabled: store.get('aiChatEnabled'),
    phraseThreshold: store.get('phraseThreshold')
  };
}

function saveSettings(settings) {
  if (settings.apiBaseUrl !== undefined) store.set('apiBaseUrl', settings.apiBaseUrl);
  if (settings.apiKey !== undefined) store.set('apiKey', settings.apiKey);
  if (settings.translateModel !== undefined) store.set('translateModel', settings.translateModel);
  if (settings.chatModel !== undefined) store.set('chatModel', settings.chatModel);
  if (settings.translationEnabled !== undefined) store.set('translationEnabled', settings.translationEnabled);
  if (settings.aiChatEnabled !== undefined) store.set('aiChatEnabled', settings.aiChatEnabled);
  if (settings.phraseThreshold !== undefined) store.set('phraseThreshold', settings.phraseThreshold);
  return getSettings();
}

module.exports = { getSettings, saveSettings };
