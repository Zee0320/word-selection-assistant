let settings = {};
let conversations = [];
let activeConversationId = '';
let saveHistory = true;
let isStreaming = false;
let streamingConversationId = '';
let streamingText = '';

const conversationList = document.getElementById('conversation-list');
const historyState = document.getElementById('history-state');
const conversationTitle = document.getElementById('conversation-title');
const conversationMeta = document.getElementById('conversation-meta');
const messagesEl = document.getElementById('messages');
const newChatBtn = document.getElementById('new-chat');
const deleteChatBtn = document.getElementById('delete-chat');
const composer = document.getElementById('composer');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-chat');
const errorBanner = document.getElementById('error-banner');

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function deriveTitle(content) {
  const text = String(content || '').replace(/\s+/g, ' ').trim();
  if (!text) return '新会话';
  return text.length > 32 ? `${text.slice(0, 32)}...` : text;
}

function getActiveConversation() {
  return conversations.find(item => item.id === activeConversationId) || null;
}

function createLocalConversation() {
  const timestamp = nowIso();
  return {
    id: createId('conv'),
    title: '新会话',
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: []
  };
}

function sortConversations() {
  conversations.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function upsertLocalConversation(conversation) {
  const index = conversations.findIndex(item => item.id === conversation.id);
  if (index >= 0) {
    conversations[index] = conversation;
  } else {
    conversations.unshift(conversation);
  }
  sortConversations();
}

function isApiConfiguredForChat() {
  const isGateway = settings.connectionMode === 'gateway';
  if (!settings.apiBaseUrl) return false;
  if (!isGateway && !settings.apiKey) return false;
  return !!settings.chatModel;
}

function missingConfigMessage() {
  const isGateway = settings.connectionMode === 'gateway';
  if (!settings.apiBaseUrl) return isGateway ? '请先配置 Gateway 地址。' : '请先配置 API 地址。';
  if (!isGateway && !settings.apiKey) return '请先配置 API Key。';
  if (!settings.chatModel) return '请先配置对话模型。';
  return '请先完善 AI 对话配置。';
}

async function load() {
  settings = await window.api.getSettings();
  const state = await window.api.getChatState();
  applyState(state);

  if (!activeConversationId) {
    const conversation = createLocalConversation();
    conversations = [conversation, ...conversations];
    activeConversationId = conversation.id;
  }

  render();
  focusInput();
}

function applyState(state) {
  saveHistory = state.saveHistory !== false;
  conversations = Array.isArray(state.conversations) ? state.conversations : [];
  activeConversationId = state.activeConversationId || conversations[0]?.id || '';
}

function render() {
  renderHistory();
  renderMessages();
  updateControls();
}

function renderHistory() {
  historyState.textContent = saveHistory ? '本地历史已开启' : '当前会话不保存';
  conversationList.replaceChildren();

  if (!conversations.length) {
    const empty = document.createElement('div');
    empty.className = 'conversation-time';
    empty.textContent = '暂无历史会话';
    conversationList.appendChild(empty);
    return;
  }

  conversations.forEach(conversation => {
    const item = document.createElement('div');
    item.className = `conversation-item${conversation.id === activeConversationId ? ' active' : ''}`;

    const main = document.createElement('div');
    main.className = 'conversation-main';
    main.addEventListener('click', () => selectConversation(conversation.id));

    const title = document.createElement('div');
    title.className = 'conversation-title';
    title.textContent = conversation.title || '新会话';

    const time = document.createElement('div');
    time.className = 'conversation-time';
    time.textContent = formatTime(conversation.updatedAt);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-small';
    remove.title = '删除会话';
    remove.textContent = 'x';
    remove.disabled = isStreaming && conversation.id === streamingConversationId;
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteConversation(conversation.id);
    });

    main.append(title, time);
    item.append(main, remove);
    conversationList.appendChild(item);
  });
}

