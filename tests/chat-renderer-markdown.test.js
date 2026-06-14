const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function createMockElement(tagName) {
  const el = {
    tagName: tagName?.toUpperCase() || 'DIV',
    id: '',
    className: '',
    textContent: '',
    innerHTML: '',
    style: {},
    children: [],
    parentElement: null,
    attributes: {},
    classList: {
      _classes: new Set(),
      add(cls) { this._classes.add(cls); el.className = [...this._classes].join(' '); },
      remove(cls) { this._classes.delete(cls); el.className = [...this._classes].join(' '); },
      contains(cls) { return this._classes.has(cls); }
    },
    appendChild(child) {
      child.parentElement = el;
      el.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      el.children = children;
      children.forEach(c => c.parentElement = el);
    },
    addEventListener() {},
    remove() {
      if (el.parentElement) {
        el.parentElement.children = el.parentElement.children.filter(c => c !== el);
      }
    },
    querySelector(selector) {
      return el.children.find(c => c.classList?.contains?.(selector.replace('.', ''))) || null;
    },
    setAttribute(name, value) { el.attributes[name] = value; },
    getAttribute(name) { return el.attributes[name]; }
  };
  return el;
}

function createMockDocument() {
  const elements = {};
  return {
    getElementById: (id) => {
      if (!elements[id]) {
        elements[id] = createMockElement('div');
        elements[id].id = id;
      }
      return elements[id];
    },
    createElement: (tagName) => createMockElement(tagName),
    createTextNode: (text) => ({
      nodeValue: text,
      textContent: text
    })
  };
}

