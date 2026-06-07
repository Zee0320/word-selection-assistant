const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildClipboardAiPrompt,
  normalizeClipboardText
} = require('../src/main/selected-context');

test('normalizes clipboard text for an AI context prompt', () => {
  assert.equal(normalizeClipboardText('  hello\r\nworld  '), 'hello\nworld');
});

test('builds a standalone chat draft from clipboard text', () => {
  const prompt = buildClipboardAiPrompt('Selected paragraph');

  assert.match(prompt, /^请基于以下选中文本进行分析/);
  assert.match(prompt, /Selected paragraph/);
});
