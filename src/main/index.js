// src/main/index.js - Electron 主进程入口
const { installSafeConsole } = require('./logger');
installSafeConsole();

const { app, ipcMain } = require('electron');
const textCapture = require('./text-capture');
const floatingWindow = require('./floating-window');
const settingsWindow = require('./settings-window');
const standaloneChatWindow = require('./standalone-chat-window');
const tray = require('./tray');
const {
  createStandaloneConversation,
  deleteStandaloneConversation,
  getSettings,
  getStandaloneChatState,
  saveSettings,
  saveStandaloneConversation,
  selectStandaloneConversation
} = require('./store');
const { lookupWord } = require('./dictionary');
const { classifyText, isChinese, translateSentence, aiChat } = require('./ai-client');

// 简单的 Markdown 到 HTML 转换（不需要外部依赖）
function simpleMarkdownToHtml(text) {
  if (!text) return '';

  let html = text
    // 转义 HTML 特殊字符
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 代码块
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 粗体
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // 斜体
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // 段落（双换行）
    .replace(/\n\n/g, '</p><p>')
    // 单换行转为 <br>
    .replace(/\n/g, '<br>');

  return `<p>${html}</p>`;
}

// 单实例锁
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  settingsWindow.openSettings();
});

// 阻止 Dock 出现（macOS），Windows 无效但无害
app.dock?.hide();

app.whenReady().then(() => {
  // 初始化托盘（必须在 ready 之后）
  tray.init();

  // 初始化文本捕获
  textCapture.init((text, x, y, activeWindowHandle) => {
    floatingWindow.showWindow(text, x, y, activeWindowHandle);
  });
  textCapture.setShouldIgnoreWindow((windowHandle) => {
    if (!windowHandle) return false;
    return [
      floatingWindow.getWindowHandle(),
      settingsWindow.getWindowHandle(),
      standaloneChatWindow.getWindowHandle()
    ].some(handle => handle && handle === windowHandle);
  });

  // 全局鼠标按下事件，用于点击外部隐藏悬浮窗
  // 不做坐标判断（uiohook 和 Electron 的坐标系在高 DPI 下不一致）
  // 而是用 requestHide 的保护期机制：显示后 300ms 内的点击会被忽略
  textCapture.setOnMouseDown(() => {
    if (floatingWindow.isVisible()) {
      floatingWindow.requestHide();
    }
  });

  // 预加载悬浮窗，保持事件循环活跃并加快首次显示速度
  floatingWindow.getOrCreateWindow();

  console.log('[Main] Application ready');
});

// 关闭所有窗口时不退出（托盘常驻）
app.on('window-all-closed', (e) => {
  // 不调用 app.quit()
});

app.on('before-quit', () => {
  textCapture.destroy();
  tray.destroy();
  standaloneChatWindow.destroy();
});

// ─── IPC 处理器 ───────────────────────────────────────────

// 设置读写
ipcMain.handle('get-settings', () => getSettings());

ipcMain.handle('save-settings', (event, settings) => {
  const updated = saveSettings(settings);
  // 通知悬浮窗设置已更新
  const wc = floatingWindow.getWebContents();
  if (wc) wc.send('settings-updated', updated);
  const chatWc = standaloneChatWindow.getWebContents();
  if (chatWc) chatWc.send('settings-updated', updated);
  return updated;
});

// 翻译单词
ipcMain.handle('translate-word', async (event, word) => {
  console.log('[IPC] translate-word called for:', word);
  const result = await lookupWord(word);
  console.log('[IPC] translate-word result:', result ? 'found' : 'null');
  return result;
});

// 文本分类
ipcMain.handle('classify-text', (event, text) => {
  const settings = getSettings();
  return {
    type: classifyText(text, settings.phraseThreshold),
    isChinese: isChinese(text)
  };
});

// 句子翻译（流式）
ipcMain.on('translate-sentence', (event, text) => {
  const settings = getSettings();
  const isGateway = settings.connectionMode === 'gateway';
  if (!settings.apiBaseUrl || !settings.translateModel || (!isGateway && !settings.apiKey)) {
    event.sender.send('translate-stream-error', { message: '请先在设置中配置 API 信息', action: 'settings' });
    return;
  }
  translateSentence(
    text,
    (chunk) => event.sender.send('translate-stream-chunk', chunk),
    () => event.sender.send('translate-stream-done'),
    (err) => {
      try {
        const parsed = JSON.parse(err.message);
        event.sender.send('translate-stream-error', parsed);
      } catch {
        event.sender.send('translate-stream-error', { message: err.message, action: 'settings' });
      }
    }
  );
});

