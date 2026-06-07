const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPlatformInfo,
  isAutomaticTextCaptureSupported
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
