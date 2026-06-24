const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function loadStandaloneChatWindowWithFakes() {
  const standaloneChatWindowPath = require.resolve('../src/main/standalone-chat-window');
  delete require.cache[standaloneChatWindowPath];

  const originalLoad = Module._load;
  const createdWindows = [];

  class FakeBrowserWindow {
    constructor() {
      this.visible = false;
      this.destroyed = false;
      this.minimized = false;
      this.focusCalls = 0;
      this.showCalls = 0;
      this.hideCalls = 0;
      this.restoreCalls = 0;
      this.sentMessages = [];
      this.webContents = {
        isLoading: () => false,
        send: (channel, payload) => this.sentMessages.push({ channel, payload }),
        once: () => {}
      };
      createdWindows.push(this);
    }

    loadFile() {}
    setMenuBarVisibility() {}
    once() {}
    on() {}
    isDestroyed() { return this.destroyed; }
    isMinimized() { return this.minimized; }
    isVisible() { return this.visible; }
    restore() {
      this.restoreCalls += 1;
      this.minimized = false;
      this.visible = true;
    }
    show() {
      this.showCalls += 1;
      this.visible = true;
    }
    hide() {
      this.hideCalls += 1;
      this.visible = false;
    }
    focus() {
      this.focusCalls += 1;
    }
    destroy() {
      this.destroyed = true;
    }
    getNativeWindowHandle() {
      return Buffer.from([1, 0, 0, 0]);
    }
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return { BrowserWindow: FakeBrowserWindow };
    }
    if (parent?.filename === standaloneChatWindowPath && request === './window-focus') {
      return { nativeWindowHandleToNumber: () => 1 };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const standaloneChatWindow = require(standaloneChatWindowPath);
    return { standaloneChatWindow, createdWindows };
  } finally {
    Module._load = originalLoad;
  }
}

test('openChatWindow shows an existing hidden chat window before focusing', () => {
  const { standaloneChatWindow, createdWindows } = loadStandaloneChatWindowWithFakes();

  try {
    const win = standaloneChatWindow.openChatWindow();
    win.show();
    standaloneChatWindow.hideChatWindow();

    standaloneChatWindow.openChatWindow({ draftText: 'Resume chat' });

    assert.equal(createdWindows.length, 1);
    assert.equal(win.isVisible(), true);
    assert.equal(win.showCalls, 2);
    assert.equal(win.focusCalls, 1);
    assert.deepEqual(win.sentMessages.at(-1), {
      channel: 'prefill-chat-input',
      payload: 'Resume chat'
    });
  } finally {
    standaloneChatWindow.destroy();
  }
});
