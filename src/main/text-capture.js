// src/main/text-capture.js - 全局文本捕获
const { clipboard, screen } = require('electron');
const { uIOhook, UiohookKey } = require('@mukea/uiohook-napi');
const windowFocus = require('./window-focus');

let isEnabled = true;
let onTextCaptured = null; // 回调: (text, x, y) => void
let onMouseDownCallback = null;
let floatingWindowIds = new Set(); // 自身窗口 ID 集合

// 鼠标按下位置
let mouseDownX = 0;
let mouseDownY = 0;

// 用于检测双击/三击
let lastMouseUpTime = 0;
let clickCount = 0;

const DRAG_THRESHOLD = 5; // px，拖拽检测阈值

/**
 * 设置鼠标按下回调，用于检测点击外部
 */
function setOnMouseDown(cb) {
  onMouseDownCallback = cb;
}

/**
 * 初始化文本捕获
 * @param {Function} callback - (text, x, y) => void
 */
function init(callback) {
  onTextCaptured = callback;

  uIOhook.on('mousedown', (e) => {
    mouseDownX = e.x;
    mouseDownY = e.y;
    if (onMouseDownCallback) {
      onMouseDownCallback(e.x, e.y);
    }
  });

  uIOhook.on('mouseup', async (e) => {
    if (!isEnabled) return;

    // 更新点击计数
    const now = Date.now();
    if (now - lastMouseUpTime < 500) {
      clickCount++;
    } else {
      clickCount = 1;
    }
    lastMouseUpTime = now;

    // 检测是否有拖拽（选择文本）
    const dx = Math.abs(e.x - mouseDownX);
    const dy = Math.abs(e.y - mouseDownY);
    
    const isDrag = dx >= DRAG_THRESHOLD || dy >= DRAG_THRESHOLD;
    const isMultiClick = clickCount >= 2; // 双击或三击

    if (!isDrag && !isMultiClick) return;

    const activeWindowHandlePromise = windowFocus.getForegroundWindow();

    // 延迟让选择状态稳定 (特别是 VSCode 等 Electron 应用，双击选中文字有一定延迟)
    await sleep(isMultiClick ? 150 : 80);

    // 备份剪贴板
    const prevClipboard = clipboard.readText();
    console.log('[TextCapture] Backup clipboard:', prevClipboard ? `"${prevClipboard.substring(0, 50)}"` : '(empty)');

    // 清空剪贴板，以便能检测到重复划词的情况
    clipboard.writeText('');

    // 模拟 Ctrl+C
    uIOhook.keyToggle(UiohookKey.Ctrl, 'down');
    uIOhook.keyTap(UiohookKey.C);
    uIOhook.keyToggle(UiohookKey.Ctrl, 'up');

    // 快速轮询等待剪贴板更新（等待其不再为空）
    const selectedText = (await waitForClipboardChange('', 150)).trim();
    console.log('[TextCapture] Selected text:', selectedText ? `"${selectedText}"` : '(empty)');

    // 还原剪贴板（始终还原，让用户感知不到剪贴板被使用）
    clipboard.writeText(prevClipboard);

    // 验证还原是否成功
    const afterRestore = clipboard.readText();
    console.log('[TextCapture] After restore check:', afterRestore === prevClipboard ? 'SUCCESS' : 'FAILED');
    console.log('[TextCapture] Current clipboard content:', afterRestore ? `"${afterRestore.substring(0, 50)}"` : '(empty)');

    if (!selectedText) {
      return;
    }

    // 调用回调
    if (onTextCaptured) {
      console.log(`[TextCapture] Captured text: "${selectedText}"`);
      const activeWindowHandle = await activeWindowHandlePromise;
      onTextCaptured(selectedText, e.x, e.y, activeWindowHandle);
    }
  });

  uIOhook.start();
  console.log('[TextCapture] Started global hook');
}

function pause() {
  isEnabled = false;
  console.log('[TextCapture] Paused');
}

function resume() {
  isEnabled = true;
  console.log('[TextCapture] Resumed');
}

function isPaused() {
  return !isEnabled;
}

function destroy() {
  uIOhook.stop();
  console.log('[TextCapture] Stopped');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForClipboardChange(prevText, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const newText = clipboard.readText();
    if (newText !== prevText) {
      return newText;
    }
    await sleep(10);
  }
  return clipboard.readText();
}

module.exports = { init, pause, resume, isPaused, destroy, setOnMouseDown };
