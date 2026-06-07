const { Marked } = require('marked');

const markdown = new Marked({
  async: false,
  breaks: false,
  gfm: true
});

function escapeRawHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMarkdownToHtml(text) {
  if (!text) return '';
  return markdown.parse(escapeRawHtml(text));
}

module.exports = {
  renderMarkdownToHtml
};
