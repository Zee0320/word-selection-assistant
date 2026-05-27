async function readSelectedTextWithFallback({
  readViaUIAutomation,
  readViaClipboardFallback,
  allowClipboardFallback = true
}) {
  const uiAutomationText = (await readViaUIAutomation()).trim();
  if (uiAutomationText) {
    return uiAutomationText;
  }
  if (!allowClipboardFallback) {
    return '';
  }
  return (await readViaClipboardFallback()).trim();
}

module.exports = { readSelectedTextWithFallback };
