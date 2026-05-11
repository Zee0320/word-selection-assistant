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
const translateHeadersList = document.getElementById('translate-headers-list');
const translateHeadersJson = document.getElementById('translate-headers-json');
const btnAddTranslateHeader = document.getElementById('btn-add-translate-header');
const chatHeadersList = document.getElementById('chat-headers-list');
const chatHeadersJson = document.getElementById('chat-headers-json');
const btnAddChatHeader = document.getElementById('btn-add-chat-header');
const btnTestTranslate = document.getElementById('btn-test-translate');
const btnTestChat = document.getElementById('btn-test-chat');
const togglePw = document.getElementById('toggle-pw');
const pwEye = document.getElementById('pw-eye');
const gatewaySettings = document.getElementById('gateway-settings');
const connectionModeInputs = Array.from(document.querySelectorAll('input[name="connection-mode"]'));

let saveTimer = null;
let isSyncingHeaders = false;
let lastSavedHeaders = {};
let lastSavedTranslateHeaders = {};
let lastSavedChatHeaders = {};

function getConnectionMode() {
  return connectionModeInputs.find(input => input.checked)?.value || 'direct';
}

function setConnectionMode(mode) {
  const nextMode = mode === 'gateway' ? 'gateway' : 'direct';
  connectionModeInputs.forEach(input => {
    input.checked = input.value === nextMode;
  });
  updateConnectionModeVisibility();
}

function isGatewayMode() {
  return getConnectionMode() === 'gateway';
}

function updateConnectionModeVisibility() {
  gatewaySettings.classList.toggle('hidden', !isGatewayMode());
  if (!isGatewayMode()) {
    clearHeadersError();
  }
}

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
  lastSavedHeaders = settings.customHeaders || {};
  lastSavedTranslateHeaders = settings.translateHeaders || {};
  lastSavedChatHeaders = settings.chatHeaders || {};
  renderHeadersRows(headersList, lastSavedHeaders, customHeadersJson);
  renderHeadersRows(translateHeadersList, lastSavedTranslateHeaders, translateHeadersJson);
  renderHeadersRows(chatHeadersList, lastSavedChatHeaders, chatHeadersJson);
  setConnectionMode(settings.connectionMode || 'direct');

  validateApiConfig(settings);
}

loadSettings();

function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 600);
}

function buildCurrentSettings() {
  const sharedResult = collectHeadersFromRows(headersList);
  const translateResult = collectHeadersFromRows(translateHeadersList);
  const chatResult = collectHeadersFromRows(chatHeadersList);

  if (isGatewayMode()) {
    if (!sharedResult.ok) {
      showHeadersError(sharedResult.error);
      return { ok: false, error: sharedResult.error };
    }
    if (!translateResult.ok) {
      showHeadersError(translateResult.error);
      return { ok: false, error: translateResult.error };
    }
    if (!chatResult.ok) {
      showHeadersError(chatResult.error);
      return { ok: false, error: chatResult.error };
    }
  }

  const sharedHeaders = sharedResult.ok ? sharedResult.headers : lastSavedHeaders;
  const translateHeaders = translateResult.ok ? translateResult.headers : lastSavedTranslateHeaders;
  const chatHeaders = chatResult.ok ? chatResult.headers : lastSavedChatHeaders;

  return {
    ok: true,
    settings: {
      connectionMode: getConnectionMode(),
      apiBaseUrl: apiBaseUrl.value.trim(),
      apiKey: apiKey.value.trim(),
      apiRequestPath: apiRequestPath.value.trim(),
      customHeaders: sharedHeaders,
      translateHeaders: translateHeaders,
      chatHeaders: chatHeaders,
      translateModel: translateModel.value.trim(),
      chatModel: chatModel.value.trim(),
      translationEnabled: translationEnabled.checked,
      aiChatEnabled: aiChatEnabled.checked,
      phraseThreshold: parseInt(phraseThreshold.value, 10)
    }
  };
}

async function doSave() {
  const result = buildCurrentSettings();
  if (!result.ok) return;

  const updated = await window.api.saveSettings(result.settings);
  lastSavedHeaders = updated.customHeaders || {};
  lastSavedTranslateHeaders = updated.translateHeaders || {};
  lastSavedChatHeaders = updated.chatHeaders || {};
  showSaveIndicator();
  validateApiConfig(updated);
}

