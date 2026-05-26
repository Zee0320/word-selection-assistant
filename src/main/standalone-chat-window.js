const { BrowserWindow } = require('electron');
const path = require('path');
const { nativeWindowHandleToNumber } = require('./window-focus');

let chatWin = null;

function openChatWindow() {
  if (chatWin && !chatWin.isDestroyed()) {
    if (chatWin.isMinimized()) chatWin.restore();
    chatWin.focus();
    return chatWin;
  }

  chatWin = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    title: 'Word Selection Assistant - Chat',
    show: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, '../preload/chat-preload.js')
    }
  });

  chatWin.loadFile(path.join(__dirname, '../renderer/chat/index.html'));
  chatWin.setMenuBarVisibility(false);
  chatWin.once('ready-to-show', () => {
    if (chatWin && !chatWin.isDestroyed()) chatWin.show();
  });
  chatWin.on('closed', () => {
    chatWin = null;
  });

  return chatWin;
}

function getWebContents() {
  if (chatWin && !chatWin.isDestroyed()) return chatWin.webContents;
  return null;
}

function getWindowHandle() {
  if (chatWin && !chatWin.isDestroyed()) {
    return nativeWindowHandleToNumber(chatWin.getNativeWindowHandle());
  }
  return null;
}

function destroy() {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.destroy();
    chatWin = null;
  }
}

module.exports = { openChatWindow, getWebContents, getWindowHandle, destroy };
