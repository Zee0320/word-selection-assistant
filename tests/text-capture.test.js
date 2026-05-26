const test = require('node:test');
const assert = require('node:assert/strict');

const {
  captureSelectedTextFromClipboard,
  createClipboardSnapshot,
  restoreClipboardSnapshot
} = require('../src/main/text-capture');

function createImage(empty = false) {
  return {
    isEmpty: () => empty
  };
}

function createClipboard({ text = '', image = null } = {}) {
  const state = { text, image };
  const writes = [];

  return {
    state,
    writes,
    availableFormats() {
      const formats = [];
      if (state.text) formats.push('text/plain');
      if (state.image) formats.push('image/png');
      return formats;
    },
    readText() {
      return state.text;
    },
    readImage() {
      return state.image;
    },
    writeText(nextText) {
      writes.push({ type: 'text', text: nextText });
      state.text = nextText;
      state.image = null;
    },
    write(data) {
      writes.push({ type: 'data', data });
      state.text = data.text || '';
      state.image = data.image || null;
    }
  };
}

function createQuietLogger() {
  return {
    warn() {}
  };
}

test('captures selected text and restores previous text clipboard', async () => {
  const fakeClipboard = createClipboard({ text: 'previous clipboard' });

  const selectedText = await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => fakeClipboard.writeText('selected text'),
    logger: createQuietLogger()
  });

  assert.equal(selectedText, 'selected text');
  assert.equal(fakeClipboard.state.text, 'previous clipboard');
  assert.equal(fakeClipboard.state.image, null);
});

test('restores image clipboard when capture returns no text', async () => {
  const image = createImage();
  const fakeClipboard = createClipboard({ image });

  const selectedText = await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {},
    logger: createQuietLogger()
  });

  assert.equal(selectedText, '');
  assert.equal(fakeClipboard.state.image, image);
  assert.equal(fakeClipboard.state.text, '');
});

test('restores image clipboard after successful text capture', async () => {
  const image = createImage();
  const fakeClipboard = createClipboard({ image });

  const selectedText = await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => fakeClipboard.writeText('selected text'),
    logger: createQuietLogger()
  });

  assert.equal(selectedText, 'selected text');
  assert.equal(fakeClipboard.state.image, image);
  assert.equal(fakeClipboard.state.text, '');
});

test('restores previous clipboard when capture throws', async () => {
  const image = createImage();
  const fakeClipboard = createClipboard({ text: 'fallback text', image });

  const selectedText = await captureSelectedTextFromClipboard({
    clipboardApi: fakeClipboard,
    copySelection: () => {
      throw new Error('copy failed');
    },
    logger: createQuietLogger()
  });

  assert.equal(selectedText, '');
  assert.equal(fakeClipboard.state.image, image);
  assert.equal(fakeClipboard.state.text, 'fallback text');
});

test('snapshot ignores empty images and falls back to text restore', () => {
  const fakeClipboard = createClipboard({ text: 'text', image: createImage(true) });
  const snapshot = createClipboardSnapshot(fakeClipboard, createQuietLogger());

  assert.equal(snapshot.image, null);

  fakeClipboard.writeText('changed');
  const restored = restoreClipboardSnapshot(snapshot, fakeClipboard, createQuietLogger());

  assert.equal(restored, true);
  assert.equal(fakeClipboard.state.text, 'text');
  assert.equal(fakeClipboard.state.image, null);
});
