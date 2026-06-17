const test = require('node:test');
const assert = require('node:assert/strict');

const { renderMarkdownToHtml, initMarkedRenderer } = require('../src/main/markdown-renderer');

// Initialize marked before running tests
test.before(async () => {
  await initMarkedRenderer();
});

test('renders the supported CommonMark and GFM subset', () => {
  const html = renderMarkdownToHtml([
    '# H1',
    '## H2',
    '',
    'Paragraph with **bold**, *italic*, `inline code`, and [link](https://example.com).',
    '',
    '> quoted text',
    '',
    '- Parent',
    '  - Child',
    '',
    '1. First',
    '2. Second',
    '',
    '```js',
    'console.log("ok");',
    '```',
    '',
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | 1 |',
    '',
    '---'
  ].join('\n'));

  assert.match(html, /<h1[^>]*>H1<\/h1>/);
  assert.match(html, /<h2[^>]*>H2<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>inline code<\/code>/);
  assert.match(html, /<a href="https:\/\/example\.com">link<\/a>/);
  assert.match(html, /<blockquote>\s*<p>quoted text<\/p>\s*<\/blockquote>/);
  assert.match(html, /<ul>\s*<li>Parent\s*<ul>\s*<li>Child<\/li>\s*<\/ul>\s*<\/li>\s*<\/ul>/);
  assert.match(html, /<ol>\s*<li>First<\/li>\s*<li>Second<\/li>\s*<\/ol>/);
  assert.match(html, /<pre><code class="language-js">console\.log\(&quot;ok&quot;\);\n<\/code><\/pre>/);
  assert.match(html, /<table>/);
  assert.match(html, /<th>Name<\/th>/);
  assert.match(html, /<td>Alpha<\/td>/);
  assert.match(html, /<hr/);
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

test('allows safe markdown link protocols and relative links', () => {
  const html = renderMarkdownToHtml([
    '[https](https://example.com)',
    '[http](http://example.com)',
    '[mail](mailto:user@example.com)',
    '[relative](/docs/page)',
    '[fragment](#section)',
    '[protocol-relative](//example.com/path)'
  ].join('\n'));

  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /href="http:\/\/example\.com"/);
  assert.match(html, /href="mailto:user@example\.com"/);
  assert.match(html, /href="\/docs\/page"/);
  assert.match(html, /href="#section"/);
  assert.match(html, /href="\/\/example\.com\/path"/);
});

test('renders unsafe markdown links without clickable hrefs', () => {
  const html = renderMarkdownToHtml([
    '[js](javascript:alert(1))',
    '[mixed](JaVaScRiPt:alert(1))',
    '[data](data:text/html,<script>alert(1)</script>)',
    '[vb](vbscript:msgbox(1))',
    '[file](file:///C:/Windows/System32/calc.exe)'
  ].join('\n'));

  assert.doesNotMatch(html, /href=/i);
  assert.doesNotMatch(html, /javascript:|data:|vbscript:|file:/i);
  assert.match(html, />js</);
  assert.match(html, />mixed</);
  assert.match(html, />data</);
});

test('renders final accumulated streamed Markdown split across chunks', () => {
  const chunks = [
    '## Streamed',
    ' result\n\n```js\ncon',
    'sole.log(1)\n```\n\n',
    '| A | B |\n| - | - |\n',
    '| one | two |\n\n',
    '[Open',
    'AI](https://openai.com)\n\n---'
  ];

  const html = renderMarkdownToHtml(chunks.join(''));

  assert.match(html, /<h2[^>]*>Streamed result<\/h2>/);
  assert.match(html, /<pre><code class="language-js">console\.log\(1\)\n<\/code><\/pre>/);
  assert.match(html, /<table>/);
  assert.match(html, /<td>one<\/td>/);
  assert.match(html, /<a href="https:\/\/openai\.com">OpenAI<\/a>/);
  assert.match(html, /<hr/);
});
