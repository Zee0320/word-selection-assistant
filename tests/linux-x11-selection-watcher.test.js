const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

function createMockXinputProcess() {
  const mock = new EventEmitter();
  mock.stdout = new PassThrough();
  mock.stderr = new PassThrough();
  mock.killed = false;

  mock.kill = function(signal = 'SIGTERM') {
    this.killed = true;
    this.emit('close', 0, signal);
  };

  mock.simulateEvent = function(line) {
    this.stdout.write(line + '\n');
  };

  return mock;
}

function createMockReadSelectedText() {
  const calls = [];
  return {
    calls,
    async readSelectedText() {
      calls.push(Date.now());
      return 'selected text';
    }
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('detects drag gesture with distance >= 5px', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  const mockReader = createMockReadSelectedText();

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: mockReader.readSelectedText,
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // Simulate button press at (100, 100) - button 1 is left click
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  // Simulate button release at (110, 105) - distance is > 5px in both x and y
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (110, 105)');

  await delay(200);

  assert.equal(captured.length, 1);
  assert.equal(captured[0].text, 'selected text');
  assert.equal(captured[0].x, 110);
  assert.equal(captured[0].y, 105);

  watcher.stop();
});

test('detects drag from real multi-line xinput test-xi2 output', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => 'selected text',
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();
  mockProcess.stdout.write([
    'EVENT type 4 (ButtonPress)',
    '    device: 4 (4)',
    '    detail: 1',
    '    flags:',
    '    root: 100.00/100.00',
    'EVENT type 5 (ButtonRelease)',
    '    device: 4 (4)',
    '    detail: 1',
    '    flags:',
    '    root: 110.00/105.00',
    ''
  ].join('\n'));

  await delay(200);

  assert.deepEqual(captured, [{ text: 'selected text', x: 110, y: 105 }]);
  watcher.stop();
});

test('ignores small drags < 5px', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  const mockReader = createMockReadSelectedText();

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: mockReader.readSelectedText,
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // Simulate button press at (100, 100)
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  // Simulate button release at (103, 102) - distance is < 5px
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (103, 102)');

  await delay(50);

  assert.equal(captured.length, 0);
  assert.equal(mockReader.calls.length, 0);

  watcher.stop();
});

test('detects double-click selection', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  const mockReader = createMockReadSelectedText();

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: mockReader.readSelectedText,
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // First click
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (100, 100)');
  await delay(50);

  // Second click (double-click) - same position
  mockProcess.simulateEvent('event 2: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 3: ButtonRelease (1) at (100, 100)');

  await delay(200);

  assert.equal(captured.length, 1);
  assert.equal(captured[0].text, 'selected text');

  watcher.stop();
});

test('detects triple-click selection', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  const mockReader = createMockReadSelectedText();

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: mockReader.readSelectedText,
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // First click
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (100, 100)');
  await delay(250); // Wait for settle + some buffer

  // Second click
  mockProcess.simulateEvent('event 2: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 3: ButtonRelease (1) at (100, 100)');
  await delay(250); // Wait for settle + some buffer

  // Third click
  mockProcess.simulateEvent('event 4: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 5: ButtonRelease (1) at (100, 100)');

  await delay(200);

  // Triple-click captures at least once
  assert.ok(captured.length >= 1, 'Should capture at least once for triple-click');

  watcher.stop();
});

test('ignores single click without drag', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  const mockReader = createMockReadSelectedText();

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: mockReader.readSelectedText,
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // Single click without drag
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (100, 100)');

  await delay(50);

  assert.equal(captured.length, 0);
  assert.equal(mockReader.calls.length, 0);

  watcher.stop();
});

test('does not capture when paused', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  const mockReader = createMockReadSelectedText();

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: mockReader.readSelectedText,
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();
  watcher.pause();

  // Simulate drag
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (110, 105)');

  await delay(50);

  assert.equal(captured.length, 0);
  assert.equal(mockReader.calls.length, 0);

  watcher.stop();
});

