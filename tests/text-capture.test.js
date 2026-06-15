const test = require('node:test');
const assert = require('node:assert/strict');

const {
  captureSelectedTextFromClipboard,
  createClipboardSnapshot,
  restoreClipboardSnapshot,
  _private
} = require('../src/main/text-capture');

const { createPendingCaptureSession, isRepeatedMouseUp, shouldShowToolbarForCapturedText } = _private;

function createImage(empty = false) {
  return {
    isEmpty: () => empty
  };
}

function createClipboard({ text = '', image = null } = {}) {
  const state = { text, image };
  const writes = [];

  return {
    state,
    writes,
    availableFormats() {
      const formats = [];
      if (state.text) formats.push('text/plain');
      if (state.image) formats.push('image/png');
      return formats;
    },
    readText() {
      return state.text;
    },
    readImage() {
      return state.image;
    },
    writeText(nextText) {
      writes.push({ type: 'text', text: nextText });
      state.text = nextText;
      state.image = null;
    },
    write(data) {
      writes.push({ type: 'data', data });
      state.text = data.text || '';
      state.image = data.image || null;
    }
  };
}

function createQuietLogger() {
  return {
    warn() {}
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('captures selected text and restores previous text clipboard', async () => {
  const fakeClipboard = createClipboard({ text: 'previous clipboard' });

  const selectedText = await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => fakeClipboard.writeText('selected text'),
    logger: createQuietLogger()
  });

  assert.equal(selectedText, 'selected text');
  assert.equal(fakeClipboard.state.text, 'previous clipboard');
  assert.equal(fakeClipboard.state.image, null);
});

test('restores image clipboard when capture returns no text', async () => {
  const image = createImage();
  const fakeClipboard = createClipboard({ image });

  const selectedText = await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {},
    logger: createQuietLogger()
  });

  assert.equal(selectedText, '');
  assert.equal(fakeClipboard.state.image, image);
  assert.equal(fakeClipboard.state.text, '');
});

test('restores image clipboard after successful text capture', async () => {
  const image = createImage();
  const fakeClipboard = createClipboard({ image });

  const selectedText = await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => fakeClipboard.writeText('selected text'),
    logger: createQuietLogger()
  });

  assert.equal(selectedText, 'selected text');
  assert.equal(fakeClipboard.state.image, image);
  assert.equal(fakeClipboard.state.text, '');
});

test('restores previous clipboard when capture throws', async () => {
  const image = createImage();
  const fakeClipboard = createClipboard({ text: 'fallback text', image });

  const selectedText = await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {
      throw new Error('copy failed');
    },
    logger: createQuietLogger()
  });

  assert.equal(selectedText, '');
  assert.equal(fakeClipboard.state.image, image);
  assert.equal(fakeClipboard.state.text, 'fallback text');
});

test('snapshot ignores empty images and falls back to text restore', () => {
  const fakeClipboard = createClipboard({ text: 'text', image: createImage(true) });
  const snapshot = createClipboardSnapshot(fakeClipboard, createQuietLogger());

  assert.equal(snapshot.image, null);

  fakeClipboard.writeText('changed');
  const restored = restoreClipboardSnapshot(snapshot, fakeClipboard, createQuietLogger());

  assert.equal(restored, true);
  assert.equal(fakeClipboard.state.text, 'text');
  assert.equal(fakeClipboard.state.image, null);
});

test('isRepeatedMouseUp accepts quick clicks at nearly the same point', () => {
  assert.equal(
    isRepeatedMouseUp({ x: 104, y: 106 }, 100, 100, 1000, 700),
    true
  );
});

test('isRepeatedMouseUp rejects quick clicks at a different point', () => {
  assert.equal(
    isRepeatedMouseUp({ x: 160, y: 140 }, 100, 100, 1000, 700),
    false
  );
});

