// gif-encoder.mjs — 纯 JS GIF89a 动画编码器（零依赖）
// 输入：8bit 调色板 PNG 帧（用 sharp 的 palette 输出量化），输出：动画 GIF Buffer。
// 每帧带独立 256 色本地调色板；LZW 变长码，LZW 最小码宽 8。
import { inflateSync } from "node:zlib";

/* ---------- 调色板 PNG 解码（bitdepth 1/2/4/8，color type 3） ---------- */
export function decodePalettePng(buf) {
  let i = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, palette = null;
  const idat = [];
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const data = buf.slice(i + 8, i + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "PLET") {
      palette = data;
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    i += 12 + len;
  }
  if (colorType !== 3 || !palette) throw new Error("需要调色板 PNG（color type 3）");
  if (![1, 2, 4, 8].includes(bitDepth)) throw new Error("不支持的位深：" + bitDepth);

  const stride = Math.ceil((width * bitDepth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const indices = Buffer.alloc(width * height);
  let prev = Buffer.alloc(stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++];
    const line = raw.slice(pos, pos + stride);
    pos += stride;
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x > 0 ? cur[x - 1] : 0;
      const b = prev[x];
      const c = x > 0 ? prev[x - 1] : 0;
      let v = line[x];
      if (ft === 1) v = (v + a) & 255;
      else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
    // 解包位到索引
    for (let x = 0; x < width; x++) {
      const bitPos = x * bitDepth;
      indices[y * width + x] = (cur[bitPos >> 3] >> (8 - bitDepth - (bitPos & 7))) & ((1 << bitDepth) - 1);
    }
    prev = cur;
  }
  const paletteSize = Math.min(palette.length / 3, 256);
  const table = Buffer.alloc(768);
  for (let p = 0; p < paletteSize; p++) {
    table[p * 3] = palette[p * 3];
    table[p * 3 + 1] = palette[p * 3 + 1];
    table[p * 3 + 2] = palette[p * 3 + 2];
  }
  return { width, height, paletteTable: table, indices };
}

/* ---------- LZW 变长编码 ---------- */
function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const codes = [];
  let codeSize = minCodeSize + 1;
  let dict = new Map();
  let nextCode = end + 1;
  const reset = () => {
    dict = new Map();
    for (let i = 0; i < clear; i++) dict.set(String(i), i);
    nextCode = end + 1;
    codeSize = minCodeSize + 1;
  };
  const push = (code) => codes.push({ code, size: codeSize });
  reset();
  push(clear);
  let current = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const k = current + "," + indices[i];
    if (dict.has(k)) { current = k; continue; }
    push(dict.get(current));
    if (nextCode < 4096) {
      dict.set(k, nextCode++);
      if (nextCode === (1 << codeSize) + 1 && codeSize < 12) codeSize++;
    } else {
      push(clear);
      reset();
    }
    current = String(indices[i]);
  }
  push(dict.get(current));
  push(end);
  const bytes = [];
  let bitBuf = 0, bitCount = 0;
  for (const { code, size } of codes) {
    bitBuf |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) { bytes.push(bitBuf & 255); bitBuf >>= 8; bitCount -= 8; }
  }
  if (bitCount > 0) bytes.push(bitBuf & 255);
  return Buffer.from(bytes);
}

/* ---------- GIF 组装 ---------- */
export function buildGif(frames) {
  // frames: [{ width, height, paletteTable(768), indices, delayMs }]
  const chunks = [];
  chunks.push(Buffer.from("GIF89a"));
  const w = frames[0].width, h = frames[0].height;
  const lsd = Buffer.alloc(7);
  lsd.writeUInt16LE(w, 0);
  lsd.writeUInt16LE(h, 2);
  lsd[4] = 0x70; // 无全局调色板，颜色分辨率 7
  lsd[5] = 0; lsd[6] = 0;
  chunks.push(lsd);
  // Netscape 循环扩展
  chunks.push(Buffer.from([0x21, 0xFF, 0x0B, 0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30, 0x03, 0x01, 0x00, 0x00, 0x00]));
  for (const f of frames) {
    const delayCs = Math.max(1, Math.min(65535, Math.round(f.delayMs / 10)));
    // Graphic Control Extension：不处置（leave），无透明
    const gce = Buffer.from([0x21, 0xF9, 0x04, 0x04, delayCs & 255, (delayCs >> 8) & 255, 0, 0x00]);
    chunks.push(gce);
    // Image Descriptor
    const id = Buffer.alloc(10);
    id[0] = 0x2C;
    id.writeUInt16LE(0, 1);
    id.writeUInt16LE(0, 3);
    id.writeUInt16LE(f.width, 5);
    id.writeUInt16LE(f.height, 7);
    id[9] = 0x87; // 本地调色板 256 色，无交织
    chunks.push(id);
    chunks.push(f.paletteTable);
    chunks.push(Buffer.from([8])); // LZW 最小码宽
    const data = lzwEncode(f.indices, 8);
    for (let i = 0; i < data.length; i += 255) {
      const sub = data.slice(i, i + 255);
      chunks.push(Buffer.from([sub.length]), sub);
    }
    chunks.push(Buffer.from([0]));
  }
  chunks.push(Buffer.from([0x3B]));
  return Buffer.concat(chunks);
}
