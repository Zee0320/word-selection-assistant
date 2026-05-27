const test = require('node:test');
const assert = require('node:assert/strict');

const { _private } = require('../src/main/selected-text-reader');

test('UI Automation script reads selected text from focused text pattern', () => {
  assert.equal(typeof _private?.buildUIAutomationSelectionScript, 'function');

  const script = _private.buildUIAutomationSelectionScript();

  assert.match(script, /AutomationElement\]::FocusedElement/);
  assert.match(script, /TextPattern\]::Pattern/);
  assert.match(script, /\.GetSelection\(\)/);
  assert.match(script, /\.GetText\(-1\)/);
});
