const test = require('node:test');
const assert = require('node:assert/strict');

const { formatApiError, detectGarbledContent } = require('../src/main/api-error-formatter');

test('formatApiError maps HTTP 401 to auth failure', () => {
  const result = formatApiError(new Error('API error: HTTP 401'));
  assert.equal(result.message, '认证失败，请检查 API Key 或鉴权配置');
  assert.equal(result.action, 'settings');
});

test('formatApiError maps HTTP 403 to auth failure', () => {
  const result = formatApiError(new Error('API error: HTTP 403'));
  assert.equal(result.message, '认证失败，请检查 API Key 或鉴权配置');
  assert.equal(result.action, 'settings');
});

test('formatApiError maps HTTP 404 to invalid URL without API body', () => {
  const result = formatApiError(new Error('API error: HTTP 404'));
  assert.equal(result.message, '请求地址无效，请检查 API 地址和路径');
  assert.equal(result.action, 'settings');
});

test('formatApiError maps HTTP 404 model errors to model configuration', () => {
  const result = formatApiError(null, {
    statusCode: 404,
    body: JSON.stringify({ error: { message: 'Model deepseek-chat not found' } })
  });
  assert.equal(result.message, '模型不存在或无权限：Model deepseek-chat not found');
  assert.equal(result.action, 'settings');
});

test('formatApiError maps HTTP 429 to rate limit', () => {
  const result = formatApiError(new Error('API error: HTTP 429'));
  assert.equal(result.message, '请求过于频繁，请稍后重试');
  assert.equal(result.action, 'retry');
});

test('formatApiError maps HTTP 500 to server error', () => {
  const result = formatApiError(new Error('API error: HTTP 500'));
  assert.equal(result.message, '服务器异常，请稍后重试');
  assert.equal(result.action, 'wait');
});

test('formatApiError maps HTTP 502 to server error', () => {
  const result = formatApiError(new Error('API error: HTTP 502'));
  assert.equal(result.message, '服务器异常，请稍后重试');
  assert.equal(result.action, 'wait');
});

test('formatApiError maps HTTP 503 to server error', () => {
  const result = formatApiError(new Error('API error: HTTP 503'));
  assert.equal(result.message, '服务器异常，请稍后重试');
  assert.equal(result.action, 'wait');
});

test('formatApiError maps unknown HTTP status to generic error', () => {
  const result = formatApiError(new Error('API error: HTTP 418'));
  assert.ok(result.message.includes('请求失败'));
  assert.equal(result.action, 'settings');
});

test('formatApiError accepts numeric status code', () => {
  const result = formatApiError(401);
  assert.equal(result.message, '认证失败，请检查 API Key 或鉴权配置');
  assert.equal(result.action, 'settings');
});

test('formatApiError uses options.statusCode with API error body', () => {
  const result = formatApiError(null, {
    statusCode: 401,
    body: JSON.stringify({ error: { message: 'Incorrect API key provided' } })
  });
  assert.equal(result.message, '认证失败：Incorrect API key provided');
  assert.equal(result.action, 'settings');
});

test('formatApiError uses options.statusCode without API error body', () => {
  const result = formatApiError(null, { statusCode: 404, body: '' });
  assert.equal(result.message, '请求地址无效，请检查 API 地址和路径');
  assert.equal(result.action, 'settings');
});

test('formatApiError uses options.statusCode with invalid JSON body', () => {
  const result = formatApiError(null, { statusCode: 500, body: 'not json' });
  assert.equal(result.message, '服务器返回格式异常，请稍后重试');
  assert.equal(result.action, 'wait');
});

test('formatApiError HTTP 500 with non-empty body but no JSON error', () => {
  const result = formatApiError(null, { statusCode: 500, body: '<html>Internal Server Error</html>' });
  assert.equal(result.message, '服务器返回格式异常，请稍后重试');
  assert.equal(result.action, 'wait');
});

test('formatApiError HTTP 500 with valid JSON error body', () => {
  const result = formatApiError(null, { statusCode: 500, body: JSON.stringify({ error: { message: 'Model overloaded' } }) });
  assert.equal(result.message, '服务器异常：Model overloaded');
  assert.equal(result.action, 'wait');
});

test('formatApiError maps ERR_CONNECTION_REFUSED', () => {
  const result = formatApiError(new Error('net::ERR_CONNECTION_REFUSED'));
  assert.equal(result.message, '无法连接到服务器，请检查网络和地址');
  assert.equal(result.action, 'settings');
});

test('formatApiError maps ENOTFOUND', () => {
  const result = formatApiError(new Error('getaddrinfo ENOTFOUND api.example.com'));
  assert.equal(result.message, '网络地址无法解析，请检查 API 地址');
  assert.equal(result.action, 'settings');
});

test('formatApiError maps ERR_NAME_NOT_RESOLVED', () => {
  const result = formatApiError(new Error('net::ERR_NAME_NOT_RESOLVED'));
  assert.equal(result.message, '网络地址无法解析，请检查 API 地址');
  assert.equal(result.action, 'settings');
});

test('formatApiError maps ETIMEDOUT', () => {
  const result = formatApiError(new Error('request ETIMEDOUT'));
  assert.equal(result.message, '连接超时，请检查网络');
  assert.equal(result.action, 'retry');
});

test('formatApiError maps ERR_CONNECTION_TIMED_OUT', () => {
  const result = formatApiError(new Error('net::ERR_CONNECTION_TIMED_OUT'));
  assert.equal(result.message, '连接超时，请检查网络');
  assert.equal(result.action, 'retry');
});

test('formatApiError maps unknown error to generic message', () => {
  const result = formatApiError(new Error('something completely unexpected'));
  assert.equal(result.message, '请求失败，请检查网络和配置');
  assert.equal(result.action, 'settings');
});

test('formatApiError maps string error to generic message', () => {
  const result = formatApiError('unknown error string');
  assert.equal(result.message, '请求失败，请检查网络和配置');
  assert.equal(result.action, 'settings');
});

test('detectGarbledContent returns false for normal text', () => {
  assert.equal(detectGarbledContent('这是一个正常的中文文本'), false);
  assert.equal(detectGarbledContent('This is normal English text'), false);
  assert.equal(detectGarbledContent(''), false);
  assert.equal(detectGarbledContent(null), false);
});

test('detectGarbledContent detects replacement characters', () => {
  const replacementChar = '\uFFFD';
  assert.equal(detectGarbledContent('正常文本' + replacementChar.repeat(3) + '异常'), true);
  assert.equal(detectGarbledContent('only two' + replacementChar.repeat(2)), false);
});

test('detectGarbledContent detects mojibake replacement characters', () => {
  assert.equal(detectGarbledContent('正常文本锟�锟�锟�异常'), true);
});

test('detectGarbledContent detects BOM residue', () => {
  assert.equal(detectGarbledContent('锘�text'), true);
  assert.equal(detectGarbledContent('ï»¿text'), true);
});

test('detectGarbledContent detects garbled pattern', () => {
  assert.equal(detectGarbledContent('閿樼笜绺樼笜绺'), true);
  assert.equal(detectGarbledContent('閿樼笜绺樼笜'), true);
});

test('detectGarbledContent detects control characters', () => {
  assert.equal(detectGarbledContent('text\x00with control'), true);
  assert.equal(detectGarbledContent('text\x1Fchar'), true);
});

test('detectGarbledContent allows newline and tab', () => {
  assert.equal(detectGarbledContent('text\nwith\nnewlines'), false);
  assert.equal(detectGarbledContent('text\twith\ttabs'), false);
});
