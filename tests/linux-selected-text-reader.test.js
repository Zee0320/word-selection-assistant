/**
 * Tests for Linux selected text reader using X11 tools
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readSelectedTextViaX11,
  buildCommandRunner
} = require('../src/main/linux-selected-text-reader');

/**
 * Create a mock exec function that simulates command responses
 * @param {Function} handler - Function that takes command and returns { stdout, stderr, error }
 * @returns {Function} Mock exec function
 */
function createMockExec(handler) {
  return (cmd, options, callback) => {
    // Handle both callback and promise styles
    if (typeof callback === 'function') {
      const result = handler(cmd);
      if (result instanceof Promise) {
        result.then(r => callback(r.error || null, { stdout: r.stdout || '', stderr: r.stderr || '' }));
      } else {
        callback(result.error || null, { stdout: result.stdout || '', stderr: result.stderr || '' });
      }
      return;
    }
    // Promise style
    const result = handler(cmd);
    if (result instanceof Promise) {
      return result.then(r => {
        if (r.error) throw r.error;
        return { stdout: r.stdout || '', stderr: r.stderr || '' };
      });
    }
    if (result.error) throw result.error;
    return { stdout: result.stdout || '', stderr: result.stderr || '' };
  };
}

test('buildCommandRunner returns a function that executes commands', () => {
  const mockExec = () => Promise.resolve({ stdout: 'test', stderr: '' });
  const runCommand = buildCommandRunner(mockExec);
  assert.equal(typeof runCommand, 'function');
});

test('buildCommandRunner resolves with stdout on success', async () => {
  const mockExec = () => Promise.resolve({ stdout: 'result', stderr: '' });
  const runCommand = buildCommandRunner(mockExec);
  const result = await runCommand('echo test');
  assert.equal(result, 'result');
});

test('buildCommandRunner rejects on error', async () => {
  const mockExec = () => Promise.reject(new Error('Command failed'));
  const runCommand = buildCommandRunner(mockExec);
  await assert.rejects(
    () => runCommand('invalid-command'),
    { message: 'Command failed: Command failed' }
  );
});

// Tests for readSelectedTextViaX11

