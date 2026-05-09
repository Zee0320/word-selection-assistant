// src/main/tray.js - 系统托盘管理
const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const textCapture = require('./text-capture');
const settingsWindow = require('./settings-window');

let tray = null;

function buildContextMenu() {
  const paused = textCapture.isPaused();
  return Menu.buildFromTemplate([
    {
      label: paused ? '▶ 恢复' : '⏸ 暂停',
      click: () => {
        if (paused) {
          textCapture.resume();
        } else {
          textCapture.pause();
        }
        // 重新构建菜单以更新标签
        tray.setContextMenu(buildContextMenu());
      }
    },
    { type: 'separator' },
    {
      label: '⚙ 设置',
      click: () => settingsWindow.openSettings()
    },
    { type: 'separator' },
    {
      label: '✕ 退出',
      click: () => app.quit()
    }
  ]);
}

function init() {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip('划词助手');
  tray.setContextMenu(buildContextMenu());

  // 双击打开设置
  tray.on('double-click', () => {
    settingsWindow.openSettings();
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
