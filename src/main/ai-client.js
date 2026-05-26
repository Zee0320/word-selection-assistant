// src/main/ai-client.js - OpenAI 兼容 API 客户端（支持流式）
const { net } = require('electron');
const { getSettings } = require('./store');
const { buildChatCompletionsUrl, buildRequestHeaders } = require('./api-request-config');
const { formatApiError, detectGarbledContent } = require('./api-error-formatter');
const { buildChatMessages } = require('./chat-prompt');

/**
 * 语言检测：判断文本是否为中文
 */
function isChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * 文本分类：单词/短语 vs 句子
 */
function classifyText(text, threshold) {
  const wordCount = text.trim().split(/\s+/).length;
  const result = wordCount <= threshold ? 'word' : 'sentence';
  console.log('[AI-Client] classifyText: text="' + text + '", wordCount=' + wordCount + ', threshold=' + threshold + ', result=' + result);
  return result;
}

/**
 * 构建翻译 system prompt
 */
function buildTranslationPrompt(text) {
  if (isChinese(text)) {
    return 'You are a professional translator. Translate the Chinese text to English. Provide only the translation, no explanations.';
  } else {
    return 'You are a professional translator. Translate the English text to Chinese. Provide only the translation, no explanations.';
  }
}

/**
 * Check if API is properly configured for the given mode and purpose
 * @returns {boolean} true if configured, false otherwise
 */
function isApiConfigured(settings, purpose) {
  const isGateway = settings.connectionMode === 'gateway';

  // Base URL always required
  if (!settings.apiBaseUrl) return false;

  // Direct mode requires apiKey
  if (!isGateway && !settings.apiKey) return false;

  // Model required based on purpose
  if (purpose === 'translate' || purpose === 'test-translate') {
    if (!settings.translateModel) return false;
  } else if (purpose === 'chat' || purpose === 'test-chat') {
    if (!settings.chatModel) return false;
  }

  return true;
}

/**
 * 发送流式请求，通过 onChunk 回调逐块返回内容
 * @param {Array} messages - OpenAI messages 数组
 * @param {string} purpose - Request purpose ('translate', 'chat', 'test-translate', 'test-chat')
 * @param {Function} onChunk - 每个 token 的回调 (chunk: string) => void
 * @param {Function} onDone - 完成回调
 * @param {Function} onError - 错误回调 (error: Error) => void
 */
function streamCompletion(model, messages, purpose, onChunk, onDone, onError) {
  const settings = getSettings();
  let settled = false;

  function finishWithError(error) {
    if (settled) return;
    settled = true;
    onError(error);
  }

  function finishDone() {
    if (settled) return;
    settled = true;
    onDone();
  }

  // Direct mode: baseUrl + apiKey + model required
  // Gateway mode: baseUrl + model required (apiKey and request path optional)
  if (!settings.apiBaseUrl || !model) {
    onError(new Error('API_NOT_CONFIGURED'));
    return;
  }
  if (settings.connectionMode !== 'gateway' && !settings.apiKey) {
    onError(new Error('API_NOT_CONFIGURED'));
    return;
  }
  const url = buildChatCompletionsUrl(settings);

  const body = JSON.stringify({
    model: model,
    messages,
    stream: true,
    temperature: 0.3
  });

  const request = net.request({
    method: 'POST',
    url,
    headers: buildRequestHeaders(settings, purpose)
  });

  request.on('response', (response) => {
    let buffer = '';
    let errorBody = '';
    let consecutiveParseFailures = 0;
    const MAX_PARSE_FAILURES = 3;

    response.on('data', (chunk) => {
      if (response.statusCode !== 200) {
        errorBody += chunk.toString();
        return;
      }
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留最后不完整的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            // Check for garbled content in output
            if (detectGarbledContent(content)) {
              consecutiveParseFailures++;
              if (consecutiveParseFailures >= MAX_PARSE_FAILURES) {
                finishWithError(new Error(JSON.stringify({ message: '模型输出异常，请稍后重试', action: 'retry' })));
                return;
              }
            } else {
              consecutiveParseFailures = 0; // Reset on valid content
            }
            onChunk(content);
          }
        } catch {
          consecutiveParseFailures++;
          if (consecutiveParseFailures >= MAX_PARSE_FAILURES) {
            finishWithError(new Error(JSON.stringify({ message: '模型输出异常，请稍后重试', action: 'retry' })));
            return;
          }
        }
      }
    });

    response.on('end', () => {
      if (response.statusCode !== 200) {
        const formatted = formatApiError(null, { statusCode: response.statusCode, body: errorBody });
        finishWithError(new Error(JSON.stringify({ message: formatted.message, action: formatted.action })));
        return;
      }
      finishDone();
    });

    response.on('error', (err) => {
      const formatted = formatApiError(err);
      finishWithError(new Error(JSON.stringify({ message: formatted.message, action: formatted.action })));
    });
  });

  request.on('error', (err) => {
    const formatted = formatApiError(err);
    finishWithError(new Error(JSON.stringify({ message: formatted.message, action: formatted.action })));
  });

  request.write(body);
  request.end();
}

/**
 * 翻译句子（流式）
 */
function translateSentence(text, onChunk, onDone, onError) {
  const settings = getSettings();
  const systemPrompt = buildTranslationPrompt(text);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text }
  ];
  streamCompletion(settings.translateModel, messages, 'translate', onChunk, onDone, onError);
}

/**
 * AI 对话（流式），selectedText 作为上下文
 */
function aiChat(selectedText, messages, onChunk, onDone, onError) {
  const settings = getSettings();
  const fullMessages = buildChatMessages(selectedText, messages);
  streamCompletion(settings.chatModel, fullMessages, 'chat', onChunk, onDone, onError);
}

/**
 * 测试 API 连通性
 * @param {Object} settings - Settings object with connection config
 * @param {string} purpose - 'test-translate' or 'test-chat'
 */
async function testConnection(settings, purpose) {
  return new Promise((resolve) => {
    const isGateway = settings.connectionMode === 'gateway';

    // Validate required fields based on mode
    if (!settings.apiBaseUrl) {
      resolve({ success: false, error: isGateway ? '请先配置 Gateway 地址。' : '请先配置 API 地址。' });
      return;
    }
    if (!isGateway && !settings.apiKey) {
      resolve({ success: false, error: 'Direct API 模式需要配置 API Key。' });
      return;
    }
    if (!settings.modelName) {
      resolve({ success: false, error: '请先填写模型名称。' });
      return;
    }

    const url = buildChatCompletionsUrl(settings);

    const body = JSON.stringify({
      model: settings.modelName,
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 1
    });

    const request = net.request({
      method: 'POST',
      url,
      headers: buildRequestHeaders(settings, purpose)
    });

    request.on('response', (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk.toString(); });
      response.on('end', () => {
        if (response.statusCode === 200) {
          resolve({ success: true });
        } else {
          const formatted = formatApiError(null, { statusCode: response.statusCode, body: data });
          resolve({ success: false, error: formatted.message, action: formatted.action });
        }
      });
    });

    request.on('error', (err) => {
      const formatted = formatApiError(err);
      resolve({ success: false, error: formatted.message, action: formatted.action });
    });
    
    request.write(body);
    request.end();
  });
}

module.exports = { classifyText, isChinese, translateSentence, aiChat, buildTranslationPrompt, testConnection, isApiConfigured };
