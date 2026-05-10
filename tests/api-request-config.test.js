const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildChatCompletionsUrl,
  buildRequestHeaders
} = require('../src/main/api-request-config');

test('buildChatCompletionsUrl keeps default /v1/chat/completions behavior', () => {
  assert.equal(
    buildChatCompletionsUrl({ apiBaseUrl: 'https://api.example.com' }),
    'https://api.example.com/v1/chat/completions'
  );

  assert.equal(
    buildChatCompletionsUrl({ apiBaseUrl: 'https://api.example.com/v1' }),
    'https://api.example.com/v1/chat/completions'
  );

  assert.equal(
    buildChatCompletionsUrl({ apiBaseUrl: 'https://api.example.com/v1/chat/completions' }),
    'https://api.example.com/v1/chat/completions'
  );
});

test('buildChatCompletionsUrl preserves existing SiliconFlow and DeepSeek defaults', () => {
  assert.equal(
    buildChatCompletionsUrl({ apiBaseUrl: 'https://api.siliconflow.cn' }),
    'https://api.siliconflow.cn/chat/completions'
  );

  assert.equal(
    buildChatCompletionsUrl({ apiBaseUrl: 'https://api.deepseek.com' }),
    'https://api.deepseek.com/chat/completions'
  );
});

test('buildChatCompletionsUrl joins a custom request path with base URL', () => {
  assert.equal(
    buildChatCompletionsUrl({
      apiBaseUrl: 'https://intranet.example.com/gateway/',
      apiRequestPath: '/openai/v2/chat/completions'
    }),
    'https://intranet.example.com/gateway/openai/v2/chat/completions'
  );

  assert.equal(
    buildChatCompletionsUrl({
      apiBaseUrl: 'https://intranet.example.com/gateway',
      apiRequestPath: 'openai/v2/chat/completions'
    }),
    'https://intranet.example.com/gateway/openai/v2/chat/completions'
  );
});

test('buildRequestHeaders includes default JSON and bearer headers', () => {
  assert.deepEqual(
    buildRequestHeaders({ apiKey: 'sk-test' }),
    {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test'
    }
  );
});

test('buildRequestHeaders appends and overrides custom headers', () => {
  assert.deepEqual(
    buildRequestHeaders({
      apiKey: 'sk-test',
      customHeaders: {
        'X-Env': 'intranet',
        Authorization: 'Token internal'
      }
    }),
    {
      'Content-Type': 'application/json',
      Authorization: 'Token internal',
      'X-Env': 'intranet'
    }
  );
});
