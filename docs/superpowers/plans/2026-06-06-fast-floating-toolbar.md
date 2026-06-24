# Fast Floating Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the floating toolbar within a short delay after a valid selection gesture, while selected text capture continues in the background.

**Architecture:** Add a pending capture session in the main text capture path. The session shows a pending toolbar after 40 ms if capture has not resolved, then either updates the same toolbar with text or hides it if no text was captured. Renderer buttons stay visible but disabled during pending state.

**Tech Stack:** Electron main process, `@mukea/uiohook-napi`, Electron `BrowserWindow`, renderer DOM/CSS, Node `node:test`.

---

## File Structure

- Modify `src/main/text-capture.js`: create pending capture sessions, support object-style `init` handlers, and call pending/text/missed callbacks with capture IDs.
- Modify `src/main/index.js`: wire text capture pending callbacks to the floating window.
- Modify `src/main/floating-window.js`: add pending toolbar display/update/hide behavior and capture ID guards.
- Modify `src/renderer/floating/script.js`: add pending UI state, disable actions while text is unavailable, and update state when text arrives.
- Modify `src/renderer/floating/style.css`: add stable disabled/pending toolbar styling without changing layout.
- Modify `tests/text-capture.test.js`: cover pending session timing and stale/ignored capture behavior.

## Assumptions

- The delay target is `40 ms` after a drag or multi-click gesture is recognized.
- Existing selection settle waits remain: `80 ms` for drag selection and `150 ms` for multi-click selection.
- Pinned expanded windows should not be overwritten by a blank pending toolbar; they update only when text is captured.
- If pending was shown and no text is captured, the toolbar hides automatically.
- Existing terminal-like clipboard fallback restrictions remain unchanged.

### Task 1: Add Pending Capture Session Tests

**Files:**
- Modify: `tests/text-capture.test.js`
- Modify: `src/main/text-capture.js`
- Test: `tests/text-capture.test.js`

- [ ] **Step 1: Write failing tests for pending session timing**

Append these tests to `tests/text-capture.test.js`:

```js
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('pending capture session shows pending after delay while unresolved', async () => {
  const { _private } = require('../src/main/text-capture');
  const pendingCalls = [];

  const session = _private.createPendingCaptureSession({
    captureId: 1,
    delayMs: 5,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 123 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => true,
    onPending: (x, y, hwnd, captureId) => {
      pendingCalls.push({ x, y, hwnd, captureId });
    },
    onMissed: () => {}
  });

  await sleep(20);

  assert.deepEqual(pendingCalls, [{ x: 10, y: 20, hwnd: 123, captureId: 1 }]);
  assert.equal(session.wasPendingShown(), true);
  session.markResolved();
});

test('pending capture session does not show after capture resolves before delay', async () => {
  const { _private } = require('../src/main/text-capture');
  const pendingCalls = [];

  const session = _private.createPendingCaptureSession({
    captureId: 2,
    delayMs: 20,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 123 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => true,
    onPending: () => pendingCalls.push('pending'),
    onMissed: () => {}
  });

  session.markResolved();
  await sleep(35);

  assert.deepEqual(pendingCalls, []);
  assert.equal(session.wasPendingShown(), false);
});

test('pending capture session ignores stale captures', async () => {
  const { _private } = require('../src/main/text-capture');
  const pendingCalls = [];

  const session = _private.createPendingCaptureSession({
    captureId: 3,
    delayMs: 5,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 123 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => false,
    onPending: () => pendingCalls.push('pending'),
    onMissed: () => {}
  });

  await sleep(20);

  assert.deepEqual(pendingCalls, []);
  assert.equal(session.wasPendingShown(), false);
  session.markResolved();
});

test('pending capture session does not show for ignored windows', async () => {
  const { _private } = require('../src/main/text-capture');
  const pendingCalls = [];

  const session = _private.createPendingCaptureSession({
    captureId: 4,
    delayMs: 5,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 456 }),
    shouldIgnoreWindow: (hwnd) => hwnd === 456,
    isCurrentCapture: () => true,
    onPending: () => pendingCalls.push('pending'),
    onMissed: () => {}
  });

  await sleep(20);

  assert.deepEqual(pendingCalls, []);
  assert.equal(session.wasPendingShown(), false);
  session.markResolved();
});

test('pending capture session hides when unresolved capture misses after pending was shown', async () => {
  const { _private } = require('../src/main/text-capture');
  const missedCalls = [];

  const session = _private.createPendingCaptureSession({
    captureId: 5,
    delayMs: 5,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 123 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => true,
    onPending: () => {},
    onMissed: (captureId) => missedCalls.push(captureId)
  });

  await sleep(20);
  session.hideIfPending();

  assert.deepEqual(missedCalls, [5]);
  session.markResolved();
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npm test -- tests/text-capture.test.js
```

