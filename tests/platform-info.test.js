const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPlatformInfo,
  isAutomaticTextCaptureSupported,
  getTextCaptureStatus,
  isUosRelease,
  parseOsRelease,
  commandExists
} = require('../src/main/platform-info');

test('identifies Linux ARM64 targets using Node arch names', () => {
  const info = getPlatformInfo({ platform: 'linux', arch: 'arm64' });

  assert.equal(info.platform, 'linux');
  assert.equal(info.arch, 'arm64');
  assert.equal(info.isLinux, true);
  assert.equal(info.isLinuxArm64, true);
  assert.equal(info.runtimeMachineHint, 'aarch64');
});

test('automatic text capture is Windows-only for the first Linux build', () => {
  assert.equal(isAutomaticTextCaptureSupported({ platform: 'win32' }), true);
  assert.equal(isAutomaticTextCaptureSupported({ platform: 'linux' }), false);
});

// parseOsRelease tests
test('parseOsRelease parses standard os-release format', () => {
  const content = `ID=uos
NAME="UnionTech OS"
VERSION="20"
PRETTY_NAME="UnionTech OS 20"`;

  const result = parseOsRelease(content);
  assert.equal(result.ID, 'uos');
  assert.equal(result.NAME, 'UnionTech OS');
  assert.equal(result.VERSION, '20');
  assert.equal(result.PRETTY_NAME, 'UnionTech OS 20');
});

test('parseOsRelease handles empty content', () => {
  const result = parseOsRelease('');
  assert.deepEqual(result, {});
});

test('parseOsRelease handles null/undefined content', () => {
  const result = parseOsRelease(null);
  assert.deepEqual(result, {});
});

test('parseOsRelease handles single-quoted values', () => {
  const content = `ID='uos'`;
  const result = parseOsRelease(content);
  assert.equal(result.ID, 'uos');
});

test('parseOsRelease ignores comments and empty lines', () => {
  const content = `# This is a comment
ID=uos

NAME="UOS"`;
  const result = parseOsRelease(content);
  assert.equal(result.ID, 'uos');
  assert.equal(result.NAME, 'UOS');
  assert.equal(Object.keys(result).length, 2);
});

// isUosRelease tests
test('isUosRelease returns true for UOS ID', () => {
  const mockFs = {
    readFileSync: () => 'ID=uos\nNAME="UnionTech OS"'
  };
  assert.equal(isUosRelease('/etc/os-release', mockFs), true);
});

test('isUosRelease returns true for Deepin ID', () => {
  const mockFs = {
    readFileSync: () => 'ID=deepin\nNAME="Deepin"'
  };
  assert.equal(isUosRelease('/etc/os-release', mockFs), true);
});

test('isUosRelease returns true for UOS in NAME', () => {
  const mockFs = {
    readFileSync: () => 'ID=custom\nNAME="Custom UOS Distribution"'
  };
  assert.equal(isUosRelease('/etc/os-release', mockFs), true);
});

test('isUosRelease returns true for Deepin in PRETTY_NAME', () => {
  const mockFs = {
    readFileSync: () => 'ID=custom\nPRETTY_NAME="Deepin Linux"'
  };
  assert.equal(isUosRelease('/etc/os-release', mockFs), true);
});

test('isUosRelease returns false for non-UOS distro', () => {
  const mockFs = {
    readFileSync: () => 'ID=ubuntu\nNAME="Ubuntu"'
  };
  assert.equal(isUosRelease('/etc/os-release', mockFs), false);
});

test('isUosRelease returns false when file does not exist', () => {
  const mockFs = {
    readFileSync: () => { throw new Error('ENOENT'); }
  };
  assert.equal(isUosRelease('/etc/os-release', mockFs), false);
});

// commandExists tests
test('commandExists returns true when command is found', () => {
  const mockExec = () => {}; // Does not throw
  assert.equal(commandExists('xsel', mockExec), true);
});

test('commandExists returns false when command is not found', () => {
  const mockExec = () => { throw new Error('Command not found'); };
  assert.equal(commandExists('nonexistent', mockExec), false);
});

// getTextCaptureStatus tests
test('getTextCaptureStatus returns windows-uiohook for Windows', () => {
  const result = getTextCaptureStatus({ runtime: { platform: 'win32', arch: 'x64' } });
  assert.deepEqual(result, { supported: true, backend: 'windows-uiohook' });
});

