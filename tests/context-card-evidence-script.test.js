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

test('capture script has committed mock preload dependency', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'capture-context-card-evidence.js');
  const preloadPath = path.join(__dirname, '..', 'scripts', 'capture-mock-preload.js');

  assert.ok(fs.existsSync(scriptPath), 'capture script should exist');
  assert.ok(fs.existsSync(preloadPath), 'mock preload should exist');

  const script = fs.readFileSync(scriptPath, 'utf8');
  const preload = fs.readFileSync(preloadPath, 'utf8');

  assert.match(script, /capture-mock-preload\.js/);
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
});
