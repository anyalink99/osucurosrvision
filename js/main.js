(function () {
  const $ = (sel, el = document) => el.querySelector(sel);

  const state = {
    osuFile: null,
    osrFile: null,
    pairs: [],
    results: [],
    inProgress: false,
  };

  function getFilesArray() {
    const a = [];
    if (state.osuFile) a.push(state.osuFile);
    if (state.osrFile) a.push(state.osrFile);
    return a;
  }

  function setProgress(step, detail) {
    const el = $("#progress-step");
    const sub = $("#progress-detail");
    if (el) el.textContent = step || "";
    if (sub) sub.textContent = detail || "";
  }

  function setProgressBar(percent) {
    const bar = $("#progress-bar-fill");
    if (bar) bar.style.width = percent + "%";
  }

  function showProgressArea() {
    const el = $("#progress-area");
    if (el) el.classList.remove("hidden");
  }

  function hideProgressArea() {
    const el = $("#progress-area");
    if (el) el.classList.add("hidden");
  }

  function showError(msg) {
    const el = $("#error-message");
    if (el) {
      el.textContent = msg;
      el.classList.remove("hidden");
    }
  }

  function clearError() {
    const el = $("#error-message");
    if (el) el.classList.add("hidden");
  }

  function revokeResultUrls() {
    const container = $("#results-list");
    if (!container) return;
    container.querySelectorAll("a[href^='blob:']").forEach((a) => {
      URL.revokeObjectURL(a.href);
    });
  }

  function addResult(result) {
    state.results.push(result);
    renderResults();
  }

  function renderDropZones() {
    updateDropZone($("#drop-zone-osr"), state.osrFile);
    updateDropZone($("#drop-zone-osu"), state.osuFile);
  }

  function updateDropZone(zone, file) {
    if (!zone) return;
    const icon = zone.querySelector(".drop-icon");
    const text = zone.querySelector(".drop-text");
    const display = zone.querySelector(".file-in-zone");
    const nameEl = zone.querySelector(".file-in-zone-name");
    if (file) {
      zone.classList.add("has-file");
      if (icon) icon.style.display = "none";
      if (text) text.classList.add("hidden");
      if (display) display.classList.remove("hidden");
      if (nameEl) nameEl.textContent = file.name;
    } else {
      zone.classList.remove("has-file");
      if (icon) icon.style.display = "";
      if (text) text.classList.remove("hidden");
      if (display) display.classList.add("hidden");
      if (nameEl) nameEl.textContent = "";
    }
  }

  function renderResults() {
    const container = $("#results-list");
    const section = $("#results-section");
    if (!container) return;
    revokeResultUrls();
    if (!state.results.length) {
      container.innerHTML = "";
      if (section) section.classList.add("hidden");
      return;
    }
    if (section) section.classList.remove("hidden");
    container.innerHTML = state.results
      .map(
        (r) => `
        <li class="result-item">
          <span class="result-name">${escapeHtml(r.name)}</span>
          ${r.detail ? `<span class="result-detail">${escapeHtml(r.detail)}</span>` : ""}
          <div class="result-actions">
            <a href="${URL.createObjectURL(r.osuBlob)}" download="${escapeAttr(r.osuDownloadName)}" class="btn btn-dl">.osu</a>
            <a href="${URL.createObjectURL(r.osrBlob)}" download="${escapeAttr(r.osrDownloadName)}" class="btn btn-dl">.osr</a>
          </div>
        </li>`
      )
      .join("");
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function getBeatmapMd5(content) {
    const bytes = new TextEncoder().encode(content);
    return MD5.hashBytes(bytes);
  }

  function normalizeBeatmapContent(content) {
    if (typeof content !== "string" || !content) return content;
    let s = content;
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function normalizeOsuContentForParsing(content) {
    if (typeof content !== "string" || !content) return content;
    const lines = content.split("\n");
    const out = [];
    let inHitObjects = false;
    let inTimingPoints = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const stripped = line.trim();
      if (stripped.startsWith("[HitObjects]")) {
        inHitObjects = true;
        inTimingPoints = false;
        out.push(line);
        continue;
      }
      if (stripped.startsWith("[TimingPoints]")) {
        inTimingPoints = true;
        inHitObjects = false;
        out.push(line);
        continue;
      }
      if (stripped.startsWith("[")) {
        inHitObjects = false;
        inTimingPoints = false;
        out.push(line);
        continue;
      }
      if (inHitObjects && stripped) {
        const idx1 = line.indexOf(",");
        const idx2 = idx1 >= 0 ? line.indexOf(",", idx1 + 1) : -1;
        const idx3 = idx2 >= 0 ? line.indexOf(",", idx2 + 1) : -1;
        if (idx3 >= 0) {
          try {
            const x = Math.floor(parseFloat(line.slice(0, idx1).trim()));
            const y = Math.floor(parseFloat(line.slice(idx1 + 1, idx2).trim()));
            const t = Math.floor(parseFloat(line.slice(idx2 + 1, idx3).trim()));
            out.push(x + "," + y + "," + t + line.slice(idx3));
            continue;
          } catch (_) {}
        }
      }
      if (inTimingPoints && stripped) {
        const parts = line.split(",");
        if (parts.length >= 7) {
          try {
            parts[0] = String(Math.floor(parseFloat(parts[0].trim())));
            parts[6] = String(Math.floor(parseFloat(parts[6].trim())));
            out.push(parts.join(","));
            continue;
          } catch (_) {}
        }
      }
      out.push(line);
    }
    return out.join("\n");
  }

  const appConfig = {
    replay: { health_percent: 88, score: -1, date_years_offset: -77 },
    metadata: { difficulty_name_suffix: " (Cursor Vision)" },
    paths: { input: "./input/", output: "./output/", output_filename_suffix: "_cursor_vision" },
  };

  function readConfigFromUI() {
    const v = (id) => { const el = $("#" + id); return el ? el.value : null; };
    const suffix = v("cfg-difficulty-suffix");
    if (suffix != null) appConfig.metadata.difficulty_name_suffix = suffix;
    const fSuffix = v("cfg-filename-suffix");
    if (fSuffix != null) appConfig.paths.output_filename_suffix = fSuffix;
    const hp = parseFloat(v("cfg-health"));
    if (!isNaN(hp)) appConfig.replay.health_percent = hp;
    const sc = parseInt(v("cfg-score"), 10);
    if (!isNaN(sc)) appConfig.replay.score = sc;
    const dateOff = parseInt(v("cfg-date-offset"), 10);
    if (!isNaN(dateOff)) appConfig.replay.date_years_offset = dateOff;
  }

  function getHitObjectsSectionHint(normalizedContent) {
    if (!normalizedContent) return "";
    const hitObjectsMatch = normalizedContent.match(/\[\s*HitObjects\s*\]/i);
    if (!hitObjectsMatch) return " (no [HitObjects] section found).";
    const after = normalizedContent.indexOf(hitObjectsMatch[0]) + hitObjectsMatch[0].length;
    const rest = normalizedContent.slice(after);
    const nextSection = rest.match(/\n\s*\[[\w\s]*\]/);
    const block = nextSection ? rest.slice(0, nextSection.index) : rest;
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    const lineCount = lines.length;
    if (lineCount === 0) return " ([HitObjects] section is empty).";
    const firstLine = lines[0].trim();
    const preview = firstLine.length > 60 ? firstLine.slice(0, 60) + "\u2026" : firstLine;
    const codes = firstLine.length > 0 ? Array.from(firstLine.slice(0, 20)).map((c) => c.charCodeAt(0)).join(",") : "";
    return " ([HitObjects] has " + lineCount + " line(s); first line chars: " + codes + " | " + preview + ").";
  }

  function buildPair(files) {
    const list = Array.from(files || []);
    const osuFile = list.find((f) => f.name.toLowerCase().endsWith(".osu"));
    const osrFile = list.find((f) => f.name.toLowerCase().endsWith(".osr"));
    if (!osuFile || !osrFile) return Promise.resolve({ pairs: [], error: "Need one .osu and one .osr file." });

    return Promise.all([
      osuFile.arrayBuffer().then((buf) => {
        const content = new TextDecoder("utf-8", { fatal: false }).decode(buf);
        const beatmapMd5 = MD5.hashBytes(new Uint8Array(buf));
        return { file: osuFile, content, beatmapMd5 };
      }),
      osrFile.arrayBuffer().then((buf) =>
        ReplayParser.parseReplay(buf).then((replay) => ({ file: osrFile, replay }))
      ),
    ]).then(([beatmap, replayData]) => {
      if (!replayData.replay) {
        return { pairs: [], error: "Failed to parse the .osr replay file." };
      }
      const beatmapName = osuFile.name.replace(/\.osu$/i, "");
      const replayName = osrFile.name.replace(/\.osr$/i, "");
      return {
        pairs: [
          {
            replayFile: replayData.file,
            beatmapFile: beatmap.file,
            replay: replayData.replay,
            beatmapName,
            replayName,
            beatmapContent: beatmap.content,
            beatmapMd5: beatmap.beatmapMd5,
          },
        ],
        error: null,
      };
    }).catch((err) => ({
      pairs: [],
      error: err && err.message ? err.message : "Failed to read or parse files.",
    }));
  }

  function processOnePair(pair, noVersionSuffix, onProgress) {
    const { replay, beatmapContent, beatmapName, beatmapMd5, replayName } = pair;
    onProgress("Building map\u2026", beatmapName);

    const normalizedContent = normalizeOsuContentForParsing(normalizeBeatmapContent(beatmapContent));
    const beatmap = OsuParser.parseBeatmap(normalizedContent);
    if (!beatmap.hitObjects.length) {
      if (beatmapMd5 && replay.beatmap_md5 && beatmapMd5 !== replay.beatmap_md5) {
        throw new Error("The .osu file does not match the replay (different map). Use the beatmap this replay was played on.");
      }
      const sectionHint = getHitObjectsSectionHint(normalizedContent);
      throw new Error("No hit objects in beatmap" + sectionHint);
    }
    if (!replay.actions.length) {
      throw new Error("Replay has no cursor data. The replay might be corrupt or in an unsupported format.");
    }

    const { lines, firstChange, bounds, newTimingLines } =
      MapAdapter.buildAdaptedHitObjects(replay, beatmap);

    const newOsuContent = OsuWriter.buildNewOsuContent(
      beatmapContent,
      lines,
      newTimingLines,
      !noVersionSuffix,
      (appConfig.metadata && appConfig.metadata.difficulty_name_suffix) || " (Cursor Vision)"
    );
    const newBeatmapMd5 = getBeatmapMd5(newOsuContent);

    const hitObjectsForCount = beatmap.hitObjectsWithMods(!!replay.hard_rock, true);
    const totalObjects = hitObjectsForCount.filter(
      (o) => o.type === "circle" || o.type === "slider"
    ).length;
    const perfectMetadata = {
      count_300: totalObjects,
      count_geki: beatmap.numComboSections,
      max_combo: beatmap.maxCombo,
    };

    onProgress("Writing replay\u2026", beatmapName);
    return ReplayWriter.buildReplayBinary(
      replay,
      newBeatmapMd5,
      bounds,
      perfectMetadata,
      appConfig.replay || null
    ).then((osrBytes) => {
      const filenameSuffix = (appConfig.paths && appConfig.paths.output_filename_suffix) || "_cursor_vision";
      const osuBlob = new Blob([newOsuContent], { type: "text/plain;charset=utf-8" });
      const osrBlob = new Blob([osrBytes], { type: "application/octet-stream" });
      const osuDownloadName = beatmapName + filenameSuffix + ".osu";
      const osrDownloadName = (replayName || beatmapName) + filenameSuffix + ".osr";

      let detail = "";
      if (firstChange) {
        const [[ox, oy], [nx, ny]] = firstChange;
        detail = `First: (${ox},${oy}) \u2192 (${nx},${ny})`;
      }
      return {
        name: beatmapName,
        osuBlob,
        osuDownloadName,
        osrBlob,
        osrDownloadName,
        detail,
      };
    });
  }

  function runConversion() {
    if (state.inProgress || !state.pairs.length) return;
    readConfigFromUI();
    const noVersionSuffix = !appConfig.metadata.difficulty_name_suffix;
    state.inProgress = true;
    state.results = [];
    clearError();
    showProgressArea();
    setProgressBar(0);
    setProgress("Starting\u2026", "");
    $("#convert-btn").disabled = true;

    const total = state.pairs.length;
    let done = 0;

    function next(i) {
      if (i >= total) {
        setProgress("Done", total + " map(s) ready");
        setProgressBar(100);
        state.inProgress = false;
        $("#convert-btn").disabled = false;
        renderResults();
        return;
      }
      const pair = state.pairs[i];
      setProgress("Processing\u2026", (i + 1) + " / " + total + ": " + pair.beatmapName);
      setProgressBar((i / total) * 100);
      processOnePair(pair, noVersionSuffix, (step, name) => {
        setProgress(step, name);
      })
        .then((result) => {
          addResult(result);
          done++;
          setProgressBar(((i + 1) / total) * 100);
          next(i + 1);
        })
        .catch((err) => {
          showError(err.message || "Conversion failed");
          setProgress("Error", "");
          state.inProgress = false;
          $("#convert-btn").disabled = false;
        });
    }
    next(0);
  }

  function applyFilesAndBuild() {
    const files = getFilesArray();
    if (files.length === 0) {
      state.pairs = [];
      hideProgressArea();
      setProgress("", "");
      setProgressBar(0);
      $("#convert-btn").disabled = true;
      clearError();
      renderDropZones();
      return;
    }
    showProgressArea();
    setProgress("Reading files\u2026", "");
    setProgressBar(10);
    buildPair(files)
      .then((result) => {
        state.pairs = result.pairs;
        setProgressBar(30);
        renderDropZones();
        if (result.error) {
          showError(result.error);
          setProgress("", "");
          $("#convert-btn").disabled = true;
          return;
        }
        setProgress("Ready", "Click Convert");
        setProgressBar(40);
        $("#convert-btn").disabled = false;
        clearError();
      })
      .catch((err) => {
        showError(err.message || "Failed to read files");
        setProgress("", "");
        renderDropZones();
      });
  }

  function handleFileDrop(fileList, type) {
    if (!fileList || !fileList.length) return;
    const ext = type === "osr" ? ".osr" : ".osu";
    const file = Array.from(fileList).find((f) => f.name.toLowerCase().endsWith(ext));
    if (!file) return;
    clearError();
    if (type === "osr") state.osrFile = file;
    else state.osuFile = file;
    applyFilesAndBuild();
  }

  function setupDropZone(zone, fileInput, type) {
    if (!zone) return;
    ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
      zone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); });
    });
    zone.addEventListener("dragover", () => zone.classList.add("dragging"));
    zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
    zone.addEventListener("drop", (e) => {
      zone.classList.remove("dragging");
      handleFileDrop(e.dataTransfer.files, type);
    });
    zone.addEventListener("click", (e) => {
      if (e.target.closest(".file-in-zone-remove")) {
        if (type === "osr") state.osrFile = null;
        else state.osuFile = null;
        if (fileInput) fileInput.value = "";
        applyFilesAndBuild();
        return;
      }
      if (fileInput) fileInput.click();
    });
    if (fileInput) {
      fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        clearError();
        if (type === "osr") state.osrFile = file || null;
        else state.osuFile = file || null;
        fileInput.value = "";
        applyFilesAndBuild();
      });
    }
  }

  function init() {
    setupDropZone($("#drop-zone-osr"), $("#file-input-osr"), "osr");
    setupDropZone($("#drop-zone-osu"), $("#file-input-osu"), "osu");

    const convertBtn = $("#convert-btn");
    const settingsToggle = $("#settings-toggle");
    const settingsPanel = $("#settings-panel");

    if (convertBtn) {
      convertBtn.addEventListener("click", () => runConversion());
    }
    if (settingsToggle && settingsPanel) {
      settingsToggle.addEventListener("click", () => {
        settingsPanel.classList.toggle("hidden");
        settingsToggle.classList.toggle("active");
      });
    }
    renderDropZones();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
