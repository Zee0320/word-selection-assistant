// src/main/settings-window.js - 设置窗口管理
const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let settingsWin = null;

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 520,
    height: 580,
    title: 'Word Selection Assistant - 设置',
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/settings-preload.js')
    }
  });

  settingsWin.loadFile(path.join(__dirname, '../renderer/settings/index.html'));
  settingsWin.setMenuBarVisibility(false);

  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

function destroy() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.destroy();
    settingsWin = null;
  }
}

module.exports = { openSettings, destroy };
