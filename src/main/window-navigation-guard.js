const { shell } = require('electron');

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function parseUrl(url) {
  try {
    return new URL(String(url || ''));
  } catch {
    return null;
  }
}

function isExternalUrl(url) {
  const parsed = parseUrl(url);
  return Boolean(parsed && EXTERNAL_PROTOCOLS.has(parsed.protocol));
}

function isSameDocumentFragmentNavigation(currentUrl, targetUrl) {
  const current = parseUrl(currentUrl);
  const target = parseUrl(targetUrl);
  if (!current || !target || !target.hash) return false;

  current.hash = '';
  target.hash = '';
  return current.href === target.href;
}

function openExternal(url) {
  shell.openExternal(url).catch(error => {
    console.error('[navigation-guard] Failed to open external URL:', error);
  });
}

function installNavigationGuard(webContents) {
  webContents.on('will-navigate', (event, url) => {
    if (isSameDocumentFragmentNavigation(webContents.getURL(), url)) {
      return;
    }

    event.preventDefault();
    if (isExternalUrl(url)) {
      openExternal(url);
    }
  });

  webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      openExternal(url);
    }
    return { action: 'deny' };
  });
}

module.exports = {
  installNavigationGuard,
  _private: {
    isExternalUrl,
    isSameDocumentFragmentNavigation
  }
};
