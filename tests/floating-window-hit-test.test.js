const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isPointInsideBounds,
  isPhysicalPointInsideWindow
} = require('../src/main/floating-window-hit-test');

test('isPointInsideBounds accepts inside point', () => {
  const bounds = { x: 10, y: 20, width: 100, height: 50 };

  assert.equal(isPointInsideBounds({ x: 10, y: 20 }, bounds), true);
  assert.equal(isPointInsideBounds({ x: 60, y: 45 }, bounds), true);
  assert.equal(isPointInsideBounds({ x: 110, y: 70 }, bounds), true);
});

test('isPointInsideBounds rejects outside points', () => {
  const bounds = { x: 10, y: 20, width: 100, height: 50 };

  assert.equal(isPointInsideBounds(null, bounds), false);
  assert.equal(isPointInsideBounds({ x: 10, y: 20 }, null), false);
  assert.equal(isPointInsideBounds({ x: 9, y: 20 }, bounds), false);
  assert.equal(isPointInsideBounds({ x: 111, y: 70 }, bounds), false);
  assert.equal(isPointInsideBounds({ x: 10, y: 19 }, bounds), false);
  assert.equal(isPointInsideBounds({ x: 110, y: 71 }, bounds), false);
});

test('isPointInsideBounds supports padding', () => {
  const bounds = { x: 10, y: 20, width: 100, height: 50 };

  assert.equal(isPointInsideBounds({ x: 8, y: 20 }, bounds, 2), true);
  assert.equal(isPointInsideBounds({ x: 112, y: 70 }, bounds, 2), true);
  assert.equal(isPointInsideBounds({ x: 10, y: 18 }, bounds, 2), true);
  assert.equal(isPointInsideBounds({ x: 110, y: 72 }, bounds, 2), true);
  assert.equal(isPointInsideBounds({ x: 7, y: 20 }, bounds, 2), false);
});

test('isPhysicalPointInsideWindow converts physical coordinates to DIP before hit-test', () => {
  const screenApi = {
    screenToDipPoint(point) {
      return { x: point.x / 2, y: point.y / 2 };
    }
  };
  const windowRef = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 10, y: 20, width: 100, height: 50 })
  };

  assert.equal(isPhysicalPointInsideWindow(20, 40, windowRef, screenApi, 0), true);
  assert.equal(isPhysicalPointInsideWindow(222, 140, windowRef, screenApi, 0), false);
});

test('isPhysicalPointInsideWindow accepts raw coordinates when they already match bounds', () => {
  const screenApi = {
    screenToDipPoint(point) {
      return { x: point.x / 2, y: point.y / 2 };
    }
  };
  const windowRef = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 100, y: 100, width: 80, height: 40 })
  };

  assert.equal(isPhysicalPointInsideWindow(120, 120, windowRef, screenApi, 0), true);
});

test('isPhysicalPointInsideWindow rejects destroyed or missing windows', () => {
  const screenApi = {
    screenToDipPoint(point) {
      return point;
    }
  };
  const bounds = { x: 10, y: 20, width: 100, height: 50 };

  assert.equal(isPhysicalPointInsideWindow(10, 20, null, screenApi), false);
  assert.equal(isPhysicalPointInsideWindow(10, 20, { isDestroyed: () => true, getBounds: () => bounds }, screenApi), false);
  assert.equal(isPhysicalPointInsideWindow(10, 20, { isDestroyed: () => false }, screenApi), false);
  assert.equal(isPhysicalPointInsideWindow(10, 20, { isDestroyed: () => false, getBounds: () => null }, screenApi), false);
});