test('captures again after resume', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  const mockReader = createMockReadSelectedText();

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: mockReader.readSelectedText,
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();
  watcher.pause();

  // Simulate drag while paused
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (110, 105)');
  await delay(200);

  assert.equal(captured.length, 0);

  watcher.resume();

  // Simulate another drag after resume
  mockProcess.simulateEvent('event 2: ButtonPress (1) at (200, 200)');
  mockProcess.simulateEvent('event 3: ButtonRelease (1) at (210, 210)');

  await delay(200);

  assert.equal(captured.length, 1);
  assert.equal(captured[0].x, 210);

  watcher.stop();
});

test('kills xinput process on stop', async () => {
  const mockProcess = createMockXinputProcess();

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => 'test'
  });

  watcher.start();
  assert.equal(mockProcess.killed, false);

  watcher.stop();
  assert.equal(mockProcess.killed, true);
});

test('does not capture when text is empty', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  const readCalls = [];

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => {
      readCalls.push(true);
      return ''; // Empty text
    },
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // Simulate drag
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (110, 105)');

  await delay(200);

  assert.equal(readCalls.length, 1);
  assert.equal(captured.length, 0);

  watcher.stop();
});

test('does not capture when text is whitespace only', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => '   ', // Whitespace only
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // Simulate drag
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (110, 105)');

  await delay(50);

  assert.equal(captured.length, 0);

  watcher.stop();
});

test('handles drag in X direction only', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => 'horizontal text',
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // Drag only in X direction (> 5px)
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (110, 100)');

  await delay(200);

  assert.equal(captured.length, 1);
  assert.equal(captured[0].text, 'horizontal text');

  watcher.stop();
});

test('handles drag in Y direction only', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => 'vertical text',
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // Drag only in Y direction (> 5px)
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (100, 110)');

  await delay(200);

  assert.equal(captured.length, 1);
  assert.equal(captured[0].text, 'vertical text');

  watcher.stop();
});

test('double-click within distance threshold', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => 'double-clicked text',
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // First click
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (100, 100)');
  await delay(50);

  // Second click slightly offset (within threshold)
  mockProcess.simulateEvent('event 2: ButtonPress (1) at (105, 105)');
  mockProcess.simulateEvent('event 3: ButtonRelease (1) at (105, 105)');

  await delay(200);

  assert.equal(captured.length, 1);

  watcher.stop();
});

test('ignores double-click outside distance threshold', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  const readCalls = [];

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => {
      readCalls.push(true);
      return 'text';
    },
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // First click
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (100, 100)');
  await delay(50);

  // Second click far away (outside threshold)
  mockProcess.simulateEvent('event 2: ButtonPress (1) at (200, 200)');
  mockProcess.simulateEvent('event 3: ButtonRelease (1) at (200, 200)');

  await delay(50);

  // Both clicks should be treated as single clicks (no capture)
  assert.equal(captured.length, 0);
  assert.equal(readCalls.length, 0);

  watcher.stop();
});

test('ignores double-click outside time threshold', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  const readCalls = [];

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => {
      readCalls.push(true);
      return 'text';
    },
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // First click
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (100, 100)');

  // Wait too long (> 500ms threshold)
  await delay(600);

  // Second click
  mockProcess.simulateEvent('event 2: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 3: ButtonRelease (1) at (100, 100)');

  await delay(50);

  // Both should be treated as single clicks
  assert.equal(captured.length, 0);
  assert.equal(readCalls.length, 0);

  watcher.stop();
});

test('handles multiple sequential selections', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  let textCounter = 0;

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => `text ${++textCounter}`,
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // First selection
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (110, 105)');
  await delay(200);

  // Second selection
  mockProcess.simulateEvent('event 2: ButtonPress (1) at (200, 200)');
  mockProcess.simulateEvent('event 3: ButtonRelease (1) at (210, 210)');
  await delay(200);

  assert.equal(captured.length, 2);
  assert.equal(captured[0].text, 'text 1');
  assert.equal(captured[1].text, 'text 2');

  watcher.stop();
});

test('ignores button 2 (middle click)', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  const readCalls = [];

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => {
      readCalls.push(true);
      return 'text';
    },
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // Middle click drag - button 2
  mockProcess.simulateEvent('event 0: ButtonPress (2) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (2) at (110, 105)');

  await delay(50);

  assert.equal(captured.length, 0);
  assert.equal(readCalls.length, 0);

  watcher.stop();
});

