/**
 * Linux Selected Text Reader
 *
 * Reads selected text on Linux using X11 tools:
 * 1. Try PRIMARY selection via xclip (text selected in X11 apps is automatically available)
 * 2. Fall back to clipboard: use xdotool to simulate Ctrl+C, then read clipboard
 * 3. Restore previous clipboard content after fallback
 */

const { exec: execCallback } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(execCallback);

/**
 * Build a command runner function for dependency injection
 * @param {Function} execFn - Exec function to use (for testing)
 * @returns {Function} Command runner
 */
function buildCommandRunner(execFn = execAsync) {
  return async (command) => {
    try {
      const { stdout } = await execFn(command, {
        maxBuffer: 1024 * 1024 // 1MB buffer for large selections
      });
      return stdout;
    } catch (error) {
      throw new Error(`Command failed: ${error.message}`);
    }
  };
}

/**
 * Read selected text via X11 PRIMARY selection or clipboard fallback
 * @param {Function} runCommand - Command runner function
 * @returns {Promise<string>} Selected text (empty string if nothing selected or error)
 */
async function readSelectedTextViaX11(runCommand) {
  try {
    // Try PRIMARY selection first (X11 automatically populates this on text selection)
    const primaryText = await readPrimarySelection(runCommand);
    const trimmed = primaryText?.trim();

    if (trimmed) {
      return trimmed;
    }

    // Fall back to clipboard via Ctrl+C simulation
    return await readViaClipboardFallback(runCommand);
  } catch (error) {
    // Return empty string on any error to avoid breaking the app
    console.error('Failed to read selected text:', error.message);
    return '';
  }
}

/**
 * Read text from X11 PRIMARY selection using xclip
 * @param {Function} runCommand - Command runner
 * @returns {Promise<string>} Selection text or empty string
 */
async function readPrimarySelection(runCommand) {
  try {
    // xclip -o outputs the current PRIMARY selection
    // -selection primary targets the PRIMARY selection buffer
    return await runCommand('xclip -o -selection primary');
  } catch (error) {
    // xclip not installed or no selection
    return '';
  }
}

/**
 * Read selected text by simulating Ctrl+C and reading clipboard
 * Restores previous clipboard content afterward
 * @param {Function} runCommand - Command runner
 * @returns {Promise<string>} Selected text or empty string
 */
async function readViaClipboardFallback(runCommand) {
  let previousClipboard = '';

  try {
    // Save current clipboard content
    previousClipboard = await readClipboard(runCommand);
  } catch {
    // Clipboard might be empty or xclip not available
  }

  try {
    // Simulate Ctrl+C to copy selection to clipboard
    await runCommand('xdotool key --clearmodifiers ctrl+c');

    // Small delay for clipboard to update
    await new Promise(resolve => setTimeout(resolve, 50));

    // Read the new clipboard content
    const newClipboard = await readClipboard(runCommand);
    const trimmed = newClipboard?.trim();

    return trimmed || '';
  } catch (error) {
    return '';
  } finally {
    // Always try to restore previous clipboard content
    if (previousClipboard) {
      try {
        await restoreClipboard(runCommand, previousClipboard);
      } catch {
        // Ignore restoration errors
      }
    }
  }
}

/**
 * Read current clipboard content
 * @param {Function} runCommand - Command runner
 * @returns {Promise<string>} Clipboard content
 */
async function readClipboard(runCommand) {
  return await runCommand('xclip -o -selection clipboard');
}

/**
 * Restore clipboard content
 * @param {Function} runCommand - Command runner
 * @param {string} content - Content to restore
 */
async function restoreClipboard(runCommand, content) {
  // Use xclip with stdin to set clipboard content
  // We need to use shell command with echo to pipe content
  const escapedContent = content
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''");

  await runCommand(`echo -n '${escapedContent}' | xclip -selection clipboard`);
}

module.exports = {
  readSelectedTextViaX11,
  buildCommandRunner
};
