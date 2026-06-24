# Issue 2 Markdown Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve complete Markdown rendering while preventing unsafe link protocols from executing in Electron renderers, then publish the corrected issue #2 branch.

**Architecture:** Keep the existing shared `Marked` instance and raw-HTML escaping. Add a custom link renderer that accepts only `http:`, `https:`, `mailto:`, relative URLs, fragments, and protocol-relative URLs; unsafe schemes render as plain escaped link text. Verify both parser output and real renderer behavior before updating evidence.

**Tech Stack:** Node.js, Marked 18, Electron renderer, `node:test`, Git.

---

## Current State

- Worktree: `.claude/worktrees/issue-2-markdown`
- HEAD: `910a0144e5a8a87e20915d72b5f79d60a0a6c0a7`
- Fresh full test result: 119 passed, 0 failed.
- Screenshots are real 920x680 PNG files.
- Blocking defect: `[x](javascript:alert(1))` currently renders `<a href="javascript:alert(1)">x</a>`.
- No CSP, `will-navigate`, or `setWindowOpenHandler` guard compensates for this.
- The branch is local only and is not contained in `origin/master`.

## Files

- Modify: `.claude/worktrees/issue-2-markdown/src/main/markdown-renderer.js`
- Modify: `.claude/worktrees/issue-2-markdown/tests/markdown-renderer.test.js`
- Modify: `.claude/worktrees/issue-2-markdown/tests/chat-renderer-markdown.test.js`
- Modify: `.claude/worktrees/issue-2-markdown/scripts/capture-markdown-evidence.mjs`
- Replace: `.claude/worktrees/issue-2-markdown/docs/superpowers/verification/issue-2/malicious-html-escaped.png`
- Modify: `.claude/worktrees/issue-2-markdown/docs/superpowers/verification/2026-06-14-issue-2.md`

### Task 1: Define The Safe URL Contract With Failing Tests

- [ ] **Step 1: Add parser-level protocol tests**

Add to `tests/markdown-renderer.test.js`:

```js
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
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/markdown-renderer.test.js`

Expected: FAIL because unsafe links still contain `href`.

### Task 2: Implement One Shared Safe-Link Renderer

- [ ] **Step 1: Add URL classification helpers**

In `src/main/markdown-renderer.js`, add:

```js
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function isSafeLinkHref(href) {
  const value = String(href || '').trim();
  if (!value) return false;
  if (value.startsWith('#') || value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
    return true;
  }

  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i);
  return !scheme || SAFE_PROTOCOLS.has(`${scheme[1].toLowerCase()}:`);
}

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```

- [ ] **Step 2: Configure Marked's link renderer**

After creating `markdown`, call:

```js
markdown.use({
  renderer: {
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (!isSafeLinkHref(href)) return label;

      const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : '';
      return `<a href="${escapeAttribute(href)}"${titleAttribute}>${label}</a>`;
    }
  }
});
```

Export `isSafeLinkHref` through `_private` only if direct helper tests are needed. Do not add a sanitizer dependency for this narrow contract.

- [ ] **Step 3: Run parser tests**

Run: `node --test tests/markdown-renderer.test.js`

Expected: all tests pass.

### Task 3: Prove Both Renderers Use The Secured Parser

- [ ] **Step 1: Extend renderer tests**

In `tests/chat-renderer-markdown.test.js`, add one stored-message and one streaming-message case containing `[unsafe](javascript:alert(1))`. Assert rendered HTML has the text `unsafe` and no `href="javascript:`.

In `tests/floating-renderer-ui.test.js`, add the same assertion for translation and floating AI stream rendering.

- [ ] **Step 2: Run renderer tests**

```powershell
node --test tests/markdown-renderer.test.js tests/chat-renderer-markdown.test.js tests/floating-renderer-ui.test.js
```

Expected: PASS.

### Task 4: Refresh Security Evidence And Publish

- [ ] **Step 1: Extend the screenshot payload**

Update `scripts/capture-markdown-evidence.mjs` so the malicious case visibly includes raw `<script>`, `<img onerror>`, and `[unsafe link](javascript:alert(1))`. The screenshot must show the link label as non-clickable text.

- [ ] **Step 2: Regenerate and inspect evidence**

Run: `npx electron scripts/capture-markdown-evidence.mjs`

Expected: both PNG files remain at least 920x680 and larger than 1024 bytes. Visually confirm the unsafe link has no browser-link affordance.

- [ ] **Step 3: Run full verification**

```powershell
npm test
node -e "const {renderMarkdownToHtml}=require('./src/main/markdown-renderer'); console.log(renderMarkdownToHtml('[x](javascript:alert(1))'))"
```

Expected: full suite passes; printed HTML contains `x` and no `href` or `javascript:`.

- [ ] **Step 4: Update verification and commit**

Record the unsafe-protocol cases, exact test count, screenshot dimensions, and changed files.

```powershell
git add src/main/markdown-renderer.js tests scripts/capture-markdown-evidence.mjs docs/superpowers/verification
git commit -m "fix: block unsafe markdown link protocols"
git push -u origin worktree-issue-2-markdown
```