function renderMessages() {
  const conversation = getActiveConversation();
  conversationTitle.textContent = conversation?.title || '新会话';
  const isActiveStreaming = conversation?.id === streamingConversationId;
  const messageCount = conversation?.messages?.length || 0;
  conversationMeta.textContent = isActiveStreaming
    ? `${messageCount} 条消息 - 正在回复`
    : (messageCount ? `${messageCount} 条消息` : '就绪');
  messagesEl.replaceChildren();

  if (!conversation || (!conversation.messages.length && !isActiveStreaming)) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div><strong>开始新会话</strong><br>向内网模型提问。</div>';
    messagesEl.appendChild(empty);
    return;
  }

  conversation.messages.forEach(message => {
    messagesEl.appendChild(renderMessage(message.role, message.content));
  });
  if (isActiveStreaming) {
    messagesEl.appendChild(renderStreamingMessage(streamingText));
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMessage(role, content) {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  el.setAttribute('data-raw', content || '');
  el.innerHTML = window.api.parseMarkdown(content || '');
  return el;
}

function updateControls() {
  const isActiveStreaming = isStreaming && activeConversationId === streamingConversationId;
  sendBtn.disabled = isStreaming;
  deleteChatBtn.disabled = isActiveStreaming || !getActiveConversation();
}

async function selectConversation(conversationId) {
  activeConversationId = conversationId;
  if (saveHistory) {
    const state = await window.api.selectConversation(conversationId);
    applyState(state);
  }
  render();
  focusInput();
}

async function newConversation() {
  if (isStreaming) return;
  hideError();
  if (saveHistory) {
    const state = await window.api.newConversation('');
    applyState(state);
  } else {
    const conversation = createLocalConversation();
    conversations.unshift(conversation);
    activeConversationId = conversation.id;
  }
  render();
  focusInput();
}

async function deleteConversation(conversationId) {
  if (isStreaming && conversationId === streamingConversationId) return;
  hideError();
  if (saveHistory) {
    const state = await window.api.deleteConversation(conversationId);
    applyState(state);
  } else {
    conversations = conversations.filter(item => item.id !== conversationId);
    activeConversationId = conversations[0]?.id || '';
  }

  if (!activeConversationId) {
    const conversation = createLocalConversation();
    conversations = [conversation, ...conversations];
    activeConversationId = conversation.id;
  }

  render();
  focusInput();
}

async function persistConversation(conversation) {
  upsertLocalConversation(conversation);
  activeConversationId = conversation.id;
  if (saveHistory) {
    const state = await window.api.saveConversation(conversation);
    applyState(state);
  }
  render();
}

async function sendMessage() {
  const content = chatInput.value.trim();
  if (!content || isStreaming) return;

  hideError();
  if (!isApiConfiguredForChat()) {
    showError(missingConfigMessage(), 'settings');
    return;
  }

  let conversation = getActiveConversation() || createLocalConversation();
  const timestamp = nowIso();
  const userMessage = {
    id: createId('msg'),
    role: 'user',
    content,
    createdAt: timestamp
  };
  const wasUntitled = !conversation.messages.length || conversation.title === '新会话';
  conversation = {
    ...conversation,
    title: wasUntitled ? deriveTitle(content) : conversation.title,
    updatedAt: timestamp,
    messages: [...(conversation.messages || []), userMessage]
  };

  chatInput.value = '';
  resizeInput();
  await persistConversation(conversation);

  isStreaming = true;
  streamingConversationId = conversation.id;
  streamingText = '';
  appendStreamingMessage();
  updateControls();

  const messages = conversation.messages.map(({ role, content }) => ({ role, content }));
  window.api.sendChat(conversation.id, messages);
}

function appendStreamingMessage() {
  if (activeConversationId !== streamingConversationId) return;
  const empty = messagesEl.querySelector('.empty-state');
  if (empty) empty.remove();
  messagesEl.appendChild(renderStreamingMessage(streamingText));
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderStreamingMessage(content) {
  const el = renderMessage('assistant', content || '');
  el.classList.add('streaming');
  return el;
}

function updateStreamingMessage(chunk) {
  streamingText += chunk;
  if (activeConversationId !== streamingConversationId) return;
  const el = messagesEl.querySelector('.message.streaming');
  if (!el) return;
  el.setAttribute('data-raw', streamingText);
  el.innerHTML = window.api.parseMarkdown(streamingText);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function finishStreaming(conversationId) {
  if (conversationId !== streamingConversationId) return;
  const viewedConversationId = activeConversationId;
  const conversation = conversations.find(item => item.id === conversationId);
  if (conversation && streamingText) {
    const assistantMessage = {
      id: createId('msg'),
      role: 'assistant',
      content: streamingText,
      createdAt: nowIso()
    };
    const updatedConversation = {
      ...conversation,
      updatedAt: assistantMessage.createdAt,
      messages: [...conversation.messages, assistantMessage]
    };
    if (viewedConversationId === conversationId) {
      await persistConversation(updatedConversation);
    } else {
      upsertLocalConversation(updatedConversation);
      if (saveHistory) {
        await window.api.saveConversation(updatedConversation);
        await window.api.selectConversation(viewedConversationId);
      }
      activeConversationId = viewedConversationId;
    }
  }
  isStreaming = false;
  streamingConversationId = '';
  streamingText = '';
  render();
  focusInput();
}

function failStreaming(conversationId, error) {
  if (conversationId !== streamingConversationId) return;
  isStreaming = false;
  streamingConversationId = '';
  streamingText = '';
  render();
  showError(error?.message || '请求失败，请稍后重试。', error?.action);
  focusInput();
}

function showError(message, action) {
  errorBanner.replaceChildren(document.createTextNode(message));
  if (action === 'settings') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '打开设置';
    button.addEventListener('click', () => window.api.openSettings());
    errorBanner.appendChild(button);
  }
  errorBanner.classList.remove('hidden');
}

function hideError() {
  errorBanner.textContent = '';
  errorBanner.classList.add('hidden');
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function resizeInput() {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 160)}px`;
}

function focusInput() {
  setTimeout(() => chatInput.focus(), 20);
}

newChatBtn.addEventListener('click', newConversation);
deleteChatBtn.addEventListener('click', () => {
  const conversation = getActiveConversation();
  if (conversation) deleteConversation(conversation.id);
});

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage();
});

chatInput.addEventListener('input', resizeInput);
chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

window.api.onChatChunk(({ conversationId, chunk }) => {
  if (conversationId === streamingConversationId) updateStreamingMessage(chunk);
});

window.api.onChatDone(({ conversationId }) => {
  finishStreaming(conversationId);
});

window.api.onChatError(({ conversationId, error }) => {
  failStreaming(conversationId, error);
});

window.api.onSettingsUpdated((updated) => {
  settings = updated;
});

load().catch(err => {
  showError(err.message || '加载 AI 对话失败。');
});
