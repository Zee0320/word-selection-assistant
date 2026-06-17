/**
 * Capture Context Card Evidence Script
 *
 * This script launches an Electron BrowserWindow, loads the floating renderer,
 * and captures screenshots of the context card in various states.
 *
 * States captured:
 * - collapsed-context-card.png: Chat panel open with selected text, context collapsed
 * - expanded-context-card.png: Context textarea expanded
 * - locked-context-card.png: After sending a message (context frozen/locked)
 * - empty-context-card.png: No selected text context
 * - after-clear-context-card.png: After clearing context with the X button
 */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// Output directory for screenshots
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'superpowers', 'verification', 'issue-5');

// Path to floating renderer
const FLOATING_HTML = path.join(__dirname, '..', 'src', 'renderer', 'floating', 'index.html');
const MOCK_PRELOAD = path.join(__dirname, 'capture-mock-preload.js');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

let win;

/**
 * Capture screenshot and save to file
 */
async function captureScreenshot(name) {
  const imagePath = path.join(OUTPUT_DIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(imagePath, image.toPNG());
  console.log(`Captured: ${name}`);
}

/**
 * Wait for a condition to be true
 */
function waitFor(condition, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error('Timeout waiting for condition'));
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

/**
 * Execute JavaScript in the renderer and wait for result
 */
async function exec(code) {
  return win.webContents.executeJavaScript(code);
}

/**
 * Main capture routine
 */
async function captureAllStates() {
  // Create BrowserWindow
  win = new BrowserWindow({
    width: 420,
    height: 620,
    show: true,
    webPreferences: {
      preload: MOCK_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load floating renderer HTML
  await win.loadFile(FLOATING_HTML);

  // Wait for page to be ready
  await new Promise(resolve => setTimeout(resolve, 500));

  // Get default settings from mock
  const defaultSettings = await exec('window.__mockTrigger.getSettings()');

  // Helper to trigger show-toolbar event
  async function triggerShowToolbar(text, options = {}) {
    await exec(`
      (function() {
        window.__mockTrigger.showToolbar({
          text: ${JSON.stringify(text)},
          settings: window.__mockTrigger.getSettings(),
          pinned: ${options.pinned || false},
          expanded: ${options.expanded || false},
          pending: ${options.pending || false}
        });
      })();
    `);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Helper to click element
  async function clickElement(selector) {
    await exec(`
      (function() {
        const el = document.querySelector('${selector}');
        if (el) el.click();
      })();
    `);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Helper to set input value
  async function setInputValue(selector, value) {
    await exec(`
      (function() {
        const el = document.querySelector('${selector}');
        if (el) {
          el.value = ${JSON.stringify(value)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })();
    `);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // ========== CAPTURE 1: Collapsed Context Card ==========
  console.log('\\nCapturing state 1: Collapsed context card...');

  // Trigger toolbar with selected text
  await triggerShowToolbar('This is the selected text that will appear in the context card area.');

  // Open chat panel
  await clickElement('#btn-chat');
  await new Promise(resolve => setTimeout(resolve, 200));

  // Context should be collapsed by default
  await captureScreenshot('collapsed-context-card.png');

  // ========== CAPTURE 2: Expanded Context Card ==========
  console.log('\\nCapturing state 2: Expanded context card...');

  // Click toggle button to expand
  await clickElement('#chat-context-toggle');
  await new Promise(resolve => setTimeout(resolve, 200));

  await captureScreenshot('expanded-context-card.png');

  // ========== CAPTURE 3: Locked Context Card ==========
  console.log('\\nCapturing state 3: Locked context card...');

  // Collapse back first
  await clickElement('#chat-context-toggle');
  await new Promise(resolve => setTimeout(resolve, 100));

  // Type a message and send it
  await setInputValue('#chat-input', 'Hello AI, can you help me?');
  await clickElement('#chat-send-btn');

  // Wait for the message to be sent and context to be locked
  await new Promise(resolve => setTimeout(resolve, 500));

  await captureScreenshot('locked-context-card.png');

  // ========== CAPTURE 4: Empty Context Card ==========
  console.log('\\nCapturing state 4: Empty context card...');

  // Reset and trigger with empty text
  await exec(`
    (function() {
      // Reset chat state
      window.chatMessages = [];
      document.getElementById('chat-messages').innerHTML = '';
      window.chatContext = '';
      window.activeChatContext = '';
      window.isChatContextFrozen = false;
      window.isChatContextExpanded = false;

      // Trigger with empty text
      window.__mockTrigger.showToolbar({
        text: '',
        settings: window.__mockTrigger.getSettings(),
        pinned: false,
        expanded: false,
        pending: false
      });
    })();
  `);

  // Open chat panel again
  await clickElement('#btn-chat');
  await new Promise(resolve => setTimeout(resolve, 200));

  await captureScreenshot('empty-context-card.png');

  // ========== CAPTURE 5: After Clear Context Card ==========
  console.log('\\nCapturing state 5: After clear context card...');

  // Trigger with text again
  await exec(`
    (function() {
      // Trigger with text
      window.__mockTrigger.showToolbar({
        text: 'Some selected text to clear.',
        settings: window.__mockTrigger.getSettings(),
        pinned: false,
        expanded: false,
        pending: false
      });
    })();
  `);

  // Open chat panel
  await clickElement('#btn-chat');
  await new Promise(resolve => setTimeout(resolve, 200));

  // Click clear button
  await clickElement('#chat-context-clear');
  await new Promise(resolve => setTimeout(resolve, 200));

  await captureScreenshot('after-clear-context-card.png');

  console.log('\\n=== All screenshots captured successfully! ===');
  console.log(`Output directory: ${OUTPUT_DIR}`);
}

// Run the app
app.whenReady().then(async () => {
  try {
    await captureAllStates();
  } catch (err) {
    console.error('Error capturing screenshots:', err);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});

// Handle app errors
app.on('window-all-closed', () => {
  app.quit();
});