Expected: FAIL because `_private.createPendingCaptureSession` is not exported.

- [ ] **Step 3: Implement the pending capture session helper**

In `src/main/text-capture.js`, add these constants near `CLIPBOARD_WAIT_MS`:

```js
const PENDING_TOOLBAR_DELAY_MS = 40;
```

Add this helper near `sleep(ms)`:

```js
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
  let pendingShown = false;
  let resolved = false;

  const timer = setTimeout(async () => {
    try {
      const activeWindowInfo = await getActiveWindowInfo();
      if (resolved || !isCurrentCapture(captureId)) return;
      if (shouldIgnoreWindow && shouldIgnoreWindow(activeWindowInfo.hwnd)) return;

      pendingShown = true;
      if (onPending) {
        onPending(mouseX, mouseY, activeWindowInfo.hwnd, captureId);
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
      if (pendingShown && isCurrentCapture(captureId) && onMissed) {
        onMissed(captureId);
      }
    },
    wasPendingShown() {
      return pendingShown;
    }
  };
}
```

At the bottom of `src/main/text-capture.js`, add `_private` to `module.exports`:

```js
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
  _private: { createPendingCaptureSession }
};
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npm test -- tests/text-capture.test.js
```

Expected: PASS for all `text-capture` tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/main/text-capture.js tests/text-capture.test.js
git commit -m "test: cover pending toolbar capture sessions"
```

### Task 2: Wire Pending Sessions Into Text Capture

**Files:**
- Modify: `src/main/text-capture.js`
- Test: `tests/text-capture.test.js`

- [ ] **Step 1: Add handler state and capture ID state**

In `src/main/text-capture.js`, replace the callback declarations:

```js
let onTextCaptured = null;
let onMouseDownCallback = null;
let shouldIgnoreWindow = null;
```

with:

```js
let onTextCaptured = null;
let onCapturePending = null;
let onCaptureMissed = null;
let onMouseDownCallback = null;
let shouldIgnoreWindow = null;
let activeCaptureId = 0;
```

- [ ] **Step 2: Update `init` to accept either a function or handler object**

Replace the start of `init(callback)`:

```js
function init(callback) {
  onTextCaptured = callback;
```

with:

```js
function init(callbackOrHandlers) {
  if (typeof callbackOrHandlers === 'function') {
    onTextCaptured = callbackOrHandlers;
    onCapturePending = null;
    onCaptureMissed = null;
  } else {
    onTextCaptured = callbackOrHandlers?.onTextCaptured || null;
    onCapturePending = callbackOrHandlers?.onCapturePending || null;
    onCaptureMissed = callbackOrHandlers?.onCaptureMissed || null;
  }
```

- [ ] **Step 3: Add a current-capture helper**

Add this function near `sleep(ms)`:

```js
function isCurrentCapture(captureId) {
  return captureId === activeCaptureId;
}
```

- [ ] **Step 4: Replace the `mouseup` async capture flow**

Inside the `uIOhook.on('mouseup', async (e) => { ... })` handler, replace the block from:

```js
    const activeWindowInfoPromise = windowFocus.getForegroundWindowInfo();

    // Let selection settle before reading, especially for double-click selection.
    await sleep(isMultiClick ? 150 : 80);
    const activeWindowInfo = await activeWindowInfoPromise;
    const activeWindowHandle = activeWindowInfo.hwnd;
```

through:

```js
    if (onTextCaptured) {
      console.log(`[TextCapture] Captured text: "${selectedText}"`);
      onTextCaptured(selectedText, e.x, e.y, activeWindowHandle);
    }
```

with:

```js
    const captureId = ++activeCaptureId;
    const activeWindowInfoPromise = windowFocus.getForegroundWindowInfo();
    let activeWindowInfo = null;
    const getActiveWindowInfo = async () => {
      if (!activeWindowInfo) {
        activeWindowInfo = await activeWindowInfoPromise;
      }
      return activeWindowInfo;
    };

    const pendingSession = createPendingCaptureSession({
      captureId,
      mouseX: e.x,
      mouseY: e.y,
      getActiveWindowInfo,
      shouldIgnoreWindow,
      isCurrentCapture,
      onPending: onCapturePending,
      onMissed: onCaptureMissed
    });

    // Let selection settle before reading, especially for double-click selection.
    await sleep(isMultiClick ? 150 : 80);
    activeWindowInfo = await getActiveWindowInfo();
    const activeWindowHandle = activeWindowInfo.hwnd;

    if (!isCurrentCapture(captureId)) {
      pendingSession.markResolved();
      return;
    }

    if (shouldIgnoreWindow && shouldIgnoreWindow(activeWindowHandle)) {
      pendingSession.markResolved();
      pendingSession.hideIfPending();
      console.log('[TextCapture] Ignored own application window');
      return;
    }

    const allowClipboardFallback = !isTerminalLikeWindow(activeWindowInfo);
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

    pendingSession.markResolved();

    if (!isCurrentCapture(captureId)) {
      return;
    }

    if (!selectedText && !allowClipboardFallback) {
      console.log('[TextCapture] Skipping clipboard fallback for terminal-like window:', {
        processName: activeWindowInfo.processName,
        className: activeWindowInfo.className,
        title: activeWindowInfo.title
      });
    }
    console.log('[TextCapture] Selected text:', selectedText ? `"${selectedText}"` : '(empty)');

    if (!selectedText) {
      pendingSession.hideIfPending();
      return;
    }

    if (onTextCaptured) {
      console.log(`[TextCapture] Captured text: "${selectedText}"`);
      onTextCaptured(selectedText, e.x, e.y, activeWindowHandle, captureId);
    }
```

- [ ] **Step 5: Run text capture tests**

Run:

```bash
npm test -- tests/text-capture.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/main/text-capture.js tests/text-capture.test.js
git commit -m "feat: emit pending selection capture state"
```

### Task 3: Add Pending Toolbar Support in the Floating Window

**Files:**
- Modify: `src/main/floating-window.js`
- Modify: `src/main/index.js`
- Test: manual Electron verification

- [ ] **Step 1: Track the latest capture ID in `floating-window.js`**

In `src/main/floating-window.js`, add this near the other module state:

```js
let activeCaptureId = null;
```

- [ ] **Step 2: Add `showPendingWindow`**

In `src/main/floating-window.js`, add this function before `showWindow`:

```js
function showPendingWindow(mouseX, mouseY, restoreFocusHandle = null, captureId = null) {
  if (isPinned && isExpanded) return;

  activeCaptureId = captureId;
  showWindow('', mouseX, mouseY, restoreFocusHandle, { pending: true, captureId });
}
```

- [ ] **Step 3: Extend `showWindow` with pending options**

Change the function signature:

```js
function showWindow(text, mouseX, mouseY, restoreFocusHandle = null) {
```

to:

```js
function showWindow(text, mouseX, mouseY, restoreFocusHandle = null, options = {}) {
```

Add this after settings are loaded and feature flags are checked:

```js
  const isPending = Boolean(options.pending);
  if (options.captureId !== undefined) {
    activeCaptureId = options.captureId;
  }
```

Change the renderer event send:

```js
    win.webContents.send('show-toolbar', { text, settings, pinned: isPinned, expanded: isExpanded });
```

to:

```js
    win.webContents.send('show-toolbar', {
      text,
      settings,
      pinned: isPinned,
      expanded: isExpanded,
      pending: isPending
    });
```

- [ ] **Step 4: Add guarded pending hide**

In `src/main/floating-window.js`, add this function after `hideWindow()`:

```js
function hidePendingWindow(captureId = null) {
  if (captureId !== null && activeCaptureId !== captureId) return;
  if (isPinned || isExpanded) return;
  hideWindow();
}
```

- [ ] **Step 5: Export the pending functions**

At the bottom of `src/main/floating-window.js`, update `module.exports` to include:

```js
showPendingWindow,
hidePendingWindow,
```

The final export object should include the existing exports plus these two names:

```js
module.exports = { showWindow, showPendingWindow, hidePendingWindow, hideWindow, requestHide, extendGrace, isVisible, resizeWindow, collapseWindow, moveWindow, setPinned, getPinned, getWebContents, getWindowHandle, destroy, getOrCreateWindow };
```

- [ ] **Step 6: Wire handlers in `index.js`**

In `src/main/index.js`, replace:

```js
  textCapture.init((text, x, y, activeWindowHandle) => {
    floatingWindow.showWindow(text, x, y, activeWindowHandle);
  });
```

with:

```js
  textCapture.init({
    onCapturePending: (x, y, activeWindowHandle, captureId) => {
      floatingWindow.showPendingWindow(x, y, activeWindowHandle, captureId);
    },
    onTextCaptured: (text, x, y, activeWindowHandle, captureId) => {
      floatingWindow.showWindow(text, x, y, activeWindowHandle, { captureId });
    },
    onCaptureMissed: (captureId) => {
      floatingWindow.hidePendingWindow(captureId);
    }
  });
```

- [ ] **Step 7: Run all unit tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/main/floating-window.js src/main/index.js
git commit -m "feat: show pending floating toolbar"
```

### Task 4: Add Pending State to the Floating Renderer

**Files:**
- Modify: `src/renderer/floating/script.js`
- Modify: `src/renderer/floating/style.css`
- Test: manual Electron verification

- [ ] **Step 1: Add renderer pending state**

In `src/renderer/floating/script.js`, add this near the other top-level state:

```js
let isTextPending = false;
```

- [ ] **Step 2: Read pending flag from `show-toolbar`**

Change the handler signature:

```js
window.api.onShowToolbar(({ text, settings, pinned = false, expanded = false }) => {
```

to:

```js
window.api.onShowToolbar(({ text, settings, pinned = false, expanded = false, pending = false }) => {
```

Replace this section:

```js
  currentText = text;
  currentSettings = settings;
  isPinned = Boolean(pinned);
```

with:

```js
  currentText = pending ? '' : text;
  currentSettings = settings;
  isPinned = Boolean(pinned);
  isTextPending = Boolean(pending);
```

Immediately after `applyFeatureVisibility(settings);`, add:

```js
  applyPendingState();
```

- [ ] **Step 3: Add pending guards to actions**

At the start of `btnTranslate` click handler, after `e.stopPropagation();`, add:

```js
  if (isTextPending || !currentText.trim()) return;
```

At the start of `doTranslate()`, add:

```js
  if (isTextPending || !currentText.trim()) return;
```

At the start of `btnChat` click handler, after `window.api.notifyInteraction();`, add:

```js
  if (isTextPending || !currentText.trim()) return;
```

At the start of `sendChatMessage()`, after `const content = chatInput.value.trim();`, replace:

```js
  if (!content || isStreaming) return;
```

with:

```js
  if (!content || isStreaming || isTextPending) return;
```

- [ ] **Step 4: Add `applyPendingState()`**

In `src/renderer/floating/script.js`, add this function before `applyFeatureVisibility(settings)`:

```js
function applyPendingState() {
  toolbar.classList.toggle('toolbar-pending', isTextPending);

  const disableActions = isTextPending || !currentText.trim();
  btnTranslate.disabled = disableActions;
  btnChat.disabled = disableActions;

  const pendingTitle = '正在读取选中文字...';
  btnTranslate.title = isTextPending ? pendingTitle : '翻译';
  btnChat.title = isTextPending ? pendingTitle : 'AI 对话';
  btnTranslate.setAttribute('aria-label', btnTranslate.title);
  btnChat.setAttribute('aria-label', btnChat.title);
}
```

Then update `applyFeatureVisibility(settings)` by adding this at the end of the function:

```js
  applyPendingState();
```

- [ ] **Step 5: Reset pending state when the window is reset**

In `window.api.onResetUI(() => { ... })`, add this before `resetPanels();`:

```js
  isTextPending = false;
  applyPendingState();
```

- [ ] **Step 6: Style pending and disabled buttons**

In `src/renderer/floating/style.css`, add this after `.toolbar-btn:hover`:

```css
.toolbar-btn:disabled {
  opacity: 0.45;
  cursor: wait;
  transform: none;
}

.toolbar-btn:disabled:hover {
  background: transparent;
  color: var(--text-primary);
}

#toolbar.toolbar-pending .drag-handle {
  color: var(--accent2);
  opacity: 0.85;
}
```

- [ ] **Step 7: Run all unit tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/renderer/floating/script.js src/renderer/floating/style.css
git commit -m "feat: disable toolbar actions while text is pending"
```

### Task 5: End-to-End Verification

**Files:**
- No source file changes expected
- Test: Electron runtime behavior

- [ ] **Step 1: Start the app**

Run:

```bash
npm run dev
```

Expected: Electron tray app starts without console errors.

- [ ] **Step 2: Verify drag selection pending behavior**

Manual check:

1. Open a browser or editor.
2. Drag-select a sentence.
3. Confirm the toolbar appears almost immediately near the mouse after mouseup.
4. Confirm buttons are briefly disabled only while text is pending.
5. Confirm buttons become enabled after selected text arrives.
6. Click translation and confirm it uses the selected text.

- [ ] **Step 3: Verify double-click selection behavior**

Manual check:

1. Double-click an English word in a browser or editor.
2. Confirm the toolbar appears quickly.
3. Confirm translation opens and uses the double-clicked word.

- [ ] **Step 4: Verify no-text miss behavior**

Manual check:

1. Drag in an area that does not produce selected text.
2. If the pending toolbar appears, confirm it hides automatically after capture fails.

- [ ] **Step 5: Verify own-window ignore behavior**

Manual check:

1. Open the floating toolbar.
2. Click or drag inside the toolbar/settings/chat app windows.
3. Confirm no new pending toolbar is shown for the app's own windows.

- [ ] **Step 6: Verify pinned expanded behavior**

Manual check:

1. Open translation or chat panel.
2. Pin it.
3. Select new text in another app.
4. Confirm no blank pending state overwrites the pinned expanded panel.
5. Confirm the panel updates after selected text is captured.

- [ ] **Step 7: Commit final verification note if any source changes were needed**

If verification required source fixes, commit them:

```bash
git add src/main/text-capture.js src/main/floating-window.js src/main/index.js src/renderer/floating/script.js src/renderer/floating/style.css tests/text-capture.test.js
git commit -m "fix: polish pending toolbar behavior"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: The plan implements方案 C by showing a pending toolbar after a short delay while text capture continues, then updating or hiding based on capture result.
- Placeholder scan: No task uses placeholder language. Each code-changing step includes the concrete code to add or replace.
- Type consistency: Capture IDs are consistently passed as `captureId`; pending handlers are consistently named `onCapturePending`, `onTextCaptured`, and `onCaptureMissed`.
