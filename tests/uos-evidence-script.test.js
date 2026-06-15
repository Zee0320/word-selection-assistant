const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('UOS evidence script records required environment and tools', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'collect-uos-capture-evidence.sh');
  const script = fs.readFileSync(scriptPath, 'utf8');
  for (const command of ['uname -m', 'XDG_SESSION_TYPE', '/etc/os-release', 'command -v xinput', 'command -v xdotool', 'command -v xclip']) {
    assert.match(script, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('UOS evidence script validates aarch64 architecture', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'collect-uos-capture-evidence.sh');
  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.match(script, /uname -m.*aarch64/);
  assert.match(script, /test.*aarch64/);
});

test('UOS evidence script validates X11 session type', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'collect-uos-capture-evidence.sh');
  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.match(script, /XDG_SESSION_TYPE.*x11/);
});

test('UOS evidence script validates UOS/UnionTech OS', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'collect-uos-capture-evidence.sh');
  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.match(script, /(uos|uniontech)/i);
});
