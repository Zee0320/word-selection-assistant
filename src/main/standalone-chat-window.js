const { BrowserWindow } = require('electron');
const path = require('path');
const { nativeWindowHandleToNumber } = require('./window-focus');
const { installNavigationGuard } = require('./window-navigation-guard');

let chatWin = null;
let pendingDraftText = '';

function sendDraftText(text) {
  const draftText = String(text || '').trim();
  if (!draftText || !chatWin || chatWin.isDestroyed()) return;

  if (chatWin.webContents.isLoading()) {
    pendingDraftText = draftText;
    return;
  }

  chatWin.webContents.send('prefill-chat-input', draftText);
}

function openChatWindow(options = {}) {
  const draftText = typeof options === 'string' ? options : options.draftText;

  if (chatWin && !chatWin.isDestroyed()) {
    if (chatWin.isMinimized()) chatWin.restore();
    chatWin.focus();
    sendDraftText(draftText);
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

  installNavigationGuard(chatWin.webContents);
  chatWin.loadFile(path.join(__dirname, '../renderer/chat/index.html'));
  chatWin.setMenuBarVisibility(false);
  if (draftText) {
    pendingDraftText = String(draftText);
  }
  chatWin.webContents.once('did-finish-load', () => {
    const draft = pendingDraftText;
    pendingDraftText = '';
    sendDraftText(draft);
  });
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

function sendChatState(state) {
  if (!chatWin || chatWin.isDestroyed()) return false;

  const sendState = () => {
    if (!chatWin || chatWin.isDestroyed()) return;
    chatWin.webContents.send('standalone-chat-state-updated', state);
  };

  if (chatWin.webContents.isLoading()) {
    chatWin.webContents.once('did-finish-load', sendState);
  } else {
    sendState();
  }
  return true;
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

module.exports = { openChatWindow, getWebContents, sendChatState, getWindowHandle, destroy };
