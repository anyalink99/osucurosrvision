const CursorPath = (function () {
  function buildCursorPath(actions) {
    const path = [];
    let prevMs = -1;
    for (const a of actions) {
      const tMs = a.offsetMs;
      if (tMs <= prevMs) continue;
      prevMs = tMs;
      path.push({ time_ms: tMs, x: a.position.x, y: a.position.y });
    }
    return path;
  }

  function clampPlayfield(x, y) {
    x = Math.max(0, Math.min(512, Math.round(x)));
    y = Math.max(0, Math.min(384, Math.round(y)));
    return [x, y];
  }

  function clampToBounds(x, y, minX, maxX, minY, maxY) {
    x = Math.max(minX, Math.min(maxX, Math.round(x)));
    y = Math.max(minY, Math.min(maxY, Math.round(y)));
    return [x, y];
  }

  function pathTimeBounds(path) {
    if (!path.length) return [0, 0];
    return [path[0].time_ms, path[path.length - 1].time_ms];
  }

  function pathSegmentForWindow(path, startMs, endMs) {
    if (!path.length || startMs >= endMs) return [];
    const segment = path.filter((p) => p.time_ms >= startMs && p.time_ms <= endMs);
    if (!segment.length || segment[0].time_ms > startMs) {
      const [x, y] = interpolate(path, startMs);
      segment.unshift({ time_ms: startMs, x, y });
    }
    if (!segment.length || segment[segment.length - 1].time_ms < endMs) {
      const [x, y] = interpolate(path, endMs);
      segment.push({ time_ms: endMs, x, y });
    }
    return segment;
  }

  function interpolate(path, timeMs) {
    if (!path.length) return [256, 192];
    if (timeMs <= path[0].time_ms)
      return clampPlayfield(path[0].x, path[0].y);
    if (timeMs >= path[path.length - 1].time_ms)
      return clampPlayfield(path[path.length - 1].x, path[path.length - 1].y);
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (a.time_ms <= timeMs && timeMs <= b.time_ms) {
        if (b.time_ms === a.time_ms) return clampPlayfield(a.x, a.y);
        const r = (timeMs - a.time_ms) / (b.time_ms - a.time_ms);
        const x = a.x + r * (b.x - a.x);
        const y = a.y + r * (b.y - a.y);
        return clampPlayfield(x, y);
      }
    }
    return clampPlayfield(path[path.length - 1].x, path[path.length - 1].y);
  }

  return {
    buildCursorPath,
    clampPlayfield,
    clampToBounds,
    pathTimeBounds,
    pathSegmentForWindow,
    interpolate,
  };
})();
