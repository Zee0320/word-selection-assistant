// src/renderer/settings/script.js - 设置页面逻辑

const apiBaseUrl = document.getElementById('api-base-url');
const apiKey = document.getElementById('api-key');
const apiRequestPath = document.getElementById('api-request-path');
const translateModel = document.getElementById('translate-model');
const chatModel = document.getElementById('chat-model');
const translationEnabled = document.getElementById('translation-enabled');
const aiChatEnabled = document.getElementById('ai-chat-enabled');
const phraseThreshold = document.getElementById('phrase-threshold');
const thresholdValue = document.getElementById('threshold-value');
const saveIndicator = document.getElementById('save-indicator');
const apiStatus = document.getElementById('api-status');
const headersList = document.getElementById('headers-list');
const customHeadersJson = document.getElementById('custom-headers-json');
const headersError = document.getElementById('headers-error');
const btnAddHeader = document.getElementById('btn-add-header');
const btnTestTranslate = document.getElementById('btn-test-translate');
const btnTestChat = document.getElementById('btn-test-chat');
const togglePw = document.getElementById('toggle-pw');
const pwEye = document.getElementById('pw-eye');

let saveTimer = null;
let isSyncingHeaders = false;

// ── 初始加载 ──────────────────────────────────────────

async function loadSettings() {
  const settings = await window.api.getSettings();
  apiBaseUrl.value = settings.apiBaseUrl || '';
  apiKey.value = settings.apiKey || '';
  apiRequestPath.value = settings.apiRequestPath || '';
  translateModel.value = settings.translateModel || '';
  chatModel.value = settings.chatModel || '';
  translationEnabled.checked = settings.translationEnabled;
  aiChatEnabled.checked = settings.aiChatEnabled;
  phraseThreshold.value = settings.phraseThreshold;
  thresholdValue.textContent = settings.phraseThreshold;
  renderHeadersRows(settings.customHeaders || {});

  validateApiConfig(settings);
}

loadSettings();

// ── 自动保存 ──────────────────────────────────────────

function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 600);
}

async function doSave() {
  const headersResult = collectHeadersFromRows();
  if (!headersResult.ok) {
    showHeadersError(headersResult.error);
    return;
  }

  const settings = {
    apiBaseUrl: apiBaseUrl.value.trim(),
    apiKey: apiKey.value.trim(),
    apiRequestPath: apiRequestPath.value.trim(),
    customHeaders: headersResult.headers,
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

[apiBaseUrl, apiKey, apiRequestPath, translateModel, chatModel].forEach(el => {
  el.addEventListener('input', scheduleAutoSave);
});

[translationEnabled, aiChatEnabled].forEach(el => {
  el.addEventListener('change', doSave);
});

phraseThreshold.addEventListener('input', () => {
  thresholdValue.textContent = phraseThreshold.value;
  scheduleAutoSave();
});

btnAddHeader.addEventListener('click', () => {
  addHeaderRow('', '');
  syncJsonFromRows();
  scheduleAutoSave();
});

customHeadersJson.addEventListener('input', () => {
  if (isSyncingHeaders) return;

  const result = parseHeadersJson(customHeadersJson.value);
  if (!result.ok) {
    showHeadersError(result.error);
    return;
  }

  clearHeadersError();
  renderHeadersRows(result.headers);
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

  const headersResult = collectHeadersFromRows();
  if (!headersResult.ok) {
    showHeadersError(headersResult.error);
    showApiStatus('error', '⚠ 请先修正自定义 Headers');
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
    apiRequestPath: apiRequestPath.value.trim(),
    customHeaders: headersResult.headers,
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
    apiRequestPath: currentSettings.apiRequestPath,
    customHeaders: currentSettings.customHeaders,
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

function addHeaderRow(name, value) {
  const row = document.createElement('div');
  row.className = 'header-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'header-name';
  nameInput.placeholder = 'Header 名称';
  nameInput.value = name;

  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'header-value';
  valueInput.placeholder = 'Header 值';
  valueInput.value = value;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn-icon';
  removeButton.title = '删除 Header';
  removeButton.textContent = '×';

  row.append(nameInput, valueInput, removeButton);
  headersList.appendChild(row);

  [nameInput, valueInput].forEach(input => {
    input.addEventListener('input', () => {
      syncJsonFromRows();
      scheduleAutoSave();
    });
  });

  removeButton.addEventListener('click', () => {
    row.remove();
    syncJsonFromRows();
    scheduleAutoSave();
  });
}

function renderHeadersRows(headers) {
  headersList.replaceChildren();
  Object.entries(headers).forEach(([name, value]) => {
    addHeaderRow(name, String(value));
  });
  syncJsonFromRows();
}

function collectHeadersFromRows() {
  const headers = {};
  const rows = Array.from(headersList.querySelectorAll('.header-row'));

  for (const row of rows) {
    const name = row.querySelector('.header-name').value.trim();
    const value = row.querySelector('.header-value').value.trim();

    if (!name && !value) continue;
    if (!name) {
      return { ok: false, error: 'Header 名称不能为空' };
    }
    headers[name] = value;
  }

  clearHeadersError();
  return { ok: true, headers };
}

function parseHeadersJson(value) {
  if (!value.trim()) {
    return { ok: true, headers: {} };
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { ok: false, error: 'Headers JSON 格式无效' };
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    return { ok: false, error: 'Headers JSON 必须是对象' };
  }

  const headers = {};
  for (const [name, headerValue] of Object.entries(parsed)) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return { ok: false, error: 'Header 名称不能为空' };
    }
    headers[trimmedName] = String(headerValue);
  }

  return { ok: true, headers };
}

function syncJsonFromRows() {
  if (isSyncingHeaders) return;

  const result = collectHeadersFromRows();
  if (!result.ok) {
    showHeadersError(result.error);
    return;
  }

  isSyncingHeaders = true;
  customHeadersJson.value = JSON.stringify(result.headers, null, 2);
  isSyncingHeaders = false;
}

function showHeadersError(message) {
  headersError.textContent = message;
  headersError.classList.remove('hidden');
}

function clearHeadersError() {
  headersError.textContent = '';
  headersError.classList.add('hidden');
}
