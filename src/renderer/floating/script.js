// src/renderer/floating/script.js - 悬浮窗逻辑

let currentText = '';
let currentSettings = {};
let chatMessages = [];
let isStreaming = false;
let isPinned = false;

// DOM 引用
const btnTranslate = document.getElementById('btn-translate');
const btnChat = document.getElementById('btn-chat');
const btnPin = document.getElementById('btn-pin');
const pinDivider = document.getElementById('pin-divider');
const panelTranslation = document.getElementById('panel-translation');
const panelChat = document.getElementById('panel-chat');

const wordResult = document.getElementById('word-result');
const wordText = document.getElementById('word-text');
const wordPhonetic = document.getElementById('word-phonetic');
const wordChinese = document.getElementById('word-chinese');
const wordMeanings = document.getElementById('word-meanings');

const sentenceResult = document.getElementById('sentence-result');
const sentenceOutput = document.getElementById('sentence-output');
const sentenceLoading = document.getElementById('sentence-loading');
const translationError = document.getElementById('translation-error');

const chatContextText = document.getElementById('chat-context-text');
const chatMessages$ = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

// ── 拖动功能 ──────────────────────────────────────────────

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

const toolbar = document.getElementById('toolbar');

toolbar.addEventListener('mousedown', (e) => {
  if (e.target.closest('.toolbar-btn')) return;
  isDragging = true;
  dragStartX = e.screenX;
  dragStartY = e.screenY;
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const deltaX = e.screenX - dragStartX;
  const deltaY = e.screenY - dragStartY;
  dragStartX = e.screenX;
  dragStartY = e.screenY;
  if (deltaX !== 0 || deltaY !== 0) {
    window.api.moveWindow(deltaX, deltaY);
  }
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});

// ── 初始化 ────────────────────────────────────────────

// 全局 mousedown 拦截：通知主进程延长保护期
document.addEventListener('mousedown', () => {
  window.api.notifyInteraction();
}, true);

window.api.onShowToolbar(({ text, settings, pinned = false, expanded = false }) => {
  const activePanel = getActivePanel();
  const shouldPreservePanel = pinned && expanded && activePanel;

  currentText = text;
  currentSettings = settings;
  isPinned = Boolean(pinned);

  cleanupStreamListeners();
  applyFeatureVisibility(settings);

  if (shouldPreservePanel === 'translation') {
    showTranslationPanel();
    resetTranslationUI();
    updatePinControls();
    doTranslate();
    return;
  }

  if (shouldPreservePanel === 'chat') {
    showChatPanel();
    resetChatState();
    updatePinControls();
    return;
  }

  resetPanels();
  resetChatState();
  updatePinControls();
});

window.api.onResetUI(() => {
  resetPanels();
  resetChatState();
});

window.api.onSettingsUpdated((settings) => {
  currentSettings = settings;
});

// ── 翻译功能 ──────────────────────────────────────────

btnTranslate.addEventListener('click', async (e) => {
  window.api.notifyInteraction();
  e.stopPropagation();

  if (panelTranslation.classList.contains('active-panel')) {
    collapseAll();
    return;
  }
  collapseAll();
  showTranslationPanel();
  updatePinControls();
  await doTranslate();
});

async function doTranslate() {
  resetTranslationUI();

  try {
    const { type, isChinese } = await window.api.classifyText(currentText);

    if (type === 'word' && !isChinese) {
      const result = await window.api.translateWord(currentText);
      if (result) {
        renderWordResult(result);
      } else {
        // 词典找不到 → fallback 到 AI 翻译
        doSentenceTranslate();
      }
    } else {
      doSentenceTranslate();
    }
  } catch (err) {
    console.error('[Renderer] doTranslate error:', err);
    showTranslationError('翻译出错，请重试');
  }
}

function doSentenceTranslate() {
  sentenceResult.classList.remove('hidden');
  sentenceLoading.classList.remove('hidden');
  sentenceOutput.innerHTML = '';
  sentenceOutput.setAttribute('data-raw', '');
  sentenceOutput.className = 'markdown-body';

  if (!currentSettings.apiBaseUrl || !currentSettings.apiKey || !currentSettings.translateModel) {
    sentenceLoading.classList.add('hidden');
    showTranslationError('请先在设置中配置 API 信息');
    addSettingsLink();
    return;
  }

  window.api.translateSentence(currentText);
}

