const Util = (function () {
  function consumeByte(buffer) {
    const result = buffer[0];
    buffer.shift();
    return result;
  }

  function consumeShort(buffer) {
    const result = (buffer[0] | (buffer[1] << 8)) >>> 0;
    buffer.splice(0, 2);
    return result & 0xffff;
  }

  function consumeInt(buffer) {
    const result =
      buffer[0] | (buffer[1] << 8) | (buffer[2] << 16) | (buffer[3] << 24);
    buffer.splice(0, 4);
    return result >>> 0;
  }

  function consumeLong(buffer) {
    const lo =
      buffer[0] | (buffer[1] << 8) | (buffer[2] << 16) | (buffer[3] << 24);
    const hi =
      buffer[4] | (buffer[5] << 8) | (buffer[6] << 16) | (buffer[7] << 24);
    buffer.splice(0, 8);
    return { lo: lo >>> 0, hi: hi >>> 0 };
  }

  function consumeUleb128(buffer) {
    let result = 0;
    let shift = 0;
    while (true) {
      const byte = consumeByte(buffer);
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  }

  function consumeString(buffer) {
    const mode = consumeByte(buffer);
    if (mode === 0) return "";
    if (mode !== 0x0b)
      throw new Error(`expected 0x00 or 0x0B in .osr, got ${mode}`);
    const byteLength = consumeUleb128(buffer);
    const data = buffer.splice(0, byteLength);
    return new TextDecoder("utf-8").decode(new Uint8Array(data));
  }

  const WINDOWS_EPOCH_MS = new Date("0001-01-01T00:00:00.000Z").getTime();

  function consumeDatetime(buffer) {
    const { lo, hi } = consumeLong(buffer);
    const ticks = BigInt(lo) + (BigInt(hi) << 32n);
    const ms = Number(ticks / 10000n);
    return new Date(WINDOWS_EPOCH_MS + ms);
  }

  function writeByte(n) {
    return [n & 0xff];
  }

  function writeShort(n) {
    n = n & 0xffff;
    return [n & 0xff, (n >> 8) & 0xff];
  }

  function writeInt(n) {
    n = n >>> 0;
    return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  }

  function writeLong(n) {
    if (typeof n === "bigint") n = Number(n);
    n = Math.floor(n) >>> 0;
    const lo = n % 0x100000000;
    const hi = Math.floor(n / 0x100000000) >>> 0;
    return [
      lo & 0xff,
      (lo >> 8) & 0xff,
      (lo >> 16) & 0xff,
      (lo >> 24) & 0xff,
      hi & 0xff,
      (hi >> 8) & 0xff,
      (hi >> 16) & 0xff,
      (hi >> 24) & 0xff,
    ];
  }

  function uleb128Encode(n) {
    if (n < 0) throw new Error("ULEB128 only for non-negative integers");
    const parts = [];
    while (true) {
      parts.push(n & 0x7f);
      n >>>= 7;
      if (n === 0) break;
    }
    const out = [...parts];
    for (let i = 0; i < out.length - 1; i++) out[i] |= 0x80;
    return out;
  }

  function osrStringBytes(s) {
    if (!s) s = "";
    const raw = new TextEncoder().encode(s);
    return [0x0b, ...uleb128Encode(raw.length), ...raw];
  }

  return {
    consumeByte,
    consumeShort,
    consumeInt,
    consumeLong,
    consumeUleb128,
    consumeString,
    consumeDatetime,
    writeByte,
    writeShort,
    writeInt,
    writeLong,
    uleb128Encode,
    osrStringBytes,
  };
})();
