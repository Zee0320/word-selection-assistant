const test = require('node:test');
const assert = require('node:assert/strict');

const {
  captureSelectedTextFromClipboard,
  createClipboardSnapshot,
  restoreClipboardSnapshot,
  _private
} = require('../src/main/text-capture');

const { createPendingCaptureSession } = _private;

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

test('pending capture session shows pending after delay while unresolved', async () => {
  const pendingCalls = [];

  const session = createPendingCaptureSession({
    captureId: 7,
    delayMs: 5,
    mouseX: 10,
    mouseY: 20,
    getActiveWindowInfo: async () => ({ hwnd: 123 }),
    shouldIgnoreWindow: () => false,
    isCurrentCapture: () => true,
    onPending: (...args) => pendingCalls.push(args),
    onMissed: () => {}
  });

  await delay(20);

  assert.equal(session.wasPendingShown(), true);
  assert.deepEqual(pendingCalls, [[10, 20, 123, 7]]);
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
