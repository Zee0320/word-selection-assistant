const test = require('node:test');
const assert = require('node:assert/strict');

const { renderMarkdownToHtml, initMarkedRenderer } = require('../src/main/markdown-renderer');

// Initialize marked before running tests
test.before(async () => {
  await initMarkedRenderer();
});

test('renders the supported CommonMark and GFM subset', () => {
  const md = [
    '# Heading 1',
    '## Heading 2',
    '### Heading 3',
    '',
    'Paragraph with **bold** and *italic* and `inline code`.',
    '',
    '> Blockquote text',
    '',
    '- List item one',
    '- List item two',
    '',
    '1. Ordered item',
    '2. Second item',
    '',
    '```python',
    'def hello():',
    '    print("world")',
    '```',
    '',
    '| Col A | Col B |',
    '|-------|-------|',
    '| val1  | val2  |',
    '',
    '[Link](https://example.com) and an image: ![alt](img.png)',
    '',
    'Horizontal rule:',
    '',
    '---',
    '',
    'Strikethrough: ~~deleted~~'
  ].join('\n');

  const html = renderMarkdownToHtml(md);

  // Headings
  assert.match(html, /<h1[^>]*>Heading 1<\/h1>/);
  assert.match(html, /<h2[^>]*>Heading 2<\/h2>/);
  assert.match(html, /<h3[^>]*>Heading 3<\/h3>/);

  // Emphasis
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>inline code<\/code>/);

  // Blockquote
  assert.match(html, /<blockquote>\s*<p>Blockquote text<\/p>\s*<\/blockquote>/);

  // Unordered list
  assert.match(html, /<ul>/);
  assert.match(html, /<li>List item one<\/li>/);

  // Ordered list
  assert.match(html, /<ol>/);
  assert.match(html, /<li>Ordered item<\/li>/);

  // Fenced code block with language
  assert.match(html, /<pre><code class="language-python">/);
  assert.match(html, /print\(&quot;world&quot;\)/);

  // GFM table
  assert.match(html, /<table>/);
  assert.match(html, /<th[^>]*>Col A<\/th>/);
  assert.match(html, /<td>val1<\/td>/);

  // Links and images
  assert.match(html, /<a href="https:\/\/example\.com">Link<\/a>/);
  assert.match(html, /<img src="img\.png" alt="alt"/);

  // Horizontal rule
  assert.match(html, /<hr\s*\/?>/);

  // GFM strikethrough
  assert.match(html, /<del>deleted<\/del>/);
});

test('renders fenced code blocks, tables, nested lists, links, and emphasis', () => {
  const html = renderMarkdownToHtml([
    '## Result',
    '',
    '```js',
    'console.log("ok");',
    '```',
    '',
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | 1 |',
    '',
    '- Parent',
    '  - Child',
    '',
    '[Docs](https://example.com) has **bold** and *italic* text.'
  ].join('\n'));

  assert.match(html, /<h2[^>]*>Result<\/h2>/);
  assert.match(html, /<pre><code class="language-js">console\.log\(&quot;ok&quot;\);\n<\/code><\/pre>/);
  assert.match(html, /<table>/);
  assert.match(html, /<th>Name<\/th>/);
  assert.match(html, /<td>Alpha<\/td>/);
  assert.match(html, /<ul>\s*<li>Parent\s*<ul>\s*<li>Child<\/li>\s*<\/ul>\s*<\/li>\s*<\/ul>/);
  assert.match(html, /<a href="https:\/\/example\.com">Docs<\/a>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
});

test('escapes raw HTML so script tags and event handlers are not executable', () => {
  const html = renderMarkdownToHtml('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');

  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('renders final accumulated streamed Markdown split across incomplete chunks', () => {
  // Simulates streaming where chunks may split syntax mid-way:
  // - Code fence split: '```js\ncon' + 'sole...'
  // - Table split across header and body
  // - Link text split: '[Open' + 'AI]'
  const chunks = [
    '```js\ncon',          // Code fence opened, code content incomplete
    'sole.log(1)\n```\n\n', // Code fence closed
    '| A | B |\n| - | - |\n', // Table header split before body
    '| one | two |\n\n',    // Table body
    '[Open',                // Link text incomplete
    'AI](https://openai.com)' // Link completed
  ];

  const html = renderMarkdownToHtml(chunks.join(''));

  assert.match(html, /<pre><code class="language-js">console\.log\(1\)\n<\/code><\/pre>/);
  assert.match(html, /<table>/);
  assert.match(html, /<td>one<\/td>/);
  assert.match(html, /<a href="https:\/\/openai\.com">OpenAI<\/a>/);
});

test('handles incomplete markdown syntax that spans chunk boundaries', () => {
  // Test emphasis split across chunks
  const emphasisChunks = ['This is **bo', 'ld** text'];
  const emphasisHtml = renderMarkdownToHtml(emphasisChunks.join(''));
  assert.match(emphasisHtml, /<strong>bold<\/strong>/);

  // Test inline code split across chunks
  const codeChunks = ['Use `foo', 'bar` for that'];
  const codeHtml = renderMarkdownToHtml(codeChunks.join(''));
  assert.match(codeHtml, /<code>foobar<\/code>/);

  // Test strikethrough split across chunks
  const strikeChunks = ['~~del', 'eted~~'];
  const strikeHtml = renderMarkdownToHtml(strikeChunks.join(''));
  assert.match(strikeHtml, /<del>deleted<\/del>/);
});
