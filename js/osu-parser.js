const OsuParser = (function () {
  function findSection(content, name) {
    const re = new RegExp("^\\s*\\[" + name.replace(/[\]\\]/, "\\$&") + "\\s*\\]", "im");
    const m = content.match(re);
    return m ? content.indexOf(m[0]) : -1;
  }

  function getSectionContent(content, sectionName) {
    let start = findSection(content, sectionName);
    const alternates = (sectionName === "HitObjects") ? ["Hit Objects"] : [];
    for (const alt of alternates) {
      if (start >= 0) break;
      start = findSection(content, alt);
    }
    if (start < 0) return null;
    if (sectionName === "HitObjects") {
      const hitMatch = content.match(/\[\s*HitObjects\s*\]/i);
      if (!hitMatch) return null;
      const after = content.indexOf(hitMatch[0]) + hitMatch[0].length;
      const rest = content.slice(after);
      const nextSection = rest.match(/\n\s*\[[\w\s]*\]/);
      const block = (nextSection ? rest.slice(0, nextSection.index) : rest).replace(/^\s*\n?/, "").trim();
      return block.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }
    const closingBracket = content.indexOf("]", start);
    const afterHeader = content.indexOf("\n", closingBracket) + 1;
    if (afterHeader === 0) return null;
    const nextSection = content.slice(afterHeader).match(/^\s*\[[\w\s]+\s*\]/m);
    const end = nextSection
      ? afterHeader + nextSection.index
      : content.length;
    const raw = content.slice(afterHeader, end).trim();
    return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function parseKeyValue(block) {
    const map = {};
    for (const line of block.split("\n")) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      map[key] = value;
    }
    return map;
  }

  function parseIntOrFloat(s, fallback) {
    const n = parseFloat(s);
    return Number.isNaN(n) ? (fallback !== undefined ? fallback : 0) : Math.floor(n);
  }

  function parseNum(s) {
    if (s == null || s === "") return NaN;
    const t = String(s).replace(/[\uFEFF\u200B-\u200D\u2060\u00A0\s]/g, "").replace(/[^\d.-]/g, "");
    const n = parseFloat(t);
    return Number.isNaN(n) ? NaN : n;
  }

  function parseTimingPoints(block) {
    if (!block) return [];
    const points = [];
    for (const line of block.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const parts = t.split(",").map((s) => s.trim());
      const offsetMs = parseIntOrFloat(parts[0], 0);
      const beatLength = parseFloat(parts[1]);
      const meter = parseIntOrFloat(parts[2], 4) || 4;
      const sampleSet = parseIntOrFloat(parts[3], 0) || 0;
      const sampleIndex = parseIntOrFloat(parts[4], 0) || 0;
      const volume = Math.max(0, Math.min(100, parseIntOrFloat(parts[5], 100) || 100));
      const uninherited = parseIntOrFloat(parts[6], 1) !== 0;
      const kiai = parseIntOrFloat(parts[7], 0) || 0;
      points.push({
        offsetMs,
        msPerBeat: beatLength,
        meter,
        sampleSet,
        sampleIndex,
        volume,
        uninherited,
        kiaiMode: !!kiai,
        parent: null,
      });
    }
    points.sort((a, b) => a.offsetMs - b.offsetMs);
    for (let i = 0; i < points.length; i++) {
      if (!points[i].uninherited && points[i].msPerBeat < 0) {
        for (let j = i - 1; j >= 0; j--) {
          if (points[j].uninherited) {
            points[i].parent = points[j];
            break;
          }
        }
      }
    }
    return points;
  }

  const defaultTimingPoint = {
    offsetMs: 0,
    msPerBeat: 600,
    uninherited: true,
    parent: null,
    meter: 4,
    sampleSet: 0,
    sampleIndex: 0,
    volume: 100,
    kiaiMode: false,
  };

  function timingPointAt(timingPoints, timeMs) {
    if (!timingPoints || timingPoints.length === 0) return defaultTimingPoint;
    let last = timingPoints[0];
    for (const tp of timingPoints) {
      if (tp.offsetMs > timeMs) break;
      last = tp;
    }
    return last;
  }

  function greenMsPerBeatAt(timingPoints, timeMs) {
    const tp = timingPointAt(timingPoints, timeMs);
    if (!tp) return 600;
    const p = tp.parent || tp;
    return p.msPerBeat;
  }

  function parseHitObjectLine(line, timingPoints, sliderMultiplier) {
    const normalizedLine = line.replace(/\uFEFF/g, "")
      .replace(/[\uFF0C\u060C\u3001\uFE50\uFE51]/g, ",");
    let parts = normalizedLine.split(/[,\t]+/).map((s) => s.trim());
    if (parts.length < 4) {
      const match = normalizedLine.match(/^([\d.-]+)\D+([\d.-]+)\D+([\d.-]+)\D+([\d.-]+)\D+([\d.-]+)\D*(.*)$/);
      if (match) parts = [match[1], match[2], match[3], match[4], match[5], match[6] || "0:0:0:0:"];
      else return null;
    }
    const x = parseNum(parts[0]);
    const y = parseNum(parts[1]);
    const timeMs = parseNum(parts[2]);
    let typeBits = Math.floor(parseNum(parts[3]));
    if (Number.isNaN(typeBits) || typeBits < 0) typeBits = 0;
    if (!(typeBits & 1) && !(typeBits & 2) && !(typeBits & 8) && parts.length >= 5 && !Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(timeMs)) {
      typeBits = 1;
    }
    const hitsound = parseIntOrFloat(parts[4], 0) || 0;
    const addition = parts[5] || "0:0:0:0:";

    if (typeBits & 1) {
      return { type: "circle", x, y, timeMs, typeBits, hitsound, addition };
    }
    if (typeBits & 2) {
      let curvePart = parts[5] || "";
      let repeat = parseIntOrFloat(parts[6], 1) || 1;
      let length = parseFloat(parts[7]) || 100;
      if (parts.length === 6 && curvePart.indexOf(",") >= 0) {
        const sliderRest = curvePart.split(",");
        curvePart = sliderRest[0] || "";
        repeat = parseIntOrFloat(sliderRest[1], 1) || 1;
        length = parseFloat(sliderRest[2]) || 100;
      }
      const edgeSounds = (parts[8] || "0").split("|").map((s) => parseIntOrFloat(s, 0) || 0).slice(0, 2);
      const edgeAdditions = (parts[9] || "0:0").split("|").slice(0, 2);
      const additionSlider = parts[10] || "0:0:0:0:";

      const defaultTp = { offsetMs: 0, msPerBeat: 600, uninherited: true, parent: null };
      const tp = (timingPoints && timingPoints.length) ? timingPointAt(timingPoints, timeMs) : defaultTp;
      const velocityMultiplier = tp.uninherited
        ? 1
        : Math.max(0.1, Math.min(10, -100 / tp.msPerBeat));
      const msPerBeat = tp.uninherited ? tp.msPerBeat : (tp.parent && tp.parent.msPerBeat) || 600;
      const pixelsPerBeat = sliderMultiplier * 100 * velocityMultiplier;
      const numBeats = (length * repeat) / pixelsPerBeat;
      const durationMs = numBeats * msPerBeat;
      const endTimeMs = timeMs + durationMs;

      let endX = x,
        endY = y;
      const curveMatch = curvePart.match(/^([LBCP])\|(.+)$/);
      if (curveMatch) {
        const kind = curveMatch[1];
        const pointStr = curveMatch[2];
        const pts = [{ x, y }];
        for (const p of pointStr.split("|")) {
          const [xs, ys] = p.split(":");
          const xx = parseIntOrFloat(xs);
          const yy = parseIntOrFloat(ys);
          if (xs !== undefined && ys !== undefined && !Number.isNaN(parseFloat(xs)) && !Number.isNaN(parseFloat(ys)))
            pts.push({ x: xx, y: yy });
        }
        if (kind === "L" && pts.length >= 2) {
          endX = pts[pts.length - 1].x;
          endY = pts[pts.length - 1].y;
        } else if (pts.length >= 2) {
          endX = pts[pts.length - 1].x;
          endY = pts[pts.length - 1].y;
        }
      }

      return {
        type: "slider",
        x,
        y,
        timeMs,
        endTimeMs,
        typeBits,
        hitsound,
        addition,
        repeat,
        length,
        edgeSounds: edgeSounds.length >= 2 ? edgeSounds : [0, 0],
        edgeAdditions: edgeAdditions.length >= 2 ? edgeAdditions : ["0:0", "0:0"],
        addition: additionSlider,
        endX,
        endY,
      };
    }
    if (typeBits & 8) {
      let endTimeMs = parseFloat(parts[5]);
      if (Number.isNaN(endTimeMs)) endTimeMs = timeMs;
      if (endTimeMs < timeMs) endTimeMs = timeMs;
      const spinnerAddition = parts[6] || "0:0:0:0:";
      return {
        type: "spinner",
        x: 256,
        y: 192,
        timeMs,
        endTimeMs,
        typeBits,
        hitsound,
        addition: spinnerAddition,
      };
    }
    const lastResort = normalizedLine.match(/^([\d.-]+)\D+([\d.-]+)\D+([\d.-]+)\D+([\d.-]+)\D*(.*)$/);
    if (lastResort) {
      const x0 = parseNum(lastResort[1]), y0 = parseNum(lastResort[2]), t0 = parseNum(lastResort[3]);
      if (!Number.isNaN(x0) && !Number.isNaN(y0) && !Number.isNaN(t0))
        return { type: "circle", x: x0, y: y0, timeMs: t0, typeBits: 1, hitsound: 0, addition: (lastResort[5] || "").trim() || "0:0:0:0:" };
    }
    return null;
  }

  function parseHitObjects(block, timingPoints, sliderMultiplier) {
    if (!block) return [];
    const list = [];
    for (const line of block.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const obj = parseHitObjectLine(t, timingPoints, sliderMultiplier);
      if (obj) list.push(obj);
    }
    return list;
  }

  function parseBeatmap(content) {
    const general = parseKeyValue(getSectionContent(content, "General") || "");
    const difficulty = parseKeyValue(getSectionContent(content, "Difficulty") || "");
    const metadata = parseKeyValue(getSectionContent(content, "Metadata") || "");
    const sliderMultiplier = parseFloat(difficulty.SliderMultiplier) || 1.4;
    const sliderTickRate = parseFloat(difficulty.SliderTickRate) || 1;
    let formatVersion = parseIntOrFloat(metadata.FormatVersion, 14) || 14;
    const formatMatch = content.match(/osu file format v(\d+)/i);
    if (formatMatch) formatVersion = parseIntOrFloat(formatMatch[1], 14) || 14;
    let approachRate = parseFloat(difficulty.ApproachRate);
    if (Number.isNaN(approachRate)) approachRate = parseFloat(difficulty.OverallDifficulty) || 9;
    const circleSize = parseFloat(difficulty.CircleSize) || 5;
    const stackLeniency = parseFloat(general.StackLeniency) || 0;

    const timingBlock = getSectionContent(content, "TimingPoints");
    const timingPoints = parseTimingPoints(timingBlock || "");
    const hitObjectsBlock = getSectionContent(content, "HitObjects");
    const hitObjects = parseHitObjects(
      hitObjectsBlock || "",
      timingPoints,
      sliderMultiplier
    );

    let maxCombo = 0;
    let comboSection = 1;
    for (const obj of hitObjects) {
      if (obj.type === "circle" || obj.type === "slider") {
        maxCombo += 1 + (obj.type === "slider" ? (obj.repeat || 1) - 1 : 0);
        if (obj.typeBits & 4) comboSection++;
      }
    }

    function applyHardRock(obj) {
      if (obj.type === "circle") {
        return { ...obj, x: obj.x, y: 384 - obj.y };
      }
      if (obj.type === "slider") {
        return { ...obj, x: obj.x, y: 384 - obj.y, endX: obj.endX, endY: 384 - obj.endY };
      }
      return obj;
    }

    function applyStacking(objects, arMs, csScale, leniency) {
      if (!objects.length) return objects;
      const stackThresholdMs = arMs * leniency;
      const stackDist = 3 * csScale;
      const n = objects.length;
      const stackHeight = new Array(n).fill(0);
      for (let i = n - 1; i >= 0; i--) {
        const ob = objects[i];
        if (stackHeight[i] !== 0 || ob.type === "spinner") continue;
        for (let j = i - 1; j >= 0; j--) {
          const obJ = objects[j];
          if (obJ.type === "spinner") continue;
          const endJ = obJ.endTimeMs != null ? obJ.endTimeMs : obJ.timeMs;
          if (ob.timeMs - endJ > stackThresholdMs) break;
          const dx = ob.x - obJ.x;
          const dy = ob.y - obJ.y;
          if (Math.abs(dx) < stackDist && Math.abs(dy) < stackDist) {
            stackHeight[i] = Math.max(stackHeight[i], stackHeight[j] + 1);
          }
        }
      }
      return objects.map((ob, idx) => {
        const h = stackHeight[idx];
        if (h === 0) return ob;
        const offset = -h * stackDist;
        if (ob.type === "circle") {
          return { ...ob, x: ob.x + offset, y: ob.y + offset };
        }
        if (ob.type === "slider") {
          return { ...ob, x: ob.x + offset, y: ob.y + offset, endX: ob.endX + offset, endY: ob.endY + offset };
        }
        return ob;
      });
    }

    function hitObjectsWithMods(hardRock = false, stacking = true) {
      let list = hardRock ? hitObjects.map(applyHardRock) : hitObjects.slice();
      if (stacking && formatVersion >= 6) {
        const arMs = approachRate >= 5 ? 1950 - approachRate * 150 : 1800 - approachRate * 120;
        let csRadius = 54.4 - 4.48 * circleSize;
        if (csRadius < 32) csRadius = 32;
        const csScale = 128 / (2 * csRadius);
        const leniency = Math.max(0, Math.min(1, stackLeniency));
        list = applyStacking(list, arMs, csScale, leniency);
      }
      return list;
    }

    return {
      content,
      sliderMultiplier,
      sliderTickRate,
      timingPoints,
      hitObjects,
      approachRate,
      circleSize,
      stackLeniency,
      formatVersion,
      timingPointAt: (timeMs) => timingPointAt(timingPoints, timeMs),
      greenMsPerBeatAt: (timeMs) => greenMsPerBeatAt(timingPoints, timeMs),
      maxCombo,
      numComboSections: comboSection,
      hitObjectsWithMods,
    };
  }

  return { parseBeatmap };
})();
