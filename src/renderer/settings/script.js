// src/renderer/settings/script.js - 设置页面逻辑

const apiBaseUrl = document.getElementById('api-base-url');
const apiKey = document.getElementById('api-key');
const translateModel = document.getElementById('translate-model');
const chatModel = document.getElementById('chat-model');
const translationEnabled = document.getElementById('translation-enabled');
const aiChatEnabled = document.getElementById('ai-chat-enabled');
const phraseThreshold = document.getElementById('phrase-threshold');
const thresholdValue = document.getElementById('threshold-value');
const saveIndicator = document.getElementById('save-indicator');
const apiStatus = document.getElementById('api-status');
const btnTestTranslate = document.getElementById('btn-test-translate');
const btnTestChat = document.getElementById('btn-test-chat');
const togglePw = document.getElementById('toggle-pw');
const pwEye = document.getElementById('pw-eye');

let saveTimer = null;

// ── 初始加载 ──────────────────────────────────────────

async function loadSettings() {
  const settings = await window.api.getSettings();
  apiBaseUrl.value = settings.apiBaseUrl || '';
  apiKey.value = settings.apiKey || '';
  translateModel.value = settings.translateModel || '';
  chatModel.value = settings.chatModel || '';
  translationEnabled.checked = settings.translationEnabled;
  aiChatEnabled.checked = settings.aiChatEnabled;
  phraseThreshold.value = settings.phraseThreshold;
  thresholdValue.textContent = settings.phraseThreshold;

  validateApiConfig(settings);
}

loadSettings();

// ── 自动保存 ──────────────────────────────────────────

function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 600);
}

async function doSave() {
  const settings = {
    apiBaseUrl: apiBaseUrl.value.trim(),
    apiKey: apiKey.value.trim(),
    translateModel: translateModel.value.trim(),
    chatModel: chatModel.value.trim(),
    translationEnabled: translationEnabled.checked,
    aiChatEnabled: aiChatEnabled.checked,
    phraseThreshold: parseInt(phraseThreshold.value, 10)
  };

  await window.api.saveSettings(settings);
  showSaveIndicator();
  validateApiConfig(settings);
}

function showSaveIndicator() {
  saveIndicator.classList.remove('hidden');
  saveIndicator.style.animation = 'none';
  void saveIndicator.offsetWidth; // reflow
  saveIndicator.style.animation = 'fadeInOut 2s ease forwards';
  setTimeout(() => saveIndicator.classList.add('hidden'), 2000);
}

// ── 事件监听 ──────────────────────────────────────────

[apiBaseUrl, apiKey, translateModel, chatModel].forEach(el => {
  el.addEventListener('input', scheduleAutoSave);
});

[translationEnabled, aiChatEnabled].forEach(el => {
  el.addEventListener('change', doSave);
});

phraseThreshold.addEventListener('input', () => {
  thresholdValue.textContent = phraseThreshold.value;
  scheduleAutoSave();
});

// 显示/隐藏密码
togglePw.addEventListener('click', () => {
  const isPassword = apiKey.type === 'password';
  apiKey.type = isPassword ? 'text' : 'password';
  pwEye.style.opacity = isPassword ? '0.4' : '1';
});

// 测试连通性
async function testModelConnection(btn, modelValue) {
  if (!modelValue) {
    showApiStatus('error', '⚠ 请先填写模型名称');
    return;
  }

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '测试...';
  hideApiStatus();

  // 确保测试前保存当前输入
  const currentSettings = {
    apiBaseUrl: apiBaseUrl.value.trim(),
    apiKey: apiKey.value.trim(),
    translateModel: translateModel.value.trim(),
    chatModel: chatModel.value.trim(),
    translationEnabled: translationEnabled.checked,
    aiChatEnabled: aiChatEnabled.checked,
    phraseThreshold: parseInt(phraseThreshold.value, 10)
  };
  await window.api.saveSettings(currentSettings);

  const testConfig = {
    apiBaseUrl: currentSettings.apiBaseUrl,
    apiKey: currentSettings.apiKey,
    modelName: modelValue
  };

  const result = await window.api.testConnection(testConfig);
  if (result.success) {
    showApiStatus('ok', `✓ ${modelValue} 连接测试成功！`);
  } else {
    showApiStatus('error', `⚠ ${modelValue} 测试失败: ${result.error}`);
  }

  btn.disabled = false;
  btn.textContent = originalText;
}

btnTestTranslate.addEventListener('click', () => {
  testModelConnection(btnTestTranslate, translateModel.value.trim());
});

btnTestChat.addEventListener('click', () => {
  testModelConnection(btnTestChat, chatModel.value.trim());
});

// ── API 配置验证 ──────────────────────────────────────

function validateApiConfig(settings) {
  const hasConfig = settings.apiBaseUrl && settings.apiKey && (settings.translateModel || settings.chatModel);
  const needsAI = settings.translationEnabled || settings.aiChatEnabled;

  if (!hasConfig && needsAI) {
    showApiStatus('error', '⚠ 请填写完整的 API 配置以使用 AI 功能');
  } else if (hasConfig) {
    showApiStatus('ok', '✓ API 配置已就绪');
  } else {
    hideApiStatus();
  }
}

function showApiStatus(type, msg) {
  apiStatus.textContent = msg;
  apiStatus.className = `api-status ${type}`;
  apiStatus.classList.remove('hidden');
}

function hideApiStatus() {
  apiStatus.classList.add('hidden');
}
