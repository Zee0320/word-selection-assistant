// src/main/text-capture.js - global text selection capture
const { clipboard } = require('electron');
const { uIOhook, UiohookKey } = require('@mukea/uiohook-napi');
const windowFocus = require('./window-focus');

let isEnabled = true;
let onTextCaptured = null;
let onMouseDownCallback = null;
let shouldIgnoreWindow = null;

let mouseDownX = 0;
let mouseDownY = 0;
let lastMouseUpTime = 0;
let clickCount = 0;

const DRAG_THRESHOLD = 5;
const CLIPBOARD_WAIT_MS = 150;

function setOnMouseDown(cb) {
  onMouseDownCallback = cb;
}

function setShouldIgnoreWindow(cb) {
  shouldIgnoreWindow = cb;
}

function init(callback) {
  onTextCaptured = callback;

  uIOhook.on('mousedown', (e) => {
    mouseDownX = e.x;
    mouseDownY = e.y;
    if (onMouseDownCallback) {
      onMouseDownCallback(e.x, e.y);
    }
  });

  uIOhook.on('mouseup', async (e) => {
    if (!isEnabled) return;

    const now = Date.now();
    if (now - lastMouseUpTime < 500) {
      clickCount++;
    } else {
      clickCount = 1;
    }
    lastMouseUpTime = now;

    const dx = Math.abs(e.x - mouseDownX);
    const dy = Math.abs(e.y - mouseDownY);
    const isDrag = dx >= DRAG_THRESHOLD || dy >= DRAG_THRESHOLD;
    const isMultiClick = clickCount >= 2;

    if (!isDrag && !isMultiClick) return;

    const activeWindowHandlePromise = windowFocus.getForegroundWindow();

    // Let selection settle before copying, especially for double-click selection.
    await sleep(isMultiClick ? 150 : 80);
    const activeWindowHandle = await activeWindowHandlePromise;

    if (shouldIgnoreWindow && shouldIgnoreWindow(activeWindowHandle)) {
      console.log('[TextCapture] Ignored own application window');
      return;
    }

    const selectedText = await captureSelectedTextFromClipboard();
    console.log('[TextCapture] Selected text:', selectedText ? `"${selectedText}"` : '(empty)');

    if (!selectedText) return;

    if (onTextCaptured) {
      console.log(`[TextCapture] Captured text: "${selectedText}"`);
      onTextCaptured(selectedText, e.x, e.y, activeWindowHandle);
    }
  });

  uIOhook.start();
  console.log('[TextCapture] Started global hook');
}

function pause() {
  isEnabled = false;
  console.log('[TextCapture] Paused');
}

function resume() {
  isEnabled = true;
  console.log('[TextCapture] Resumed');
}

function isPaused() {
  return !isEnabled;
}

function destroy() {
  uIOhook.stop();
  console.log('[TextCapture] Stopped');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hasNonEmptyImage(image) {
  if (!image) return false;
  if (typeof image.isEmpty === 'function') {
    return !image.isEmpty();
  }
  return true;
}

function safeCall(fn, fallback, label, logger = console) {
  try {
    return fn();
  } catch (err) {
    logger.warn?.(`[TextCapture] ${label} failed:`, err.message || err);
    return fallback;
  }
}

function createClipboardSnapshot(clipboardApi = clipboard, logger = console) {
  const formats = safeCall(
    () => clipboardApi.availableFormats?.() || [],
    [],
    'Read clipboard formats',
    logger
  );
  const text = safeCall(
    () => clipboardApi.readText?.() || '',
    '',
    'Read clipboard text',
    logger
  );
  const image = safeCall(
    () => clipboardApi.readImage?.() || null,
    null,
    'Read clipboard image',
    logger
  );

  return {
    formats,
    text,
    image: hasNonEmptyImage(image) ? image : null
  };
}

function restoreClipboardSnapshot(snapshot, clipboardApi = clipboard, logger = console) {
  if (!snapshot) return false;

  return safeCall(
    () => {
      if (hasNonEmptyImage(snapshot.image)) {
        const data = { image: snapshot.image };
        if (snapshot.text) data.text = snapshot.text;
        if (typeof clipboardApi.write === 'function') {
          clipboardApi.write(data);
        } else {
          clipboardApi.writeImage?.(snapshot.image);
        }
      } else {
        clipboardApi.writeText?.(snapshot.text || '');
      }
      return true;
    },
    false,
    'Restore clipboard',
    logger
  );
}

function copySelectionToClipboard() {
  uIOhook.keyToggle(UiohookKey.Ctrl, 'down');
  uIOhook.keyTap(UiohookKey.C);
  uIOhook.keyToggle(UiohookKey.Ctrl, 'up');
}

async function captureSelectedTextFromClipboard({
  clipboardApi = clipboard,
  copySelection = copySelectionToClipboard,
  logger = console,
  waitTimeout = CLIPBOARD_WAIT_MS
} = {}) {
  const snapshot = createClipboardSnapshot(clipboardApi, logger);
  logger.log?.('[TextCapture] Backup clipboard:', snapshot.text ? `"${snapshot.text.substring(0, 50)}"` : '(empty)');

  let selectedText = '';
  try {
    clipboardApi?.writeText?.('');
    copySelection();
    selectedText = (await waitForClipboardChange('', waitTimeout, clipboardApi)).trim();
  } catch (err) {
    logger.warn?.('[TextCapture] Capture selected text failed:', err.message || err);
    selectedText = '';
  } finally {
    const restored = restoreClipboardSnapshot(snapshot, clipboardApi, logger);
    logger.log?.('[TextCapture] Clipboard restore:', restored ? 'SUCCESS' : 'FAILED');
  }

  return selectedText;
}

async function waitForClipboardChange(prevText, timeout, clipboardApi = clipboard) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const newText = clipboardApi.readText();
    if (newText !== prevText) {
      return newText;
    }
    await sleep(10);
  }
  return clipboardApi.readText();
}

module.exports = {
  captureSelectedTextFromClipboard,
  createClipboardSnapshot,
  destroy,
  init,
  isPaused,
  pause,
  resume,
  restoreClipboardSnapshot,
  setOnMouseDown,
  setShouldIgnoreWindow
};
