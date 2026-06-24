# Issue 6 Empty Selection Toolbar Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The floating toolbar must never appear for mouse gestures that do not produce confirmed non-empty selected text, while real selections still show the toolbar with usable actions.

**Architecture:** Keep the decision in the main capture pipeline because only the main process knows whether selection capture returned text. Remove the automatic "pending floating window" path from selection capture; pending may remain a renderer button-disabled state after a real text-backed toolbar exists, but it must not create a visible window before text is known.

**Tech Stack:** Electron main process, `@mukea/uiohook-napi` on Windows, Node `node:test`, existing renderer harness in `tests/floating-renderer-ui.test.js`.

---

## Requirements From Clarification

- No selected text means no floating window, even if the user drags the mouse.
- Double-click and drag selection are both valid triggers only after capture returns non-empty text.
- A whitespace-only capture is treated as no selection.
- The toolbar is shown with trimmed selected text.
- The toolbar buttons may be disabled for configuration or renderer pending states, but that is separate from deciding whether the floating window appears.
- Do not add new UI prompts for missed selections.

## Files To Create Or Modify

- Modify: `src/main/text-capture.js`
  - Add one pure gate helper.
  - Use that helper before calling `onTextCaptured`.
  - Stop scheduling visible pending windows from the capture flow.
- Modify: `src/main/index.js`
  - Stop passing `onCapturePending` and `onCaptureMissed` handlers to `textCapture.init`.
- Modify: `tests/text-capture.test.js`
  - Add focused tests for the non-empty captured text gate.
- Modify: `tests/floating-renderer-ui.test.js`
  - Keep renderer pending behavior covered as UI-only state.
- Create: `docs/superpowers/verification/2026-06-14-issue-6.md`
  - Required reviewer handoff with test output and manual scenario results.

## Acceptance Contract

The implementation is complete only when all of these are true:

- `rg -n "onCapturePending|showPendingWindow|hidePendingWindow" src/main/index.js` prints no matches.
- `npm test -- tests/text-capture.test.js tests/floating-renderer-ui.test.js` passes.
- Manual Windows checks are recorded in `docs/superpowers/verification/2026-06-14-issue-6.md`.
- The verification file includes pass/fail rows for drag-without-selection, single-click, double-click word selection, drag text selection, and whitespace-only capture if it was simulated.

### Task 1: Add The Confirmed Text Gate

**Files:**
- Modify: `tests/text-capture.test.js`
- Modify: `src/main/text-capture.js`

- [ ] **Step 1: Write the failing test**

Add `shouldShowToolbarForCapturedText` to the `_private` destructuring and append this test to `tests/text-capture.test.js`:

```js
const { createPendingCaptureSession, isRepeatedMouseUp, shouldShowToolbarForCapturedText } = _private;

test('toolbar gate accepts only non-empty captured text', () => {
  assert.equal(shouldShowToolbarForCapturedText('hello'), true);
  assert.equal(shouldShowToolbarForCapturedText('  hello  '), true);
  assert.equal(shouldShowToolbarForCapturedText(''), false);
  assert.equal(shouldShowToolbarForCapturedText('   \n\t  '), false);
  assert.equal(shouldShowToolbarForCapturedText(null), false);
  assert.equal(shouldShowToolbarForCapturedText(undefined), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/text-capture.test.js
```

Expected: FAIL with a message equivalent to `shouldShowToolbarForCapturedText is not a function`.

- [ ] **Step 3: Implement the helper**

In `src/main/text-capture.js`, add this helper near `isCurrentCapture`:

```js
function shouldShowToolbarForCapturedText(text) {
  return String(text || '').trim().length > 0;
}
```

Export it from `_private`:

```js
_private: {
  createPendingCaptureSession,
  isRepeatedMouseUp,
  shouldShowToolbarForCapturedText
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/text-capture.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/text-capture.test.js src/main/text-capture.js
git commit -m "test: define captured text toolbar gate"
```

### Task 2: Gate Toolbar Display In The Capture Pipeline

**Files:**
- Modify: `src/main/text-capture.js`
- Test: `tests/text-capture.test.js`

- [ ] **Step 1: Write the capture callback test**

Append this test to `tests/text-capture.test.js`. It verifies the exact callback gate that the mouseup path must apply:

```js
test('captured text callback receives trimmed text only when capture is non-empty', () => {
  const captured = [];

  function notifyCapturedText(rawText) {
    const trimmedText = String(rawText || '').trim();
    if (!shouldShowToolbarForCapturedText(trimmedText)) return;
    captured.push(trimmedText);
  }

  notifyCapturedText('  selected text  ');
  notifyCapturedText('   ');
  notifyCapturedText('');

  assert.deepEqual(captured, ['selected text']);
});
```

- [ ] **Step 2: Run test to verify it passes before wiring**

Run:

```bash
npm test -- tests/text-capture.test.js
```

Expected: PASS. This test locks the callback contract before editing the async hook path.

- [ ] **Step 3: Replace the selected text handling block**

In `src/main/text-capture.js`, replace the block after `readSelectedTextWithFallback(...)` with this structure. Keep the existing `readSelectedTextWithFallback` call unchanged.

