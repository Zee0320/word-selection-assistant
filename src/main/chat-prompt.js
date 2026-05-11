function buildChatSystemMessage(selectedText) {
  const context = (selectedText || '').trim();
  if (!context) {
    return {
      role: 'system',
      content: 'You are a helpful assistant.'
    };
  }

  return {
    role: 'system',
    content: `You are a helpful assistant. The user has selected the following text as context:\n\n"${context}"\n\nHelp the user understand or discuss this text.`
  };
}

function buildChatMessages(selectedText, messages) {
  return [buildChatSystemMessage(selectedText), ...(messages || [])];
}

module.exports = { buildChatSystemMessage, buildChatMessages };
