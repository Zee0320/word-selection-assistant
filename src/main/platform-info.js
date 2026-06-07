function getPlatformInfo(runtime = process) {
  const platform = runtime.platform || process.platform;
  const arch = runtime.arch || process.arch;

  return {
    platform,
    arch,
    isWindows: platform === 'win32',
    isLinux: platform === 'linux',
    isLinuxArm64: platform === 'linux' && arch === 'arm64',
    runtimeMachineHint: platform === 'linux' && arch === 'arm64' ? 'aarch64' : arch
  };
}

function isAutomaticTextCaptureSupported(runtime = process) {
  return getPlatformInfo(runtime).isWindows;
}

module.exports = {
  getPlatformInfo,
  isAutomaticTextCaptureSupported
};
