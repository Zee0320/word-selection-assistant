const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadFloatingWindowWithFakes({ hitTestResult = false } = {}) {
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
        once: () => {},
        on: () => {},
        setWindowOpenHandler: () => {},
        getURL: () => 'file:///app/renderer/floating/index.html'
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
      return { isPhysicalPointInsideWindow: () => hitTestResult };
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

test('pending toolbar does not enable interaction before text capture resolves', async () => {
  const { floatingWindow, createdWindows } = loadFloatingWindowWithFakes();

  try {
    floatingWindow.showPendingWindow(100, 100, 123, 1);
    await delay(150);

    assert.deepEqual(createdWindows[0].focusableCalls, [false]);
  } finally {
    floatingWindow.hideWindow();
  }
});

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

test('pending toolbar click reports the mouse gesture as consumed', () => {
  const { floatingWindow } = loadFloatingWindowWithFakes({ hitTestResult: true });

  try {
    floatingWindow.showPendingWindow(100, 100, 123, 1);

    assert.equal(floatingWindow.requestHide(120, 120), true);
  } finally {
    floatingWindow.hideWindow();
  }
});

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

test('pending toolbar interaction restores the original foreground window', () => {
  const { floatingWindow, restoredHandles } = loadFloatingWindowWithFakes({ hitTestResult: true });

  try {
    floatingWindow.showPendingWindow(100, 100, 123, 1);
    const restoreCountAfterShow = restoredHandles.length;

    floatingWindow.requestHide(120, 120);

    assert.equal(restoredHandles.length, restoreCountAfterShow + 1);
    assert.equal(restoredHandles.at(-1), 123);
  } finally {
    floatingWindow.hideWindow();
  }
});

test('pending toolbar stays visible long enough for slow text capture', async () => {
  const { floatingWindow, createdWindows } = loadFloatingWindowWithFakes();

  try {
    floatingWindow.showPendingWindow(100, 100, 123, 1);
    await delay(1800);

    assert.equal(createdWindows[0].isVisible(), true);
  } finally {
    floatingWindow.hideWindow();
  }
});
