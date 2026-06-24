# Issue 3 UOS ARM64 X11 Text Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support automatic word selection capture on UOS ARM64 when the desktop session is X11, and degrade clearly on unsupported UOS/Wayland environments.

**Architecture:** Keep Windows capture unchanged. Add a separate UOS ARM64 X11 backend that uses installed X11 command-line tools for global mouse events and selected-text reads, then route `text-capture.js` to that backend only when platform, architecture, distro, session type, and dependencies match.

**Tech Stack:** Electron main process, Node `child_process`, X11 tools (`xinput`, `xdotool`, `xclip`), UOS ARM64 Debian package metadata, Node `node:test`.

---

## Requirements From Clarification

- Scope is only UOS ARM64.
- Do not spend effort supporting x64 UOS or other Linux distributions.
- Support only X11 sessions.
- Wayland is unsupported and must show clear status/degradation.
- Missing X11 dependencies must show clear status and installation guidance.
- Existing Windows global selection capture must keep working.
- Users on unsupported environments should still be able to open AI Chat manually and use clipboard-based chat.

## Files To Create Or Modify

- Modify: `src/main/platform-info.js`
  - Add platform/distro/session capability helpers.
- Modify: `tests/platform-info.test.js`
  - Add UOS ARM64 X11/Wayland/non-UOS detection tests.
- Create: `src/main/linux-selected-text-reader.js`
  - Read selected text through X11 PRIMARY selection first, then clipboard fallback.
- Create: `tests/linux-selected-text-reader.test.js`
  - Unit-test command order, trimming, fallback, and clipboard restore.
- Create: `src/main/linux-x11-selection-watcher.js`
  - Spawn `xinput test-xi2 --root`, parse button press/release, and trigger reads for drags/double-clicks.
- Create: `tests/linux-x11-selection-watcher.test.js`
  - Unit-test gesture detection and process cleanup with fake child processes.
- Modify: `src/main/text-capture.js`
  - Route to Windows hook or UOS X11 backend.
- Create: `tests/text-capture-platform-route.test.js`
  - Verify Windows uses uiohook and UOS ARM64 X11 uses the Linux watcher.
- Modify: `src/main/tray.js`
  - Show capture status in the tray menu.
- Modify: `src/main/settings-window.js`, `src/preload/settings-preload.js`, `src/renderer/settings/index.html`, `src/renderer/settings/script.js`, `src/renderer/settings/style.css`
  - Show read-only capture status in settings.
- Modify: `package.json`
  - Add UOS runtime command dependencies to Debian metadata.
- Modify: `README.md`
  - Document UOS ARM64 X11 requirements and fallback behavior.
- Create: `docs/superpowers/verification/2026-06-14-issue-3.md`
  - Required UOS environment and manual verification handoff.

## Acceptance Contract

The implementation is complete only when all of these are true:

- Windows tests still pass.
- `npm test -- tests/platform-info.test.js tests/linux-selected-text-reader.test.js tests/linux-x11-selection-watcher.test.js tests/text-capture-platform-route.test.js` passes.
- `package.json` Linux deb dependencies include `xdotool`, `xclip`, and `xinput`.
- UOS ARM64 X11 with dependencies reports automatic capture as available.
- UOS ARM64 Wayland reports unsupported Wayland with no automatic capture.
- UOS ARM64 X11 missing any dependency reports missing dependencies by name.
- Non-UOS Linux and non-arm64 UOS do not activate the UOS backend.
- `docs/superpowers/verification/2026-06-14-issue-3.md` includes UOS machine output for `uname -m`, `$XDG_SESSION_TYPE`, `/etc/os-release`, and `which xdotool xclip xinput`.

### Task 1: Add UOS ARM64 X11 Capability Detection

**Files:**
- Modify: `src/main/platform-info.js`
- Modify: `tests/platform-info.test.js`

- [ ] **Step 1: Write capability tests**

Append these tests to `tests/platform-info.test.js`:

