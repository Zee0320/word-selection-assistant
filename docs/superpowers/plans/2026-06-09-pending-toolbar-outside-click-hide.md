# Pending Toolbar Outside Click Hide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a pending floating toolbar disappear when the user clicks outside it, while preserving the current inside-click protection.

**Architecture:** Keep the behavior inside `src/main/floating-window.js` because `requestHide(mouseX, mouseY)` is the single main-process decision point for global mouse-down hide requests. Use the existing `isPhysicalPointInsideWindow()` result to split pending clicks into inside and outside behavior.

**Tech Stack:** Electron main process, Node.js built-in test runner, existing CommonJS test fakes.

---

## File Structure

- Modify: `tests/floating-window.test.js`
  - Add test coverage for pending toolbar outside clicks.
  - Adjust the floating-window hit-test fake so individual tests can simulate inside vs outside clicks.
- Modify: `src/main/floating-window.js`
  - Change only the pending branch in `requestHide()` so pending state consumes inside clicks but allows outside clicks to follow normal hide behavior.

---

### Task 1: Add Failing Coverage For Pending Outside Click

**Files:**
- Modify: `tests/floating-window.test.js`

- [ ] **Step 1: Update the test fake to allow per-test hit-test behavior**

Change the helper signature and add a local `hitTestResult` option near the top of `tests/floating-window.test.js`:

```js
function loadFloatingWindowWithFakes({ hitTestResult = false } = {}) {
  const floatingWindowPath = require.resolve('../src/main/floating-window');
  delete require.cache[floatingWindowPath];
```

Then replace the current hit-test fake:

```js
if (parent?.filename === floatingWindowPath && request === './floating-window-hit-test') {
  return { isPhysicalPointInsideWindow: () => false };
}
```

with:

```js
if (parent?.filename === floatingWindowPath && request === './floating-window-hit-test') {
  return { isPhysicalPointInsideWindow: () => hitTestResult };
}
```

- [ ] **Step 2: Make the existing pending inside-click tests explicit**

In `tests/floating-window.test.js`, update these two tests to pass `hitTestResult: true`:

```js
test('pending toolbar click reports the mouse gesture as consumed', () => {
  const { floatingWindow } = loadFloatingWindowWithFakes({ hitTestResult: true });
```

```js
test('pending toolbar interaction restores the original foreground window', () => {
  const { floatingWindow, restoredHandles } = loadFloatingWindowWithFakes({ hitTestResult: true });
```

- [ ] **Step 3: Add a failing outside-click test**

Add this test after `pending toolbar click reports the mouse gesture as consumed`:

```js
test('pending toolbar outside click hides without consuming the mouse gesture', async () => {
  const { floatingWindow, createdWindows } = loadFloatingWindowWithFakes({ hitTestResult: false });

  try {
    floatingWindow.showPendingWindow(100, 100, 123, 1);

    assert.equal(floatingWindow.requestHide(500, 500), false);
    await delay(150);

    assert.equal(createdWindows[0].isVisible(), false);
  } finally {
    floatingWindow.hideWindow();
  }
});
```

- [ ] **Step 4: Run the focused test and verify it fails**

Run:

```bash
npm test -- tests/floating-window.test.js
```

Expected before implementation:

```text
not ok ... pending toolbar outside click hides without consuming the mouse gesture
```

The failure should show `true !== false` for `requestHide(500, 500)` or show the fake window still visible after the hide delay.

---

### Task 2: Implement The Minimal Pending Click Split

**Files:**
- Modify: `src/main/floating-window.js`

- [ ] **Step 1: Replace the pending branch in `requestHide()`**

Find this block:

```js
if (isPendingToolbarVisible) {
  console.log('[requestHide] Pending toolbar is visible, keeping visible');
  markPendingInteraction();
  extendGrace();
  return true;
}
```

Replace it with:

```js
if (isPendingToolbarVisible && isInsideWindow) {
  console.log('[requestHide] Pending toolbar inside click, keeping visible');
  extendGrace();
  return true;
}
```

This preserves the existing inside-click path. Outside clicks fall through to the existing grace-period and delayed-hide logic.

- [ ] **Step 2: Run the focused test file**

Run:

```bash
npm test -- tests/floating-window.test.js
```

Expected:

```text
# pass
# fail 0
```

- [ ] **Step 3: Run the full test suite**

Run:

```bash
npm test
```

Expected:

```text
# pass
# fail 0
```

---

### Task 3: Review The Diff

**Files:**
- Review: `tests/floating-window.test.js`
- Review: `src/main/floating-window.js`

- [ ] **Step 1: Confirm the diff is surgical**

Run:

```bash
git diff -- tests/floating-window.test.js src/main/floating-window.js
```

Expected:

```text
diff --git a/tests/floating-window.test.js b/tests/floating-window.test.js
diff --git a/src/main/floating-window.js b/src/main/floating-window.js
```

The diff should only include:

- A configurable hit-test fake.
- Existing pending interaction tests made explicit as inside-click tests.
- One new outside-click regression test.
- The `requestHide()` pending branch narrowed to `isPendingToolbarVisible && isInsideWindow`.

- [ ] **Step 2: Do not change unrelated dirty files**

Run:

```bash
git status --short
```

Expected relevant changed files from this implementation:

```text
 M src/main/floating-window.js
 M tests/floating-window.test.js
?? docs/superpowers/plans/2026-06-09-pending-toolbar-outside-click-hide.md
```

Existing unrelated dirty files may also appear. Do not stage, edit, or revert unrelated files.

---

## Self-Review

- Spec coverage: The plan covers the requested pending-toolbar outside-click behavior and preserves inside-click protection.
- Placeholder scan: No placeholders or open-ended implementation steps remain.
- Type consistency: The plan uses existing CommonJS APIs and the existing `requestHide(mouseX, mouseY)` signature.