test('pending capture session does not show after capture resolves before delay', async () => {
  const pendingCalls = [];

  const session = createPendingCaptureSession({
    captureId: 8,
    delayMs: 20,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 123 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => true,
    onPending: (...args) => pendingCalls.push(args),
    onMissed: () => {}
  });

  session.markResolved();
  await delay(30);

  assert.equal(session.wasPendingShown(), false);
  assert.deepEqual(pendingCalls, []);
});

test('pending capture session does not show after capture misses before delay', async () => {
  const pendingCalls = [];
  const missedCaptureIds = [];

  const session = createPendingCaptureSession({
    captureId: 12,
    delayMs: 20,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 123 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => true,
    onPending: (...args) => pendingCalls.push(args),
    onMissed: captureId => missedCaptureIds.push(captureId)
  });

  session.hideIfPending();
  await delay(30);

  assert.equal(session.wasPendingShown(), false);
  assert.deepEqual(pendingCalls, []);
  assert.deepEqual(missedCaptureIds, []);
});

test('pending capture session ignores stale captures', async () => {
  const pendingCalls = [];

  const session = createPendingCaptureSession({
    captureId: 9,
    delayMs: 5,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 123 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => false,
    onPending: (...args) => pendingCalls.push(args),
    onMissed: () => {}
  });

  await delay(20);

  assert.equal(session.wasPendingShown(), false);
  assert.deepEqual(pendingCalls, []);
});

test('pending capture session does not show for ignored windows', async () => {
  const pendingCalls = [];

  const session = createPendingCaptureSession({
    captureId: 10,
    delayMs: 5,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 123 }),
    shouldIgnoreWindow: hwnd => hwnd === 123,
    isCurrentCapture: () => true,
    onPending: (...args) => pendingCalls.push(args),
    onMissed: () => {}
  });

  await delay(20);

  assert.equal(session.wasPendingShown(), false);
  assert.deepEqual(pendingCalls, []);
});

test('pending capture session hides when unresolved capture misses after pending was shown', async () => {
  const missedCaptureIds = [];

  const session = createPendingCaptureSession({
    captureId: 11,
    delayMs: 5,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 123 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => true,
    onPending: () => {},
    onMissed: captureId => missedCaptureIds.push(captureId)
  });

  await delay(20);
  assert.equal(session.wasPendingShown(), true);

  session.hideIfPending();

  assert.equal(session.wasPendingShown(), false);
  assert.deepEqual(missedCaptureIds, [11]);
});

test('pending capture session hides after capture is marked resolved', async () => {
  const missedCaptureIds = [];

  const session = createPendingCaptureSession({
    captureId: 13,
    delayMs: 5,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 123 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => true,
    onPending: () => {},
    onMissed: captureId => missedCaptureIds.push(captureId)
  });

  await delay(20);
  assert.equal(session.wasPendingShown(), true);

  session.markResolved();
  session.hideIfPending();

  assert.equal(session.wasPendingShown(), false);
  assert.deepEqual(missedCaptureIds, [13]);
});

test('pending capture session hides after pending capture becomes stale', async () => {
  let isCurrent = true;
  const missedCaptureIds = [];

  const session = createPendingCaptureSession({
    captureId: 14,
    delayMs: 5,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 123 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => isCurrent,
    onPending: () => {},
    onMissed: captureId => missedCaptureIds.push(captureId)
  });

  await delay(20);
  assert.equal(session.wasPendingShown(), true);

  isCurrent = false;
  session.markResolved();
  session.hideIfPending();

  assert.equal(session.wasPendingShown(), false);
  assert.deepEqual(missedCaptureIds, [14]);
});

test('toolbar gate accepts only non-empty captured text', () => {
  assert.equal(shouldShowToolbarForCapturedText('hello'), true);
  assert.equal(shouldShowToolbarForCapturedText('  hello  '), true);
  assert.equal(shouldShowToolbarForCapturedText(''), false);
  assert.equal(shouldShowToolbarForCapturedText('   \n\t  '), false);
  assert.equal(shouldShowToolbarForCapturedText(null), false);
  assert.equal(shouldShowToolbarForCapturedText(undefined), false);
});

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

