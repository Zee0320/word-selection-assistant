const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadTextCaptureWithFakes({
  activeWindowInfo = {
    hwnd: 123,
    processName: 'notepad',
    className: 'Notepad',
    title: 'Untitled'
  },
  isTerminalLikeWindow = () => false,
  readSelectedText
}) {
  const textCapturePath = require.resolve('../src/main/text-capture');
  delete require.cache[textCapturePath];

  const originalLoad = Module._load;
  const handlers = {};

  const fakeHook = {
    on(eventName, handler) {
      handlers[eventName] = handler;
    },
    start() {},
    stop() {},
    keyToggle() {},
    keyTap() {}
  };

  let selectedTextCallCount = 0;

  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') {
      return { clipboard: {} };
    }
    if (request === '@mukea/uiohook-napi') {
      return {
        uIOhook: fakeHook,
        UiohookKey: { Ctrl: 'Ctrl', C: 'C' }
      };
    }
    if (parent?.filename === textCapturePath && request === './window-focus') {
      return {
        getForegroundWindowInfo: async () => activeWindowInfo,
        _private: {
          isTerminalLikeWindow
        }
      };
    }
    if (parent?.filename === textCapturePath && request === './selected-text-reader') {
      return { readSelectedTextViaUIAutomation: async () => '' };
    }
    if (parent?.filename === textCapturePath && request === './selected-text-capture-strategy') {
      return {
        readSelectedTextWithFallback: async ({ allowClipboardFallback }) => readSelectedText({
          callCount: selectedTextCallCount++,
          allowClipboardFallback
        })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  const textCapture = require(textCapturePath);
  const restore = () => {
    textCapture.destroy();
    Module._load = originalLoad;
  };

  return { textCapture, handlers, restore };
}

test('ignored mouse gesture during pending capture does not cancel original text capture', async () => {
  // Deferred promise to control when the capture resolves
  let resolveCapture;
  const capturePromise = new Promise(resolve => { resolveCapture = resolve; });

  const { textCapture, handlers, restore } = loadTextCaptureWithFakes({
    readSelectedText: async () => capturePromise
  });
  const capturedTexts = [];

  // Promise that resolves when onTextCaptured is called
  let resolveTextCaptured;
  const textCapturedPromise = new Promise(resolve => { resolveTextCaptured = resolve; });

  try {
    textCapture.init({
      onTextCaptured: text => {
        capturedTexts.push(text);
        resolveTextCaptured();
      },
      onCapturePending: () => {},
      onCaptureMissed: () => {}
    });
    textCapture.setShouldIgnoreWindow(() => false);
    textCapture.setOnMouseDown((x, y) => x === 12 && y === 0);

    // Start the original capture
    handlers.mousedown({ x: 0, y: 0 });
    handlers.mouseup({ x: 10, y: 0 });

    // Trigger the ignored gesture while capture is pending
    handlers.mousedown({ x: 12, y: 0 });
    handlers.mouseup({ x: 12, y: 0 });

    // Prove the ignored gesture completed without resolving the capture
    assert.deepEqual(capturedTexts, [], 'capture should not have completed yet');

    // Now resolve the capture
    resolveCapture('hello');

    // Wait for onTextCaptured to be called
    await textCapturedPromise;

    // The original text should be captured
    assert.deepEqual(capturedTexts, ['hello'], 'original capture should complete');
  } finally {
    restore();
  }
});

test('drag capture waits for selected text to settle before reading', async () => {
  let mouseUpAt = 0;
  const { textCapture, handlers, restore } = loadTextCaptureWithFakes({
    readSelectedText: async () => Date.now() - mouseUpAt >= 150 ? 'hello' : ''
  });
  const capturedTexts = [];
  const missedCaptures = [];

  try {
    textCapture.init({
      onTextCaptured: text => capturedTexts.push(text),
      onCapturePending: () => {},
      onCaptureMissed: captureId => missedCaptures.push(captureId)
    });
    textCapture.setShouldIgnoreWindow(() => false);
    textCapture.setOnMouseDown(() => false);

    handlers.mousedown({ x: 0, y: 0 });
    mouseUpAt = Date.now();
    handlers.mouseup({ x: 12, y: 0 });

    await delay(350);

    assert.deepEqual(capturedTexts, ['hello']);
    assert.deepEqual(missedCaptures, []);
  } finally {
    restore();
  }
});

test('terminal capture allows clipboard fallback when UI Automation returns no text', async () => {
  const fallbackFlags = [];
  const { textCapture, handlers, restore } = loadTextCaptureWithFakes({
    activeWindowInfo: {
      hwnd: 123,
      processName: 'WindowsTerminal',
      className: 'CASCADIA_HOSTING_WINDOW_CLASS',
      title: 'C:\\Windows\\System32\\cmd.exe'
    },
    isTerminalLikeWindow: () => true,
    readSelectedText: async ({ allowClipboardFallback }) => {
      fallbackFlags.push(allowClipboardFallback);
      return allowClipboardFallback ? 'terminal text' : '';
    }
  });
  const capturedTexts = [];

  try {
    textCapture.init({
      onTextCaptured: text => capturedTexts.push(text),
      onCapturePending: () => {},
      onCaptureMissed: () => {}
    });
    textCapture.setShouldIgnoreWindow(() => false);
    textCapture.setOnMouseDown(() => false);

    handlers.mousedown({ x: 0, y: 0 });
    handlers.mouseup({ x: 12, y: 0 });

    await delay(350);

    assert.deepEqual(fallbackFlags, [true]);
    assert.deepEqual(capturedTexts, ['terminal text']);
  } finally {
    restore();
  }
});