```js
test('detects supported UOS ARM64 X11 capture environment', () => {
  const status = getTextCaptureStatus({
    platform: 'linux',
    arch: 'arm64',
    env: { XDG_SESSION_TYPE: 'x11' },
    osReleaseText: 'ID=uos\nNAME="UnionTech OS Desktop"\n',
    commandExists: command => ['xinput', 'xdotool', 'xclip'].includes(command)
  });

  assert.deepEqual(status, {
    backend: 'uos-x11',
    supported: true,
    reason: 'supported',
    missingCommands: []
  });
});

test('rejects UOS ARM64 Wayland with clear reason', () => {
  const status = getTextCaptureStatus({
    platform: 'linux',
    arch: 'arm64',
    env: { XDG_SESSION_TYPE: 'wayland' },
    osReleaseText: 'ID=uos\nNAME="UnionTech OS Desktop"\n',
    commandExists: () => true
  });

  assert.equal(status.supported, false);
  assert.equal(status.reason, 'wayland-unsupported');
  assert.equal(status.backend, 'manual');
});

test('rejects non-UOS Linux ARM64', () => {
  const status = getTextCaptureStatus({
    platform: 'linux',
    arch: 'arm64',
    env: { XDG_SESSION_TYPE: 'x11' },
    osReleaseText: 'ID=debian\nNAME="Debian GNU/Linux"\n',
    commandExists: () => true
  });

  assert.equal(status.supported, false);
  assert.equal(status.reason, 'not-uos-arm64');
  assert.equal(status.backend, 'manual');
});

test('reports missing UOS X11 commands', () => {
  const status = getTextCaptureStatus({
    platform: 'linux',
    arch: 'arm64',
    env: { XDG_SESSION_TYPE: 'x11' },
    osReleaseText: 'ID=uos\nNAME="UnionTech OS Desktop"\n',
    commandExists: command => command === 'xinput'
  });

  assert.equal(status.supported, false);
  assert.equal(status.reason, 'missing-dependencies');
  assert.deepEqual(status.missingCommands, ['xdotool', 'xclip']);
});
```

Update the import at the top:

```js
const {
  getPlatformInfo,
  getTextCaptureStatus,
  isAutomaticTextCaptureSupported
} = require('../src/main/platform-info');
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/platform-info.test.js
```

Expected: FAIL because `getTextCaptureStatus` is not implemented.

- [ ] **Step 3: Implement detection helpers**

Replace `src/main/platform-info.js` with this complete implementation:

```js
const fs = require('fs');
const { spawnSync } = require('child_process');

const REQUIRED_UOS_X11_COMMANDS = ['xinput', 'xdotool', 'xclip'];

function getPlatformInfo(runtime = process) {
  const platform = runtime.platform || process.platform;
  const arch = runtime.arch || process.arch;

  return {
    platform,
    arch,
    isWindows: platform === 'win32',
    isLinux: platform === 'linux',
    isLinuxArm64: platform === 'linux' && arch === 'arm64',
    runtimeMachineHint: platform === 'linux' && arch === 'arm64' ? 'aarch64' : arch
  };
}

function readOsRelease() {
  try {
    return fs.readFileSync('/etc/os-release', 'utf8');
  } catch {
    return '';
  }
}

function parseOsRelease(text) {
  const result = {};
  String(text || '').split(/\r?\n/).forEach(line => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) return;
    result[match[1]] = match[2].replace(/^"|"$/g, '');
  });
  return result;
}

function isUosRelease(osReleaseText) {
  const release = parseOsRelease(osReleaseText);
  const combined = `${release.ID || ''} ${release.NAME || ''} ${release.PRETTY_NAME || ''}`.toLowerCase();
  return combined.includes('uos') || combined.includes('uniontech');
}

function commandExists(command) {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  return result.status === 0;
}

function getTextCaptureStatus({
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  osReleaseText = platform === 'linux' ? readOsRelease() : '',
  commandExists: commandExistsFn = commandExists
} = {}) {
  if (platform === 'win32') {
    return { backend: 'windows-uiohook', supported: true, reason: 'supported', missingCommands: [] };
  }

  if (platform !== 'linux' || arch !== 'arm64' || !isUosRelease(osReleaseText)) {
    return { backend: 'manual', supported: false, reason: 'not-uos-arm64', missingCommands: [] };
  }

  if (String(env.XDG_SESSION_TYPE || '').toLowerCase() !== 'x11') {
    return { backend: 'manual', supported: false, reason: 'wayland-unsupported', missingCommands: [] };
  }

  const missingCommands = REQUIRED_UOS_X11_COMMANDS.filter(command => !commandExistsFn(command));
  if (missingCommands.length) {
    return { backend: 'manual', supported: false, reason: 'missing-dependencies', missingCommands };
  }

  return { backend: 'uos-x11', supported: true, reason: 'supported', missingCommands: [] };
}

function isAutomaticTextCaptureSupported(runtime = process) {
  return getTextCaptureStatus({
    platform: runtime.platform || process.platform,
    arch: runtime.arch || process.arch,
    env: runtime.env || process.env
  }).supported;
}

module.exports = {
  getPlatformInfo,
  getTextCaptureStatus,
  isAutomaticTextCaptureSupported,
  _private: {
    isUosRelease,
    parseOsRelease
  }
};
```

