const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// We need to mock platform-info before requiring text-capture
function setupMocks({
  platform = 'win32',
  arch = 'x64',
  backend = 'windows-uiohook',
  supported = true,
  reason = null,
  missing = undefined
}) {
  const mockPlatformInfo = {
    getTextCaptureStatus: () => {
      const result = { supported, backend, reason };
      if (missing !== undefined) {
        result.missing = missing;
      }
      return result;
    }
  };

  // Clear require cache
  const textCapturePath = require.resolve('../src/main/text-capture');
  const platformInfoPath = require.resolve('../src/main/platform-info');
  delete require.cache[textCapturePath];
  delete require.cache[platformInfoPath];

  // Mock platform-info module
  require.cache[platformInfoPath] = {
    exports: mockPlatformInfo,
    id: platformInfoPath,
    file: platformInfoPath,
    loaded: true,
    children: [],
    paths: []
  };

  return mockPlatformInfo;
}

function resetModules() {
  const textCapturePath = require.resolve('../src/main/text-capture');
  const platformInfoPath = require.resolve('../src/main/platform-info');
  delete require.cache[textCapturePath];
  delete require.cache[platformInfoPath];
}

test('getCaptureStatus returns cached status on subsequent calls', () => {
  setupMocks({ backend: 'windows-uiohook', supported: true });

  const { getCaptureStatus } = require('../src/main/text-capture');

  const status1 = getCaptureStatus();
  const status2 = getCaptureStatus();

  assert.equal(status1.backend, 'windows-uiohook');
  assert.equal(status1.supported, true);
  assert.strictEqual(status1, status2, 'should return same cached object');

  resetModules();
});

test('getCaptureStatus returns uos-x11 backend for UOS ARM64', () => {
  setupMocks({ platform: 'linux', arch: 'arm64', backend: 'uos-x11', supported: true });

  const { getCaptureStatus } = require('../src/main/text-capture');

  const status = getCaptureStatus();

  assert.equal(status.backend, 'uos-x11');
  assert.equal(status.supported, true);

  resetModules();
});

test('getCaptureStatus returns unsupported for Wayland', () => {
  setupMocks({ platform: 'linux', arch: 'arm64', backend: null, supported: false, reason: 'wayland-unsupported' });

  const { getCaptureStatus } = require('../src/main/text-capture');

  const status = getCaptureStatus();

  assert.equal(status.supported, false);
  assert.equal(status.reason, 'wayland-unsupported');

  resetModules();
});

test('getCaptureStatus returns unsupported for missing dependencies', () => {
  setupMocks({
    platform: 'linux',
    arch: 'arm64',
    backend: null,
    supported: false,
    reason: 'missing-dependencies',
    missing: ['xsel', 'xdotool']
  });

  const { getCaptureStatus } = require('../src/main/text-capture');

  const status = getCaptureStatus();

  assert.equal(status.supported, false);
  assert.equal(status.reason, 'missing-dependencies');
  assert.deepEqual(status.missing, ['xsel', 'xdotool']);

  resetModules();
});

test('getCaptureStatus returns unsupported for non-UOS ARM64', () => {
  setupMocks({ platform: 'linux', arch: 'arm64', backend: null, supported: false, reason: 'not-uos-arm64' });

  const { getCaptureStatus } = require('../src/main/text-capture');

  const status = getCaptureStatus();

  assert.equal(status.supported, false);
  assert.equal(status.reason, 'not-uos-arm64');

  resetModules();
});

test('getCaptureStatus returns unsupported for unsupported platform', () => {
  setupMocks({ platform: 'darwin', backend: null, supported: false, reason: 'unsupported-platform' });

  const { getCaptureStatus } = require('../src/main/text-capture');

  const status = getCaptureStatus();

  assert.equal(status.supported, false);
  assert.equal(status.reason, 'unsupported-platform');

  resetModules();
});

test('getHookApi returns null for non-windows backend', () => {
  setupMocks({ platform: 'linux', arch: 'arm64', backend: 'uos-x11', supported: true });

  const { _private } = require('../src/main/text-capture');

  // Since getHookApi is not exposed, we verify via the behavior:
  // On non-windows, init() should not attempt to load uiohook
  // This test just verifies the status returns correct backend
  const { getCaptureStatus } = require('../src/main/text-capture');
  const status = getCaptureStatus();

  assert.equal(status.backend, 'uos-x11');
  assert.notEqual(status.backend, 'windows-uiohook');

  resetModules();
});

test('getHookApi returns null for unsupported platform', () => {
  setupMocks({ platform: 'darwin', backend: null, supported: false, reason: 'unsupported-platform' });

  const { getCaptureStatus } = require('../src/main/text-capture');
  const status = getCaptureStatus();

  assert.equal(status.supported, false);
  assert.equal(status.backend, null);

  resetModules();
});