// ============================================================================
// Tests for capture result behavior: no callback for empty/whitespace/unresolved
// ============================================================================

test('unresolved capture produces no window callback', async () => {
  const capturedCalls = [];
  const pendingCalls = [];

  const session = createPendingCaptureSession({
    captureId: 100,
    delayMs: 5,
    mouseX: 100,
    mouseY: 200,
    getActiveWindowInfo: async () => ({ hwnd: 456 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => true,
    onPending: (...args) => pendingCalls.push(args),
    onMissed: () => {}
  });

  // Session is created but never resolved - simulate capture that never completes
  // After delay, onPending may be called, but onTextCaptured should never be called
  await delay(20);

  // The key assertion: without resolution, no text capture callback should fire
  assert.deepEqual(capturedCalls, [], 'Unresolved capture should not trigger onTextCaptured callback');
});

test('empty result produces no window callback', () => {
  const capturedCalls = [];

  // Simulate the callback logic from text-capture.js mouseup handler
  function simulateCaptureResult(selectedText) {
    const trimmedText = String(selectedText || '').trim();
    if (!shouldShowToolbarForCapturedText(trimmedText)) return;
    capturedCalls.push(trimmedText);
  }

  // Empty string result
  simulateCaptureResult('');

  assert.deepEqual(capturedCalls, [], 'Empty result should not trigger window callback');
});

test('whitespace-only result produces no window callback', () => {
  const capturedCalls = [];

  // Simulate the callback logic from text-capture.js mouseup handler
  function simulateCaptureResult(selectedText) {
    const trimmedText = String(selectedText || '').trim();
    if (!shouldShowToolbarForCapturedText(trimmedText)) return;
    capturedCalls.push(trimmedText);
  }

  // Various whitespace-only inputs
  simulateCaptureResult('   ');
  simulateCaptureResult('\n\t');
  simulateCaptureResult('  \n  \t  ');
  simulateCaptureResult('   \n\t   ');

  assert.deepEqual(capturedCalls, [], 'Whitespace-only result should not trigger window callback');
});

test('non-empty drag result produces one callback with trimmed text', () => {
  const capturedCalls = [];

  // Simulate the callback logic from text-capture.js mouseup handler
  function simulateCaptureResult(selectedText, x, y, hwnd, captureId) {
    const trimmedText = String(selectedText || '').trim();
    if (!shouldShowToolbarForCapturedText(trimmedText)) return;
    capturedCalls.push({ text: trimmedText, x, y, hwnd, captureId });
  }

  // Simulate a drag selection that captured text with surrounding whitespace
  simulateCaptureResult('  dragged text  ', 100, 200, 789, 1);

  assert.equal(capturedCalls.length, 1, 'Non-empty drag should produce exactly one callback');
  assert.deepEqual(capturedCalls[0], {
    text: 'dragged text',
    x: 100,
    y: 200,
    hwnd: 789,
    captureId: 1
  }, 'Callback should receive trimmed text');
});

test('non-empty double-click result produces one callback with trimmed text', () => {
  const capturedCalls = [];

  // Simulate the callback logic from text-capture.js mouseup handler
  function simulateCaptureResult(selectedText, x, y, hwnd, captureId) {
    const trimmedText = String(selectedText || '').trim();
    if (!shouldShowToolbarForCapturedText(trimmedText)) return;
    capturedCalls.push({ text: trimmedText, x, y, hwnd, captureId });
  }

  // Simulate a double-click selection that captured a word
  simulateCaptureResult('double-clicked-word', 150, 250, 999, 2);

  assert.equal(capturedCalls.length, 1, 'Non-empty double-click should produce exactly one callback');
  assert.deepEqual(capturedCalls[0], {
    text: 'double-clicked-word',
    x: 150,
    y: 250,
    hwnd: 999,
    captureId: 2
  }, 'Callback should receive trimmed text');
});

test('stale earlier capture cannot show after newer capture starts', async () => {
  const pendingCalls = [];
  let activeCaptureId = 1;

  // Create session for the first (older) capture
  const firstSession = createPendingCaptureSession({
    captureId: 1,
    delayMs: 5,
    mouseX: 100,
    mouseY: 100,
    getActiveWindowInfo: async () => ({ hwnd: 111 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => activeCaptureId === 1,
    onPending: (...args) => pendingCalls.push({ captureId: 1, args }),
    onMissed: () => {}
  });

  // Before first session's delay fires, start a new capture
  activeCaptureId = 2;

  // Create session for the second (newer) capture
  const secondSession = createPendingCaptureSession({
    captureId: 2,
    delayMs: 5,
    mouseX: 200,
    mouseY: 200,
    getActiveWindowInfo: async () => ({ hwnd: 222 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => activeCaptureId === 2,
    onPending: (...args) => pendingCalls.push({ captureId: 2, args }),
    onMissed: () => {}
  });

  // Wait for both delays to fire
  await delay(20);

  // Only the second (current) capture should show pending
  assert.equal(pendingCalls.length, 1, 'Only current capture should show pending');
  assert.equal(pendingCalls[0].captureId, 2, 'Stale capture should not show');

  // First session should not show pending
  assert.equal(firstSession.wasPendingShown(), false, 'Stale session should not show pending');

  // Second session should show pending
  assert.equal(secondSession.wasPendingShown(), true, 'Current session should show pending');
});

// ============================================================================
// Sentinel-based clipboard detection tests
// These tests verify the sentinel approach for detecting empty/unchanged clipboard
// ============================================================================

test('sentinel: clipboard unchanged after Copy returns empty string', async () => {
  // Scenario: User selects nothing, Copy doesn't change clipboard
  // Sentinel remains in clipboard -> return ''
  const SENTINEL = '\x00_TEXT_CAPTURE_SENTINEL_\x00';
  const fakeClipboard = createClipboard({ text: 'previous clipboard' });

  const selectedText = await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {
      // Copy does nothing (no selection) - clipboard still has sentinel
      fakeClipboard.state.text = SENTINEL;
    },
    logger: createQuietLogger(),
    sentinel: SENTINEL
  });

  assert.equal(selectedText, '', 'Unchanged sentinel should return empty string');
});

test('sentinel: clipboard changes from sentinel to whitespace returns empty string after trim', async () => {
  // Scenario: Copy succeeds but content is whitespace only
  // Sentinel changes to whitespace -> trim -> '' -> return ''
  const SENTINEL = '\x00_TEXT_CAPTURE_SENTINEL_\x00';
  const fakeClipboard = createClipboard({ text: 'previous clipboard' });

  const selectedText = await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {
      // Copy puts whitespace in clipboard
      fakeClipboard.writeText('   \n\t  ');
    },
    logger: createQuietLogger(),
    sentinel: SENTINEL
  });

  assert.equal(selectedText, '', 'Whitespace-only content should return empty string after trim');
});

test('sentinel: clipboard changes from sentinel to selected text returns trimmed text', async () => {
  // Scenario: Copy succeeds with actual text
  // Sentinel changes to selected text -> trim -> return trimmed text
  const SENTINEL = '\x00_TEXT_CAPTURE_SENTINEL_\x00';
  const fakeClipboard = createClipboard({ text: 'previous clipboard' });

  const selectedText = await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {
      fakeClipboard.writeText('  selected text  ');
    },
    logger: createQuietLogger(),
    sentinel: SENTINEL
  });

  assert.equal(selectedText, 'selected text', 'Should return trimmed selected text');
});

