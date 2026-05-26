// src/main/window-focus.js - best-effort Windows foreground window restore
const { execFile } = require('child_process');

const isWindows = process.platform === 'win32';
const POWERSHELL = 'powershell.exe';

function nativeWindowHandleToNumber(handleBuffer) {
  if (!handleBuffer || !Buffer.isBuffer(handleBuffer) || handleBuffer.length === 0) {
    return null;
  }

  try {
    const value = handleBuffer.length >= 8
      ? handleBuffer.readBigUInt64LE(0)
      : BigInt(handleBuffer.readUInt32LE(0));
    const numberValue = Number(value);
    return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : null;
  } catch {
    return null;
  }
}

function runPowerShell(command) {
  if (!isWindows) return Promise.resolve('');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value = '') => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fallbackTimer = setTimeout(() => finish(''), 900);

    try {
      const child = execFile(
        POWERSHELL,
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { timeout: 800, windowsHide: true },
        (error, stdout) => {
          clearTimeout(fallbackTimer);
          if (error) {
            finish('');
            return;
          }
          finish(String(stdout || '').trim());
        }
      );
      child.once('error', () => {
        clearTimeout(fallbackTimer);
        finish('');
      });
    } catch {
      clearTimeout(fallbackTimer);
      finish('');
    }
  });
}

async function getForegroundWindow() {
  const output = await runPowerShell(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WinFocus {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
}
"@
[WinFocus]::GetForegroundWindow().ToInt64()
`);

  const hwnd = Number(output);
  return Number.isFinite(hwnd) && hwnd > 0 ? hwnd : null;
}

function restoreForegroundWindow(hwnd) {
  if (!hwnd || !isWindows) return;

  runPowerShell(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WinFocus {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@
$hwnd = [IntPtr]${Math.trunc(hwnd)}
if ([WinFocus]::IsIconic($hwnd)) {
  [WinFocus]::ShowWindowAsync($hwnd, 9) | Out-Null
}
[WinFocus]::SetForegroundWindow($hwnd) | Out-Null
`);
}

module.exports = { getForegroundWindow, nativeWindowHandleToNumber, restoreForegroundWindow };
