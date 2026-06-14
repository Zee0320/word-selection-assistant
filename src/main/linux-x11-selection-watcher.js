// src/main/linux-x11-selection-watcher.js - X11 mouse selection watcher for Linux/UOS
const { spawn } = require('child_process');

const DRAG_THRESHOLD = 5;
const MULTI_CLICK_DISTANCE = 8;
const MULTI_CLICK_TIME_MS = 500;
const SELECTION_SETTLE_MS = 160;

/**
 * Parse coordinates from xinput output line
 * @param {string} line - xinput output line
 * @returns {{ x: number, y: number } | null}
 */
function parseXinputCoordinates(line) {
  // Match patterns like "at (100, 200)" or "at(100, 200)"
  const match = line.match(/at\s*\((\d+),\s*(\d+)\)/);
  if (!match) return null;
  return {
    x: parseInt(match[1], 10),
    y: parseInt(match[2], 10)
  };
}

/**
 * Parse event type from xinput output line
 * @param {string} line - xinput output line
 * @returns {string | null}
 */
function parseXinputEvent(line) {
  const match = line.match(/event\s+\d+:\s+(\w+)/);
  return match ? match[1] : null;
}

/**
 * Parse button number from xinput output line
 * @param {string} line - xinput output line
 * @returns {number | null}
 */
function parseXinputButton(line) {
  // Match patterns like "ButtonPress (1)" or "ButtonRelease (2)"
  const match = line.match(/Button(?:Press|Release)\s+\((\d+)\)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Check if mouse up is a repeated click (for double/triple click detection)
 * @param {number} x - Current mouse X position
 * @param {number} y - Current mouse Y position
 * @param {number | null} prevX - Previous mouse X position
 * @param {number | null} prevY - Previous mouse Y position
 * @param {number} now - Current timestamp
 * @param {number} prevTime - Previous click timestamp
 * @returns {boolean}
 */
function isRepeatedClick(x, y, prevX, prevY, now, prevTime) {
  if (prevX === null || prevY === null) return false;
  if (now - prevTime >= MULTI_CLICK_TIME_MS) return false;

  return (
    Math.abs(x - prevX) <= MULTI_CLICK_DISTANCE &&
    Math.abs(y - prevY) <= MULTI_CLICK_DISTANCE
  );
}

/**
 * Create a Linux X11 selection watcher using xinput
 * @param {object} options
 * @param {function} options.spawnXinput - Function to spawn xinput process (for testing)
 * @param {function} options.readSelectedText - Async function to read selected text
 * @param {function} options.onTextCaptured - Callback when text is captured (text, x, y)
 * @param {object} [options.logger] - Logger instance
 * @returns {object} Watcher instance with start, stop, pause, resume, isPaused methods
 */
function createLinuxX11SelectionWatcher({
  spawnXinput = defaultSpawnXinput,
  readSelectedText,
  onTextCaptured,
  logger = console
}) {
  let isEnabled = true;
  let xinputProcess = null;
  let mouseDownX = 0;
  let mouseDownY = 0;
  let lastMouseUpTime = 0;
  let lastMouseUpX = null;
  let lastMouseUpY = null;
  let clickCount = 0;

  function start() {
    if (xinputProcess) return;

    try {
      xinputProcess = spawnXinput();
      logger.log('[LinuxX11Watcher] Started xinput process');

      xinputProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          processXinputLine(line.trim());
        }
      });

      xinputProcess.stderr.on('data', (data) => {
        logger.warn('[LinuxX11Watcher] xinput stderr:', data.toString());
      });

      xinputProcess.on('close', (code, signal) => {
        logger.log('[LinuxX11Watcher] xinput process closed:', code, signal);
        xinputProcess = null;
      });

      xinputProcess.on('error', (err) => {
        logger.error('[LinuxX11Watcher] xinput process error:', err.message);
        xinputProcess = null;
      });
    } catch (err) {
      logger.error('[LinuxX11Watcher] Failed to start xinput:', err.message);
      xinputProcess = null;
    }
  }

  function stop() {
    if (xinputProcess) {
      xinputProcess.kill('SIGTERM');
      xinputProcess = null;
      logger.log('[LinuxX11Watcher] Stopped');
    }
  }

  function pause() {
    isEnabled = false;
    logger.log('[LinuxX11Watcher] Paused');
  }

  function resume() {
    isEnabled = true;
    logger.log('[LinuxX11Watcher] Resumed');
  }

  function isPaused() {
    return !isEnabled;
  }

  async function processXinputLine(line) {
    if (!line) return;

    const eventType = parseXinputEvent(line);

    if (eventType === 'ButtonPress') {
      const button = parseXinputButton(line);
      // Only handle button 1 (left click)
      if (button !== 1) return;

      const coords = parseXinputCoordinates(line);
      if (coords) {
        mouseDownX = coords.x;
        mouseDownY = coords.y;
      }
    } else if (eventType === 'ButtonRelease') {
      if (!isEnabled) return;
      if (!xinputProcess) return; // Process was killed

      const button = parseXinputButton(line);
      // Only handle button 1 (left click)
      if (button !== 1) return;

      const coords = parseXinputCoordinates(line);
      if (!coords) return;

      const { x, y } = coords;
      const now = Date.now();

      // Check for repeated click (double/triple click)
      if (isRepeatedClick(x, y, lastMouseUpX, lastMouseUpY, now, lastMouseUpTime)) {
        clickCount++;
      } else {
        clickCount = 1;
      }
      lastMouseUpTime = now;
      lastMouseUpX = x;
      lastMouseUpY = y;

      // Calculate drag distance
      const dx = Math.abs(x - mouseDownX);
      const dy = Math.abs(y - mouseDownY);
      const isDrag = dx >= DRAG_THRESHOLD || dy >= DRAG_THRESHOLD;
      const isMultiClick = clickCount >= 2;

      // Only capture on drag or multi-click
      if (!isDrag && !isMultiClick) return;

      // Wait for selection to settle (especially important for double-click)
      await sleep(SELECTION_SETTLE_MS);

      // Check again if still enabled and process still alive
      if (!isEnabled || !xinputProcess) return;

      try {
        const text = await readSelectedText();

        // Only capture non-empty text (after trimming whitespace)
        if (!text || !text.trim()) return;

        if (onTextCaptured) {
          logger.log(`[LinuxX11Watcher] Captured text: "${text}"`);
          onTextCaptured(text, x, y);
        }
      } catch (err) {
        logger.warn('[LinuxX11Watcher] Failed to read selected text:', err.message);
      }
    }
    // Ignore Motion events and other event types
  }

  return {
    start,
    stop,
    pause,
    resume,
    isPaused
  };
}

/**
 * Default xinput spawn function
 * @returns {ChildProcess}
 */
function defaultSpawnXinput() {
  return spawn('xinput', ['test-xi2', '--root'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  createLinuxX11SelectionWatcher,
  parseXinputCoordinates,
  parseXinputEvent,
  parseXinputButton,
  isRepeatedClick
};