test('getTextCaptureStatus returns windows-uiohook for Windows ARM64', () => {
  const result = getTextCaptureStatus({ runtime: { platform: 'win32', arch: 'arm64' } });
  assert.deepEqual(result, { supported: true, backend: 'windows-uiohook' });
});

test('getTextCaptureStatus rejects Wayland with reason wayland-unsupported', () => {
  const mockFs = {
    readFileSync: () => 'ID=uos\nNAME="UOS"'
  };
  const mockExec = () => {}; // Commands exist

  const result = getTextCaptureStatus({
    runtime: { platform: 'linux', arch: 'arm64' },
    execFn: mockExec,
    fsModule: mockFs,
    env: { XDG_SESSION_TYPE: 'wayland' }
  });

  assert.deepEqual(result, { supported: false, reason: 'wayland-unsupported' });
});

test('getTextCaptureStatus rejects non-UOS Linux ARM64 with reason not-uos-arm64', () => {
  const mockFs = {
    readFileSync: () => 'ID=ubuntu\nNAME="Ubuntu"'
  };

  const result = getTextCaptureStatus({
    runtime: { platform: 'linux', arch: 'arm64' },
    fsModule: mockFs,
    env: {}
  });

  assert.deepEqual(result, { supported: false, reason: 'not-uos-arm64' });
});

test('getTextCaptureStatus rejects non-ARM64 Linux with reason not-uos-arm64', () => {
  const result = getTextCaptureStatus({
    runtime: { platform: 'linux', arch: 'x64' },
    env: {}
  });

  assert.deepEqual(result, { supported: false, reason: 'not-uos-arm64' });
});

test('getTextCaptureStatus reports missing dependencies by name', () => {
  const mockFs = {
    readFileSync: () => 'ID=uos\nNAME="UOS"'
  };
  const mockExec = (cmd) => {
    if (cmd.includes('xsel')) throw new Error('Not found');
    // xdotool exists
  };

  const result = getTextCaptureStatus({
    runtime: { platform: 'linux', arch: 'arm64' },
    execFn: mockExec,
    fsModule: mockFs,
    env: { XDG_SESSION_TYPE: 'x11' }
  });

  assert.equal(result.supported, false);
  assert.equal(result.reason, 'missing-dependencies');
  assert.deepEqual(result.missing, ['xsel']);
});

test('getTextCaptureStatus reports multiple missing dependencies', () => {
  const mockFs = {
    readFileSync: () => 'ID=uos\nNAME="UOS"'
  };
  const mockExec = () => { throw new Error('Not found'); };

  const result = getTextCaptureStatus({
    runtime: { platform: 'linux', arch: 'arm64' },
    execFn: mockExec,
    fsModule: mockFs,
    env: { XDG_SESSION_TYPE: 'x11' }
  });

  assert.equal(result.supported, false);
  assert.equal(result.reason, 'missing-dependencies');
  assert.deepEqual(result.missing.sort(), ['xsel', 'xdotool'].sort());
});

test('getTextCaptureStatus returns uos-x11 for valid UOS ARM64 X11 setup', () => {
  const mockFs = {
    readFileSync: () => 'ID=uos\nNAME="UnionTech OS"'
  };
  const mockExec = () => {}; // All commands exist

  const result = getTextCaptureStatus({
    runtime: { platform: 'linux', arch: 'arm64' },
    execFn: mockExec,
    fsModule: mockFs,
    env: { XDG_SESSION_TYPE: 'x11' }
  });

  assert.deepEqual(result, { supported: true, backend: 'uos-x11' });
});

test('getTextCaptureStatus works without XDG_SESSION_TYPE (defaults to X11)', () => {
  const mockFs = {
    readFileSync: () => 'ID=deepin\nNAME="Deepin"'
  };
  const mockExec = () => {};

  const result = getTextCaptureStatus({
    runtime: { platform: 'linux', arch: 'arm64' },
    execFn: mockExec,
    fsModule: mockFs,
    env: {} // No XDG_SESSION_TYPE
  });

  assert.deepEqual(result, { supported: true, backend: 'uos-x11' });
});

test('getTextCaptureStatus returns unsupported-platform for other platforms', () => {
  const result = getTextCaptureStatus({
    runtime: { platform: 'darwin', arch: 'arm64' },
    env: {}
  });

  assert.deepEqual(result, { supported: false, reason: 'unsupported-platform' });
});
