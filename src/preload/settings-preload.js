// src/preload/settings-preload.js - 设置窗口预加载脚本
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  testConnection: (settings, purpose) => ipcRenderer.invoke('test-connection', settings, purpose)
});
