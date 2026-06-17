const { Marked } = require('marked');

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const SAFE_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);

function isSafeLinkHref(href) {
  const value = String(href || '').trim();
  if (!value) return false;
  if (value.startsWith('#') || value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
    return true;
  }

  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i);
  return !scheme || SAFE_PROTOCOLS.has(`${scheme[1].toLowerCase()}:`);
}

function isSafeImageHref(href) {
  const value = String(href || '').trim();
  if (!value) return false;

  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!scheme) return false;
  return SAFE_IMAGE_PROTOCOLS.has(`${scheme[1].toLowerCase()}:`);
}

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const markdown = new Marked({
  async: false,
  breaks: false,
  gfm: true
});

markdown.use({
  renderer: {
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (!isSafeLinkHref(href)) return `<span>${label}</span>`;

      const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : '';
      return `<a href="${escapeAttribute(href)}"${titleAttribute}>${label}</a>`;
    },
    image({ href, title, text }) {
      const label = escapeHtml(text || '');
      if (!isSafeImageHref(href)) return `<span>${label}</span>`;

      const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : '';
      return `<img src="${escapeAttribute(href)}" alt="${escapeAttribute(text)}"${titleAttribute}>`;
    }
  }
});

function escapeRawHtml(text) {
  // Escape potential HTML tags to prevent XSS
  // We need to be careful not to escape markdown syntax like > for blockquotes
  // Strategy:
  // 1. Escape < followed by HTML tag characters (letters, /, !)
  // 2. Escape > when it looks like it's closing an HTML tag (preceded by letters, quotes, spaces)
  // 3. But don't escape > at the start of a line (blockquote syntax in markdown)

  return String(text || '')
    // Escape & that aren't part of existing entities
    .replace(/&(?!#?\w+;)/g, '&amp;')
    // Escape < only when followed by HTML tag start characters (a-z, A-Z, /, !)
    .replace(/<(?=[a-zA-Z/!])/g, '&lt;')
    // Escape > when preceded by characters that suggest it's closing an HTML tag
    // But NOT when > is at the start of a line (blockquote marker)
    // Split into lines to handle this properly
    .split('\n')
    .map(line => {
      // If line starts with > (blockquote), preserve it
      if (line.startsWith('>')) {
        return line;
      }
      // Otherwise escape any > that looks like HTML closing tag
      return line.replace(/(?<=[a-zA-Z"'0-9\s])>/g, '&gt;');
    })
    .join('\n');
}

function renderMarkdownToHtml(text) {
  if (!text) return '';
  return markdown.parse(escapeRawHtml(text));
}

async function initMarkedRenderer() {
  return markdown;
}

module.exports = {
  renderMarkdownToHtml,
  initMarkedRenderer
};
