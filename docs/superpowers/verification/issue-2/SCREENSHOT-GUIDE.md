# Issue 2 Screenshot Capture Guide

This guide helps capture the required screenshots for issue-2 verification.

## Prerequisites

1. The application must be built and running
2. A text editor (Notepad, VS Code, etc.) must be available for selecting text

## Required Screenshots

### 1. markdown-panel.png

Shows normal markdown rendering in the floating panel.

**Steps:**
1. Start the app: `npm start`
2. Open Notepad and paste this text:
   ```
   # Heading
   
   - First item
   - Second item
   
   `inline code`
   ```
3. Select the text (Ctrl+A)
4. Wait for the floating toolbar to appear
5. Click the Translate button
6. Capture screenshot of the floating panel showing rendered markdown
7. Save as: `docs/superpowers/verification/issue-2/markdown-panel.png`

### 2. malicious-html-escaped.png

Shows that malicious HTML is escaped and not executed.

**Steps:**
1. Start the app: `npm start`
2. Open Notepad and paste this text:
   ```
   <script>alert("xss")</script>
   <img src=x onerror=alert("xss")>
   ```
3. Select the text (Ctrl+A)
4. Wait for the floating toolbar to appear
5. Click the Translate button
6. Verify that:
   - No script alert appears
   - No image error event fires
   - The HTML tags are displayed as escaped text
7. Capture screenshot showing the escaped HTML
8. Save as: `docs/superpowers/verification/issue-2/malicious-html-escaped.png`

## Screenshot Tools

### Windows
- **Snipping Tool**: Win + Shift + S
- **Print Screen**: Alt + Print Screen (active window only)

### PowerShell Screenshot
```powershell
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("{PRTSC}")
```

## After Capturing Screenshots

1. Verify files exist:
   ```bash
   ls -la docs/superpowers/verification/issue-2/
   ```

2. Update verification document:
   - Change Status from BLOCKED to PASS
   - Remove the BLOCKER section

3. Commit:
   ```bash
   git add docs/superpowers/verification/issue-2/*.png
   git add docs/superpowers/verification/2026-06-14-issue-2.md
   git commit -m "docs: add issue-2 visual evidence screenshots"
   ```

4. Run audit (from main repo):
   ```bash
   node scripts/audit-completed-issues.js 2
   ```
