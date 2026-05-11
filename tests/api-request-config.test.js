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

test('buildChatCompletionsUrl ignores custom request path in direct mode', () => {
  assert.equal(
    buildChatCompletionsUrl({
      connectionMode: 'direct',
      apiBaseUrl: 'https://api.example.com',
      apiRequestPath: '/openai/v2/chat/completions'
    }),
    'https://api.example.com/v1/chat/completions'
  );
});

test('buildChatCompletionsUrl joins a gateway request path with base URL', () => {
  assert.equal(
    buildChatCompletionsUrl({
      connectionMode: 'gateway',
      apiBaseUrl: 'https://intranet.example.com/gateway/',
      apiRequestPath: '/openai/v2/chat/completions'
    }),
    'https://intranet.example.com/gateway/openai/v2/chat/completions'
  );

  assert.equal(
    buildChatCompletionsUrl({
      connectionMode: 'gateway',
      apiBaseUrl: 'https://intranet.example.com/gateway',
      apiRequestPath: 'openai/v2/chat/completions'
    }),
    'https://intranet.example.com/gateway/openai/v2/chat/completions'
  );
});

test('buildChatCompletionsUrl uses direct endpoint defaults in gateway mode without a request path', () => {
  assert.equal(
    buildChatCompletionsUrl({
      connectionMode: 'gateway',
      apiBaseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
      apiRequestPath: ''
    }),
    'https://coding.dashscope.aliyuncs.com/v1/chat/completions'
  );

  assert.equal(
    buildChatCompletionsUrl({
      connectionMode: 'gateway',
      apiBaseUrl: 'https://intranet.example.com/gateway/openai/v2/chat/completions',
      apiRequestPath: ''
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

test('buildRequestHeaders ignores custom headers in direct mode', () => {
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'direct',
      apiKey: 'sk-test',
      customHeaders: {
        'X-Env': 'intranet',
        Authorization: 'Token internal'
      }
    }),
    {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test'
    }
  );
});

test('buildRequestHeaders ignores purpose-specific headers in direct mode', () => {
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'direct',
      apiKey: 'sk-test',
      customHeaders: { 'X-Shared': 'common' },
      translateHeaders: { 'X-Translate': 'special' },
      chatHeaders: { 'X-Chat': 'special' }
    }, 'translate'),
    {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test'
    }
  );

  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'direct',
      apiKey: 'sk-test',
      customHeaders: { 'X-Shared': 'common' },
      translateHeaders: { 'X-Translate': 'special' },
      chatHeaders: { 'X-Chat': 'special' }
    }, 'chat'),
    {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test'
    }
  );
});

test('buildRequestHeaders appends and overrides custom headers in gateway mode', () => {
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
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

test('buildRequestHeaders merges translateHeaders in gateway mode with translate purpose', () => {
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      apiKey: 'sk-test',
      customHeaders: { 'X-Shared': 'common' },
      translateHeaders: { 'X-Translate': 'special', 'X-Shared': 'override' }
    }, 'translate'),
    {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test',
      'X-Shared': 'override',
      'X-Translate': 'special'
    }
  );
});

test('buildRequestHeaders merges chatHeaders in gateway mode with chat purpose', () => {
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      apiKey: 'sk-test',
      customHeaders: { 'X-Shared': 'common' },
      chatHeaders: { 'X-Chat': 'special', 'X-Shared': 'override' }
    }, 'chat'),
    {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test',
      'X-Shared': 'override',
      'X-Chat': 'special'
    }
  );
});

test('buildRequestHeaders uses translateHeaders for test-translate purpose', () => {
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      apiKey: 'sk-test',
      customHeaders: { 'X-Shared': 'common' },
      translateHeaders: { 'X-Test': 'translate' },
      chatHeaders: { 'X-Test': 'chat' }
    }, 'test-translate'),
    {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test',
      'X-Shared': 'common',
      'X-Test': 'translate'
    }
  );
});

test('buildRequestHeaders uses chatHeaders for test-chat purpose', () => {
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      apiKey: 'sk-test',
      customHeaders: { 'X-Shared': 'common' },
      translateHeaders: { 'X-Test': 'translate' },
      chatHeaders: { 'X-Test': 'chat' }
    }, 'test-chat'),
    {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test',
      'X-Shared': 'common',
      'X-Test': 'chat'
    }
  );
});

test('buildRequestHeaders ignores purpose-specific headers without a purpose', () => {
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      apiKey: 'sk-test',
      customHeaders: { 'X-Shared': 'common' },
      translateHeaders: { 'X-Translate': 'special' },
      chatHeaders: { 'X-Chat': 'special' }
    }),
    {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test',
      'X-Shared': 'common'
    }
  );
});

// Gateway mode without apiKey tests

test('buildRequestHeaders skips Authorization header when apiKey is empty in gateway mode', () => {
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      apiKey: '',
      customHeaders: { 'X-Env': 'intranet' }
    }),
    {
      'Content-Type': 'application/json',
      'X-Env': 'intranet'
    }
  );

  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      customHeaders: { 'X-Env': 'intranet' }
    }),
    {
      'Content-Type': 'application/json',
      'X-Env': 'intranet'
    }
  );
});

test('buildRequestHeaders allows custom Authorization in gateway mode without apiKey', () => {
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      apiKey: '',
      customHeaders: { Authorization: 'Token internal-secret' }
    }),
    {
      'Content-Type': 'application/json',
      Authorization: 'Token internal-secret'
    }
  );
});

test('buildRequestHeaders allows Authorization via purpose-specific headers without apiKey', () => {
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      apiKey: '',
      customHeaders: { 'X-Shared': 'common' },
      translateHeaders: { Authorization: 'Token translate-auth' }
    }, 'translate'),
    {
      'Content-Type': 'application/json',
      'X-Shared': 'common',
      Authorization: 'Token translate-auth'
    }
  );

  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      apiKey: '',
      customHeaders: { 'X-Shared': 'common' },
      chatHeaders: { Authorization: 'Token chat-auth' }
    }, 'chat'),
    {
      'Content-Type': 'application/json',
      'X-Shared': 'common',
      Authorization: 'Token chat-auth'
    }
  );
});

test('buildRequestHeaders custom Authorization overrides default Bearer in gateway mode', () => {
  // Shared headers override default Bearer
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      apiKey: 'sk-default',
      customHeaders: { Authorization: 'Token shared-auth' }
    }),
    {
      'Content-Type': 'application/json',
      Authorization: 'Token shared-auth'
    }
  );

  // Purpose-specific headers override shared and default
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      apiKey: 'sk-default',
      customHeaders: { Authorization: 'Token shared-auth' },
      translateHeaders: { Authorization: 'Token translate-auth' }
    }, 'translate'),
    {
      'Content-Type': 'application/json',
      Authorization: 'Token translate-auth'
    }
  );

  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'gateway',
      apiKey: 'sk-default',
      customHeaders: { Authorization: 'Token shared-auth' },
      chatHeaders: { Authorization: 'Token chat-auth' }
    }, 'chat'),
    {
      'Content-Type': 'application/json',
      Authorization: 'Token chat-auth'
    }
  );
});

test('buildRequestHeaders still requires apiKey for direct mode', () => {
  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'direct',
      apiKey: '',
      customHeaders: { Authorization: 'Token internal' }
    }),
    {
      'Content-Type': 'application/json'
    }
  );

  assert.deepEqual(
    buildRequestHeaders({
      connectionMode: 'direct',
      apiKey: 'sk-test'
    }),
    {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test'
    }
  );
});