test('chat renderer uses parseMarkdown for stored messages', async () => {
  const parseMarkdownCalls = [];
  const mockParseMarkdown = (text) => {
    parseMarkdownCalls.push(text);
    return `<p>${text}</p>`;
  };

  const mockDocument = createMockDocument();

  // Create VM context with chat script globals
  const context = {
    window: {
      api: {
        getSettings: async () => ({ apiBaseUrl: 'https://test.api', apiKey: 'test', chatModel: 'gpt' }),
        getChatState: async () => ({ conversations: [], activeConversationId: '', saveHistory: false }),
        selectConversation: async () => ({ conversations: [], activeConversationId: '' }),
        newConversation: async () => ({ conversations: [], activeConversationId: '' }),
        deleteConversation: async () => ({ conversations: [], activeConversationId: '' }),
        saveConversation: async () => ({ conversations: [], activeConversationId: '' }),
        sendChat: () => {},
        onChatChunk: () => {},
        onChatDone: () => {},
        onChatError: () => {},
        onSettingsUpdated: () => {},
        onPrefillChatInput: () => {},
        openSettings: () => {},
        parseMarkdown: mockParseMarkdown,
        removeAllListeners: () => {}
      }
    },
    document: mockDocument,
    setTimeout: global.setTimeout,
    console
  };

  vm.createContext(context);

  // Load and execute the chat script in VM
  const fs = require('fs');
  const path = require('path');
  const scriptPath = path.join(__dirname, '..', 'src', 'renderer', 'chat', 'script.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

  vm.runInContext(scriptContent, context);

  // Wait for initial load to complete
  await new Promise(resolve => setTimeout(resolve, 50));

  // Access internal functions from context
  const { renderMessage, renderStreamingMessage } = context;

  // Test 1: renderMessage uses parseMarkdown
  const msgElement = renderMessage('assistant', 'Hello **world**');
  assert.equal(parseMarkdownCalls.length, 1, 'renderMessage should call parseMarkdown');
  assert.equal(parseMarkdownCalls[0], 'Hello **world**', 'renderMessage should pass raw content to parseMarkdown');
  assert.equal(msgElement.attributes['data-raw'], 'Hello **world**', 'data-raw should store raw content');

  // Clear calls
  parseMarkdownCalls.length = 0;

  // Test 2: renderStreamingMessage uses parseMarkdown
  const streamElement = renderStreamingMessage('Streaming **text**');
  assert.equal(parseMarkdownCalls.length, 1, 'renderStreamingMessage should call parseMarkdown');
  assert.equal(parseMarkdownCalls[0], 'Streaming **text**', 'renderStreamingMessage should pass content to parseMarkdown');
  assert.ok(streamElement.classList.contains('streaming'), 'Streaming element should have streaming class');
});

test('chat renderer stores raw text in message content', async () => {
  const parseMarkdownCalls = [];
  const mockParseMarkdown = (text) => {
    parseMarkdownCalls.push(text);
    return `<p>${text}</p>`;
  };

  const mockDocument = createMockDocument();

  const context = {
    window: {
      api: {
        getSettings: async () => ({ apiBaseUrl: 'https://test.api', apiKey: 'test', chatModel: 'gpt' }),
        getChatState: async () => ({ conversations: [], activeConversationId: '', saveHistory: false }),
        selectConversation: async () => ({ conversations: [], activeConversationId: '' }),
        newConversation: async () => ({ conversations: [], activeConversationId: '' }),
        deleteConversation: async () => ({ conversations: [], activeConversationId: '' }),
        saveConversation: async () => ({ conversations: [], activeConversationId: '' }),
        sendChat: () => {},
        onChatChunk: () => {},
        onChatDone: () => {},
        onChatError: () => {},
        onSettingsUpdated: () => {},
        onPrefillChatInput: () => {},
        openSettings: () => {},
        parseMarkdown: mockParseMarkdown,
        removeAllListeners: () => {}
      }
    },
    document: mockDocument,
    setTimeout: global.setTimeout,
    console
  };

  vm.createContext(context);

  const fs = require('fs');
  const path = require('path');
  const scriptPath = path.join(__dirname, '..', 'src', 'renderer', 'chat', 'script.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

  vm.runInContext(scriptContent, context);

  await new Promise(resolve => setTimeout(resolve, 50));

  const { renderMessage } = context;

  // Test with markdown content
  const markdownContent = '# Title\n\nParagraph with **bold** and `code`.';
  const element = renderMessage('assistant', markdownContent);

  // Verify raw content is stored in data-raw attribute
  assert.equal(element.attributes['data-raw'], markdownContent, 'data-raw should contain original markdown');

  // Verify parseMarkdown was called with raw content
  assert.equal(parseMarkdownCalls.length, 1);
  assert.equal(parseMarkdownCalls[0], markdownContent, 'parseMarkdown should receive raw markdown');

  // Verify innerHTML is the result of parseMarkdown
  assert.equal(element.innerHTML, `<p>${markdownContent}</p>`, 'innerHTML should be result of parseMarkdown');
});

test('chat renderer handles streaming with markdown code blocks', async () => {
  const parseMarkdownCalls = [];
  const mockParseMarkdown = (text) => {
    parseMarkdownCalls.push(text);
    // Simulate marked behavior for code blocks
    if (text.includes('```')) {
      return text.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    }
    return `<p>${text}</p>`;
  };

  const mockDocument = createMockDocument();

  const context = {
    window: {
      api: {
        getSettings: async () => ({ apiBaseUrl: 'https://test.api', apiKey: 'test', chatModel: 'gpt' }),
        getChatState: async () => ({ conversations: [], activeConversationId: '', saveHistory: false }),
        selectConversation: async () => ({ conversations: [], activeConversationId: '' }),
        newConversation: async () => ({ conversations: [], activeConversationId: '' }),
        deleteConversation: async () => ({ conversations: [], activeConversationId: '' }),
        saveConversation: async () => ({ conversations: [], activeConversationId: '' }),
        sendChat: () => {},
        onChatChunk: () => {},
        onChatDone: () => {},
        onChatError: () => {},
        onSettingsUpdated: () => {},
        onPrefillChatInput: () => {},
        openSettings: () => {},
        parseMarkdown: mockParseMarkdown,
        removeAllListeners: () => {}
      }
    },
    document: mockDocument,
    setTimeout: global.setTimeout,
    console
  };

  vm.createContext(context);

  const fs = require('fs');
  const path = require('path');
  const scriptPath = path.join(__dirname, '..', 'src', 'renderer', 'chat', 'script.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

  vm.runInContext(scriptContent, context);

  await new Promise(resolve => setTimeout(resolve, 50));

  const { renderStreamingMessage } = context;

  // Simulate streaming of a code block
  const chunks = ['```js\ncon', 'sole.log(1)\n```'];
  let streamedText = '';

  // Initial streaming message
  streamedText = chunks[0];
  let streamElement = renderStreamingMessage(streamedText);

  // Verify first chunk is rendered
  assert.equal(parseMarkdownCalls.length, 1, 'First chunk should call parseMarkdown');
  assert.equal(streamElement.attributes['data-raw'], streamedText, 'data-raw should store streamed text');

  // Continue streaming - simulate accumulating text
  streamedText += chunks[1];
  streamElement = renderStreamingMessage(streamedText);

  // Final rendered content
  assert.equal(parseMarkdownCalls[parseMarkdownCalls.length - 1], streamedText, 'Final content passed to parseMarkdown');
  assert.match(streamElement.innerHTML, /<pre><code/, 'Code block should be rendered');
});

test('chat renderer uses parseMarkdown for user messages', async () => {
  const parseMarkdownCalls = [];
  const mockParseMarkdown = (text) => {
    parseMarkdownCalls.push(text);
    return `<p>${text}</p>`;
  };

  const mockDocument = createMockDocument();

  const context = {
    window: {
      api: {
        getSettings: async () => ({ apiBaseUrl: 'https://test.api', apiKey: 'test', chatModel: 'gpt' }),
        getChatState: async () => ({ conversations: [], activeConversationId: '', saveHistory: false }),
        selectConversation: async () => ({ conversations: [], activeConversationId: '' }),
        newConversation: async () => ({ conversations: [], activeConversationId: '' }),
        deleteConversation: async () => ({ conversations: [], activeConversationId: '' }),
        saveConversation: async () => ({ conversations: [], activeConversationId: '' }),
        sendChat: () => {},
        onChatChunk: () => {},
        onChatDone: () => {},
        onChatError: () => {},
        onSettingsUpdated: () => {},
        onPrefillChatInput: () => {},
        openSettings: () => {},
        parseMarkdown: mockParseMarkdown,
        removeAllListeners: () => {}
      }
    },
    document: mockDocument,
    setTimeout: global.setTimeout,
    console
  };

  vm.createContext(context);

  const fs = require('fs');
  const path = require('path');
  const scriptPath = path.join(__dirname, '..', 'src', 'renderer', 'chat', 'script.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

  vm.runInContext(scriptContent, context);

  await new Promise(resolve => setTimeout(resolve, 50));

  const { renderMessage } = context;

  // Test with user message
  const userElement = renderMessage('user', 'How do I use **this** feature?');

  assert.equal(parseMarkdownCalls.length, 1, 'renderMessage should call parseMarkdown for user messages');
  assert.equal(userElement.className, 'message user', 'User message should have user class');
  assert.equal(userElement.attributes['data-raw'], 'How do I use **this** feature?', 'data-raw should store raw user content');
});
