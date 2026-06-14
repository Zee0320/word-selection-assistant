const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendMessages,
  applyHistoryUpdate,
  createConversation,
  deleteConversation,
  deriveTitle,
  getConversationSelectedContext,
  resolveActiveConversation,
  sortConversations,
  upsertConversation
} = require('../src/main/chat-history');

test('creates conversations and derives readable titles from first user message', () => {
  const conversation = createConversation('Summarize this internal deployment note for me');

  assert.equal(conversation.messages.length, 1);
  assert.equal(conversation.messages[0].role, 'user');
  assert.equal(conversation.title, 'Summarize this internal deployme...');
});

test('appends messages and preserves an existing title', () => {
  const conversation = createConversation('Original question');
  const updated = appendMessages(conversation, [
    { role: 'assistant', content: 'Answer' }
  ]);

  assert.equal(updated.title, 'Original question');
  assert.equal(updated.messages.length, 2);
  assert.equal(updated.messages[1].role, 'assistant');
});

test('upserts and orders conversations by most recent update', () => {
  const older = {
    ...createConversation('Older'),
    id: 'older',
    updatedAt: '2026-05-25T00:00:00.000Z'
  };
  const newer = {
    ...createConversation('Newer'),
    id: 'newer',
    updatedAt: '2026-05-26T00:00:00.000Z'
  };

  assert.deepEqual(sortConversations([older, newer]).map(item => item.id), ['newer', 'older']);

  const replacement = { ...older, title: 'Updated older', updatedAt: '2026-05-27T00:00:00.000Z' };
  const upserted = upsertConversation([older, newer], replacement);

  assert.deepEqual(upserted.map(item => item.id), ['older', 'newer']);
  assert.equal(upserted[0].title, 'Updated older');
});

test('deletes conversations and resolves the active conversation fallback', () => {
  const first = { ...createConversation('First'), id: 'first', updatedAt: '2026-05-26T00:00:00.000Z' };
  const second = { ...createConversation('Second'), id: 'second', updatedAt: '2026-05-25T00:00:00.000Z' };
  const remaining = deleteConversation([first, second], 'first');

  assert.deepEqual(remaining.map(item => item.id), ['second']);
  assert.equal(resolveActiveConversation(remaining, 'first', true), 'second');
  assert.equal(resolveActiveConversation(remaining, 'second', false), '');
});

test('history-disabled updates keep persistent history untouched', () => {
  const persistent = [{ ...createConversation('Saved'), id: 'saved' }];
  const transient = [{ ...createConversation('Draft'), id: 'draft' }];
  const next = [{ ...createConversation('Unsaved'), id: 'unsaved' }];

  const result = applyHistoryUpdate({
    saveHistory: false,
    persistentConversations: persistent,
    persistentActiveConversationId: 'saved',
    transientConversations: transient,
    transientActiveConversationId: 'draft',
    conversations: next,
    activeConversationId: 'unsaved'
  });

  assert.deepEqual(result.persistentConversations.map(item => item.id), ['saved']);
  assert.equal(result.persistentActiveConversationId, 'saved');
  assert.deepEqual(result.transientConversations.map(item => item.id), ['unsaved']);
  assert.equal(result.transientActiveConversationId, 'unsaved');
});

test('restore-last-conversation setting controls active conversation selection', () => {
  const conversations = [
    { ...createConversation('Recent'), id: 'recent', updatedAt: '2026-05-26T00:00:00.000Z' },
    { ...createConversation('Older'), id: 'older', updatedAt: '2026-05-25T00:00:00.000Z' }
  ];

  assert.equal(resolveActiveConversation(conversations, 'older', true), 'older');
  assert.equal(resolveActiveConversation(conversations, '', true), 'recent');
  assert.equal(resolveActiveConversation(conversations, 'older', false), '');
});

test('deriveTitle handles empty input', () => {
  assert.equal(deriveTitle('   '), '新会话');
});

test('normalizes selected context metadata without creating a chat message', () => {
  const conversation = createConversation('Explain the selected code', {
    metadata: {
      selectedContext: '  const value = 1;  ',
      source: 'floating'
    }
  });

  assert.equal(conversation.metadata.selectedContext, 'const value = 1;');
  assert.equal(conversation.metadata.source, 'floating');
  assert.equal(conversation.messages.length, 1);
  assert.equal(conversation.messages[0].content, 'Explain the selected code');
});

test('upsert and append preserve conversation metadata', () => {
  const conversation = createConversation('Question', {
    metadata: {
      selectedContext: 'Selected paragraph',
      source: 'floating'
    }
  });
  const appended = appendMessages(conversation, [
    { role: 'assistant', content: 'Answer' }
  ]);
  const upserted = upsertConversation([], appended);

  assert.equal(appended.metadata.selectedContext, 'Selected paragraph');
  assert.equal(upserted[0].metadata.selectedContext, 'Selected paragraph');
  assert.equal(getConversationSelectedContext(upserted[0]), 'Selected paragraph');
});

test('floating conversations use source metadata and normal chat messages', () => {
  const conversation = createConversation('What does this mean?', {
    metadata: {
      selectedContext: 'Selected API response',
      source: 'floating'
    }
  });
  const updated = appendMessages(conversation, [
    { role: 'assistant', content: 'It means the request succeeded.' }
  ]);

  assert.deepEqual(updated.messages.map(message => message.role), ['user', 'assistant']);
  assert.deepEqual(updated.messages.map(message => message.content), [
    'What does this mean?',
    'It means the request succeeded.'
  ]);
  assert.equal(updated.metadata.selectedContext, 'Selected API response');
  assert.equal(updated.metadata.source, 'floating');
});
