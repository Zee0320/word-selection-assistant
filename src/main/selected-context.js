function normalizeClipboardText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function buildClipboardAiPrompt(text) {
  const normalized = normalizeClipboardText(text);
  if (!normalized) return '';

  return `请基于以下选中文本进行分析、总结或回答后续问题：\n\n${normalized}`;
}

module.exports = {
  buildClipboardAiPrompt,
  normalizeClipboardText
};
