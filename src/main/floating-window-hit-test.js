function isPointInsideBounds(point, bounds, padding = 0) {
  if (!point || !bounds) return false;

  const left = bounds.x - padding;
  const top = bounds.y - padding;
  const right = bounds.x + bounds.width + padding;
  const bottom = bounds.y + bounds.height + padding;

  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function toDipPoint(point, screenApi) {
  if (screenApi && typeof screenApi.screenToDipPoint === 'function') {
    return screenApi.screenToDipPoint(point);
  }

  return point;
}

function isPhysicalPointInsideWindow(mouseX, mouseY, windowRef, screenApi, padding = 2) {
  if (!windowRef) return false;
  if (typeof windowRef.isDestroyed === 'function' && windowRef.isDestroyed()) return false;
  if (typeof windowRef.getBounds !== 'function') return false;

  const bounds = windowRef.getBounds();
  if (!bounds) return false;

  const rawPoint = { x: mouseX, y: mouseY };
  const dipPoint = toDipPoint(rawPoint, screenApi);

  return (
    isPointInsideBounds(dipPoint, bounds, padding) ||
    isPointInsideBounds(rawPoint, bounds, padding)
  );
}

module.exports = {
  isPointInsideBounds,
  toDipPoint,
  isPhysicalPointInsideWindow
};