function showSaveIndicator() {
  saveIndicator.classList.remove('hidden');
  saveIndicator.style.animation = 'none';
  void saveIndicator.offsetWidth;
  saveIndicator.style.animation = 'fadeInOut 2s ease forwards';
  setTimeout(() => saveIndicator.classList.add('hidden'), 2000);
}

[apiBaseUrl, apiKey, apiRequestPath, translateModel, chatModel].forEach(el => {
  el.addEventListener('input', scheduleAutoSave);
});

[translationEnabled, aiChatEnabled].forEach(el => {
  el.addEventListener('change', doSave);
});

connectionModeInputs.forEach(input => {
  input.addEventListener('change', () => {
    updateConnectionModeVisibility();
    doSave();
  });
});

phraseThreshold.addEventListener('input', () => {
  thresholdValue.textContent = phraseThreshold.value;
  scheduleAutoSave();
});

btnAddHeader.addEventListener('click', () => {
  addHeaderRow(headersList, '', '', customHeadersJson);
  syncJsonFromRows(headersList, customHeadersJson);
  scheduleAutoSave();
});

btnAddTranslateHeader.addEventListener('click', () => {
  addHeaderRow(translateHeadersList, '', '', translateHeadersJson);
  syncJsonFromRows(translateHeadersList, translateHeadersJson);
  scheduleAutoSave();
});

btnAddChatHeader.addEventListener('click', () => {
  addHeaderRow(chatHeadersList, '', '', chatHeadersJson);
  syncJsonFromRows(chatHeadersList, chatHeadersJson);
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
  renderHeadersRows(headersList, result.headers, customHeadersJson);
  scheduleAutoSave();
});

translateHeadersJson.addEventListener('input', () => {
  if (isSyncingHeaders) return;

  const result = parseHeadersJson(translateHeadersJson.value);
  if (!result.ok) {
    showHeadersError(result.error);
    return;
  }

  clearHeadersError();
  renderHeadersRows(translateHeadersList, result.headers, translateHeadersJson);
  scheduleAutoSave();
});

chatHeadersJson.addEventListener('input', () => {
  if (isSyncingHeaders) return;

  const result = parseHeadersJson(chatHeadersJson.value);
  if (!result.ok) {
    showHeadersError(result.error);
    return;
  }

  clearHeadersError();
  renderHeadersRows(chatHeadersList, result.headers, chatHeadersJson);
  scheduleAutoSave();
});

togglePw.addEventListener('click', () => {
  const isPassword = apiKey.type === 'password';
  apiKey.type = isPassword ? 'text' : 'password';
  pwEye.style.opacity = isPassword ? '0.4' : '1';
});

async function testModelConnection(btn, modelValue, label, purpose) {
  if (!modelValue) {
    showApiStatus('error', `Missing ${label} model.`);
    return;
  }

  const result = buildCurrentSettings();
  if (!result.ok) {
    showApiStatus('error', 'Fix gateway headers before testing.');
    return;
  }

  const validationError = getValidationError(result.settings);
  if (validationError) {
    showApiStatus('error', validationError);
    return;
  }

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Testing...';
  hideApiStatus();

  const currentSettings = await window.api.saveSettings(result.settings);
  lastSavedHeaders = currentSettings.customHeaders || {};
  lastSavedTranslateHeaders = currentSettings.translateHeaders || {};
  lastSavedChatHeaders = currentSettings.chatHeaders || {};

  const testConfig = {
    connectionMode: currentSettings.connectionMode,
    apiBaseUrl: currentSettings.apiBaseUrl,
    apiKey: currentSettings.apiKey,
    apiRequestPath: currentSettings.apiRequestPath,
    customHeaders: currentSettings.customHeaders,
    translateHeaders: currentSettings.translateHeaders,
    chatHeaders: currentSettings.chatHeaders,
    modelName: modelValue
  };

  const testResult = await window.api.testConnection(testConfig, purpose);
  if (testResult.success) {
    const modeLabel = currentSettings.connectionMode === 'gateway' ? 'gateway' : 'direct';
    const headerInfo = currentSettings.connectionMode === 'gateway'
      ? ` (shared + ${label} headers)`
      : '';
    showApiStatus('ok', `${label} model "${modelValue}" connected in ${modeLabel} mode${headerInfo}.`);
  } else {
    showApiStatus('error', testResult.error);
  }

  btn.disabled = false;
  btn.textContent = originalText;
}