test('ignores button 3 (right click)', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];
  const readCalls = [];

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => {
      readCalls.push(true);
      return 'text';
    },
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // Right click drag - button 3
  mockProcess.simulateEvent('event 0: ButtonPress (3) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (3) at (110, 105)');

  await delay(50);

  assert.equal(captured.length, 0);
  assert.equal(readCalls.length, 0);

  watcher.stop();
});

test('handles xinput process exit gracefully', async () => {
  const mockProcess = createMockXinputProcess();
  const captured = [];

  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => mockProcess,
    readSelectedText: async () => 'text',
    onTextCaptured: (text, x, y) => captured.push({ text, x, y })
  });

  watcher.start();

  // Simulate process exit
  mockProcess.emit('close', 0, null);

  // Should not throw if events come after exit
  mockProcess.simulateEvent('event 0: ButtonPress (1) at (100, 100)');
  mockProcess.simulateEvent('event 1: ButtonRelease (1) at (110, 105)');

  await delay(50);

  // No capture should happen after process exit
  assert.equal(captured.length, 0);

  watcher.stop();
});

test('parseXinputCoordinates extracts coordinates from xinput output', () => {
  const { parseXinputCoordinates } = require('../src/main/linux-x11-selection-watcher');

  // Standard xinput output format
  const result1 = parseXinputCoordinates('event 0: ButtonPress (1) at (100, 200)');
  assert.deepEqual(result1, { x: 100, y: 200 });

  // Different event type
  const result2 = parseXinputCoordinates('event 1: ButtonRelease (1) at (350, 450)');
  assert.deepEqual(result2, { x: 350, y: 450 });

  // With detail field
  const result3 = parseXinputCoordinates('event 2: ButtonPress (1) detail: 1 at (50, 75)');
  assert.deepEqual(result3, { x: 50, y: 75 });

  const result4 = parseXinputCoordinates('    root: 1053.23/101.84');
  assert.deepEqual(result4, { x: 1053.23, y: 101.84 });
});

test('parseXinputEvent extracts event type from xinput output', () => {
  const { parseXinputEvent } = require('../src/main/linux-x11-selection-watcher');

  assert.equal(parseXinputEvent('event 0: ButtonPress (1) at (100, 200)'), 'ButtonPress');
  assert.equal(parseXinputEvent('event 1: ButtonRelease (1) at (350, 450)'), 'ButtonRelease');
  assert.equal(parseXinputEvent('event 2: Motion (0) at (100, 200)'), 'Motion');
  assert.equal(parseXinputEvent('EVENT type 4 (ButtonPress)'), 'ButtonPress');
  assert.equal(parseXinputEvent('EVENT type 5 (ButtonRelease)'), 'ButtonRelease');
  assert.equal(parseXinputEvent('some random line'), null);
});

test('parseXinputButton extracts button number from xinput output', () => {
  const { parseXinputButton } = require('../src/main/linux-x11-selection-watcher');

  assert.equal(parseXinputButton('event 0: ButtonPress (1) at (100, 200)'), 1);
  assert.equal(parseXinputButton('event 1: ButtonRelease (2) at (350, 450)'), 2);
  assert.equal(parseXinputButton('event 2: ButtonPress (3) detail: 1 at (50, 75)'), 3);
  assert.equal(parseXinputButton('    detail: 1'), 1);
  assert.equal(parseXinputButton('some random line'), null);
});

test('isPaired checks module state', () => {
  const { createLinuxX11SelectionWatcher } = require('../src/main/linux-x11-selection-watcher');
  const watcher = createLinuxX11SelectionWatcher({
    spawnXinput: () => createMockXinputProcess(),
    readSelectedText: async () => 'text'
  });

  assert.equal(watcher.isPaused(), false);

  watcher.pause();
  assert.equal(watcher.isPaused(), true);

  watcher.resume();
  assert.equal(watcher.isPaused(), false);

  watcher.stop();
});
