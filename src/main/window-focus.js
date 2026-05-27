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

function buildForegroundWindowInfoScript() {
  return `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class WinInfo {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder className, int maxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
}
"@
$hwnd = [WinInfo]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) { return }
$processId = 0
[WinInfo]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
$classBuilder = New-Object System.Text.StringBuilder 256
[WinInfo]::GetClassName($hwnd, $classBuilder, $classBuilder.Capacity) | Out-Null
$titleBuilder = New-Object System.Text.StringBuilder 512
[WinInfo]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
$processName = ''
if ($processId -gt 0) {
  try {
    $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName
  } catch {
    $processName = ''
  }
}
$tab = [char]9
[Console]::Write(($hwnd.ToInt64().ToString() + $tab + $processName + $tab + $classBuilder.ToString() + $tab + $titleBuilder.ToString()))
`;
}

async function getForegroundWindowInfo() {
  const output = await runPowerShell(buildForegroundWindowInfoScript());
  const [hwndText = '', processName = '', className = '', title = ''] = output.split('\t');
  const hwnd = Number(hwndText);
  if (!Number.isFinite(hwnd) || hwnd <= 0) {
    return { hwnd: null, processName: '', className: '', title: '' };
  }
  return { hwnd, processName, className, title };
}

function normalizeWindowToken(value) {
  return String(value || '').trim().toLowerCase().replace(/\.exe$/, '');
}

function isTerminalLikeWindow(info = {}) {
  const processName = normalizeWindowToken(info.processName);
  const className = normalizeWindowToken(info.className);

  const terminalProcesses = new Set([
    'windowsterminal',
    'openconsole',
    'conhost',
    'cmd',
    'powershell',
    'pwsh',
    'mintty',
    'wezterm-gui',
    'alacritty'
  ]);
  const terminalClasses = new Set([
    'cascadia_hosting_window_class',
    'consolewindowclass'
  ]);

  return terminalProcesses.has(processName) || terminalClasses.has(className);
}

function buildRestoreForegroundWindowScript(hwnd) {
  return `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WinFocus {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
}
"@
$hwnd = [IntPtr]${Math.trunc(hwnd)}
if ([WinFocus]::IsIconic($hwnd)) {
  [WinFocus]::ShowWindowAsync($hwnd, 9) | Out-Null
}
[WinFocus]::SetForegroundWindow($hwnd) | Out-Null
`;
}

function restoreForegroundWindow(hwnd) {
  if (!hwnd || !isWindows) return;

  runPowerShell(buildRestoreForegroundWindowScript(hwnd));
}

module.exports = {
  getForegroundWindow,
  getForegroundWindowInfo,
  nativeWindowHandleToNumber,
  restoreForegroundWindow,
  _private: {
    buildForegroundWindowInfoScript,
    buildRestoreForegroundWindowScript,
    isTerminalLikeWindow
  }
};