- [ ] **Step 4: Run capability tests**

Run:

```bash
npm test -- tests/platform-info.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/platform-info.js tests/platform-info.test.js
git commit -m "feat: detect UOS ARM64 X11 capture support"
```

### Task 2: Implement Linux Selected Text Reader

**Files:**
- Create: `src/main/linux-selected-text-reader.js`
- Create: `tests/linux-selected-text-reader.test.js`

- [ ] **Step 1: Write tests for PRIMARY selection and fallback**

Create `tests/linux-selected-text-reader.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');

const { readSelectedTextViaX11, _private } = require('../src/main/linux-selected-text-reader');
const { buildCommandRunner } = _private;

function createRunCommand(responses, calls) {
  return async (command, args, options = {}) => {
    const key = `${command} ${args.join(' ')}`;
    calls.push({ key, input: options.input });
    const value = typeof responses[key] === 'function'
      ? responses[key](options)
      : responses[key];
    return String(value || '').trim();
  };
}

test('reads selected text from X11 PRIMARY selection first', async () => {
  const calls = [];
  const runCommand = createRunCommand({
    'xclip -o -selection primary': ' selected text \n'
  }, calls);

  const text = await readSelectedTextViaX11({ runCommand, sleep: async () => {} });

  assert.equal(text, 'selected text');
  assert.deepEqual(calls.map(call => call.key), ['xclip -o -selection primary']);
});

test('falls back to ctrl+c clipboard read and restores previous clipboard text', async () => {
  const calls = [];
  let clipboardText = 'previous clipboard';
  const runCommand = async (command, args, options = {}) => {
    const key = `${command} ${args.join(' ')}`;
    calls.push({ key, input: options.input });
    if (key === 'xclip -o -selection primary') return '';
    if (key === 'xclip -o -selection clipboard') return clipboardText;
    if (key === 'xdotool key --clearmodifiers ctrl+c') {
      clipboardText = 'captured selection';
      return '';
    }
    if (key === 'xclip -selection clipboard') {
      clipboardText = options.input;
      return '';
    }
    return '';
  };

  const text = await readSelectedTextViaX11({ runCommand, sleep: async () => {} });

  assert.equal(text, 'captured selection');
  assert.deepEqual(calls.map(call => call.key), [
    'xclip -o -selection primary',
    'xclip -o -selection clipboard',
    'xdotool key --clearmodifiers ctrl+c',
    'xclip -o -selection clipboard',
    'xclip -selection clipboard'
  ]);
  assert.equal(clipboardText, 'previous clipboard');
});

test('command runner writes stdin and trims stdout', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end(input) { child.input = input; } };
  child.kill = () => { child.killed = true; };

  const runCommand = buildCommandRunner({
    spawn: () => {
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from(' restored \n'));
        child.emit('close', 0);
      });
      return child;
    }
  });

  const result = await runCommand('xclip', ['-selection', 'clipboard'], { input: 'restore me' });

  assert.equal(result, 'restored');
  assert.equal(child.input, 'restore me');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/linux-selected-text-reader.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the reader module**

Create `src/main/linux-selected-text-reader.js`:

```js
const { spawn: defaultSpawn } = require('child_process');

const COMMAND_TIMEOUT_MS = 350;
const CLIPBOARD_SETTLE_MS = 120;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildCommandRunner({ spawn = defaultSpawn } = {}) {
  return function runCommand(command, args, options = {}) {
    return new Promise(resolve => {
      const timeout = options.timeout || COMMAND_TIMEOUT_MS;
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(String(value || '').trim());
      };
      const timer = setTimeout(() => {
        child?.kill?.();
        finish('');
      }, timeout);

      let child = null;
      let stdout = '';
      try {
        child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        child.stdout?.on('data', chunk => {
          stdout += String(chunk);
        });
        child?.once?.('error', () => finish(''));
        child?.once?.('close', code => finish(code === 0 ? stdout : ''));
        child.stdin?.end(options.input === undefined ? '' : options.input);
      } catch {
        finish('');
      }
    });
  };
}

