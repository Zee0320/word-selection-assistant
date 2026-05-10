function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function trimLeadingSlash(value) {
  return value.replace(/^\/+/, '');
}

function buildChatCompletionsUrl(settings) {
  const baseUrl = trimTrailingSlash(settings.apiBaseUrl || '');
  const customPath = (settings.apiRequestPath || '').trim();

  if (customPath) {
    return `${baseUrl}/${trimLeadingSlash(customPath)}`;
  }

  let url = baseUrl;
  if (!url.endsWith('/chat/completions')) {
    if (!url.endsWith('/v1') && !url.includes('api.siliconflow.cn') && !url.includes('api.deepseek.com')) {
      url += '/v1';
    }
    url += '/chat/completions';
  }

  return url;
}

function buildRequestHeaders(settings) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.apiKey}`,
    ...(settings.customHeaders || {})
  };
}

module.exports = { buildChatCompletionsUrl, buildRequestHeaders };
