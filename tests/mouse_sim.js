const { execSync } = require('child_process');

const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition '
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);
' -Name Win32 -Namespace System

[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(300, 300)

[System.Win32]::mouse_event(0x02, 0, 0, 0, 0)
[System.Win32]::mouse_event(0x04, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[System.Win32]::mouse_event(0x02, 0, 0, 0, 0)
[System.Win32]::mouse_event(0x04, 0, 0, 0, 0)
`;

console.log("Simulating double click at 300,300...");
execSync(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`);
console.log("Done.");
