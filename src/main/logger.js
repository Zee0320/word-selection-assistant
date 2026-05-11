function isBrokenPipeError(error) {
  return error && (error.code === 'EPIPE' || /EPIPE|broken pipe/i.test(String(error.message)));
}

function ignoreBrokenPipe(stream) {
  if (!stream || typeof stream.on !== 'function') return;
  stream.on('error', (error) => {
    if (!isBrokenPipeError(error)) {
      throw error;
    }
  });
}

function installSafeConsole() {
  ignoreBrokenPipe(process.stdout);
  ignoreBrokenPipe(process.stderr);

  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      try {
        original(...args);
      } catch (error) {
        if (!isBrokenPipeError(error)) {
          throw error;
        }
      }
    };
  }
}

module.exports = { installSafeConsole };
