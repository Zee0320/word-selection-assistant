function isModelNotFoundMessage(message) {
  if (!message || typeof message !== 'string') return false;
  return /model|模型/i.test(message) &&
    /not found|does not exist|不存在|无权限|permission|access|unauthorized/i.test(message);
}

function withApiMessage(prefix, apiMessage) {
  return apiMessage ? `${prefix}：${apiMessage}` : prefix;
}

function formatHttpError(statusCode, apiMessage, bodyContent) {
  switch (statusCode) {
    case 401:
    case 403:
      return {
        message: withApiMessage('认证失败，请检查 API Key 或网关鉴权 Header', apiMessage),
        action: 'settings'
      };
    case 404:
      if (isModelNotFoundMessage(apiMessage)) {
        return {
          message: withApiMessage('模型不存在或无权限，请检查模型名称和账号权限', apiMessage),
          action: 'settings'
        };
      }
      return {
        message: withApiMessage('请求地址无效，请检查 API 地址和请求路径', apiMessage),
        action: 'settings'
      };
    case 429:
      return { message: '请求过于频繁，请稍后重试', action: 'retry' };
    case 500:
    case 502:
    case 503:
      if (bodyContent && !apiMessage) {
        return { message: '服务器返回内容异常，请稍后重试', action: 'wait' };
      }
      return {
        message: withApiMessage('服务器异常，请稍后重试', apiMessage),
        action: 'wait'
      };
    default:
      return {
        message: apiMessage
          ? `请求失败：${apiMessage}`
          : `请求失败（HTTP ${statusCode}），请检查网络和配置`,
        action: 'settings'
      };
  }
}

function formatNetworkError(errorString) {
  const lower = errorString.toLowerCase();

  if (lower.includes('connection_refused') || lower.includes('connection refused')) {
    return { message: '无法连接到服务器，请检查网络、内网地址或模型服务是否已启动', action: 'settings' };
  }
  if (lower.includes('enotfound') || lower.includes('name_not_resolved')) {
    return { message: '网络地址无法解析，请检查 API 地址是否正确', action: 'settings' };
  }
  if (lower.includes('etimedout') || lower.includes('connection_timed_out') || lower.includes('timed out')) {
    return { message: '连接超时，请检查网络或稍后重试', action: 'retry' };
  }

  return null;
}

function parseApiErrorMessage(body) {
  if (!body || typeof body !== 'string') return null;
  try {
    const json = JSON.parse(body);
    const message = json.error?.message || json.message;
    return typeof message === 'string' && message.trim() ? message.trim() : null;
  } catch {
    return null;
  }
}

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

function detectGarbledContent(content) {
  if (!content || typeof content !== 'string') return false;

  const replacementCount = (content.match(/\uFFFD/g) || []).length;
  const mojibakeReplacementCount = (content.match(/閿燂拷/g) || []).length;
  const bomResidueCount = (content.match(/茂禄驴|閿橈拷|闁挎绗?/g) || []).length;
  const garbledPatternCount = (content.match(/[闁挎绗滅缓]{3,}/g) || []).length;
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
