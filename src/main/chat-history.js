const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES_PER_CONVERSATION = 200;

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function deriveTitle(content) {
  const cleaned = String(content || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '新会话';
  return cleaned.length > 32 ? `${cleaned.slice(0, 32)}...` : cleaned;
}

function normalizeMessage(message) {
  return {
    id: message.id || createId('msg'),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: String(message.content || ''),
    createdAt: message.createdAt || nowIso()
  };
}

function normalizeConversation(conversation) {
  const createdAt = conversation.createdAt || nowIso();
  const messages = Array.isArray(conversation.messages)
    ? conversation.messages.map(normalizeMessage).slice(-MAX_MESSAGES_PER_CONVERSATION)
    : [];

  return {
    id: conversation.id || createId('conv'),
    title: conversation.title || deriveTitle(messages.find(msg => msg.role === 'user')?.content),
    createdAt,
    updatedAt: conversation.updatedAt || createdAt,
    messages
  };
}

function sortConversations(conversations) {
  return conversations
    .map(normalizeConversation)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, MAX_CONVERSATIONS);
}

function createConversation(messageContent = '') {
  const timestamp = nowIso();
  const messages = messageContent
    ? [normalizeMessage({ role: 'user', content: messageContent, createdAt: timestamp })]
    : [];

  return {
    id: createId('conv'),
    title: messageContent ? deriveTitle(messageContent) : '新会话',
    createdAt: timestamp,
    updatedAt: timestamp,
    messages
  };
}

function appendMessages(conversation, messages) {
  const timestamp = nowIso();
  const nextMessages = [
    ...(Array.isArray(conversation.messages) ? conversation.messages.map(normalizeMessage) : []),
    ...messages.map(normalizeMessage)
  ].slice(-MAX_MESSAGES_PER_CONVERSATION);
  const firstUser = nextMessages.find(msg => msg.role === 'user');
  const title = !conversation.title || conversation.title === '新会话'
    ? deriveTitle(firstUser?.content)
    : conversation.title;

  return {
    ...normalizeConversation(conversation),
    title,
    messages: nextMessages,
    updatedAt: timestamp
  };
}

function upsertConversation(conversations, conversation) {
  const normalized = normalizeConversation(conversation);
  const others = sortConversations(conversations).filter(item => item.id !== normalized.id);
  return sortConversations([normalized, ...others]);
}

function deleteConversation(conversations, conversationId) {
  return sortConversations(conversations).filter(item => item.id !== conversationId);
}

function resolveActiveConversation(conversations, activeConversationId, restoreLastConversation) {
  const sorted = sortConversations(conversations);
  if (!restoreLastConversation) return '';
  if (activeConversationId && sorted.some(item => item.id === activeConversationId)) {
    return activeConversationId;
  }
  return sorted[0]?.id || '';
}

function applyHistoryUpdate(options) {
  const conversations = sortConversations(options.conversations || []);
  const activeConversationId = options.activeConversationId || '';

  if (options.saveHistory === false) {
    return {
      persistentConversations: sortConversations(options.persistentConversations || []),
      persistentActiveConversationId: options.persistentActiveConversationId || '',
      transientConversations: conversations,
      transientActiveConversationId: activeConversationId
    };
  }

  return {
    persistentConversations: conversations,
    persistentActiveConversationId: activeConversationId,
    transientConversations: sortConversations(options.transientConversations || []),
    transientActiveConversationId: options.transientActiveConversationId || ''
  };
}

module.exports = {
  appendMessages,
  applyHistoryUpdate,
  createConversation,
  deleteConversation,
  deriveTitle,
  normalizeConversation,
  resolveActiveConversation,
  sortConversations,
  upsertConversation
};
