function hasCustomHeaders(headers) {
  return !!headers && typeof headers === 'object' && Object.keys(headers).length > 0;
}

function inferConnectionMode(settings) {
  if ((settings.apiRequestPath || '').trim() ||
      hasCustomHeaders(settings.customHeaders) ||
      hasCustomHeaders(settings.translateHeaders) ||
      hasCustomHeaders(settings.chatHeaders)) {
    return 'gateway';
  }
  return 'direct';
}

module.exports = { inferConnectionMode };