window.api.onTranslateChunk((chunk) => {
  sentenceLoading.classList.add('hidden');
  const rawText = sentenceOutput.getAttribute('data-raw') || '';
  const newText = rawText + chunk;
  sentenceOutput.setAttribute('data-raw', newText);
  sentenceOutput.innerHTML = window.api.parseMarkdown(newText);
  resizePanelForContent();
});

window.api.onTranslateDone(() => {
  sentenceLoading.classList.add('hidden');
});

window.api.onTranslateError((err) => {
  sentenceLoading.classList.add('hidden');
  if (err === 'API_NOT_CONFIGURED') {
    showTranslationError('请先在设置中配置 API 信息');
    addSettingsLink();
  } else {
    showTranslationError('翻译失败：' + err);
  }
});

function renderWordResult(result) {
  wordResult.classList.remove('hidden');

  wordText.textContent = result.word;
  wordPhonetic.textContent = result.phonetic ? `/${result.phonetic}/` : '';

  wordChinese.innerHTML = '';
  (result.chineseDefinitions || []).forEach(def => {
    const tag = document.createElement('span');
    tag.className = 'cn-tag';
    tag.textContent = def.replace(/^[a-z]+\.?\s*/i, '');
    wordChinese.appendChild(tag);
  });

  wordMeanings.innerHTML = '';
  (result.meanings || []).forEach(m => {
    const block = document.createElement('div');
    block.className = 'meaning-block';

    const posTag = document.createElement('span');
    posTag.className = 'pos-tag';
    posTag.textContent = m.partOfSpeech;
    block.appendChild(posTag);

    (m.definitions || []).forEach(d => {
      const defEl = document.createElement('div');
      defEl.className = 'def-item';
      defEl.textContent = d.definition;
      block.appendChild(defEl);

      if (d.example) {
        const exEl = document.createElement('div');
        exEl.className = 'def-example';
        exEl.textContent = `"${d.example}"`;
        block.appendChild(exEl);
      }
    });

    wordMeanings.appendChild(block);
  });

  resizePanelForContent();
}

// ── AI 对话功能 ───────────────────────────────────────

btnChat.addEventListener('click', () => {
  window.api.notifyInteraction();
  if (panelChat.classList.contains('active-panel')) {
    collapseAll();
    return;
  }
  collapseAll();
  showChatPanel();
  updatePinControls();

  setTimeout(() => chatInput.focus(), 50);
});

btnPin.addEventListener('click', async (e) => {
  window.api.notifyInteraction();
  e.stopPropagation();

  const nextPinned = !isPinned;
  isPinned = await window.api.setPinned(nextPinned);
  updatePinControls();
});

chatSendBtn.addEventListener('click', sendChatMessage);

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

function sendChatMessage() {
  const content = chatInput.value.trim();
  if (!content || isStreaming) return;

  if (!currentSettings.apiBaseUrl || !currentSettings.apiKey || !currentSettings.chatModel) {
    appendChatError('请先在设置中配置 API 信息');
    return;
  }

  chatInput.value = '';
  chatMessages.push({ role: 'user', content });
  appendChatMessage('user', content);

  const assistantEl = appendChatMessage('assistant', '');
  assistantEl.classList.add('streaming');

  isStreaming = true;
  chatSendBtn.disabled = true;

  window.api.aiChatSend(currentText, chatMessages);
}

window.api.onAiChatChunk((chunk) => {
  const lastMsg = chatMessages$?.lastElementChild;
  if (lastMsg?.classList.contains('streaming')) {
    const rawText = lastMsg.getAttribute('data-raw') || '';
    const newText = rawText + chunk;
    lastMsg.setAttribute('data-raw', newText);
    lastMsg.innerHTML = window.api.parseMarkdown(newText);
    chatMessages$.scrollTop = chatMessages$.scrollHeight;
  }
});

window.api.onAiChatDone(() => {
  isStreaming = false;
  chatSendBtn.disabled = false;

  const lastMsg = chatMessages$?.lastElementChild;
  if (lastMsg?.classList.contains('streaming')) {
    lastMsg.classList.remove('streaming');
    const rawText = lastMsg.getAttribute('data-raw') || lastMsg.textContent;
    chatMessages.push({ role: 'assistant', content: rawText });
  }
  chatInput.focus();
});

window.api.onAiChatError((err) => {
  isStreaming = false;
  chatSendBtn.disabled = false;

  const lastMsg = chatMessages$?.lastElementChild;
  if (lastMsg?.classList.contains('streaming')) {
    lastMsg.remove();
    chatMessages.pop();
  }

  if (err === 'API_NOT_CONFIGURED') {
    appendChatError('请先在设置中配置 API 信息');
  } else {
    appendChatError('请求失败：' + err);
  }
});

