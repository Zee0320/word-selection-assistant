const test = require('node:test');
const assert = require('node:assert/strict');

const { nativeWindowHandleToNumber, _private } = require('../src/main/window-focus');

test('nativeWindowHandleToNumber reads 64-bit little-endian handles', () => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(12345n, 0);

  assert.equal(nativeWindowHandleToNumber(buffer), 12345);
});

test('nativeWindowHandleToNumber rejects invalid handles', () => {
  assert.equal(nativeWindowHandleToNumber(null), null);
  assert.equal(nativeWindowHandleToNumber(Buffer.alloc(0)), null);
});

test('restore foreground script only restores minimized windows before activation', () => {
  assert.equal(typeof _private?.buildRestoreForegroundWindowScript, 'function');

  const script = _private.buildRestoreForegroundWindowScript(12345);

  assert.match(script, /public static extern bool IsIconic\(IntPtr hWnd\);/);
  assert.match(script, /\$hwnd = \[IntPtr\]12345/);
  assert.match(
    script,
    /if \(\[WinFocus\]::IsIconic\(\$hwnd\)\) \{\s*\[WinFocus\]::ShowWindowAsync\(\$hwnd, 9\) \| Out-Null\s*\}/
  );
  assert.equal((script.match(/ShowWindowAsync\(\$hwnd, 9\)/g) || []).length, 1);
  assert.match(script, /\[WinFocus\]::SetForegroundWindow\(\$hwnd\) \| Out-Null/);
});

test('foreground window info script captures process, class, and title', () => {
  assert.equal(typeof _private?.buildForegroundWindowInfoScript, 'function');

  const script = _private.buildForegroundWindowInfoScript();

  assert.match(script, /GetWindowThreadProcessId/);
  assert.match(script, /GetClassName/);
  assert.match(script, /GetWindowText/);
  assert.match(script, /Get-Process -Id \$processId/);
});

test('terminal-like window detection recognizes common terminal hosts', () => {
  assert.equal(typeof _private?.isTerminalLikeWindow, 'function');

  assert.equal(_private.isTerminalLikeWindow({ processName: 'WindowsTerminal' }), true);
  assert.equal(_private.isTerminalLikeWindow({ processName: 'pwsh.exe' }), true);
  assert.equal(_private.isTerminalLikeWindow({ processName: 'alacritty' }), true);
  assert.equal(_private.isTerminalLikeWindow({ className: 'CASCADIA_HOSTING_WINDOW_CLASS' }), true);
  assert.equal(_private.isTerminalLikeWindow({ className: 'ConsoleWindowClass' }), true);
  assert.equal(_private.isTerminalLikeWindow({ processName: 'notepad', className: 'Notepad' }), false);
});
