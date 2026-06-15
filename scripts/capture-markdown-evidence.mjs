/**
 * Reproducible Markdown Screenshot Capture Script (ESM)
 *
 * Captures screenshots of markdown rendering for documentation verification.
 * Run with: npx electron scripts/capture-markdown-evidence.mjs
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

app.commandLine.appendSwitch('disable-gpu');

// CSS styles from floating/style.css for markdown-body
const markdownStyles = `
  .markdown-body { font-family: 'Inter', sans-serif; font-size: 13px; line-height: 1.5; color: #e8e8f0; }
  .markdown-body h1 { margin: 12px 0 8px; font-weight: 600; color: #fff; font-size: 1.3em; }
  .markdown-body h2 { margin: 12px 0 8px; font-weight: 600; color: #fff; font-size: 1.2em; }
  .markdown-body h3 { margin: 12px 0 8px; font-weight: 600; color: #fff; font-size: 1.1em; }
  .markdown-body p { margin: 0 0 8px; }
  .markdown-body ul, .markdown-body ol { margin: 4px 0 8px; padding-left: 20px; }
  .markdown-body li { margin-bottom: 4px; }
  .markdown-body code { background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 4px; font-family: Consolas, Monaco, 'Courier New', monospace; font-size: 0.9em; }
  .markdown-body pre { background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; margin: 6px 0 8px; border: 1px solid rgba(255,255,255,0.08); overflow-x: auto; }
  .markdown-body pre code { background: transparent; padding: 0; border-radius: 0; }
  .markdown-body blockquote { margin: 6px 0 8px; padding-left: 10px; border-left: 3px solid #6c63ff; color: rgba(232,232,240,0.55); }
  .markdown-body table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; margin: 8px 0; }
  .markdown-body th, .markdown-body td { border: 1px solid rgba(255,255,255,0.08); padding: 4px 6px; text-align: left; white-space: nowrap; }
  .markdown-body th { background: rgba(255,255,255,0.06); color: #fff; font-weight: 600; }
  .markdown-body hr { border: 0; border-top: 1px solid rgba(255,255,255,0.08); margin: 10px 0; }
  .markdown-body a { color: #6c63ff; text-decoration: none; }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body strong { font-weight: 600; color: #fff; }
  .markdown-body em { font-style: italic; opacity: 0.9; }
`;

const panelStyles = `
  body { background: rgba(22,22,35,0.97); margin: 0; padding: 16px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .panel { background: rgba(22,22,35,0.97); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; max-width: 420px; }
  .panel-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #6c63ff; font-family: 'Inter', sans-serif; }
`;

// Markdown content for normal rendering - demonstrates various markdown features
const normalMarkdown = [
  '# Heading',
  '',
  '- First item',
  '  - Nested item',
  '- Second item',
  '',
  'Paragraph with **bold**, *italic*, and `inline code`.',
  '',
  '> quoted text',
  '',
  '| Name | Value |',
  '| --- | --- |',
  '| Alpha | 1 |',
  '| Beta | 2 |',
  '',
  '~~~js',
  'console.log("ok");',
  '~~~',
  '',
  '---'
].join('\n');

// Malicious content that should be visible but inert
const maliciousHtml = [
  'Raw script:',
  '<script>alert("xss")</script>',
  '',
  'Image event handler:',
  '<img src=x onerror=alert("xss")>',
  '',
  'Unsafe link protocol:',
  '[unsafe link](javascript:alert(1))'
].join('\n');

function renderMarkdownToHtml(markdown) {
  const nodeExecutable = process.env.npm_node_execpath || process.env.NODE || 'node';
  const rendererScript = [
    "const fs = require('node:fs');",
    "const input = fs.readFileSync(0, 'utf8');",
    "const { renderMarkdownToHtml } = require('./src/main/markdown-renderer');",
    'process.stdout.write(renderMarkdownToHtml(input));'
  ].join('\n');

  return execFileSync(nodeExecutable, ['-e', rendererScript], {
    cwd: projectRoot,
    input: markdown,
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true
  });
}

/**
 * Creates a complete HTML document for rendering
 */
function createHtml(title, content) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${markdownStyles}${panelStyles}</style>
</head>
<body>
  <div class="panel">
    <div class="panel-title">${title}</div>
    <div class="markdown-body">${content}</div>
  </div>
</body>
</html>`;
}

/**
 * Captures a screenshot of the window content
 */
async function captureScreenshot(window, filename) {
  const image = await window.webContents.capturePage();
  const outputPath = path.join(__dirname, '..', 'docs', 'superpowers', 'verification', 'issue-2', filename);

  // Ensure directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Save as PNG
  fs.writeFileSync(outputPath, image.toPNG());

  const stats = fs.statSync(outputPath);
  const size = image.getSize();
  console.log(`Saved: ${outputPath}`);
  console.log(`  Size: ${stats.size} bytes, Dimensions: ${size.width}x${size.height}`);

  return outputPath;
}

/**
 * Waits for the loaded document to finish painting stable content.
 */
async function waitForRender(window) {
  await window.webContents.executeJavaScript(`
    new Promise(resolve => {
      const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      ready.then(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })
  `);
}

/**
 * Main capture routine
 */
async function run() {
  console.log('Starting markdown screenshot capture...\n');

  // Create offscreen BrowserWindow for capture
  // Using offscreen: true allows capture without showing the window
  const window = new BrowserWindow({
    width: 920,
    height: 680,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: true
    }
  });

  try {
    // Capture normal markdown rendering
    console.log('Capturing normal markdown rendering...');
    const normalHtml = createHtml('Markdown Rendering', renderMarkdownToHtml(normalMarkdown));
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(normalHtml)}`);
    await waitForRender(window);
    await captureScreenshot(window, 'markdown-panel.png');

    console.log('');

    // Capture malicious HTML (should be escaped)
    console.log('Capturing malicious HTML (XSS protection)...');
    const escapedHtml = createHtml('Escaped HTML (XSS Protection)', renderMarkdownToHtml(maliciousHtml));
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(escapedHtml)}`);
    await waitForRender(window);
    await captureScreenshot(window, 'malicious-html-escaped.png');

    console.log('\nScreenshot capture complete!');
  } catch (error) {
    console.error('Error during capture:', error);
    throw error;
  } finally {
    if (!window.isDestroyed()) {
      window.close();
    }
  }
}

// Run when Electron is ready
app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    await run();
  } catch (error) {
    exitCode = 1;
    console.error('Screenshot capture failed:', error);
  } finally {
    app.exit(exitCode);
  }
});

// Handle errors
app.on('window-all-closed', () => {
  app.quit();
});
