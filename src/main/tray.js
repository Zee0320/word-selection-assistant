// src/main/tray.js - system tray management
const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const textCapture = require('./text-capture');
const settingsWindow = require('./settings-window');
const standaloneChatWindow = require('./standalone-chat-window');

let tray = null;

function buildContextMenu() {
  const paused = textCapture.isPaused();
  return Menu.buildFromTemplate([
    {
      label: paused ? 'Resume capture' : 'Pause capture',
      click: () => {
        if (paused) {
          textCapture.resume();
        } else {
          textCapture.pause();
        }
        tray.setContextMenu(buildContextMenu());
      }
    },
    { type: 'separator' },
    {
      label: 'AI Chat',
      click: () => standaloneChatWindow.openChatWindow()
    },
    {
      label: 'Settings',
      click: () => settingsWindow.openSettings()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);
}

function init() {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip('Word Selection Assistant');
  tray.setContextMenu(buildContextMenu());

  tray.on('double-click', () => {
    standaloneChatWindow.openChatWindow();
  });

  console.log('[Tray] System tray initialized');
}

function destroy() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { init, destroy };
