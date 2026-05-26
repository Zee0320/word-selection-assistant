const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getChatState: () => ipcRenderer.invoke('standalone-chat-state'),
  newConversation: (initialMessage) => ipcRenderer.invoke('standalone-chat-new-conversation', initialMessage),
  saveConversation: (conversation) => ipcRenderer.invoke('standalone-chat-save-conversation', conversation),
  selectConversation: (conversationId) => ipcRenderer.invoke('standalone-chat-select-conversation', conversationId),
  deleteConversation: (conversationId) => ipcRenderer.invoke('standalone-chat-delete-conversation', conversationId),
  sendChat: (conversationId, messages) => ipcRenderer.send('standalone-chat-send', { conversationId, messages }),
  onChatChunk: (cb) => ipcRenderer.on('standalone-chat-stream-chunk', (event, payload) => cb(payload)),
  onChatDone: (cb) => ipcRenderer.on('standalone-chat-stream-done', (event, payload) => cb(payload)),
  onChatError: (cb) => ipcRenderer.on('standalone-chat-stream-error', (event, payload) => cb(payload)),
  onSettingsUpdated: (cb) => ipcRenderer.on('settings-updated', (event, settings) => cb(settings)),
  openSettings: () => ipcRenderer.send('open-settings'),
  parseMarkdown: (text) => ipcRenderer.sendSync('parse-markdown', text),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
