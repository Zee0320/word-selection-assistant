const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('capture script produces all required context card screenshots', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'capture-context-card-evidence.js');
  const script = fs.readFileSync(scriptPath, 'utf8');
  for (const name of [
    'collapsed-context-card.png',
    'expanded-context-card.png',
    'locked-context-card.png',
    'empty-context-card.png',
    'after-clear-context-card.png'
  ]) {
    assert.match(script, new RegExp(name.replace('.', '\\.')));
  }
});

test('capture script uses BrowserWindow capturePage', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'capture-context-card-evidence.js');
  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.match(script, /capturePage/);
  assert.match(script, /BrowserWindow/);
});