btnTestTranslate.addEventListener('click', () => {
  testModelConnection(btnTestTranslate, translateModel.value.trim(), 'translation', 'test-translate');
});

btnTestChat.addEventListener('click', () => {
  testModelConnection(btnTestChat, chatModel.value.trim(), 'chat', 'test-chat');
});

function getValidationError(settings) {
  const needsTranslation = settings.translationEnabled;
  const needsChat = settings.aiChatEnabled;
  const isGateway = settings.connectionMode === 'gateway';

  if (!needsTranslation && !needsChat) return '';
  if (!settings.apiBaseUrl) return isGateway ? 'Gateway URL is required.' : 'API URL is required for enabled AI features.';
  if (!isGateway && !settings.apiKey) return 'API key is required for Direct API mode.';
  if (needsTranslation && !settings.translateModel) return 'Translation is enabled, but no translation model is configured.';
  if (needsChat && !settings.chatModel) return 'AI chat is enabled, but no chat model is configured.';
  return '';
}

function validateApiConfig(settings) {
  const error = getValidationError(settings);
  const isGateway = settings.connectionMode === 'gateway';
  if (error) {
    showApiStatus('error', error);
  } else if (settings.apiBaseUrl && (settings.apiKey || isGateway)) {
    const modeLabel = isGateway ? 'Gateway' : 'Direct API';
    const authInfo = isGateway && !settings.apiKey ? ' (auth via headers)' : '';
    showApiStatus('ok', `${modeLabel} configuration is ready${authInfo}.`);
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

function addHeaderRow(listEl, name, value, jsonEl) {
  const row = document.createElement('div');
  row.className = 'header-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'header-name';
  nameInput.placeholder = 'Header name';
  nameInput.value = name;

  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'header-value';
  valueInput.placeholder = 'Header value';
  valueInput.value = value;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn-icon';
  removeButton.title = 'Remove header';
  removeButton.textContent = 'x';

  row.append(nameInput, valueInput, removeButton);
  listEl.appendChild(row);

  [nameInput, valueInput].forEach(input => {
    input.addEventListener('input', () => {
      syncJsonFromRows(listEl, jsonEl);
      scheduleAutoSave();
    });
  });

  removeButton.addEventListener('click', () => {
    row.remove();
    syncJsonFromRows(listEl, jsonEl);
    scheduleAutoSave();
  });
}

function renderHeadersRows(listEl, headers, jsonEl) {
  listEl.replaceChildren();
  Object.entries(headers).forEach(([name, value]) => {
    addHeaderRow(listEl, name, String(value), jsonEl);
  });
  syncJsonFromRows(listEl, jsonEl);
}

function collectHeadersFromRows(listEl) {
  const headers = {};
  const rows = Array.from(listEl.querySelectorAll('.header-row'));

  for (const row of rows) {
    const name = row.querySelector('.header-name').value.trim();
    const value = row.querySelector('.header-value').value.trim();

    if (!name && !value) continue;
    if (!name) {
      return { ok: false, error: 'Header name cannot be empty.' };
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
    return { ok: false, error: 'Headers JSON is not valid JSON.' };
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    return { ok: false, error: 'Headers JSON must be an object.' };
  }

  const headers = {};
  for (const [name, headerValue] of Object.entries(parsed)) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return { ok: false, error: 'Header name cannot be empty.' };
    }
    headers[trimmedName] = String(headerValue);
  }

  return { ok: true, headers };
}

function syncJsonFromRows(listEl, jsonEl) {
  if (isSyncingHeaders) return;

  const result = collectHeadersFromRows(listEl);
  if (!result.ok) {
    showHeadersError(result.error);
    return;
  }

  isSyncingHeaders = true;
  jsonEl.value = JSON.stringify(result.headers, null, 2);
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