// AI 对话（流式）
ipcMain.on('ai-chat-send', (event, { selectedText, messages }) => {
  const settings = getSettings();
  const isGateway = settings.connectionMode === 'gateway';
  if (!settings.apiBaseUrl || !settings.chatModel || (!isGateway && !settings.apiKey)) {
    event.sender.send('ai-chat-stream-error', { message: '请先在设置中配置 API 信息', action: 'settings' });
    return;
  }
  aiChat(
    selectedText,
    messages,
    (chunk) => event.sender.send('ai-chat-stream-chunk', chunk),
    () => event.sender.send('ai-chat-stream-done'),
    (err) => {
      try {
        const parsed = JSON.parse(err.message);
        event.sender.send('ai-chat-stream-error', parsed);
      } catch {
        event.sender.send('ai-chat-stream-error', { message: err.message, action: 'settings' });
      }
    }
  );
});

ipcMain.handle('standalone-chat-state', () => getStandaloneChatState());

ipcMain.handle('standalone-chat-new-conversation', (event, initialMessage = '') => {
  return createStandaloneConversation(initialMessage);
});

ipcMain.handle('standalone-chat-save-conversation', (event, conversation) => {
  return saveStandaloneConversation(conversation);
});

ipcMain.handle('standalone-chat-select-conversation', (event, conversationId) => {
  return selectStandaloneConversation(conversationId);
});

ipcMain.handle('standalone-chat-delete-conversation', (event, conversationId) => {
  return deleteStandaloneConversation(conversationId);
});

ipcMain.on('standalone-chat-send', (event, { conversationId, messages }) => {
  const settings = getSettings();
  const isGateway = settings.connectionMode === 'gateway';
  if (!settings.apiBaseUrl || !settings.chatModel || (!isGateway && !settings.apiKey)) {
    event.sender.send('standalone-chat-stream-error', {
      conversationId,
      error: { message: '请先在设置中配置 AI 对话所需的 API 信息。', action: 'settings' }
    });
    return;
  }

  aiChat(
    '',
    messages,
    (chunk) => event.sender.send('standalone-chat-stream-chunk', { conversationId, chunk }),
    () => event.sender.send('standalone-chat-stream-done', { conversationId }),
    (err) => {
      try {
        const parsed = JSON.parse(err.message);
        event.sender.send('standalone-chat-stream-error', { conversationId, error: parsed });
      } catch {
        event.sender.send('standalone-chat-stream-error', {
          conversationId,
          error: { message: err.message, action: 'settings' }
        });
      }
    }
  );
});

// 调整悬浮窗大小
ipcMain.on('resize-window', (event, { width, height }) => {
  floatingWindow.resizeWindow(width, height);
});

// 收起悬浮窗到工具栏大小
ipcMain.on('collapse-window', () => {
  floatingWindow.collapseWindow();
});

// 固定/取消固定扩展悬浮窗
ipcMain.handle('set-pinned', (event, pinned) => {
  return floatingWindow.setPinned(pinned);
});

// 移动悬浮窗
ipcMain.on('move-window', (event, { deltaX, deltaY }) => {
  floatingWindow.moveWindow(deltaX, deltaY);
});

// 打开设置
ipcMain.on('open-settings', () => {
  settingsWindow.openSettings();
});

ipcMain.on('open-standalone-chat', () => {
  standaloneChatWindow.openChatWindow();
});

// 用户与悬浮窗交互（点击按钮等），重置保护期
ipcMain.on('notify-interaction', () => {
  floatingWindow.extendGrace();
});

// Markdown 解析（同步，供 preload 调用）
ipcMain.on('parse-markdown', (event, text) => {
  event.returnValue = simpleMarkdownToHtml(text);
});

// 测试 API 连通性
ipcMain.handle('test-connection', async (event, settings, purpose) => {
  const { testConnection } = require('./ai-client');
  return await testConnection(settings, purpose);
});
