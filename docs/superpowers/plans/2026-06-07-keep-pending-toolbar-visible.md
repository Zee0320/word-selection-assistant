# Keep Pending Toolbar Visible Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the floating toolbar visible when the user clicks inside it during the gray pending state, while preserving outside-click hide behavior.

**Architecture:** Add a small pure hit-test helper that converts uiohook physical mouse coordinates to Electron DIP coordinates and checks whether the click is inside the current floating window bounds. Wire global mousedown handling through that helper in the main process so inside clicks extend the grace period instead of scheduling a hide. Renderer behavior remains unchanged except for relying on the main-process guard as the source of truth.

**Tech Stack:** Electron main process, `@mukea/uiohook-napi` mouse coordinates, Node `node:test`.

---

## File Structure

- Create `src/main/floating-window-hit-test.js`: pure helper for checking whether a physical mouse point is inside a BrowserWindow's DIP bounds.
- Create `tests/floating-window-hit-test.test.js`: focused unit tests for hit-test conversion, padding, destroyed windows, and missing bounds.
- Modify `src/main/floating-window.js`: use the hit-test helper in `requestHide(mouseX, mouseY)` and keep inside clicks visible.
- Modify `src/main/index.js`: pass global mousedown coordinates into `floatingWindow.requestHide(x, y)`.

## Behavior Contract

- Clicking a gray pending toolbar button keeps the toolbar visible and does not run translate/chat.
- Clicking another area inside the toolbar keeps the toolbar visible.
- Clicking outside the toolbar still hides it after the existing `requestHide` delay.
- Pending capture failure still hides through `hidePendingWindow(captureId)` and the existing watchdog.
- Pinned expanded windows keep their existing behavior.

### Task 1: Add Testable Window Hit-Test Helper

**Files:**
- Create: `src/main/floating-window-hit-test.js`
- Create: `tests/floating-window-hit-test.test.js`

- [ ] **Step 1: Write the failing hit-test tests**

Create `tests/floating-window-hit-test.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isPhysicalPointInsideWindow,
  isPointInsideBounds
} = require('../src/main/floating-window-hit-test');

function createWindow(bounds, destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    getBounds: () => bounds
  };
}

test('isPointInsideBounds accepts points inside bounds', () => {
  assert.equal(isPointInsideBounds({ x: 110, y: 120 }, { x: 100, y: 100, width: 50, height: 40 }), true);
});

test('isPointInsideBounds rejects points outside bounds', () => {
  assert.equal(isPointInsideBounds({ x: 99, y: 120 }, { x: 100, y: 100, width: 50, height: 40 }), false);
  assert.equal(isPointInsideBounds({ x: 151, y: 120 }, { x: 100, y: 100, width: 50, height: 40 }), false);
  assert.equal(isPointInsideBounds({ x: 110, y: 99 }, { x: 100, y: 100, width: 50, height: 40 }), false);
  assert.equal(isPointInsideBounds({ x: 110, y: 141 }, { x: 100, y: 100, width: 50, height: 40 }), false);
});

test('isPointInsideBounds supports small padding for edge clicks', () => {
  assert.equal(isPointInsideBounds({ x: 98, y: 120 }, { x: 100, y: 100, width: 50, height: 40 }, 2), true);
  assert.equal(isPointInsideBounds({ x: 97, y: 120 }, { x: 100, y: 100, width: 50, height: 40 }, 2), false);
});

test('isPhysicalPointInsideWindow converts physical coordinates to DIP before hit-test', () => {
  const screenApi = {
    screenToDipPoint: ({ x, y }) => ({ x: x / 2, y: y / 2 })
  };
  const win = createWindow({ x: 100, y: 100, width: 50, height: 40 });

  assert.equal(isPhysicalPointInsideWindow(220, 240, win, screenApi), true);
  assert.equal(isPhysicalPointInsideWindow(400, 240, win, screenApi), false);
});

test('isPhysicalPointInsideWindow rejects destroyed or missing windows', () => {
  const screenApi = { screenToDipPoint: point => point };

  assert.equal(isPhysicalPointInsideWindow(110, 120, null, screenApi), false);
  assert.equal(isPhysicalPointInsideWindow(110, 120, createWindow({ x: 100, y: 100, width: 50, height: 40 }, true), screenApi), false);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --test tests/floating-window-hit-test.test.js
```

Expected: FAIL with a module-not-found error for `src/main/floating-window-hit-test.js`.

- [ ] **Step 3: Implement the hit-test helper**

Create `src/main/floating-window-hit-test.js`:

