const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

/**
 * Parse /etc/os-release file content
 * @param {string} content - Content of /etc/os-release
 * @returns {Object} Parsed key-value pairs
 */
function parseOsRelease(content) {
  const result = {};
  if (!content) return result;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex);
    let value = trimmed.slice(equalsIndex + 1);

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Check if the current system is a UOS release
 * Note: Scope is UOS only. Deepin is NOT accepted as UOS.
 * @param {string} osReleasePath - Path to os-release file
 * @param {Object} fsModule - File system module (for testing)
 * @returns {boolean}
 */
function isUosRelease(osReleasePath = '/etc/os-release', fsModule = fs) {
  try {
    const content = fsModule.readFileSync(osReleasePath, 'utf-8');
    const parsed = parseOsRelease(content);

    // Check for UOS identifiers (NOT Deepin - scope is UOS ARM64 only)
    const id = (parsed.ID || '').toLowerCase();
    const name = (parsed.NAME || '').toLowerCase();
    const prettyName = (parsed.PRETTY_NAME || '').toLowerCase();

    // Accept only UOS/UnionTech, NOT Deepin
    return id === 'uos' ||
           id === 'uniontech' ||
           id === 'uniontechos' ||
           name.includes('uniontech os') ||
           prettyName.includes('uniontech os') ||
           name.includes('uos') ||
           prettyName.includes('uos');
  } catch {
    return false;
  }
}

/**
 * Check if a command exists in PATH
 * @param {string} command - Command name to check
 * @param {Function} execFn - Exec function (for testing)
 * @returns {boolean}
 */
function commandExists(command, execFn = execSync) {
  try {
    execFn(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get detailed text capture support status
 * @param {Object} options - Options for detection
 * @param {Object} options.runtime - Runtime object with platform/arch
 * @param {Function} options.execFn - Exec function (for testing)
 * @param {Function} options.fsModule - File system module (for testing)
 * @param {Object} options.env - Environment variables (for testing)
 * @returns {Object} Status object with supported, backend, and reason fields
 */
function getTextCaptureStatus(options = {}) {
  const {
    runtime = process,
    execFn = execSync,
    fsModule = fs,
    env = process.env
  } = options;

  const platformInfo = getPlatformInfo(runtime);

  // Windows: Always supported via uiohook
  if (platformInfo.isWindows) {
    return { supported: true, backend: 'windows-uiohook' };
  }

  // Linux ARM64: Check for UOS X11 support
  if (platformInfo.isLinuxArm64) {
    // Check if UOS release first (NOT Deepin)
    if (!isUosRelease('/etc/os-release', fsModule)) {
      return { supported: false, reason: 'not-uos-arm64' };
    }

    // Check for explicit X11 session (do NOT default to X11)
    const sessionType = (env.XDG_SESSION_TYPE || '').toLowerCase();
    if (sessionType !== 'x11') {
      // Reject Wayland AND unknown/missing session type
      return { supported: false, reason: sessionType === 'wayland' ? 'wayland-unsupported' : 'x11-session-not-confirmed' };
    }

    // Check required dependencies: xinput, xdotool, xclip
    const missingDeps = [];
    const requiredCommands = ['xinput', 'xdotool', 'xclip'];

    for (const cmd of requiredCommands) {
      if (!commandExists(cmd, execFn)) {
        missingDeps.push(cmd);
      }
    }

    if (missingDeps.length > 0) {
      return {
        supported: false,
        reason: 'missing-dependencies',
        missing: missingDeps
      };
    }

    return { supported: true, backend: 'uos-x11' };
  }

  // Other Linux: Not supported
  if (platformInfo.isLinux) {
    return { supported: false, reason: 'not-uos-arm64' };
  }

  // Other platforms: Not supported
  return { supported: false, reason: 'unsupported-platform' };
}

function isAutomaticTextCaptureSupported(runtime = process) {
  return getPlatformInfo(runtime).isWindows;
}

module.exports = {
  getPlatformInfo,
  isAutomaticTextCaptureSupported,
  getTextCaptureStatus,
  isUosRelease,
  parseOsRelease,
  commandExists
};