test('returns text from PRIMARY selection when available', async () => {
  const mockExec = createMockExec(cmd => {
    if (cmd.includes('xclip') && cmd.includes('primary')) {
      return { stdout: 'selected text', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  const runCommand = buildCommandRunner(mockExec);
  const result = await readSelectedTextViaX11(runCommand);
  assert.equal(result, 'selected text');
});

test('trims whitespace from PRIMARY selection', async () => {
  const mockExec = createMockExec(cmd => {
    if (cmd.includes('xclip') && cmd.includes('primary')) {
      return { stdout: '  selected text  \n', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  const runCommand = buildCommandRunner(mockExec);
  const result = await readSelectedTextViaX11(runCommand);
  assert.equal(result, 'selected text');
});

test('falls back to clipboard when PRIMARY is empty', async () => {
  let callCount = 0;
  const mockExec = createMockExec(cmd => {
    callCount++;
    if (cmd.includes('xclip') && cmd.includes('primary')) {
      return { stdout: '', stderr: '' };
    }
    if (cmd.includes('clipboard') && callCount === 2) {
      // Previous clipboard
      return { stdout: '', stderr: '' };
    }
    if (cmd.includes('xdotool')) {
      return { stdout: '', stderr: '' };
    }
    if (cmd.includes('clipboard') && callCount === 4) {
      // New clipboard after Ctrl+C
      return { stdout: 'fallback text', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  const runCommand = buildCommandRunner(mockExec);
  const result = await readSelectedTextViaX11(runCommand);
  assert.equal(result, 'fallback text');
});

test('restores previous clipboard content after fallback', async () => {
  const commands = [];
  let callCount = 0;

  const mockExec = createMockExec(cmd => {
    commands.push(cmd);
    callCount++;

    if (cmd.includes('xclip') && cmd.includes('primary')) {
      return { stdout: '', stderr: '' };
    }
    if (callCount === 2) {
      // Save previous clipboard
      return { stdout: 'saved clipboard content', stderr: '' };
    }
    if (cmd.includes('xdotool')) {
      return { stdout: '', stderr: '' };
    }
    if (callCount === 4) {
      // Read new clipboard
      return { stdout: 'new selection', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  const runCommand = buildCommandRunner(mockExec);
  await readSelectedTextViaX11(runCommand);

  // Should have a command to restore clipboard (xclip -selection clipboard with input)
  const restoreCmd = commands.find(c =>
    c.includes('xclip') &&
    c.includes('clipboard') &&
    !c.includes('-o')
  );
  assert.ok(restoreCmd, 'Should have a restore clipboard command');
});

test('trims whitespace from clipboard result', async () => {
  let callCount = 0;
  const mockExec = createMockExec(cmd => {
    callCount++;
    if (cmd.includes('primary')) {
      return { stdout: '', stderr: '' };
    }
    if (callCount === 2) {
      return { stdout: '', stderr: '' };
    }
    if (cmd.includes('xdotool')) {
      return { stdout: '', stderr: '' };
    }
    if (callCount === 4) {
      return { stdout: '  trimmed text  ', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  const runCommand = buildCommandRunner(mockExec);
  const result = await readSelectedTextViaX11(runCommand);
  assert.equal(result, 'trimmed text');
});

test('returns empty string when xclip is not available', async () => {
  const mockExec = createMockExec(() => ({
    error: new Error('command not found: xclip'),
    stdout: '',
    stderr: ''
  }));

  const runCommand = buildCommandRunner(mockExec);
  const result = await readSelectedTextViaX11(runCommand);
  assert.equal(result, '');
});

test('returns empty string when xdotool fails', async () => {
  let callCount = 0;
  const mockExec = createMockExec(cmd => {
    callCount++;
    if (cmd.includes('primary')) {
      return { stdout: '', stderr: '' };
    }
    if (cmd.includes('xdotool')) {
      return { error: new Error('xdotool failed'), stdout: '', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  const runCommand = buildCommandRunner(mockExec);
  const result = await readSelectedTextViaX11(runCommand);
  assert.equal(result, '');
});

test('returns empty string when both methods fail', async () => {
  const mockExec = createMockExec(() => ({
    error: new Error('All methods failed'),
    stdout: '',
    stderr: ''
  }));

  const runCommand = buildCommandRunner(mockExec);
  const result = await readSelectedTextViaX11(runCommand);
  assert.equal(result, '');
});

test('handles multiline text from PRIMARY selection', async () => {
  const mockExec = createMockExec(cmd => {
    if (cmd.includes('primary')) {
      return { stdout: 'line1\nline2\nline3', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  const runCommand = buildCommandRunner(mockExec);
  const result = await readSelectedTextViaX11(runCommand);
  assert.equal(result, 'line1\nline2\nline3');
});

test('handles special characters in text', async () => {
  const mockExec = createMockExec(cmd => {
    if (cmd.includes('primary')) {
      return { stdout: 'special: <>&"\'chars', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  const runCommand = buildCommandRunner(mockExec);
  const result = await readSelectedTextViaX11(runCommand);
  assert.ok(result.includes('special:'));
});

test('handles unicode text', async () => {
  const mockExec = createMockExec(cmd => {
    if (cmd.includes('primary')) {
      return { stdout: '你好世界 🌍 مرحبا', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  const runCommand = buildCommandRunner(mockExec);
  const result = await readSelectedTextViaX11(runCommand);
  assert.equal(result, '你好世界 🌍 مرحبا');
});

test('returns empty string for whitespace-only selection', async () => {
  const mockExec = createMockExec(cmd => {
    if (cmd.includes('primary')) {
      return { stdout: '   \n\t  ', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  const runCommand = buildCommandRunner(mockExec);
  const result = await readSelectedTextViaX11(runCommand);
  assert.equal(result, '');
});
