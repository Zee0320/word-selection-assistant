// Synchronous markdown renderer using pre-loaded marked instance
// Marked v18+ is pure ESM, so we need to load it asynchronously at startup

let markdownParser = null;
let initPromise = null;

async function initMarkedRenderer() {
  if (markdownParser) return markdownParser;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { Marked } = await import('marked');
    markdownParser = new Marked({
      async: false,
      breaks: false,
      gfm: true
    });
    return markdownParser;
  })();

  return initPromise;
}

// Escape raw HTML tags to prevent XSS while preserving markdown syntax.
function escapeRawHtml(text) {
  return String(text || '')
    .replace(/&([a-zA-Z]+|#[0-9]+|#x[0-9a-fA-F]+);/g, '&amp;$1;')
    .replace(/<(\/?[\w!])/g, '&lt;$1')
    .replace(/([\w"'])>/g, '$1&gt;');
}

function renderMarkdownToHtml(text) {
  if (!text) return '';
  if (!markdownParser) {
    // Fallback: return escaped text if parser not initialized
    // This shouldn't happen in normal operation since we init at startup
    console.warn('[MarkdownRenderer] Parser not initialized, returning escaped text');
    return escapeRawHtml(text);
  }
  return markdownParser.parse(escapeRawHtml(text));
}

module.exports = {
  renderMarkdownToHtml,
  initMarkedRenderer
};
