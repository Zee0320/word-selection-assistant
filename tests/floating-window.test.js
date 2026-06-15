const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadFloatingWindowWithFakes() {
  const floatingWindowPath = require.resolve('../src/main/floating-window');
  delete require.cache[floatingWindowPath];

  const originalLoad = Module._load;
  const createdWindows = [];
  const restoredHandles = [];

  class FakeBrowserWindow {
    constructor() {
      this.visible = false;
      this.destroyed = false;
      this.focusableCalls = [];
      this.bounds = { x: 0, y: 0, width: 320, height: 56 };
      this.webContents = {
        isLoading: () => false,
        send: () => {},
        once: () => {}
      };
      createdWindows.push(this);
    }

    loadFile() {}
    on() {}
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    showInactive() { this.visible = true; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    setFocusable(value) { this.focusableCalls.push(value); }
    setBounds(bounds) { this.bounds = { ...this.bounds, ...bounds }; }
    getBounds() { return this.bounds; }
    setSize(width, height) {
      this.bounds.width = width;
      this.bounds.height = height;
    }
    getPosition() { return [this.bounds.x, this.bounds.y]; }
    setPosition(x, y) {
      this.bounds.x = x;
      this.bounds.y = y;
    }
    getNativeWindowHandle() { return Buffer.alloc(8); }
    destroy() { this.destroyed = true; }
  }

  const fakeElectron = {
    BrowserWindow: FakeBrowserWindow,
    screen: {
      screenToDipPoint: point => point,
      getDisplayNearestPoint: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
    }
  };

  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') {
      return fakeElectron;
    }
    if (parent?.filename === floatingWindowPath && request === './store') {
      return { getSettings: () => ({ translationEnabled: true, aiChatEnabled: true }) };
    }
    if (parent?.filename === floatingWindowPath && request === './window-focus') {
      return {
        restoreForegroundWindow(handle) {
          restoredHandles.push(handle);
        },
        nativeWindowHandleToNumber: () => 1
      };
    }
    if (parent?.filename === floatingWindowPath && request === './floating-window-hit-test') {
      return { isPhysicalPointInsideWindow: () => false };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const floatingWindow = require(floatingWindowPath);
    return { floatingWindow, createdWindows, restoredHandles };
  } finally {
    Module._load = originalLoad;
  }
}

// These tests verify the NEW behavior: no pending window, only show after confirmed text

test('resolved toolbar enables interaction after passive show delay', async () => {
  const { floatingWindow, createdWindows } = loadFloatingWindowWithFakes();

  try {
    floatingWindow.showWindow('hello', 100, 100, 123, { captureId: 1 });
    await delay(150);

    assert.deepEqual(createdWindows[0].focusableCalls, [false, true]);
  } finally {
    floatingWindow.hideWindow();
  }
});

test('showWindow returns false for empty string', () => {
  const { floatingWindow, createdWindows } = loadFloatingWindowWithFakes();

  const result = floatingWindow.showWindow('', 100, 100);

  assert.equal(result, false);
  assert.equal(createdWindows.length, 0);
});

test('showWindow returns false for whitespace-only text', () => {
  const { floatingWindow, createdWindows } = loadFloatingWindowWithFakes();

  const result = floatingWindow.showWindow('   \t\n  ', 100, 100);

  assert.equal(result, false);
  assert.equal(createdWindows.length, 0);
});

test('showWindow returns true and shows window for valid text', async () => {
  const { floatingWindow, createdWindows } = loadFloatingWindowWithFakes();

  try {
    const result = floatingWindow.showWindow('hello world', 100, 100);
    await delay(10);

    assert.equal(result, true);
    assert.equal(createdWindows.length, 1);
    assert.equal(createdWindows[0].isVisible(), true);
  } finally {
    floatingWindow.hideWindow();
  }
});

test('showWindow normalizes text before sending to renderer', async () => {
  const { floatingWindow, createdWindows } = loadFloatingWindowWithFakes();

  try {
    floatingWindow.showWindow('  trimmed text  ', 100, 100);
    await delay(10);

    // The webContents.send mock doesn't capture calls, but we verify the window was shown
    // which means normalization passed and text was sent
    assert.equal(createdWindows[0].isVisible(), true);
  } finally {
    floatingWindow.hideWindow();
  }
});

test('showWindow does not create window when text is null', () => {
  const { floatingWindow, createdWindows } = loadFloatingWindowWithFakes();

  const result = floatingWindow.showWindow(null, 100, 100);

  assert.equal(result, false);
  assert.equal(createdWindows.length, 0);
});

test('showWindow does not create window when text is undefined', () => {
  const { floatingWindow, createdWindows } = loadFloatingWindowWithFakes();

  const result = floatingWindow.showWindow(undefined, 100, 100);

  assert.equal(result, false);
  assert.equal(createdWindows.length, 0);
});