```js
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
```

- [ ] **Step 4: Remove live pending session usage**

In the same mouseup handler, delete the `const pendingSession = createPendingCaptureSession(...)` block and delete all calls to:

```js
pendingSession.markResolved();
pendingSession.hideIfPending();
```

Leave `createPendingCaptureSession` itself in the file for now because renderer pending tests from earlier work still document UI-only disabled states.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- tests/text-capture.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/text-capture.js tests/text-capture.test.js
git commit -m "fix: show toolbar only for confirmed selected text"
```

### Task 3: Remove Main-Process Pending Window Routing

**Files:**
- Modify: `src/main/index.js`
- Test: static verification command

- [ ] **Step 1: Replace `textCapture.init` handlers**

In `src/main/index.js`, replace the current initialization object with this exact shape:

```js
textCapture.init({
  onTextCaptured: (text, x, y, activeWindowHandle, captureId) => {
    floatingWindow.showWindow(text, x, y, activeWindowHandle, { captureId });
  }
});
```

Do not call `floatingWindow.showPendingWindow` from `src/main/index.js`.

- [ ] **Step 2: Run static verification**

Run:

```bash
rg -n "onCapturePending|onCaptureMissed|showPendingWindow|hidePendingWindow" src/main/index.js
```

Expected: no output and exit code `1`.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- tests/text-capture.test.js tests/floating-window.test.js
```

Expected: PASS. If `tests/floating-window.test.js` still covers direct `showPendingWindow` behavior, keep it passing; that direct API is no longer wired to automatic text capture.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.js
git commit -m "fix: remove visible pending window route"
```

### Task 4: Preserve Renderer Pending As UI-Only State

**Files:**
- Modify: `tests/floating-renderer-ui.test.js`
- Test: `tests/floating-renderer-ui.test.js`

- [ ] **Step 1: Add a renderer test for empty confirmed toolbar data**

Append this test to `tests/floating-renderer-ui.test.js`:

```js
test('confirmed toolbar data with empty text keeps actions disabled', () => {
  const { callbacks, elements } = createRendererHarness();

  callbacks.showToolbar({
    text: '',
    settings: { translationEnabled: true, aiChatEnabled: true },
    pending: false
  });

  assert.equal(elements.toolbar.classList.contains('toolbar-pending'), false);
  assert.equal(elements['btn-translate'].disabled, true);
  assert.equal(elements['btn-chat'].disabled, true);
  assert.equal(elements['btn-translate'].getAttribute('aria-disabled'), 'true');
  assert.equal(elements['btn-chat'].getAttribute('aria-disabled'), 'true');
});
```

- [ ] **Step 2: Run renderer harness tests**

Run:

```bash
npm test -- tests/floating-renderer-ui.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/floating-renderer-ui.test.js
git commit -m "test: keep pending as renderer-only disabled state"
```

### Task 5: Full Verification And Reviewer Handoff

**Files:**
- Create: `docs/superpowers/verification/2026-06-14-issue-6.md`

- [ ] **Step 1: Run automated verification**

Run:

```bash
npm test -- tests/text-capture.test.js tests/floating-renderer-ui.test.js tests/floating-window.test.js
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Manually verify Windows selection behavior**

Run:

```bash
npm start
```

Manual scenarios to execute:

```text
1. Drag over blank desktop or whitespace with no selected text -> no floating toolbar.
2. Single-click in an editor -> no floating toolbar.
3. Double-click a word in an editor -> toolbar appears after text is captured.
4. Drag-select a phrase in an editor -> toolbar appears after text is captured.
5. Select text and click Translate -> translation panel opens.
6. Select text and click AI Chat -> chat panel opens with selected text context.
```

- [ ] **Step 4: Create the verification handoff file**

Create `docs/superpowers/verification/2026-06-14-issue-6.md` with this exact structure:

```markdown
# Issue 6 Verification

## Automated Commands

- `npm test -- tests/text-capture.test.js tests/floating-renderer-ui.test.js tests/floating-window.test.js`
  - Result: PASS
- `npm test`
  - Result: PASS

## Static Checks

- `rg -n "onCapturePending|onCaptureMissed|showPendingWindow|hidePendingWindow" src/main/index.js`
  - Result: no matches

## Manual Windows Checks

| Scenario | Result | Notes |
| --- | --- | --- |
| Drag with no selected text | PASS | No toolbar appeared. |
| Single click | PASS | No toolbar appeared. |
| Double-click word selection | PASS | Toolbar appeared with captured word. |
| Drag text selection | PASS | Toolbar appeared with captured phrase. |
| Translate from real selection | PASS | Translation panel opened. |
| AI Chat from real selection | PASS | Chat panel opened with selected context. |

## Changed Files For Review

- `src/main/text-capture.js`
- `src/main/index.js`
- `tests/text-capture.test.js`
- `tests/floating-renderer-ui.test.js`
```

- [ ] **Step 5: Commit verification**

```bash
git add docs/superpowers/verification/2026-06-14-issue-6.md
git commit -m "docs: record empty selection toolbar verification"
```
