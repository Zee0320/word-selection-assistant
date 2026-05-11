// src/main/store.js - 设置存储模块
const Store = require('electron-store');
const { inferConnectionMode } = require('./settings-migration');

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
    phraseThreshold: store.get('phraseThreshold')
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
  return getSettings();
}

module.exports = { getSettings, saveSettings };
