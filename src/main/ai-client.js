// src/main/ai-client.js - OpenAI 兼容 API 客户端（支持流式）
const { net } = require('electron');
const { getSettings } = require('./store');
const { buildChatCompletionsUrl, buildRequestHeaders } = require('./api-request-config');

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
 * 发送流式请求，通过 onChunk 回调逐块返回内容
 * @param {Array} messages - OpenAI messages 数组
 * @param {Function} onChunk - 每个 token 的回调 (chunk: string) => void
 * @param {Function} onDone - 完成回调
 * @param {Function} onError - 错误回调 (error: Error) => void
 */
function streamCompletion(model, messages, onChunk, onDone, onError) {
  const settings = getSettings();

  if (!settings.apiBaseUrl || !settings.apiKey || !model) {
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
    headers: buildRequestHeaders(settings)
  });

  request.on('response', (response) => {
    let buffer = '';

    response.on('data', (chunk) => {
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
            onChunk(content);
          }
        } catch {
          // 忽略解析错误的行
        }
      }
    });

    response.on('end', () => {
      onDone();
    });

    response.on('error', (err) => {
      onError(err);
    });

    if (response.statusCode !== 200) {
      onError(new Error(`API error: HTTP ${response.statusCode}`));
    }
  });

  request.on('error', (err) => {
    onError(err);
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
  streamCompletion(settings.translateModel, messages, onChunk, onDone, onError);
}

/**
 * AI 对话（流式），selectedText 作为上下文
 */
function aiChat(selectedText, messages, onChunk, onDone, onError) {
  const settings = getSettings();
  const systemMessage = {
    role: 'system',
    content: `You are a helpful assistant. The user has selected the following text as context:\n\n"${selectedText}"\n\nHelp the user understand or discuss this text.`
  };
  const fullMessages = [systemMessage, ...messages];
  streamCompletion(settings.chatModel, fullMessages, onChunk, onDone, onError);
}

/**
 * 测试 API 连通性
 */
async function testConnection(settings) {
  return new Promise((resolve) => {
    if (!settings.apiBaseUrl || !settings.apiKey || !settings.modelName) {
      resolve({ success: false, error: '请填写完整的 API 配置' });
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
      headers: buildRequestHeaders(settings)
    });

    request.on('response', (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk.toString(); });
      response.on('end', () => {
        if (response.statusCode === 200) {
          resolve({ success: true });
        } else {
          try {
            const json = JSON.parse(data);
            resolve({ success: false, error: json.error?.message || `HTTP ${response.statusCode}` });
          } catch {
            resolve({ success: false, error: `HTTP ${response.statusCode}` });
          }
        }
      });
    });

    request.on('error', (err) => resolve({ success: false, error: err.message }));
    
    request.write(body);
    request.end();
  });
}

module.exports = { classifyText, isChinese, translateSentence, aiChat, buildTranslationPrompt, testConnection };