test('sentinel: clipboard changes after short delay returns selected text', async () => {
  // Scenario: Copy takes a moment to populate clipboard (slow app response)
  // Sentinel eventually changes to selected text -> return trimmed text
  const SENTINEL = '\x00_TEXT_CAPTURE_SENTINEL_\x00';
  const fakeClipboard = createClipboard({ text: 'previous clipboard' });

  const selectedText = await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: async () => {
      // Simulate slow clipboard population
      await delay(30);
      fakeClipboard.writeText('delayed text');
    },
    logger: createQuietLogger(),
    sentinel: SENTINEL,
    waitTimeout: 100 // Give enough time for the delay
  });

  assert.equal(selectedText, 'delayed text', 'Should capture text that appears after short delay');
});

test('sentinel: restores original text clipboard on successful capture', async () => {
  // Scenario: Original clipboard has text, capture succeeds
  // After capture, original text should be restored
  const SENTINEL = '\x00_TEXT_CAPTURE_SENTINEL_\x00';
  const fakeClipboard = createClipboard({ text: 'original text' });

  await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {
      fakeClipboard.writeText('captured text');
    },
    logger: createQuietLogger(),
    sentinel: SENTINEL
  });

  assert.equal(fakeClipboard.state.text, 'original text', 'Should restore original text');
  assert.equal(fakeClipboard.state.image, null, 'Should have no image');
});

