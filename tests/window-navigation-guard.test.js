const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadGuardWithFakeShell() {
  const guardPath = require.resolve('../src/main/window-navigation-guard');
  delete require.cache[guardPath];

  const openedUrls = [];
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') {
      return {
        shell: {
          openExternal(url) {
            openedUrls.push(url);
            return Promise.resolve();
          }
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return { guard: require(guardPath), openedUrls };
  } finally {
    Module._load = originalLoad;
  }
}

function createFakeWebContents(currentUrl = 'file:///app/renderer/floating/index.html') {
  const handlers = {};
  let windowOpenHandler = null;
  return {
    handlers,
    on(eventName, handler) {
      handlers[eventName] = handler;
    },
    setWindowOpenHandler(handler) {
      windowOpenHandler = handler;
    },
    getURL() {
      return currentUrl;
    },
    triggerWillNavigate(url) {
      let prevented = false;
      handlers['will-navigate']({
        preventDefault() {
          prevented = true;
        }
      }, url);
      return prevented;
    },
    triggerWindowOpen(url) {
      return windowOpenHandler({ url });
    }
  };
}

test('navigation guard opens http, https, and mailto links externally', () => {
  const { guard, openedUrls } = loadGuardWithFakeShell();
  const webContents = createFakeWebContents();

  guard.installNavigationGuard(webContents);

  assert.equal(webContents.triggerWillNavigate('https://example.com/path'), true);
  assert.equal(webContents.triggerWillNavigate('http://example.com/path'), true);
  assert.equal(webContents.triggerWillNavigate('mailto:user@example.com'), true);
  assert.deepEqual(openedUrls, [
    'https://example.com/path',
    'http://example.com/path',
    'mailto:user@example.com'
  ]);
});

test('navigation guard blocks file-resolved relative and protocol-relative links', () => {
  const { guard, openedUrls } = loadGuardWithFakeShell();
  const webContents = createFakeWebContents();

  guard.installNavigationGuard(webContents);

  assert.equal(webContents.triggerWillNavigate('file:///C:/Windows/System32/calc.exe'), true);
  assert.equal(webContents.triggerWillNavigate('file://example.com/path'), true);
  assert.deepEqual(openedUrls, []);
});

test('navigation guard denies window.open and opens safe external URLs outside the app', () => {
  const { guard, openedUrls } = loadGuardWithFakeShell();
  const webContents = createFakeWebContents();

  guard.installNavigationGuard(webContents);

  assert.deepEqual(webContents.triggerWindowOpen('https://example.com'), { action: 'deny' });
  assert.deepEqual(webContents.triggerWindowOpen('file:///C:/secret.txt'), { action: 'deny' });
  assert.deepEqual(openedUrls, ['https://example.com']);
});

test('navigation guard allows same-document fragment changes only', () => {
  const { guard, openedUrls } = loadGuardWithFakeShell();
  const webContents = createFakeWebContents('file:///app/renderer/floating/index.html');

  guard.installNavigationGuard(webContents);

  assert.equal(webContents.triggerWillNavigate('file:///app/renderer/floating/index.html#section'), false);
  assert.equal(webContents.triggerWillNavigate('file:///app/renderer/floating/other.html#section'), true);
  assert.deepEqual(openedUrls, []);
});
