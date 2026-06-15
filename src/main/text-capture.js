// src/main/text-capture.js - global text selection capture
const { clipboard } = require('electron');
const windowFocus = require('./window-focus');
const { isAutomaticTextCaptureSupported } = require('./platform-info');
const { readSelectedTextViaUIAutomation } = require('./selected-text-reader');
const { readSelectedTextWithFallback } = require('./selected-text-capture-strategy');

let isEnabled = true;
let onTextCaptured = null;
let onMouseDownCallback = null;
let shouldIgnoreWindow = null;
let activeCaptureId = 0;
let ignoreCurrentMouseGesture = false;

let mouseDownX = 0;
let mouseDownY = 0;
let lastMouseUpTime = 0;
let lastMouseUpX = null;
let lastMouseUpY = null;
let clickCount = 0;
let hookApi = null;
let hookLoadAttempted = false;

const DRAG_THRESHOLD = 5;
const MULTI_CLICK_DISTANCE = 8;
const CLIPBOARD_WAIT_MS = 150;
const SELECTION_SETTLE_MS = 160;
const PENDING_TOOLBAR_DELAY_MS = 20;
const PENDING_WINDOW_INFO_BUDGET_MS = 10;

function getHookApi() {
  if (!isAutomaticTextCaptureSupported()) return null;
  if (hookLoadAttempted) return hookApi;

  hookLoadAttempted = true;
  try {
    hookApi = require('@mukea/uiohook-napi');
  } catch (err) {
    console.warn('[TextCapture] Global hook unavailable:', err.message || err);
    hookApi = null;
  }
  return hookApi;
}

function setOnMouseDown(cb) {
  onMouseDownCallback = cb;
}

function setShouldIgnoreWindow(cb) {
  shouldIgnoreWindow = cb;
}

