// src/preload/floating-preload.js - 悬浮窗预加载脚本
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 接收主进程推送
  onShowToolbar: (cb) => ipcRenderer.on('show-toolbar', (e, data) => cb(data)),
  onSettingsUpdated: (cb) => ipcRenderer.on('settings-updated', (e, data) => cb(data)),
  onResetUI: (cb) => ipcRenderer.on('reset-ui', () => cb()),

  // 翻译单词
  translateWord: (word) => ipcRenderer.invoke('translate-word', word),

  // 文本分类
  classifyText: (text) => ipcRenderer.invoke('classify-text', text),

  // 句子翻译流式
  translateSentence: (text) => ipcRenderer.send('translate-sentence', text),
  onTranslateChunk: (cb) => ipcRenderer.on('translate-stream-chunk', (e, chunk) => cb(chunk)),
  onTranslateDone: (cb) => ipcRenderer.on('translate-stream-done', () => cb()),
  onTranslateError: (cb) => ipcRenderer.on('translate-stream-error', (e, err) => cb(err)),

  // AI 对话流式
  aiChatSend: (selectedText, messages) => ipcRenderer.send('ai-chat-send', { selectedText, messages }),
  onAiChatChunk: (cb) => ipcRenderer.on('ai-chat-stream-chunk', (e, chunk) => cb(chunk)),
  onAiChatDone: (cb) => ipcRenderer.on('ai-chat-stream-done', () => cb()),
  onAiChatError: (cb) => ipcRenderer.on('ai-chat-stream-error', (e, err) => cb(err)),

  // 窗口控制
  resizeWindow: (width, height) => ipcRenderer.send('resize-window', { width, height }),
  collapseWindow: () => ipcRenderer.send('collapse-window'),
  setPinned: (pinned) => ipcRenderer.invoke('set-pinned', pinned),
  openSettings: () => ipcRenderer.send('open-settings'),
  notifyInteraction: () => ipcRenderer.send('notify-interaction'),
  moveWindow: (deltaX, deltaY) => ipcRenderer.send('move-window', { deltaX, deltaY }),

  // 移除监听（防止内存泄漏）
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // Markdown 解析 - 通过 IPC 调用主进程处理
  parseMarkdown: (text) => ipcRenderer.sendSync('parse-markdown', text),

  // 诊断日志（发送到main进程console）
  log: (msg) => ipcRenderer.send('diagnostic-log', msg)
});
