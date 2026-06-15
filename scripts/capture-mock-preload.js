/**
 * Mock Preload Script for Screenshot Capture
 *
 * This script provides a mock window.api that doesn't require IPC,
 * allowing the floating renderer to load without errors during capture.
 */

const { contextBridge } = require('electron');

// Mock state
const mockState = {
  settings: {
    apiBaseUrl: 'http://localhost:8080',
    apiKey: 'test-key',
    chatModel: 'test-model',
    translateModel: 'test-model',
    translationEnabled: true,
    aiChatEnabled: true,
    connectionMode: 'direct'
  }
};

// Event handlers storage
const handlers = {};

// Streaming callbacks
let onAiChatChunkCb = null;
let onAiChatDoneCb = null;

contextBridge.exposeInMainWorld('api', {
  // Event handlers - store them for later triggering
  onShowToolbar: (cb) => {
    handlers['show-toolbar'] = cb;
  },
  onSettingsUpdated: (cb) => {
    handlers['settings-updated'] = cb;
  },
  onResetUI: (cb) => {
    handlers['reset-ui'] = cb;
  },

  // Translate word - return null to trigger AI fallback
  translateWord: async (word) => null,

  // Classify text - always return sentence type
  classifyText: async (text) => ({ type: 'sentence', isChinese: false }),

  // Sentence translation - no-op for capture
  translateSentence: (text) => {},
  onTranslateChunk: (cb) => {},
  onTranslateDone: (cb) => {},
  onTranslateError: (cb) => {},

  // AI Chat - simulate streaming
  aiChatSend: (selectedText, messages) => {
    setTimeout(() => {
      onAiChatChunkCb?.('This is a ');
      setTimeout(() => {
        onAiChatChunkCb?.('mock AI response.');
        setTimeout(() => {
          onAiChatDoneCb?.();
        }, 100);
      }, 100);
    }, 100);
  },
  onAiChatChunk: (cb) => {
    onAiChatChunkCb = cb;
  },
  onAiChatDone: (cb) => {
    onAiChatDoneCb = cb;
  },
  onAiChatError: (cb) => {},

  // Window control - no-op for capture
  resizeWindow: (width, height) => {},
  collapseWindow: () => {},
  setPinned: async (pinned) => pinned,
  openSettings: () => {},
  notifyInteraction: () => {},
  moveWindow: (deltaX, deltaY) => {},

  // Utility
  removeAllListeners: (channel) => {},
  parseMarkdown: (text) => text,
  log: (msg) => console.log('[Renderer]', msg)
});

// Expose a way to trigger events from main process
contextBridge.exposeInMainWorld('__mockTrigger', {
  showToolbar: (data) => {
    if (handlers['show-toolbar']) {
      handlers['show-toolbar'](data);
    }
  },
  resetUI: () => {
    if (handlers['reset-ui']) {
      handlers['reset-ui']();
    }
  },
  getSettings: () => mockState.settings
});
