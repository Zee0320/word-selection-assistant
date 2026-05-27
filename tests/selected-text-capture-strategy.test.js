const test = require('node:test');
const assert = require('node:assert/strict');

const { readSelectedTextWithFallback } = require('../src/main/selected-text-capture-strategy');

test('readSelectedTextWithFallback skips clipboard fallback when UI Automation returns text', async () => {
  let fallbackCalls = 0;

  const result = await readSelectedTextWithFallback({
    readViaUIAutomation: async () => 'hiding',
    readViaClipboardFallback: async () => {
      fallbackCalls++;
      return 'clipboard text';
    }
  });

  assert.equal(result, 'hiding');
  assert.equal(fallbackCalls, 0);
});

test('readSelectedTextWithFallback uses clipboard fallback when UI Automation has no text', async () => {
  let fallbackCalls = 0;

  const result = await readSelectedTextWithFallback({
    readViaUIAutomation: async () => '',
    readViaClipboardFallback: async () => {
      fallbackCalls++;
      return 'clipboard text';
    }
  });

  assert.equal(result, 'clipboard text');
  assert.equal(fallbackCalls, 1);
});

test('readSelectedTextWithFallback skips clipboard fallback when fallback is disabled', async () => {
  let fallbackCalls = 0;

  const result = await readSelectedTextWithFallback({
    readViaUIAutomation: async () => '',
    readViaClipboardFallback: async () => {
      fallbackCalls++;
      return 'clipboard text';
    },
    allowClipboardFallback: false
  });

  assert.equal(result, '');
  assert.equal(fallbackCalls, 0);
});
