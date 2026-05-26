const test = require('node:test');
const assert = require('node:assert/strict');

const { nativeWindowHandleToNumber } = require('../src/main/window-focus');

test('nativeWindowHandleToNumber reads 64-bit little-endian handles', () => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(12345n, 0);

  assert.equal(nativeWindowHandleToNumber(buffer), 12345);
});

test('nativeWindowHandleToNumber rejects invalid handles', () => {
  assert.equal(nativeWindowHandleToNumber(null), null);
  assert.equal(nativeWindowHandleToNumber(Buffer.alloc(0)), null);
});
