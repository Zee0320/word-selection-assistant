function isModelNotFoundMessage(message) {
  if (!message || typeof message !== 'string') return false;
  return /model|模型/i.test(message) && /not found|does not exist|不存在|无权限|permission|access/i.test(message);
}

function formatHttpError(statusCode, apiMessage, bodyContent) {
  switch (statusCode) {
    case 401:
    case 403:
      return {
        message: apiMessage ? `认证失败：${apiMessage}` : '认证失败，请检查 API Key 或鉴权配置',
        action: 'settings'
      };
    case 404:
      if (isModelNotFoundMessage(apiMessage)) {
        return { message: `模型不存在或无权限：${apiMessage}`, action: 'settings' };
      }
      return {
        message: apiMessage ? `请求地址无效：${apiMessage}` : '请求地址无效，请检查 API 地址和路径',
        action: 'settings'
      };
    case 429:
      return { message: '请求过于频繁，请稍后重试', action: 'retry' };
    case 500:
    case 502:
    case 503:
      if (bodyContent && !apiMessage) {
        return { message: '服务器返回格式异常，请稍后重试', action: 'wait' };
      }
      return {
        message: apiMessage ? `服务器异常：${apiMessage}` : '服务器异常，请稍后重试',
        action: 'wait'
      };
    default:
      return {
        message: apiMessage ? `请求失败：${apiMessage}` : `请求失败 (HTTP ${statusCode})，请检查网络和配置`,
        action: 'settings'
      };
  }
}

function formatNetworkError(errorString) {
  const lower = errorString.toLowerCase();

  if (lower.includes('connection_refused') || lower.includes('connection refused')) {
    return { message: '无法连接到服务器，请检查网络和地址', action: 'settings' };
  }
  if (lower.includes('enotfound') || lower.includes('name_not_resolved')) {
    return { message: '网络地址无法解析，请检查 API 地址', action: 'settings' };
  }
  if (lower.includes('etimedout') || lower.includes('connection_timed_out') || lower.includes('timed out')) {
    return { message: '连接超时，请检查网络', action: 'retry' };
  }

  return null;
}

function parseApiErrorMessage(body) {
  if (!body || typeof body !== 'string') return null;
  try {
    const json = JSON.parse(body);
    return json.error?.message || json.message || null;
  } catch {
    return null;
  }
}

/**
 * Format a raw API error into a user-friendly message with action hint.
 * @param {Error|string|number} rawError - The raw error (Error object, error string, or HTTP status code)
 * @param {object} [options] - Optional context
 * @param {number} [options.statusCode] - HTTP status code if available
 * @param {string} [options.body] - Response body if available
 * @returns {{ message: string, action: 'settings'|'retry'|'wait' }}
 */
function formatApiError(rawError, options = {}) {
  if (options.statusCode) {
    const apiMessage = parseApiErrorMessage(options.body);
    return formatHttpError(options.statusCode, apiMessage, options.body);
  }

  if (typeof rawError === 'number') {
    return formatHttpError(rawError, null, null);
  }

  const errorString = rawError instanceof Error ? rawError.message : String(rawError);

  const httpMatch = errorString.match(/HTTP\s+(\d+)/i);
  if (httpMatch) {
    const code = parseInt(httpMatch[1], 10);
    return formatHttpError(code, null, null);
  }

  const networkResult = formatNetworkError(errorString);
  if (networkResult) return networkResult;

  return { message: '请求失败，请检查网络和配置', action: 'settings' };
}

/**
 * Detect garbled/malformed content in output text.
 * Returns true if the content appears to have encoding issues.
 * @param {string} content - The content to check
 * @returns {boolean}
 */
function detectGarbledContent(content) {
  if (!content || typeof content !== 'string') return false;

  const replacementCount = (content.match(/\uFFFD/g) || []).length;
  const mojibakeReplacementCount = (content.match(/锟�/g) || []).length;
  const bomResidueCount = (content.match(/ï»¿|锘�|閿樼笜/g) || []).length;
  const garbledPatternCount = (content.match(/[閿樼笜绺]{3,}/g) || []).length;
  const controlCharCount = (content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;

  return (
    replacementCount >= 3 ||
    mojibakeReplacementCount >= 3 ||
    bomResidueCount >= 1 ||
    garbledPatternCount >= 1 ||
    controlCharCount >= 1
  );
}

module.exports = { formatApiError, detectGarbledContent };