function init(callbackOrHandlers) {
  // Support both callback function and object format for backward compatibility
  if (typeof callbackOrHandlers === 'function') {
    onTextCaptured = callbackOrHandlers;
  } else {
    onTextCaptured = callbackOrHandlers?.onTextCaptured || null;
  }

  const hook = getHookApi();

  if (!hook) {
    console.log('[TextCapture] Automatic capture unavailable on this platform; use manual AI chat entry');
    return;
  }

  hook.uIOhook.on('mousedown', (e) => {
    mouseDownX = e.x;
    mouseDownY = e.y;
    ignoreCurrentMouseGesture = false;
    if (onMouseDownCallback) {
      ignoreCurrentMouseGesture = Boolean(onMouseDownCallback(e.x, e.y));
    }
  });

  hook.uIOhook.on('mouseup', async (e) => {
    if (!isEnabled) return;
    if (ignoreCurrentMouseGesture) {
      ignoreCurrentMouseGesture = false;
      return;
    }

    const now = Date.now();
    if (isRepeatedMouseUp(e, lastMouseUpX, lastMouseUpY, now, lastMouseUpTime)) {
      clickCount++;
    } else {
      clickCount = 1;
    }
    lastMouseUpTime = now;
    lastMouseUpX = e.x;
    lastMouseUpY = e.y;

    const dx = Math.abs(e.x - mouseDownX);
    const dy = Math.abs(e.y - mouseDownY);
    const isDrag = dx >= DRAG_THRESHOLD || dy >= DRAG_THRESHOLD;
    const isMultiClick = clickCount >= 2;

    if (!isDrag && !isMultiClick) return;

    const captureId = ++activeCaptureId;
    const activeWindowInfoPromise = windowFocus.getForegroundWindowInfo();
    let cachedActiveWindowInfo = null;
    const getActiveWindowInfo = async () => {
      if (!cachedActiveWindowInfo) {
        cachedActiveWindowInfo = await activeWindowInfoPromise;
      }
      return cachedActiveWindowInfo;
    };

    // Let selection settle before reading, especially for double-click selection.
    await sleep(SELECTION_SETTLE_MS);
    const activeWindowInfo = await getActiveWindowInfo();
    if (!isCurrentCapture(captureId)) {
      return;
    }

    const activeWindowHandle = activeWindowInfo.hwnd;

    if (shouldIgnoreWindow && shouldIgnoreWindow(activeWindowHandle)) {
      console.log('[TextCapture] Ignored own application window');
      return;
    }

    const allowClipboardFallback = true;
    const selectedText = await readSelectedTextWithFallback({
      readViaUIAutomation: async () => {
        const text = await readSelectedTextViaUIAutomation();
        if (text) {
          console.log('[TextCapture] Selected text via UIA:', `"${text}"`);
        }
        return text;
      },
      readViaClipboardFallback: captureSelectedTextFromClipboard,
      allowClipboardFallback
    });

    if (!isCurrentCapture(captureId)) {
      return;
    }

    const trimmedText = String(selectedText || '').trim();
    console.log('[TextCapture] Selected text:', trimmedText ? `"${trimmedText}"` : '(empty)');

    if (!shouldShowToolbarForCapturedText(trimmedText)) {
      return;
    }

    if (onTextCaptured) {
      console.log(`[TextCapture] Captured text: "${trimmedText}"`);
      onTextCaptured(trimmedText, e.x, e.y, activeWindowHandle, captureId);
    }
  });

  hook.uIOhook.start();
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
  const hook = getHookApi();
  if (!hook) return;

  hook.uIOhook.stop();
  console.log('[TextCapture] Stopped');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRepeatedMouseUp(e, previousX, previousY, now, previousTime) {
  if (previousX === null || previousY === null) return false;
  if (now - previousTime >= 500) return false;

  return (
    Math.abs(e.x - previousX) <= MULTI_CLICK_DISTANCE &&
    Math.abs(e.y - previousY) <= MULTI_CLICK_DISTANCE
  );
}

function withTimeout(promise, timeoutMs, fallback = null) {
  let timer = null;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isCurrentCapture(captureId) {
  return captureId === activeCaptureId;
}

function shouldShowToolbarForCapturedText(text) {
  return String(text || '').trim().length > 0;
}

function createPendingCaptureSession({
  captureId,
  delayMs = PENDING_TOOLBAR_DELAY_MS,
  mouseX,
  mouseY,
  getActiveWindowInfo,
  shouldIgnoreWindow,
  isCurrentCapture,
  onPending,
  onMissed,
  logger = console
}) {
  let resolved = false;
  let pendingShown = false;

  const timer = setTimeout(async () => {
    try {
      const activeWindowInfo = await withTimeout(
        getActiveWindowInfo(),
        PENDING_WINDOW_INFO_BUDGET_MS,
        null
      );
      const hwnd = activeWindowInfo?.hwnd;
      if (resolved || !isCurrentCapture(captureId)) {
        return;
      }
      if (hwnd && shouldIgnoreWindow?.(hwnd)) {
        return;
      }

      if (onPending) {
        pendingShown = true;
        onPending(mouseX, mouseY, hwnd, captureId);
      }
    } catch (err) {
      logger.warn?.('[TextCapture] Pending toolbar skipped:', err.message || err);
    }
  }, delayMs);

  return {
    markResolved() {
      resolved = true;
      clearTimeout(timer);
    },
    hideIfPending() {
      const shouldHide = pendingShown;
      resolved = true;
      clearTimeout(timer);

      if (shouldHide) {
        pendingShown = false;
        onMissed?.(captureId);
      }
    },
    wasPendingShown() {
      return pendingShown;
    }
  };
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
  const hook = getHookApi();
  if (!hook) {
    throw new Error('Global hook unavailable');
  }

  hook.uIOhook.keyToggle(hook.UiohookKey.Ctrl, 'down');
  hook.uIOhook.keyTap(hook.UiohookKey.C);
  hook.uIOhook.keyToggle(hook.UiohookKey.Ctrl, 'up');
}

async function captureSelectedTextFromClipboard({
  clipboardApi = clipboard,
  copySelection = copySelectionToClipboard,
  logger = console,
  waitTimeout = CLIPBOARD_WAIT_MS,
  sentinel = null
} = {}) {
  const snapshot = createClipboardSnapshot(clipboardApi, logger);
  logger.log?.('[TextCapture] Backup clipboard:', snapshot.text ? `"${snapshot.text.substring(0, 50)}"` : '(empty)');

  const actualSentinel = sentinel || `__WSA_CAPTURE_${Date.now()}_${Math.random().toString(16).slice(2)}__`;
  try {
    clipboardApi.writeText(actualSentinel);
    copySelection();
    const copied = await waitForClipboardChange(actualSentinel, waitTimeout, clipboardApi);
    return copied === actualSentinel ? '' : String(copied || '').trim();
  } catch (err) {
    logger.warn?.('[TextCapture] Capture selected text failed:', err.message || err);
    return '';
  } finally {
    const restored = restoreClipboardSnapshot(snapshot, clipboardApi, logger);
    logger.log?.('[TextCapture] Clipboard restore:', restored ? 'SUCCESS' : 'FAILED');
  }
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
  setShouldIgnoreWindow,
  _private: {
    createPendingCaptureSession,
    isRepeatedMouseUp,
    shouldShowToolbarForCapturedText
  }
};