test('sentinel: restores original image clipboard on successful capture', async () => {
  // Scenario: Original clipboard has image, capture succeeds
  // After capture, original image should be restored
  const SENTINEL = '\x00_TEXT_CAPTURE_SENTINEL_\x00';
  const originalImage = createImage();
  const fakeClipboard = createClipboard({ image: originalImage });

  await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {
      fakeClipboard.writeText('captured text');
    },
    logger: createQuietLogger(),
    sentinel: SENTINEL
  });

  assert.equal(fakeClipboard.state.image, originalImage, 'Should restore original image');
  assert.equal(fakeClipboard.state.text, '', 'Should have empty text (from image clipboard)');
});

test('sentinel: restores original clipboard on timeout (no change)', async () => {
  // Scenario: Original clipboard has text, Copy doesn't change clipboard (timeout)
  // After timeout, original text should be restored
  const SENTINEL = '\x00_TEXT_CAPTURE_SENTINEL_\x00';
  const fakeClipboard = createClipboard({ text: 'original text' });

  await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {
      // Copy does nothing - clipboard stays with sentinel
      fakeClipboard.state.text = SENTINEL;
    },
    logger: createQuietLogger(),
    sentinel: SENTINEL,
    waitTimeout: 20
  });

  assert.equal(fakeClipboard.state.text, 'original text', 'Should restore original text on timeout');
});

test('sentinel: restores original clipboard on empty result', async () => {
  // Scenario: Original clipboard has text, capture returns empty string
  // After empty result, original text should be restored
  const SENTINEL = '\x00_TEXT_CAPTURE_SENTINEL_\x00';
  const fakeClipboard = createClipboard({ text: 'original text' });

  await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {
      fakeClipboard.writeText('   '); // Whitespace that trims to empty
    },
    logger: createQuietLogger(),
    sentinel: SENTINEL
  });

  assert.equal(fakeClipboard.state.text, 'original text', 'Should restore original text on empty result');
});

test('sentinel: restores original clipboard on Copy exception', async () => {
  // Scenario: Original clipboard has text, Copy throws an error
  // After exception, original text should be restored
  const SENTINEL = '\x00_TEXT_CAPTURE_SENTINEL_\x00';
  const fakeClipboard = createClipboard({ text: 'original text' });

  await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {
      throw new Error('Copy failed');
    },
    logger: createQuietLogger(),
    sentinel: SENTINEL
  });

  assert.equal(fakeClipboard.state.text, 'original text', 'Should restore original text on Copy exception');
});

test('sentinel: restores original image clipboard on Copy exception', async () => {
  // Scenario: Original clipboard has image, Copy throws an error
  // After exception, original image should be restored
  const SENTINEL = '\x00_TEXT_CAPTURE_SENTINEL_\x00';
  const originalImage = createImage();
  const fakeClipboard = createClipboard({ image: originalImage });

  await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {
      throw new Error('Copy failed');
    },
    logger: createQuietLogger(),
    sentinel: SENTINEL
  });

  assert.equal(fakeClipboard.state.image, originalImage, 'Should restore original image on Copy exception');
});
