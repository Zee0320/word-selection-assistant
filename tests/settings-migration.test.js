const test = require('node:test');
const assert = require('node:assert/strict');

const { inferConnectionMode } = require('../src/main/settings-migration');

test('inferConnectionMode defaults to direct without gateway fields', () => {
  assert.equal(
    inferConnectionMode({ apiRequestPath: '', customHeaders: {} }),
    'direct'
  );

  assert.equal(
    inferConnectionMode({}),
    'direct'
  );
});

test('inferConnectionMode migrates request path configurations to gateway', () => {
  assert.equal(
    inferConnectionMode({ apiRequestPath: '/openai/v2/chat/completions', customHeaders: {} }),
    'gateway'
  );
});

test('inferConnectionMode migrates custom header configurations to gateway', () => {
  assert.equal(
    inferConnectionMode({ apiRequestPath: '', customHeaders: { 'X-Env': 'intranet' } }),
    'gateway'
  );
});

test('inferConnectionMode migrates translateHeaders to gateway', () => {
  assert.equal(
    inferConnectionMode({ apiRequestPath: '', customHeaders: {}, translateHeaders: { 'X-Route': 'translate' } }),
    'gateway'
  );
});

test('inferConnectionMode migrates chatHeaders to gateway', () => {
  assert.equal(
    inferConnectionMode({ apiRequestPath: '', customHeaders: {}, chatHeaders: { 'X-Route': 'chat' } }),
    'gateway'
  );
});

test('inferConnectionMode ignores empty translateHeaders and chatHeaders', () => {
  assert.equal(
    inferConnectionMode({ apiRequestPath: '', customHeaders: {}, translateHeaders: {}, chatHeaders: {} }),
    'direct'
  );
});