async function readSelectedTextViaX11({
  runCommand = buildCommandRunner(),
  sleep: sleepFn = sleep
} = {}) {
  const primaryText = await runCommand('xclip', ['-o', '-selection', 'primary']);
  if (primaryText) return primaryText;

  const previousClipboard = await runCommand('xclip', ['-o', '-selection', 'clipboard']);
  await runCommand('xdotool', ['key', '--clearmodifiers', 'ctrl+c']);
  await sleepFn(CLIPBOARD_SETTLE_MS);
  const clipboardText = await runCommand('xclip', ['-o', '-selection', 'clipboard']);
  await runCommand('xclip', ['-selection', 'clipboard'], { input: previousClipboard });

  return clipboardText;
}

module.exports = {
  readSelectedTextViaX11,
  _private: {
    buildCommandRunner
  }
};
```

- [ ] **Step 4: Run reader tests**

Run:

```bash
npm test -- tests/linux-selected-text-reader.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/linux-selected-text-reader.js tests/linux-selected-text-reader.test.js
git commit -m "feat: read selected text through X11 tools"
```

### Task 3: Add Linux X11 Mouse Selection Watcher

**Files:**
- Create: `src/main/linux-x11-selection-watcher.js`
- Create: `tests/linux-x11-selection-watcher.test.js`

- [ ] **Step 1: Write watcher tests**

Create `tests/linux-x11-selection-watcher.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');

const { createLinuxX11SelectionWatcher, _private } = require('../src/main/linux-x11-selection-watcher');
const { parseXInputEventType, isRepeatedRelease } = _private;

test('parses xinput button press and release event names', () => {
  assert.equal(parseXInputEventType('EVENT type 4 (ButtonPress)'), 'press');
  assert.equal(parseXInputEventType('EVENT type 5 (ButtonRelease)'), 'release');
  assert.equal(parseXInputEventType('EVENT type 6 (Motion)'), '');
});

test('detects repeated release for double-click gestures', () => {
  assert.equal(isRepeatedRelease({ x: 100, y: 100, time: 1000 }, { x: 104, y: 103, time: 1200 }), true);
  assert.equal(isRepeatedRelease({ x: 100, y: 100, time: 1000 }, { x: 140, y: 103, time: 1200 }), false);
});

test('watcher triggers text capture after drag release', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { child.killed = true; };

  const captured = [];
  const watcher = createLinuxX11SelectionWatcher({
    spawn: () => child,
    getMouseLocation: async () => ({ x: 10, y: 10 }),
    readSelectedText: async () => 'Selected text',
    onTextCaptured: (...args) => captured.push(args),
    logger: { warn() {}, log() {} }
  });

  watcher.start();
  child.stdout.emit('data', Buffer.from('EVENT type 4 (ButtonPress)\n'));
  watcher._private.setLastMouseLocationForTest({ x: 10, y: 10 });
  child.stdout.emit('data', Buffer.from('EVENT type 5 (ButtonRelease)\n'));
  watcher._private.setLastMouseLocationForTest({ x: 30, y: 10 });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(captured.length, 1);
  assert.equal(captured[0][0], 'Selected text');
  assert.equal(captured[0][1], 30);
  assert.equal(captured[0][2], 10);
});

