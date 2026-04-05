const OsuWriter = (function () {
  function findSectionStart(content, section) {
    const re = new RegExp("^\\s*\\[" + section.replace(/[\]\\]/g, "\\$&") + "\\s*\\]", "im");
    const m = content.match(re);
    return m ? content.indexOf(m[0]) : -1;
  }

  function findNextSectionStart(content, after) {
    const re = /^\s*\[[A-Za-z]+\s*\]/gm;
    re.lastIndex = after + 1;
    const m = re.exec(content);
    return m ? m.index : content.length;
  }

  function mergeTimingPoints(content, newTimingLines) {
    const start = findSectionStart(content, "TimingPoints");
    if (start < 0) return content;
    const headerStart = content.indexOf("[TimingPoints]", start);
    const lineEnd = (headerStart >= 0 ? content.indexOf("\n", headerStart) : content.indexOf("\n", start)) + 1;
    const end = findNextSectionStart(content, lineEnd);
    const existingBlock = content.slice(lineEnd, end);
    const existingLines = existingBlock
      .split("\n")
      .map((ln) => ln.trim())
      .filter((ln) => ln);

    function parseIntOrFloat(s) {
      const n = parseFloat(s);
      return Number.isNaN(n) ? 0 : Math.floor(n);
    }
    function parseOffset(lineStr) {
      const parts = lineStr.split(",");
      return parts.length ? parseIntOrFloat(parts[0].trim()) : 0;
    }
    function isRed(lineStr) {
      const parts = lineStr.split(",");
      if (parts.length <= 6) return true;
      return parseIntOrFloat(parts[6].trim()) === 1;
    }
    function mergedLine(oldLine, newLine) {
      const op = oldLine.split(",").map((p) => p.trim());
      const np = newLine.split(",").map((p) => p.trim());
      if (op.length >= 8 && np.length >= 2) {
        return [op[0], np[1], op[2], op[3], op[4], op[5], op[6], op[7]].join(",");
      }
      return newLine;
    }

    const reds = [];
    const greensByOffset = {};
    for (const lineStr of existingLines) {
      if (isRed(lineStr)) {
        reds.push(lineStr);
      } else {
        greensByOffset[parseOffset(lineStr)] = lineStr;
      }
    }

    const newByOffset = {};
    for (const [offsetMs, lineStr] of newTimingLines) {
      newByOffset[offsetMs] = lineStr;
    }

    const resultFromNew = [];
    for (const [offsetMs, newLine] of Object.entries(newByOffset)) {
      const o = Number(offsetMs);
      const oldGreen = greensByOffset[o];
      if (oldGreen !== undefined) {
        delete greensByOffset[o];
        resultFromNew.push(mergedLine(oldGreen, newLine));
      } else {
        resultFromNew.push(newLine);
      }
    }

    const remainingGreens = Object.values(greensByOffset);
    const combined = reds.concat(remainingGreens, resultFromNew);

    function sortKey(lineStr) {
      const parts = lineStr.split(",");
      const offsetMs = parts.length ? parseIntOrFloat(parts[0].trim()) : 0;
      const uninherited = parts.length > 6 ? parseIntOrFloat(parts[6].trim()) : 1;
      return [offsetMs, 1 - uninherited];
    }
    combined.sort((a, b) => {
      const [oa, ua] = sortKey(a);
      const [ob, ub] = sortKey(b);
      if (oa !== ob) return oa - ob;
      return ua - ub;
    });

    let newSection = combined.join("\n");
    if (newSection && !newSection.endsWith("\n")) newSection += "\n";
    return content.slice(0, lineEnd) + newSection + content.slice(end);
  }

  function replaceHitObjectsSection(content, newHitObjectLines) {
    const start = findSectionStart(content, "HitObjects");
    if (start < 0) {
      return content.trimEnd() + "\n\n[HitObjects]\n" + newHitObjectLines.join("\n") + "\n";
    }
    const headerStart = content.indexOf("[HitObjects]", start);
    const lineEnd = (headerStart >= 0 ? content.indexOf("\n", headerStart) : content.indexOf("\n", start)) + 1;
    const end = content.length;
    let newSection = newHitObjectLines.join("\n");
    if (!newSection.endsWith("\n")) newSection += "\n";
    return content.slice(0, lineEnd) + newSection + content.slice(end);
  }

  function updateVersionInMetadata(content, suffix = " (Cursor Vision)") {
    const start = findSectionStart(content, "Metadata");
    if (start < 0) return content;
    const headerClose = content.indexOf("]", start);
    const lineEnd = content.indexOf("\n", headerClose) + 1;
    const end = findNextSectionStart(content, lineEnd);
    let block = content.slice(start, end);
    const versionRe = /^(Version\s*:)(.*)$/im;
    const match = block.match(versionRe);
    if (!match) return content;
    const keyPart = match[1];
    const valuePart = match[2].trimEnd().replace(/\r$/, "");
    if (valuePart.includes(suffix)) return content;
    const newLine = keyPart + valuePart + suffix + "\n";
    block = block.replace(versionRe, newLine);
    return content.slice(0, start) + block + content.slice(end);
  }

  function buildNewOsuContent(originalContent, newHitObjectLines, newTimingLines, addVersionSuffix = true, suffix = " (Cursor Vision)") {
    let content = originalContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (newTimingLines && newTimingLines.length) {
      content = mergeTimingPoints(content, newTimingLines);
    }
    content = replaceHitObjectsSection(content, newHitObjectLines);
    if (addVersionSuffix) {
      content = updateVersionInMetadata(content, suffix);
    }
    return content;
  }

  return { mergeTimingPoints, replaceHitObjectsSection, updateVersionInMetadata, buildNewOsuContent };
})();
