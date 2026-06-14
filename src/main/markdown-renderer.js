const { Marked } = require('marked');

const markdown = new Marked({
  async: false,
  breaks: false,
  gfm: true
});

// Escape raw HTML tags to prevent XSS while preserving markdown syntax.
// Only escapes complete HTML tag patterns, not standalone > (blockquote) or & (in URLs).
function escapeRawHtml(text) {
  return String(text || '')
    // Escape & only when part of HTML entity patterns (prevent injection via entities)
    .replace(/&([a-zA-Z]+|#[0-9]+|#x[0-9a-fA-F]+);/g, '&amp;$1;')
    // Escape < only when followed by HTML tag name characters
    .replace(/<(\/?[\w!])/g, '&lt;$1')
    // Escape > only when it looks like closing an HTML tag (preceded by word char or /)
    .replace(/([\w"'])>/g, '$1&gt;');
}

function renderMarkdownToHtml(text) {
  if (!text) return '';
  return markdown.parse(escapeRawHtml(text));
}

module.exports = {
  renderMarkdownToHtml
};
