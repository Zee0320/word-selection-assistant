// src/main/floating-window.js - 悬浮窗管理
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { getSettings } = require('./store');
const windowFocus = require('./window-focus');

let floatingWin = null;
let isExpanded = false;
let isPinned = false;
let enableInteractionTimer = null;

// 显示时间戳，用于防止 mousedown 事件在 show 之后立刻隐藏
let lastShowTime = 0;
const SHOW_GRACE_MS = 300; // 显示后 300ms 内不响应 mousedown 隐藏

function getOrCreateWindow() {
  if (floatingWin && !floatingWin.isDestroyed()) {
    return floatingWin;
  }

  floatingWin = new BrowserWindow({
    width: 320,
    height: 56,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    focusable: false, // 默认不可聚焦，避免抢焦点
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, '../preload/floating-preload.js')
    }
  });
  floatingWin.loadFile(path.join(__dirname, '../renderer/floating/index.html'));

  // 失焦时请求隐藏（使用 requestHide 而不是直接 hideWindow，
  // 这样如果是因为点击了自身按钮导致的短暂失焦，可以被取消）
  floatingWin.on('blur', () => {
    if (isExpanded && !isPinned) {
      requestHide();
    }
  });

  floatingWin.on('closed', () => {
    floatingWin = null;
  });

  return floatingWin;
}

function showWindow(text, mouseX, mouseY, restoreFocusHandle = null) {
  console.log(`[showWindow] text=${text}, x=${mouseX}, y=${mouseY}`);
  const settings = getSettings();

  if (!settings.translationEnabled && !settings.aiChatEnabled) {
    return;
  }

  if (!isPinned) {
    isExpanded = false;
  }
  const win = getOrCreateWindow();
  if (enableInteractionTimer) {
    clearTimeout(enableInteractionTimer);
    enableInteractionTimer = null;
  }

  if (!(isPinned && isExpanded)) {
    // 将 uiohook 的物理坐标转换为 Electron DIP 坐标
    const dipPoint = screen.screenToDipPoint({ x: mouseX, y: mouseY });
    const { x, y } = clampToScreen(dipPoint.x + 10, dipPoint.y + 10, 320, 56);
    win.setBounds({ x: Math.round(x), y: Math.round(y), width: 320, height: 56 });
  }

  const sendAndShow = () => {
    win.webContents.send('show-toolbar', { text, settings, pinned: isPinned, expanded: isExpanded });
    if (isPinned && isExpanded) {
      if (!win.isVisible()) win.showInactive();
      windowFocus.restoreForegroundWindow(restoreFocusHandle);
    } else {
      win.setFocusable(false);
      // showInactive() avoids activating the floating toolbar when text is selected.
      // Some apps, especially WeChat, drop their editor focus if another window is activated.
      win.showInactive();
      windowFocus.restoreForegroundWindow(restoreFocusHandle);
      enableInteractionTimer = setTimeout(() => {
        enableInteractionTimer = null;
        if (!floatingWin || floatingWin.isDestroyed()) return;
        // Re-enable clicks after the passive show. Keeping focusable=false permanently
        // prevents toolbar button clicks from reaching the renderer reliably on Windows.
        floatingWin.setFocusable(true);
        windowFocus.restoreForegroundWindow(restoreFocusHandle);
      }, 120);
    }
    lastShowTime = Date.now();
    console.log('[showWindow] Window shown');
  };

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', sendAndShow);
  } else {
    sendAndShow();
  }
}

function hideWindow() {
  console.log(`[hideWindow] Called`);
  isExpanded = false;
  isPinned = false;
  if (enableInteractionTimer) {
    clearTimeout(enableInteractionTimer);
    enableInteractionTimer = null;
  }
  if (floatingWin && !floatingWin.isDestroyed()) {
    floatingWin.hide();
    floatingWin.setFocusable(false);
    floatingWin.webContents.send('reset-ui');
  }
}

// 延迟隐藏的定时器
let pendingHideTimer = null;

/**
 * 从外部（mousedown 钩子）请求隐藏。
 */
