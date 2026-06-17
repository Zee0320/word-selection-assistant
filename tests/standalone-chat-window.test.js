const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadStandaloneChatWindowWithFakes() {
  const chatWindowPath = require.resolve('../src/main/standalone-chat-window');
  delete require.cache[chatWindowPath];

  const originalLoad = Module._load;
  const createdWindows = [];
  const guardedWebContents = [];

  class FakeBrowserWindow {
    constructor() {
      this.destroyed = false;
      this.minimized = false;
      this.focused = false;
      this.webContents = {
        isLoading: () => false,
        send: () => {},
        once: () => {}
      };
      createdWindows.push(this);
    }

    loadFile(file) { this.loadedFile = file; }
    setMenuBarVisibility(value) { this.menuBarVisible = value; }
    once() {}
    on() {}
    isDestroyed() { return this.destroyed; }
    isMinimized() { return this.minimized; }
    restore() { this.minimized = false; }
    focus() { this.focused = true; }
    show() { this.visible = true; }
    getNativeWindowHandle() { return Buffer.alloc(8); }
    destroy() { this.destroyed = true; }
  }

  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') {
      return { BrowserWindow: FakeBrowserWindow };
    }
    if (parent?.filename === chatWindowPath && request === './window-focus') {
      return { nativeWindowHandleToNumber: () => 1 };
    }
    if (parent?.filename === chatWindowPath && request === './window-navigation-guard') {
      return {
        installNavigationGuard(webContents) {
          guardedWebContents.push(webContents);
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const standaloneChatWindow = require(chatWindowPath);
    return { standaloneChatWindow, createdWindows, guardedWebContents };
  } finally {
    Module._load = originalLoad;
  }
}

test('standalone chat window installs navigation guard before loading renderer', () => {
  const { standaloneChatWindow, createdWindows, guardedWebContents } = loadStandaloneChatWindowWithFakes();

  try {
    standaloneChatWindow.openChatWindow();

    assert.equal(createdWindows.length, 1);
    assert.deepEqual(guardedWebContents, [createdWindows[0].webContents]);
    assert.match(createdWindows[0].loadedFile, /renderer[\\/]chat[\\/]index\.html$/);
  } finally {
    standaloneChatWindow.destroy();
  }
});
