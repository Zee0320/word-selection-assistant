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

  try {
    const textCapture = require(textCapturePath);
    return { textCapture, handlers };
  } finally {
    Module._load = originalLoad;
  }
}

test('ignored mouse gesture during pending capture does not cancel original text capture', async () => {
  let originalMouseUpAt = 0;
  const { textCapture, handlers } = loadTextCaptureWithFakes({
    readSelectedText: async () => Date.now() - originalMouseUpAt < 200 ? 'hello' : ''
  });
  const capturedTexts = [];

  textCapture.init({
    onTextCaptured: text => capturedTexts.push(text),
    onCapturePending: () => {},
    onCaptureMissed: () => {}
  });
  textCapture.setShouldIgnoreWindow(() => false);
  textCapture.setOnMouseDown((x, y) => x === 12 && y === 0);

  handlers.mousedown({ x: 0, y: 0 });
  originalMouseUpAt = Date.now();
  handlers.mouseup({ x: 10, y: 0 });

  await delay(50);

  handlers.mousedown({ x: 12, y: 0 });
  handlers.mouseup({ x: 12, y: 0 });

  await delay(250);

  assert.deepEqual(capturedTexts, ['hello']);
});

test('drag capture waits for selected text to settle before reading', async () => {
  let mouseUpAt = 0;
  const { textCapture, handlers } = loadTextCaptureWithFakes({
    readSelectedText: async () => Date.now() - mouseUpAt >= 150 ? 'hello' : ''
  });
  const capturedTexts = [];
  const missedCaptures = [];

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
});

test('terminal capture allows clipboard fallback when UI Automation returns no text', async () => {
  const fallbackFlags = [];
  const { textCapture, handlers } = loadTextCaptureWithFakes({
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
});
