const MapAdapter = (function () {
  function formatCircle(x, y, timeMs, typeBits, hitsound, addition) {
    return `${Math.round(x)},${Math.round(y)},${Math.round(timeMs)},${typeBits},${hitsound},${addition}`;
  }

  function formatSliderLinear(x1, y1, x2, y2, timeMs, typeBits, hitsound, repeat, length, edgeSounds, edgeAdditions, addition) {
    const curvePart = `L|${Math.round(x2)}:${Math.round(y2)}`;
    const edgeSoundsStr = edgeSounds.join("|");
    const edgeSetsStr = edgeAdditions.join("|");
    return `${Math.round(x1)},${Math.round(y1)},${Math.round(timeMs)},${typeBits},${hitsound},${curvePart},${repeat},${length.toFixed(2)},${edgeSoundsStr},${edgeSetsStr},${addition}`;
  }

  function formatSliderCurve(points, timeMs, typeBits, hitsound, repeat, length, edgeSounds, edgeAdditions, addition) {
    const x1 = Math.round(points[0].x);
    const y1 = Math.round(points[0].y);
    const curvePart = "B|" + points.slice(1).map((p) => `${Math.round(p.x)}:${Math.round(p.y)}`).join("|");
    const edgeSoundsStr = edgeSounds.join("|");
    const edgeSetsStr = edgeAdditions.join("|");
    return `${x1},${y1},${Math.round(timeMs)},${typeBits},${hitsound},${curvePart},${repeat},${length.toFixed(2)},${edgeSoundsStr},${edgeSetsStr},${addition}`;
  }

  function polylineLength(points) {
    if (points.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      total += Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    }
    return total;
  }

  function sampleSliderPath(path, replayStartMs, replayEndMs, bounds, numSamples) {
    const minX = bounds[0];
    const maxX = bounds[1];
    const minY = bounds[2];
    const maxY = bounds[3];
    const points = [];
    const span = Math.max(1, numSamples - 1);
    for (let i = 0; i < numSamples; i++) {
      const t = replayStartMs + (replayEndMs - replayStartMs) * i / span;
      const [x, y] = CursorPath.interpolate(path, t);
      const [cx, cy] = CursorPath.clampToBounds(x, y, minX, maxX, minY, maxY);
      points.push({ x: cx, y: cy });
    }
    return points;
  }

  function redBeatLengthForSlider(pathLength, durationMs, repeat, greenMsPerBeat, sliderMultiplier) {
    if (pathLength < 1) pathLength = 1;
    let red = (-10000 * sliderMultiplier * durationMs) / (pathLength * repeat * greenMsPerBeat);
    return Math.max(-1000, Math.min(-10, red));
  }

  function formatTimingLine(offsetMs, beatLength, meter, sampleSet, sampleIndex, volume, uninherited, kiai) {
    return `${offsetMs},${beatLength.toFixed(10)},${meter},${sampleSet},${sampleIndex},${volume},${uninherited},${kiai}`;
  }

  function formatSpinner(x, y, timeMs, endTimeMs, typeBits, hitsound, addition) {
    return `${Math.round(x)},${Math.round(y)},${Math.round(timeMs)},${typeBits},${hitsound},${Math.round(endTimeMs)},${addition}`;
  }

  function buildAdaptedHitObjects(replay, parsedBeatmap) {
    const bm = parsedBeatmap;
    const hardRock = !!replay.hard_rock;
    const hitObjects = bm.hitObjectsWithMods(hardRock);
    const sliderMultiplier = bm.sliderMultiplier;
    const path = CursorPath.buildCursorPath(replay.actions);
    const [replayMinMs, replayMaxMs] = CursorPath.pathTimeBounds(path);
    const newTimingLines = [];

    function inReplayRange(tMs) {
      return tMs >= replayMinMs && tMs <= replayMaxMs;
    }

    function getPos(replayT, bounds) {
      let [x, y] = CursorPath.interpolate(path, replayT);
      if (bounds != null) {
        [x, y] = CursorPath.clampToBounds(x, y, bounds[0], bounds[1], bounds[2], bounds[3]);
      }
      return [Math.round(x), Math.round(y)];
    }

    const objCoordsX = [];
    const objCoordsY = [];
    for (let idx = 0; idx < hitObjects.length; idx++) {
      const obj = hitObjects[idx];
      const objTimeMs = obj.timeMs;
      const replayTimeMs = objTimeMs;
      if (obj.type === "circle") {
        if (inReplayRange(replayTimeMs)) {
          const [x, y] = CursorPath.interpolate(path, replayTimeMs);
          objCoordsX.push(Math.round(x));
          objCoordsY.push(Math.round(y));
        } else {
          objCoordsX.push(Math.round(obj.x));
          objCoordsY.push(Math.round(obj.y));
        }
      } else if (obj.type === "slider") {
        const endTimeMs = obj.endTimeMs;
        const replayEndMs = endTimeMs;
        if (inReplayRange(replayTimeMs) && inReplayRange(replayEndMs)) {
          const [x1, y1] = CursorPath.interpolate(path, replayTimeMs);
          const [x2, y2] = CursorPath.interpolate(path, replayEndMs);
          objCoordsX.push(Math.round(x1), Math.round(x2));
          objCoordsY.push(Math.round(y1), Math.round(y2));
        } else {
          objCoordsX.push(Math.round(obj.x), Math.round(obj.endX));
          objCoordsY.push(Math.round(obj.y), Math.round(obj.endY));
        }
      } else if (obj.type === "spinner") {
        objCoordsX.push(256);
        objCoordsY.push(192);
      }
    }

    let bounds;
    if (objCoordsX.length && objCoordsY.length) {
      bounds = [
        Math.min(...objCoordsX),
        Math.max(...objCoordsX),
        Math.min(...objCoordsY),
        Math.max(...objCoordsY),
      ];
    } else {
      bounds = [0, 512, 0, 384];
    }

    const lines = [];
    let firstChange = null;
    const totalObjects = hitObjects.length;

    for (let idx = 0; idx < hitObjects.length; idx++) {
      const obj = hitObjects[idx];
      const objTimeMs = obj.timeMs;
      const replayTimeMs = objTimeMs;
      const tMsInt = Math.round(objTimeMs);
      const typeBits = obj.typeBits;
      const hitsound = obj.hitsound || 0;
      const addition = obj.addition || "0:0:0:0:";

      if (obj.type === "circle") {
        let x, y;
        if (inReplayRange(replayTimeMs)) {
          [x, y] = getPos(replayTimeMs, bounds);
        } else {
          x = Math.round(obj.x);
          y = Math.round(obj.y);
        }
        if (firstChange == null && inReplayRange(replayTimeMs)) {
          firstChange = [[Math.round(obj.x), Math.round(obj.y)], [x, y]];
        }
        lines.push(formatCircle(x, y, tMsInt, typeBits, hitsound, addition));
        continue;
      }

      if (obj.type === "slider") {
        const endTimeMs = obj.endTimeMs;
        const replayEndMs = endTimeMs;
        const repeat = obj.repeat || 1;
        const edgeSounds = obj.edgeSounds || [0, 0];
        const edgeAdditions = obj.edgeAdditions || ["0:0", "0:0"];

        if (inReplayRange(replayTimeMs) && inReplayRange(replayEndMs)) {
          const durationMs = endTimeMs - objTimeMs;
          const numSamples = Math.max(50, Math.min(300, Math.floor(durationMs / 12)));
          const points = sampleSliderPath(path, replayTimeMs, replayEndMs, bounds, numSamples);
          const pathLength = polylineLength(points);
          const len = pathLength < 1 ? 1 : pathLength;
          const greenMs = bm.greenMsPerBeatAt(objTimeMs);
          const redBeat = redBeatLengthForSlider(len, durationMs, repeat, greenMs, sliderMultiplier);
          const tp = bm.timingPointAt(objTimeMs);
          if (tp) {
            newTimingLines.push([
              tMsInt,
              formatTimingLine(
                tMsInt,
                redBeat,
                tp.meter,
                tp.sampleSet,
                tp.sampleIndex,
                Math.round(tp.volume),
                0,
                tp.kiaiMode ? 1 : 0
              ),
            ]);
          }
          if (firstChange == null) {
            firstChange = [[Math.round(obj.x), Math.round(obj.y)], [Math.round(points[0].x), Math.round(points[0].y)]];
          }
          lines.push(formatSliderCurve(
            points,
            tMsInt,
            typeBits,
            hitsound,
            repeat,
            Math.round(len * 100) / 100,
            edgeSounds,
            edgeAdditions,
            addition
          ));
        } else {
          let x1, y1, x2, y2;
          x1 = getPos(replayTimeMs, bounds)[0];
          y1 = getPos(replayTimeMs, bounds)[1];
          x2 = getPos(replayEndMs, bounds)[0];
          y2 = getPos(replayEndMs, bounds)[1];
          if (!inReplayRange(replayTimeMs)) {
            x1 = Math.round(obj.x);
            y1 = Math.round(obj.y);
          }
          if (!inReplayRange(replayEndMs)) {
            x2 = Math.round(obj.endX);
            y2 = Math.round(obj.endY);
          }
          let length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
          if (length < 1) length = 1;
          if (firstChange == null && inReplayRange(replayTimeMs)) {
            firstChange = [[Math.round(obj.x), Math.round(obj.y)], [x1, y1]];
          }
          lines.push(formatSliderLinear(
            x1, y1, x2, y2,
            tMsInt,
            typeBits,
            hitsound,
            repeat,
            length,
            edgeSounds,
            edgeAdditions,
            addition
          ));
        }
        continue;
      }

      if (obj.type === "spinner") {
        const endMs = obj.endTimeMs;
        lines.push(formatSpinner(256, 192, tMsInt, Math.round(endMs), typeBits, hitsound, addition));
        continue;
      }
    }

    return { lines, firstChange, bounds, newTimingLines };
  }

  return { buildAdaptedHitObjects };
})();