function requestHide() {
  console.log('[requestHide] Called, time since show:', Date.now() - lastShowTime, 'ms');
  if (isExpanded && isPinned) {
    console.log('[requestHide] Window is pinned, ignoring');
    return;
  }
  if (Date.now() - lastShowTime < SHOW_GRACE_MS) {
    console.log('[requestHide] In grace period, ignoring');
    return;
  }
  if (pendingHideTimer) clearTimeout(pendingHideTimer);
  pendingHideTimer = setTimeout(() => {
    console.log('[requestHide] Timer fired, hiding window');
    pendingHideTimer = null;
    hideWindow();
  }, 100);
}

/**
 * 延长保护期 + 取消待执行的隐藏（用户与悬浮窗交互时调用）
 */
function extendGrace() {
  lastShowTime = Date.now();
  if (pendingHideTimer) {
    clearTimeout(pendingHideTimer);
    pendingHideTimer = null;
    console.log('[extendGrace] Cancelled pending hide');
  }
}

function isVisible() {
  return floatingWin && !floatingWin.isDestroyed() && floatingWin.isVisible();
}

function resizeWindow(width, height) {
  console.log(`[resizeWindow] width=${width}, height=${height}`);
  if (floatingWin && !floatingWin.isDestroyed()) {
    isExpanded = true;

    const [x, y] = floatingWin.getPosition();
    const clamped = clampToScreen(x, y, width, height);

    floatingWin.setSize(Math.round(width), Math.round(height));

    if (clamped.x !== x || clamped.y !== y) {
      floatingWin.setPosition(Math.round(clamped.x), Math.round(clamped.y));
    }

    // 展开面板时设置为可聚焦（用于输入框等）
    floatingWin.setFocusable(true);
    if (isPinned) {
      floatingWin.showInactive();
    } else {
      floatingWin.show();
    }
    lastShowTime = Date.now();

    console.log(`[resizeWindow] Done, isExpanded=${isExpanded}`);
  }
}

function collapseWindow() {
  console.log(`[collapseWindow] Called`);
  isExpanded = false;
  isPinned = false;
  if (floatingWin && !floatingWin.isDestroyed()) {
    floatingWin.setSize(320, 56);
    floatingWin.setFocusable(false); // 收起后不可聚焦，避免抢焦点
  }
}

function setPinned(pinned) {
  isPinned = Boolean(pinned) && isExpanded;
  console.log(`[setPinned] isPinned=${isPinned}, isExpanded=${isExpanded}`);
  return isPinned;
}

function getPinned() {
  return isPinned;
}

function moveWindow(deltaX, deltaY) {
  if (floatingWin && !floatingWin.isDestroyed()) {
    const [x, y] = floatingWin.getPosition();
    floatingWin.setPosition(Math.round(x + deltaX), Math.round(y + deltaY));
  }
}

function clampToScreen(x, y, w, h) {
  const display = screen.getDisplayNearestPoint({ x, y });
  const { bounds } = display;
  const xClamped = Math.min(x, bounds.x + bounds.width - w);
  const yClamped = Math.min(y, bounds.y + bounds.height - h);
  return {
    x: Math.max(bounds.x, xClamped),
    y: Math.max(bounds.y, yClamped)
  };
}

function getWebContents() {
  if (floatingWin && !floatingWin.isDestroyed()) {
    return floatingWin.webContents;
  }
  return null;
}

function getWindowHandle() {
  if (floatingWin && !floatingWin.isDestroyed()) {
    return windowFocus.nativeWindowHandleToNumber(floatingWin.getNativeWindowHandle());
  }
  return null;
}

function destroy() {
  isPinned = false;
  isExpanded = false;
  if (floatingWin && !floatingWin.isDestroyed()) {
    floatingWin.destroy();
    floatingWin = null;
  }
}

module.exports = { showWindow, hideWindow, requestHide, extendGrace, isVisible, resizeWindow, collapseWindow, moveWindow, setPinned, getPinned, getWebContents, getWindowHandle, destroy, getOrCreateWindow };
