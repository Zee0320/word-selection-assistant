function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function trimLeadingSlash(value) {
  return value.replace(/^\/+/, '');
}

function isGatewayMode(settings) {
  return settings.connectionMode === 'gateway';
}

function buildDirectChatCompletionsUrl(baseUrl) {
  let url = baseUrl;
  if (!url.endsWith('/chat/completions')) {
    if (!url.endsWith('/v1') && !url.includes('api.siliconflow.cn') && !url.includes('api.deepseek.com')) {
      url += '/v1';
    }
    url += '/chat/completions';
  }
  return url;
}

function buildChatCompletionsUrl(settings) {
  const baseUrl = trimTrailingSlash(settings.apiBaseUrl || '');

  if (isGatewayMode(settings)) {
    const customPath = (settings.apiRequestPath || '').trim();
    if (!customPath) return baseUrl;
    return `${baseUrl}/${trimLeadingSlash(customPath)}`;
  }

  return buildDirectChatCompletionsUrl(baseUrl);
}

function buildRequestHeaders(settings, purpose) {
  const headers = {
    'Content-Type': 'application/json'
  };

  // Only add default Bearer auth if apiKey exists
  // Gateway mode may use custom headers for auth instead
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  if (isGatewayMode(settings)) {
    // Merge shared headers first
    Object.assign(headers, settings.customHeaders || {});
    // Then merge purpose-specific headers (can override shared, including Authorization)
    if (purpose === 'translate') {
      Object.assign(headers, settings.translateHeaders || {});
    } else if (purpose === 'chat') {
      Object.assign(headers, settings.chatHeaders || {});
    } else if (purpose === 'test-translate') {
      Object.assign(headers, settings.translateHeaders || {});
    } else if (purpose === 'test-chat') {
      Object.assign(headers, settings.chatHeaders || {});
    }
  }

  console.log('[API-Config] Headers built:', {
    mode: settings.connectionMode,
    purpose: purpose || 'none',
    apiKeyPresent: !!settings.apiKey,
    sharedHeaders: settings.customHeaders || {},
    translateHeaders: settings.translateHeaders || {},
    chatHeaders: settings.chatHeaders || {},
    finalHeaders: headers
  });

  return headers;
}

module.exports = { buildChatCompletionsUrl, buildRequestHeaders, isGatewayMode };