function appendChatMessage(role, content) {
  const el = document.createElement('div');
  el.className = `message ${role} markdown-body`;
  el.setAttribute('data-raw', content);
  if (content) {
    el.innerHTML = window.api.parseMarkdown(content);
  } else {
    el.innerHTML = '';
  }
  chatMessages$.appendChild(el);
  chatMessages$.scrollTop = chatMessages$.scrollHeight;
  return el;
}

function appendChatError(msg) {
  const el = document.createElement('div');
  el.className = 'message-error';
  el.textContent = '⚠ ' + msg;
  chatMessages$.appendChild(el);
  chatMessages$.scrollTop = chatMessages$.scrollHeight;
}

// ── 面板展开/收起 ──────────────────────────────────────

function showTranslationPanel() {
  panelTranslation.classList.remove('hidden');
  panelTranslation.classList.add('active-panel');
  btnTranslate.classList.add('active');
  panelChat.classList.add('hidden');
  panelChat.classList.remove('active-panel');
  btnChat.classList.remove('active');
  window.api.resizeWindow(320, 56 + 100);
}

function showChatPanel() {
  panelChat.classList.remove('hidden');
  panelChat.classList.add('active-panel');
  btnChat.classList.add('active');
  panelTranslation.classList.add('hidden');
  panelTranslation.classList.remove('active-panel');
  btnTranslate.classList.remove('active');
  window.api.resizeWindow(360, 56 + 420);
}

function collapseAll() {
  isPinned = false;
  panelTranslation.classList.add('hidden');
  panelTranslation.classList.remove('active-panel');
  panelChat.classList.add('hidden');
  panelChat.classList.remove('active-panel');
  btnTranslate.classList.remove('active');
  btnChat.classList.remove('active');
  updatePinControls();
  window.api.collapseWindow();
}

function resetPanels() {
  collapseAll();
  resetTranslationUI();
}

function resetTranslationUI() {
  wordResult.classList.add('hidden');
  sentenceResult.classList.add('hidden');
  translationError.classList.add('hidden');
  sentenceOutput.innerHTML = '';
  sentenceOutput.setAttribute('data-raw', '');
  sentenceLoading.classList.add('hidden');
  wordChinese.innerHTML = '';
  wordMeanings.innerHTML = '';
}

function resetChatState() {
  chatMessages = [];
  chatMessages$.innerHTML = '';
  chatContextText.textContent = currentText;
  chatInput.value = '';
  isStreaming = false;
  chatSendBtn.disabled = false;
}

function getActivePanel() {
  if (panelTranslation.classList.contains('active-panel')) return 'translation';
  if (panelChat.classList.contains('active-panel')) return 'chat';
  return null;
}

function updatePinControls() {
  const hasExpandedPanel = Boolean(getActivePanel());
  btnPin.classList.toggle('hidden', !hasExpandedPanel);
  pinDivider.classList.toggle('hidden', !hasExpandedPanel);
  btnPin.classList.toggle('pinned', isPinned);
  btnPin.title = isPinned ? '取消固定窗口' : '固定窗口';
  btnPin.setAttribute('aria-label', btnPin.title);
}

function applyFeatureVisibility(settings) {
  btnTranslate.style.display = settings.translationEnabled ? 'flex' : 'none';
  document.querySelector('.divider').style.display =
    (settings.translationEnabled && settings.aiChatEnabled) ? 'block' : 'none';
  btnChat.style.display = settings.aiChatEnabled ? 'flex' : 'none';
}

function showTranslationError(msg) {
  translationError.textContent = '⚠ ' + msg;
  translationError.classList.remove('hidden');
}

function addSettingsLink() {
  const btn = document.createElement('button');
  btn.textContent = '打开设置';
  btn.style.cssText = 'margin-top:6px;padding:4px 10px;background:rgba(108,99,255,0.2);border:1px solid rgba(108,99,255,0.3);border-radius:6px;color:#6c63ff;font-size:11px;cursor:pointer;font-family:inherit;';
  btn.onclick = () => window.api.openSettings();
  translationError.appendChild(document.createElement('br'));
  translationError.appendChild(btn);
}

function resizePanelForContent() {
  const panelHeight = panelTranslation.scrollHeight;
  const totalHeight = Math.min(56 + panelHeight + 8, 56 + 340);
  window.api.resizeWindow(320, totalHeight);
}

function cleanupStreamListeners() {
  // preload 里的监听器是长期的，不需要重复添加/移除
}