```js
function isPointInsideBounds(point, bounds, padding = 0) {
  if (!point || !bounds) return false;

  const left = bounds.x - padding;
  const top = bounds.y - padding;
  const right = bounds.x + bounds.width + padding;
  const bottom = bounds.y + bounds.height + padding;

  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function toDipPoint(point, screenApi) {
  if (screenApi && typeof screenApi.screenToDipPoint === 'function') {
    return screenApi.screenToDipPoint(point);
  }
  return point;
}

function isPhysicalPointInsideWindow(mouseX, mouseY, windowRef, screenApi, padding = 2) {
  if (!windowRef || windowRef.isDestroyed?.()) return false;

  const bounds = windowRef.getBounds?.();
  if (!bounds) return false;

  const dipPoint = toDipPoint({ x: mouseX, y: mouseY }, screenApi);
  return isPointInsideBounds(dipPoint, bounds, padding);
}

module.exports = {
  isPhysicalPointInsideWindow,
  isPointInsideBounds,
  toDipPoint
};
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
node --test tests/floating-window-hit-test.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/main/floating-window-hit-test.js tests/floating-window-hit-test.test.js
git commit -m "test: cover floating window hit testing"
```

### Task 2: Preserve Pending Toolbar on Inside Click

**Files:**
- Modify: `src/main/floating-window.js`
- Modify: `src/main/index.js`
- Test: `tests/floating-window-hit-test.test.js`

- [ ] **Step 1: Import the hit-test helper**

In `src/main/floating-window.js`, add this import after the existing `windowFocus` import:

```js
const { isPhysicalPointInsideWindow } = require('./floating-window-hit-test');
```

- [ ] **Step 2: Update `requestHide` to accept coordinates and keep inside clicks visible**

Replace the current `requestHide()` function in `src/main/floating-window.js` with:

```js
function requestHide(mouseX = null, mouseY = null) {
  console.log('[requestHide] Called, time since show:', Date.now() - lastShowTime, 'ms');
  if (isExpanded && isPinned) {
    console.log('[requestHide] Window is pinned, ignoring');
    return;
  }
  if (
    mouseX !== null &&
    mouseY !== null &&
    isPhysicalPointInsideWindow(mouseX, mouseY, floatingWin, screen)
  ) {
    console.log('[requestHide] Click inside floating window, keeping visible');
    extendGrace();
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
```

- [ ] **Step 3: Pass mouse coordinates from global mousedown**

In `src/main/index.js`, replace:

```js
  textCapture.setOnMouseDown(() => {
    if (floatingWindow.isVisible()) {
      floatingWindow.requestHide();
    }
  });
```

with:

```js
  textCapture.setOnMouseDown((x, y) => {
    if (floatingWindow.isVisible()) {
      floatingWindow.requestHide(x, y);
    }
  });
```

- [ ] **Step 4: Run all tests**

Run:

```bash
npm test
```

Expected: PASS, including the new hit-test tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/main/floating-window.js src/main/index.js
git commit -m "fix: keep pending toolbar visible on inside click"
```

### Task 3: Runtime Verification

**Files:**
- No source changes expected
- Test: local Electron runtime

- [ ] **Step 1: Stop old packaged app instances before testing**

Run:

```powershell
Get-Process | Where-Object { $_.ProcessName -like 'Word Selection Assistant*' } | Select-Object Id,ProcessName,Path
```

If a packaged `dist\Word Selection Assistant 1.0.0.exe` process is running, close it from the tray or stop that exact process before starting dev mode:

```powershell
Stop-Process -Id <PID> -Force
```

Expected: no packaged app instance remains.

- [ ] **Step 2: Start current source build**

Run:

```bash
npm run dev
```

Expected output includes:

```text
[Tray] System tray initialized
[TextCapture] Started global hook
[Main] Application ready
```

- [ ] **Step 3: Verify pending gray click behavior**

Manual check:

1. Select text in another app.
2. When the gray pending toolbar appears, click the gray translate button.
3. Confirm the toolbar remains visible.
4. Click another gray area inside the toolbar.
5. Confirm the toolbar remains visible.
6. Click outside the toolbar.
7. Confirm the toolbar hides.

- [ ] **Step 4: Verify normal usable state still works**

Manual check:

1. Select text that the app can capture.
2. Confirm the toolbar becomes usable after capture completes.
3. Click translate or AI chat.
4. Confirm the panel opens and uses the selected text.

- [ ] **Step 5: Commit any verification fixes**

If runtime verification requires source changes, commit them:

```bash
git add src/main/floating-window.js src/main/index.js src/main/floating-window-hit-test.js tests/floating-window-hit-test.test.js
git commit -m "fix: polish pending toolbar click behavior"
```

If no source fixes are needed, do not create an empty commit.

## Self-Review

- Spec coverage: Task 1 covers coordinate hit-testing; Task 2 wires the hit-test into global hide behavior; Task 3 verifies pending gray clicks, outside clicks, and normal usable state.
- Placeholder scan: No placeholders remain. Commands, files, and code snippets are concrete.
- Type consistency: The helper is consistently named `isPhysicalPointInsideWindow`; `requestHide` consistently accepts `(mouseX, mouseY)` and `index.js` passes `(x, y)`.
