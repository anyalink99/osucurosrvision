const ReplayWriter = (function () {
  const Mod = {
    no_fail: 1,
    easy: 1 << 1,
    no_video: 1 << 2,
    hidden: 1 << 3,
    hard_rock: 1 << 4,
    sudden_death: 1 << 5,
    double_time: 1 << 6,
    relax: 1 << 7,
    half_time: 1 << 8,
    nightcore: 1 << 9,
    flashlight: 1 << 10,
    autoplay: 1 << 11,
    spun_out: 1 << 12,
    auto_pilot: 1 << 13,
    perfect: 1 << 14,
  };

  function modMaskFromReplay(replay) {
    let mask = 0;
    if (replay.no_fail) mask |= Mod.no_fail;
    if (replay.easy) mask |= Mod.easy;
    if (replay.no_video) mask |= Mod.no_video;
    if (replay.hidden) mask |= Mod.hidden;
    if (replay.hard_rock) mask |= Mod.hard_rock;
    if (replay.sudden_death) mask |= Mod.sudden_death;
    if (replay.double_time) mask |= Mod.double_time;
    if (replay.relax) mask |= Mod.relax;
    if (replay.half_time) mask |= Mod.half_time;
    if (replay.nightcore) mask |= Mod.nightcore;
    if (replay.flashlight) mask |= Mod.flashlight;
    if (replay.autoplay) mask |= Mod.autoplay;
    if (replay.spun_out) mask |= Mod.spun_out;
    if (replay.auto_pilot) mask |= Mod.auto_pilot;
    if (replay.perfect) mask |= Mod.perfect;
    return mask;
  }

  function windowsTicks(date) {
    const epoch = new Date("0001-01-01T00:00:00.000Z").getTime();
    const ms = date.getTime() - epoch;
    return Math.floor(ms * 10000);
  }

  function buildLifeBarConstant(replay, healthPercent) {
    const value = healthPercent / 100;
    if (replay.life_bar_graph && typeof replay.life_bar_graph === "string" && replay.life_bar_graph.length > 0) {
      const points = replay.life_bar_graph.split(",").filter(Boolean);
      return points.map((p) => {
        const [ms] = p.split("|");
        return (ms != null ? ms.trim() : "0") + "|" + value;
      }).join(",");
    }
    if (!replay.actions || replay.actions.length === 0) return "";
    const firstMs = replay.actions[0].offsetMs;
    const lastMs = replay.actions[replay.actions.length - 1].offsetMs;
    const stepMs = Math.max(100, Math.floor((lastMs - firstMs) / 200));
    const out = [];
    for (let ms = firstMs; ms <= lastMs; ms += stepMs) {
      out.push(ms + "|" + value);
    }
    if (out.length && parseInt(out[out.length - 1].split("|")[0], 10) < lastMs) {
      out.push(lastMs + "|" + value);
    }
    return out.join(",");
  }

  function encodeActions(replay, bounds) {
    const clamp = CursorPath.clampToBounds;
    const parts = [];
    let prevOffsetMs = 0;
    for (const action of replay.actions) {
      const offsetMs = action.offsetMs;
      const deltaMs = offsetMs - prevOffsetMs;
      prevOffsetMs = offsetMs;
      let x = action.position.x;
      let y = action.position.y;
      if (bounds) {
        const [minX, maxX, minY, maxY] = bounds;
        [x, y] = clamp(x, y, minX, maxX, minY, maxY);
      }
      const ix = Math.round(x);
      const iy = Math.round(y);
      const mask = action.actionBitmask;
      parts.push(`${deltaMs}|${ix}|${iy}|${mask}`);
    }
    const body = parts.join(",");
    return body;
  }

  function compressLzma(body) {
    return new Promise((resolve, reject) => {
      if (typeof LZMA === "undefined") {
        reject(new Error("LZMA not loaded"));
        return;
      }
      const bytes = new TextEncoder().encode(body);
      const arr = Array.from(bytes);
      LZMA.compress(
        arr,
        1,
        (result) => {
          if (result === null || result === undefined) {
            reject(new Error("LZMA compress failed"));
            return;
          }
          const out = result instanceof Uint8Array ? result : new Uint8Array(result);
          resolve(out);
        },
        () => {}
      );
    });
  }

  async function buildReplayBinary(replay, newBeatmapMd5, bounds, perfectMetadata, replayOverrides) {
    const payload = [];

    payload.push(...Util.writeByte(replay.mode));
    payload.push(...Util.writeInt(replay.version));
    payload.push(...Util.osrStringBytes(newBeatmapMd5));
    payload.push(...Util.osrStringBytes(replay.player_name || ""));
    payload.push(...Util.osrStringBytes(""));

    let count300, count100, count50, countGeki, countKatu, countMiss, maxCombo, fullCombo;
    let timestamp;
    let score;
    let lifeBar;
    if (perfectMetadata) {
      count300 = perfectMetadata.count_300;
      count100 = 0;
      count50 = 0;
      countGeki = perfectMetadata.count_geki;
      countKatu = 0;
      countMiss = 0;
      maxCombo = perfectMetadata.max_combo;
      fullCombo = true;
      const now = new Date();
      if (replayOverrides && replayOverrides.date_years_offset != null) {
        const y = now.getFullYear() + replayOverrides.date_years_offset;
        try {
          timestamp = new Date(now);
          timestamp.setFullYear(y);
        } catch (_) {
          timestamp = now;
        }
      } else {
        timestamp = now;
      }
      score = (replayOverrides && "score" in replayOverrides) ? replayOverrides.score : replay.score;
      if (replayOverrides && replayOverrides.health_percent != null) {
        lifeBar = buildLifeBarConstant(replay, replayOverrides.health_percent);
      } else {
        lifeBar = replay.life_bar_graph != null ? String(replay.life_bar_graph) : "";
      }
    } else {
      count300 = replay.count_300;
      count100 = replay.count_100;
      count50 = replay.count_50;
      countGeki = replay.count_geki;
      countKatu = replay.count_katu;
      countMiss = replay.count_miss;
      maxCombo = replay.max_combo;
      fullCombo = replay.full_combo;
      timestamp = replay.timestamp instanceof Date ? replay.timestamp : new Date(replay.timestamp);
      score = replay.score;
      lifeBar = replay.life_bar_graph != null ? String(replay.life_bar_graph) : "";
    }

    payload.push(...Util.writeShort(count300));
    payload.push(...Util.writeShort(count100));
    payload.push(...Util.writeShort(count50));
    payload.push(...Util.writeShort(countGeki));
    payload.push(...Util.writeShort(countKatu));
    payload.push(...Util.writeShort(countMiss));
    payload.push(...Util.writeInt(score));
    payload.push(...Util.writeShort(maxCombo));
    payload.push(...Util.writeByte(fullCombo ? 1 : 0));
    const modMask = replay.mod_mask !== undefined && replay.mod_mask !== null
      ? replay.mod_mask
      : modMaskFromReplay(replay);
    payload.push(...Util.writeInt(modMask));
    payload.push(...Util.osrStringBytes(lifeBar));
    payload.push(...Util.writeLong(windowsTicks(timestamp)));

    const body = encodeActions(replay, bounds);
    const compressed = await compressLzma(body);
    payload.push(...Util.writeInt(compressed.length));
    payload.push(...compressed);
    payload.push(...Util.writeLong(0));

    return new Uint8Array(payload);
  }

  return { buildReplayBinary };
})();
