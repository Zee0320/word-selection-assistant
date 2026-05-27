const { execFile } = require('child_process');

const isWindows = process.platform === 'win32';
const POWERSHELL = 'powershell.exe';

function buildUIAutomationSelectionScript() {
  return `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$element = [System.Windows.Automation.AutomationElement]::FocusedElement
if ($null -eq $element) { return }

$textPattern = $null
if (-not $element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$textPattern)) {
  return
}

$selection = $textPattern.GetSelection()
if ($null -eq $selection -or $selection.Length -eq 0) { return }

$parts = @()
foreach ($range in $selection) {
  $text = $range.GetText(-1)
  if (-not [string]::IsNullOrWhiteSpace($text)) {
    $parts += $text
  }
}

[Console]::Write(($parts -join "\`n").Trim())
`;
}

function runPowerShell(command, timeout = 250) {
  if (!isWindows) return Promise.resolve('');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value = '') => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fallbackTimer = setTimeout(() => finish(''), timeout + 100);

    try {
      const child = execFile(
        POWERSHELL,
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { timeout, windowsHide: true },
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

async function readSelectedTextViaUIAutomation(timeout = 250) {
  return runPowerShell(buildUIAutomationSelectionScript(), timeout);
}

module.exports = {
  readSelectedTextViaUIAutomation,
  _private: { buildUIAutomationSelectionScript }
};
