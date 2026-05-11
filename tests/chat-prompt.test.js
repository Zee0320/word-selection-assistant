const test = require('node:test');
const assert = require('node:assert/strict');

const { buildChatMessages, buildChatSystemMessage } = require('../src/main/chat-prompt');

test('buildChatSystemMessage includes non-empty selected text as context', () => {
  const message = buildChatSystemMessage('example text');

  assert.equal(message.role, 'system');
  assert.match(message.content, /selected the following text as context/);
  assert.match(message.content, /"example text"/);
});

test('buildChatSystemMessage trims selected text context', () => {
  const message = buildChatSystemMessage('  trimmed context  ');

  assert.match(message.content, /"trimmed context"/);
  assert.doesNotMatch(message.content, /"  trimmed context  "/);
});

test('buildChatSystemMessage uses generic assistant prompt without context', () => {
  assert.deepEqual(
    buildChatSystemMessage(''),
    { role: 'system', content: 'You are a helpful assistant.' }
  );

  assert.deepEqual(
    buildChatSystemMessage('   '),
    { role: 'system', content: 'You are a helpful assistant.' }
  );
});

test('buildChatMessages prepends system message and preserves conversation history', () => {
  const history = [
    { role: 'user', content: 'What does this mean?' },
    { role: 'assistant', content: 'It means...' }
  ];

  const messages = buildChatMessages('context', history);

  assert.equal(messages.length, 3);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1], history[0]);
  assert.equal(messages[2], history[1]);
});
