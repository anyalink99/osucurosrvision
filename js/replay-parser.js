const ReplayParser = (function () {
  const Mod = {
    hard_rock: 1 << 4,
    double_time: 1 << 6,
    half_time: 1 << 8,
    nightcore: 1 << 9,
  };
  function unpackMods(mask) {
    return {
      hard_rock: !!(mask & Mod.hard_rock),
      double_time: !!(mask & Mod.double_time),
      half_time: !!(mask & Mod.half_time),
      nightcore: !!(mask & Mod.nightcore),
    };
  }

  function parseActions(compressedBytes) {
    return new Promise((resolve, reject) => {
      if (typeof LZMA === "undefined") {
        reject(new Error("LZMA not loaded. Include lzma_worker.js and use http(s) or local server."));
        return;
      }
      const arr = Array.isArray(compressedBytes) ? compressedBytes : Array.from(compressedBytes);
      LZMA.decompress(
        arr,
        (decoded) => {
          if (decoded == null) {
            reject(new Error("LZMA decompress failed"));
            return;
          }
          let body;
          if (typeof decoded === "string") {
            body = decoded;
          } else {
            const bytes = decoded instanceof Uint8Array ? decoded : new Uint8Array(decoded);
            body = new TextDecoder("utf-8").decode(bytes);
          }
          body = body.replace(/^\uFEFF/, "").trim();
          const actions = [];
          let offsetMs = 0;
          const parts = body.split(",");
          for (let i = 0; i < parts.length; i++) {
            const s = parts[i].trim();
            if (!s) continue;
            const seg = s.split("|");
            if (seg.length < 4) continue;
            const delta = parseInt(seg[0], 10);
            const x = parseFloat(seg[1]);
            const y = parseFloat(seg[2]);
            const bitmask = parseInt(seg[3], 10);
            if (Number.isNaN(delta)) continue;
            offsetMs += delta;
            actions.push({
              offsetMs,
              position: { x: Number.isNaN(x) ? 0 : Math.round(x), y: Number.isNaN(y) ? 0 : Math.round(y) },
              actionBitmask: Number.isNaN(bitmask) ? 0 : bitmask,
            });
          }
          resolve(actions);
        },
        () => {}
      );
    });
  }

  async function parseReplay(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const buffer = Array.from(bytes);
    const consumeByte = Util.consumeByte.bind(null, buffer);
    const consumeShort = Util.consumeShort.bind(null, buffer);
    const consumeInt = Util.consumeInt.bind(null, buffer);
    const consumeLong = Util.consumeLong.bind(null, buffer);
    const consumeString = Util.consumeString.bind(null, buffer);
    const consumeDatetime = Util.consumeDatetime.bind(null, buffer);

    const mode = consumeByte();
    if (mode !== 0) throw new Error("Only osu!standard (mode 0) is supported");
    const version = consumeInt();
    const beatmapMd5 = consumeString();
    const playerName = consumeString();
    consumeString();
    const count300 = consumeShort();
    const count100 = consumeShort();
    const count50 = consumeShort();
    const countGeki = consumeShort();
    const countKatu = consumeShort();
    const countMiss = consumeShort();
    const score = consumeInt();
    const maxCombo = consumeShort();
    const fullCombo = consumeByte() !== 0;
    const modMask = consumeInt();
    const lifeBarGraph = consumeString();
    const timestamp = consumeDatetime();
    const compressedLength = consumeInt();
    if (compressedLength <= 0 || compressedLength > buffer.length) {
      throw new Error(
        "Replay file invalid: compressed data length is " + compressedLength +
        " (remaining bytes: " + buffer.length + "). The file may be truncated or corrupt."
      );
    }
    const compressedData = buffer.splice(0, compressedLength);

    const actions = await parseActions(compressedData);

    if (!actions || actions.length === 0) {
      const fileHint = typeof window !== "undefined" && window.location.protocol === "file:"
        ? " Open the app from a local server (e.g. double-click serve-web.bat or run \"python -m http.server 8000\" in the web folder)."
        : " The replay may be corrupt, in a legacy format, or the LZMA stream may not have decompressed correctly.";
      throw new Error("Replay has no cursor data." + fileHint);
    }

    const mods = unpackMods(modMask);
    return {
      mode: 0,
      version,
      beatmap_md5: beatmapMd5,
      player_name: playerName,
      count_300: count300,
      count_100: count100,
      count_50: count50,
      count_geki: countGeki,
      count_katu: countKatu,
      count_miss: countMiss,
      score,
      max_combo: maxCombo,
      full_combo: fullCombo,
      timestamp,
      actions,
      life_bar_graph: lifeBarGraph || "",
      mod_mask: modMask,
      hard_rock: mods.hard_rock,
      double_time: mods.double_time,
      half_time: mods.half_time,
      nightcore: mods.nightcore,
    };
  }

  return { parseReplay };
})();