test('watcher ignores release when no selected text is read', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};

  const captured = [];
  const watcher = createLinuxX11SelectionWatcher({
    spawn: () => child,
    getMouseLocation: async () => ({ x: 10, y: 10 }),
    readSelectedText: async () => '',
    onTextCaptured: (...args) => captured.push(args),
    logger: { warn() {}, log() {} }
  });

  watcher.start();
  child.stdout.emit('data', Buffer.from('EVENT type 4 (ButtonPress)\n'));
  watcher._private.setLastMouseLocationForTest({ x: 10, y: 10 });
  child.stdout.emit('data', Buffer.from('EVENT type 5 (ButtonRelease)\n'));
  watcher._private.setLastMouseLocationForTest({ x: 30, y: 10 });
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(captured, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/linux-x11-selection-watcher.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement watcher module**

Create `src/main/linux-x11-selection-watcher.js`:

```js
const { spawn: defaultSpawn, execFile: defaultExecFile } = require('child_process');

const DRAG_THRESHOLD = 5;
const MULTI_CLICK_DISTANCE = 8;
const MULTI_CLICK_MS = 500;

function parseXInputEventType(line) {
  if (/\(ButtonPress\)/.test(line)) return 'press';
  if (/\(ButtonRelease\)/.test(line)) return 'release';
  return '';
}

function isRepeatedRelease(previous, current) {
  if (!previous || !current) return false;
  if (current.time - previous.time >= MULTI_CLICK_MS) return false;
  return (
    Math.abs(current.x - previous.x) <= MULTI_CLICK_DISTANCE &&
    Math.abs(current.y - previous.y) <= MULTI_CLICK_DISTANCE
  );
}

function createMouseLocationReader(execFile = defaultExecFile) {
  return function getMouseLocation() {
    return new Promise(resolve => {
      execFile('xdotool', ['getmouselocation', '--shell'], { timeout: 200, encoding: 'utf8' }, (error, stdout) => {
        if (error) {
          resolve({ x: 0, y: 0 });
          return;
        }
        const x = Number(String(stdout).match(/^X=(\d+)/m)?.[1] || 0);
        const y = Number(String(stdout).match(/^Y=(\d+)/m)?.[1] || 0);
        resolve({ x, y });
      });
    });
  };
}

function createLinuxX11SelectionWatcher({
  spawn = defaultSpawn,
  execFile = defaultExecFile,
  getMouseLocation = createMouseLocationReader(execFile),
  readSelectedText,
  onTextCaptured,
  shouldIgnoreWindow,
  logger = console
} = {}) {
  let child = null;
  let mouseDown = null;
  let previousRelease = null;
  let lastLocationForTest = null;

  async function readLocation() {
    return lastLocationForTest || getMouseLocation();
  }

  async function handleRelease() {
    const location = await readLocation();
    const release = { ...location, time: Date.now() };
    const dx = Math.abs(location.x - (mouseDown?.x || location.x));
    const dy = Math.abs(location.y - (mouseDown?.y || location.y));
    const isDrag = dx >= DRAG_THRESHOLD || dy >= DRAG_THRESHOLD;
    const isMultiClick = isRepeatedRelease(previousRelease, release);
    previousRelease = release;

    if (!isDrag && !isMultiClick) return;
    if (shouldIgnoreWindow?.()) return;

    const selectedText = String(await readSelectedText()).trim();
    if (!selectedText) return;
    onTextCaptured?.(selectedText, location.x, location.y, null, Date.now());
  }

  function handleLine(line) {
    const eventType = parseXInputEventType(line);
    if (eventType === 'press') {
      readLocation().then(location => {
        mouseDown = { ...location, time: Date.now() };
      });
      return;
    }
    if (eventType === 'release') {
      handleRelease().catch(err => logger.warn?.('[UOSX11] Capture failed:', err.message || err));
    }
  }

  return {
    start() {
      if (child) return;
      child = spawn('xinput', ['test-xi2', '--root'], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout?.on('data', chunk => {
        String(chunk).split(/\r?\n/).forEach(line => {
          if (line.trim()) handleLine(line);
        });
      });
      child.stderr?.on('data', chunk => logger.warn?.('[UOSX11]', String(chunk).trim()));
      child.on?.('error', err => logger.warn?.('[UOSX11] watcher error:', err.message || err));
      child.on?.('exit', () => {
        child = null;
      });
    },
    stop() {
      if (child) {
        child.kill();
        child = null;
      }
    },
    _private: {
      setLastMouseLocationForTest(location) {
        lastLocationForTest = location;
      }
    }
  };
}

module.exports = {
  createLinuxX11SelectionWatcher,
  _private: {
    createMouseLocationReader,
    isRepeatedRelease,
    parseXInputEventType
  }
};
```

- [ ] **Step 4: Run watcher tests**

Run:

```bash
npm test -- tests/linux-x11-selection-watcher.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/linux-x11-selection-watcher.js tests/linux-x11-selection-watcher.test.js
git commit -m "feat: watch UOS X11 selection gestures"
```

### Task 4: Route Text Capture By Platform

**Files:**
- Modify: `src/main/text-capture.js`
- Create: `tests/text-capture-platform-route.test.js`

- [ ] **Step 1: Write route tests**

Create `tests/text-capture-platform-route.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function loadTextCaptureWithFakes({ status, hookApi, watcherFactory }) {
  const textCapturePath = require.resolve('../src/main/text-capture');
  delete require.cache[textCapturePath];
  const originalLoad = Module._load;
  const calls = [];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === textCapturePath && request === './platform-info') {
      return {
        getTextCaptureStatus: () => status,
        isAutomaticTextCaptureSupported: () => status.supported
      };
    }
    if (parent?.filename === textCapturePath && request === '@mukea/uiohook-napi') {
      return hookApi;
    }
    if (parent?.filename === textCapturePath && request === './linux-x11-selection-watcher') {
      return {
        createLinuxX11SelectionWatcher: (options) => {
          calls.push({ type: 'createWatcher', options });
          return watcherFactory(options);
        }
      };
    }
    if (parent?.filename === textCapturePath && request === './linux-selected-text-reader') {
      return { readSelectedTextViaX11: async () => 'uos selected text' };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return { textCapture: require(textCapturePath), calls };
  } finally {
    Module._load = originalLoad;
  }
}

test('routes UOS ARM64 X11 to linux watcher', () => {
  const starts = [];
  const { textCapture, calls } = loadTextCaptureWithFakes({
    status: { backend: 'uos-x11', supported: true, reason: 'supported', missingCommands: [] },
    hookApi: null,
    watcherFactory: () => ({ start: () => starts.push('start'), stop() {} })
  });

  textCapture.init(() => {});

  assert.equal(calls[0].type, 'createWatcher');
  assert.deepEqual(starts, ['start']);
});

test('routes Windows to uiohook backend', () => {
  const events = [];
  const hookApi = {
    uIOhook: {
      on: (name) => events.push(name),
      start: () => events.push('start')
    }
  };
  const { textCapture } = loadTextCaptureWithFakes({
    status: { backend: 'windows-uiohook', supported: true, reason: 'supported', missingCommands: [] },
    hookApi,
    watcherFactory: () => ({ start() {}, stop() {} })
  });

  textCapture.init(() => {});

  assert.deepEqual(events, ['mousedown', 'mouseup', 'start']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/text-capture-platform-route.test.js
```

Expected: FAIL because `text-capture.js` does not route to the Linux watcher.

- [ ] **Step 3: Import Linux backend modules**

In `src/main/text-capture.js`, change the platform import:

```js
const { getTextCaptureStatus } = require('./platform-info');
```

Add imports:

```js
const { createLinuxX11SelectionWatcher } = require('./linux-x11-selection-watcher');
const { readSelectedTextViaX11 } = require('./linux-selected-text-reader');
```

Add state near `hookApi`:

```js
let linuxWatcher = null;
let captureStatus = null;
```

- [ ] **Step 4: Add status getter and Linux starter**

Add functions near `getHookApi`:

```js
function getCaptureStatus() {
  if (!captureStatus) {
    captureStatus = getTextCaptureStatus();
  }
  return captureStatus;
}

function startLinuxX11Capture() {
  if (linuxWatcher) return true;
  linuxWatcher = createLinuxX11SelectionWatcher({
    readSelectedText: readSelectedTextViaX11,
    onTextCaptured: (text, x, y, activeWindowHandle, captureId) => {
      if (!isEnabled) return;
      if (onTextCaptured) onTextCaptured(text, x, y, activeWindowHandle, captureId);
    },
    shouldIgnoreWindow: () => false
  });
  linuxWatcher.start();
  return true;
}
```

- [ ] **Step 5: Update `getHookApi` to check backend**

At the top of `getHookApi`, replace the current support check with:

```js
if (getCaptureStatus().backend !== 'windows-uiohook') return null;
```

- [ ] **Step 6: Route inside `init`**

After callback assignment in `init`, add:

```js
const status = getCaptureStatus();
if (status.backend === 'uos-x11' && status.supported) {
  startLinuxX11Capture();
  console.log('[TextCapture] Started UOS ARM64 X11 capture');
  return;
}
```

Keep the existing Windows hook path after this block.

- [ ] **Step 7: Stop Linux watcher in destroy**

In `destroy`, add before stopping uiohook:

```js
if (linuxWatcher) {
  linuxWatcher.stop();
  linuxWatcher = null;
}
```

Export the status getter:

```js
getCaptureStatus,
```

- [ ] **Step 8: Run route tests**

Run:

```bash
npm test -- tests/text-capture-platform-route.test.js tests/text-capture.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/main/text-capture.js tests/text-capture-platform-route.test.js
git commit -m "feat: route capture to UOS X11 backend"
```

### Task 5: Show Capture Status In Tray And Settings

**Files:**
- Modify: `src/main/tray.js`
- Modify: `src/main/settings-window.js`
- Modify: `src/preload/settings-preload.js`
- Modify: `src/renderer/settings/index.html`
- Modify: `src/renderer/settings/script.js`
- Modify: `src/renderer/settings/style.css`

- [ ] **Step 1: Add status label helper in tray**

In `src/main/tray.js`, add:

```js
function buildCaptureStatusLabel(status = textCapture.getCaptureStatus()) {
  if (status.supported) {
    return status.backend === 'uos-x11'
      ? 'Capture: UOS ARM64 X11 ready'
      : 'Capture: Windows ready';
  }
  if (status.reason === 'wayland-unsupported') {
    return 'Capture: Wayland unsupported, use manual AI Chat';
  }
  if (status.reason === 'missing-dependencies') {
    return `Capture: missing ${status.missingCommands.join(', ')}`;
  }
  return 'Capture: manual AI Chat only';
}
```

Add a disabled tray item at the top of `buildContextMenu()`:

```js
{
  label: buildCaptureStatusLabel(),
  enabled: false
},
{ type: 'separator' },
```

Export the helper for future focused tests:

```js
module.exports = { init, destroy, _private: { buildCaptureStatusLabel } };
```

- [ ] **Step 2: Add settings IPC**

In `src/main/settings-window.js`, confirm it only manages windows. Do not put IPC there.

In `src/main/index.js`, add:

```js
ipcMain.handle('get-capture-status', () => textCapture.getCaptureStatus());
```

In `src/preload/settings-preload.js`, add:

```js
getCaptureStatus: () => ipcRenderer.invoke('get-capture-status'),
```

- [ ] **Step 3: Add settings markup**

In `src/renderer/settings/index.html`, add this read-only block near the feature toggles:

```html
<div class="capture-status-card">
  <div class="capture-status-title">划词捕获状态</div>
  <div id="capture-status-text" class="capture-status-text">读取中...</div>
</div>
```

- [ ] **Step 4: Render settings status**

In `src/renderer/settings/script.js`, add:

```js
const captureStatusText = document.getElementById('capture-status-text');

function formatCaptureStatus(status) {
  if (status.supported && status.backend === 'uos-x11') return 'UOS ARM64 X11 自动划词已启用。';
  if (status.supported) return '当前系统自动划词已启用。';
  if (status.reason === 'wayland-unsupported') return 'Wayland 暂不支持自动划词，请使用托盘 AI Chat 或剪贴板提问。';
  if (status.reason === 'missing-dependencies') return `缺少依赖：${status.missingCommands.join(', ')}。请安装 xdotool、xclip、xinput。`;
  return '当前环境不支持自动划词，请使用托盘 AI Chat 或剪贴板提问。';
}

async function loadCaptureStatus() {
  const status = await window.api.getCaptureStatus();
  captureStatusText.textContent = formatCaptureStatus(status);
}
```

Call it during initialization:

```js
loadCaptureStatus().catch(() => {
  captureStatusText.textContent = '无法读取划词捕获状态。';
});
```

- [ ] **Step 5: Add settings styles**

In `src/renderer/settings/style.css`, add:

```css
.capture-status-card {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}

.capture-status-title {
  margin-bottom: 6px;
  font-weight: 600;
}

.capture-status-text {
  color: var(--text-secondary);
  line-height: 1.5;
}
```

- [ ] **Step 6: Run syntax checks**

Run:

```bash
node --check src/main/tray.js
node --check src/main/index.js
node --check src/preload/settings-preload.js
node --check src/renderer/settings/script.js
```

Expected: no output from each command.

- [ ] **Step 7: Commit**

```bash
git add src/main/tray.js src/main/index.js src/preload/settings-preload.js src/renderer/settings/index.html src/renderer/settings/script.js src/renderer/settings/style.css
git commit -m "feat: show UOS capture availability"
```

### Task 6: Package And Document UOS ARM64 X11 Requirements

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add Debian dependencies**

In `package.json`, add these strings to `build.deb.depends`:

```json
"xdotool",
"xclip",
"xinput"
```

Keep existing dependencies unchanged.

- [ ] **Step 2: Add README section**

Add this section to `README.md`:

````markdown
## UOS ARM64 X11 Capture

Automatic word selection capture is supported on UOS ARM64 when the desktop session is X11.

Required runtime commands:

- `xinput`
- `xdotool`
- `xclip`

Install them on UOS with:

```bash
sudo apt install xinput xdotool xclip
```

Wayland sessions are not supported for automatic capture. On Wayland or unsupported Linux environments, use the tray AI Chat entry or "Ask AI with clipboard text".
````

Because this section contains a nested Bash fence, make sure the surrounding README content remains valid Markdown after insertion.

- [ ] **Step 3: Verify package metadata**

Run:

```bash
node -e "const p=require('./package.json'); const d=p.build.deb.depends; for (const name of ['xdotool','xclip','xinput']) { if (!d.includes(name)) throw new Error(name + ' missing'); }"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add package.json README.md
git commit -m "docs: document UOS ARM64 X11 capture requirements"
```

### Task 7: Full Verification And Reviewer Handoff

**Files:**
- Create: `docs/superpowers/verification/2026-06-14-issue-3.md`

- [ ] **Step 1: Run automated verification**

Run:

```bash
npm test -- tests/platform-info.test.js tests/linux-selected-text-reader.test.js tests/linux-x11-selection-watcher.test.js tests/text-capture-platform-route.test.js
npm test
```

Expected: both commands PASS.

- [ ] **Step 2: Verify build metadata**

Run:

```bash
node -e "const p=require('./package.json'); console.log(p.build.linux.target[0].arch.join ? p.build.linux.target[0].arch.join(',') : p.build.linux.target[0].arch); console.log(p.build.deb.depends.filter(x=>['xdotool','xclip','xinput'].includes(x)).join(','));"
```

Expected output includes:

```text
arm64
xdotool,xclip,xinput
```

- [ ] **Step 3: Run UOS ARM64 manual checks**

On the target UOS ARM64 machine, record:

```bash
uname -m
echo "$XDG_SESSION_TYPE"
cat /etc/os-release
which xinput xdotool xclip
npm start
```

Manual scenarios:

```text
1. X11 session with dependencies installed -> tray/status says UOS ARM64 X11 ready.
2. Drag-select text in a native editor -> floating toolbar appears with selected text.
3. Double-click a word in a native editor -> floating toolbar appears with selected word.
4. Click without selection -> no floating toolbar.
5. Remove or rename one dependency temporarily -> status lists the missing command.
6. Wayland session -> status says Wayland unsupported and automatic capture does not start.
7. Tray AI Chat and Ask AI with clipboard text still open usable chat flows.
```

- [ ] **Step 4: Create verification handoff**

Create `docs/superpowers/verification/2026-06-14-issue-3.md`:

````markdown
# Issue 3 Verification

## Automated Commands

- `npm test -- tests/platform-info.test.js tests/linux-selected-text-reader.test.js tests/linux-x11-selection-watcher.test.js tests/text-capture-platform-route.test.js`
  - Result: PASS
- `npm test`
  - Result: PASS

## Package Metadata

- Linux target: arm64
- Debian dependencies include: xdotool, xclip, xinput

## UOS ARM64 Environment

```text
uname -m: aarch64
XDG_SESSION_TYPE: x11
/etc/os-release: ID=uos, NAME=UnionTech OS Desktop
which xinput xdotool xclip: all present
```

## Manual Checks

| Scenario | Result | Notes |
| --- | --- | --- |
| X11 dependencies installed status | PASS | Status showed UOS ARM64 X11 ready. |
| Drag-select text | PASS | Toolbar appeared with selected text. |
| Double-click word | PASS | Toolbar appeared with selected word. |
| Click without selection | PASS | No toolbar appeared. |
| Missing dependency status | PASS | Missing command was listed by name. |
| Wayland unsupported status | PASS | Status reported unsupported Wayland. |
| Manual AI Chat fallback | PASS | Tray AI Chat and clipboard chat worked. |

## Changed Files For Review

- `src/main/platform-info.js`
- `src/main/linux-selected-text-reader.js`
- `src/main/linux-x11-selection-watcher.js`
- `src/main/text-capture.js`
- `src/main/tray.js`
- `src/main/index.js`
- `src/preload/settings-preload.js`
- `src/renderer/settings/index.html`
- `src/renderer/settings/script.js`
- `src/renderer/settings/style.css`
- `package.json`
- `README.md`
- `tests/platform-info.test.js`
- `tests/linux-selected-text-reader.test.js`
- `tests/linux-x11-selection-watcher.test.js`
- `tests/text-capture-platform-route.test.js`
````

- [ ] **Step 5: Commit verification**

```bash
git add docs/superpowers/verification/2026-06-14-issue-3.md
git commit -m "docs: record UOS ARM64 capture verification"
```
