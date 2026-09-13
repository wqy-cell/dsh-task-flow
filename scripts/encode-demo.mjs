// scripts/encode-demo.mjs — 用已录好的原始帧重新编码演示 GIF（不用重录）。
// 用法：
//   node scripts/encode-demo.mjs                      # 用默认参数重编三张
//   node scripts/encode-demo.mjs gif1 760 144 0.4     # 指定 name / 宽度 / 颜色数 / 抖动
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { decodePalettePng, buildGif } from "./gif-encoder.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, "..");
const WORKSPACE = path.resolve(PLUGIN_ROOT, "..");
const FRAME_DIR = path.join(WORKSPACE, ".demo-frames");
const OUT_DIR = process.env.DEMO_OUT_DIR || path.join(PLUGIN_ROOT, "assets", "demo");

function loadSharp() {
  try { return require("sharp"); } catch (e) { /* 继续 */ }
  const npx = path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
  for (const d of fs.readdirSync(npx)) {
    const p = path.join(npx, d, "node_modules", "sharp");
    if (fs.existsSync(p)) return require(p);
  }
  const alt = path.join(os.homedir(), ".dsh", "profiles", "node_modules", "sharp");
  if (fs.existsSync(alt)) return require(alt);
  throw new Error("找不到 sharp");
}

const sharp = loadSharp();
const NAMES = ["gif1", "gif2", "gif3"];
const FILES = {
  gif1: "gif1-一句话长出星图.gif",
  gif2: "gif2-AI推进星图点亮.gif",
  gif3: "gif3-任务历史.gif"
};

async function encode(name, width, colours, dither, tol) {
  const dir = path.join(FRAME_DIR, name);
  if (!fs.existsSync(dir)) { console.log("跳过", name, "（没有原始帧）"); return null; }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  const times = JSON.parse(fs.readFileSync(path.join(dir, "times.json"), "utf8"));
  const frames = files.map((f, i) => ({ buf: fs.readFileSync(path.join(dir, f)), t: Number(times[i]) }));
  const delays = frames.map((f, i) => {
    const next = frames[i + 1];
    if (!next) return 111;
    const d = Number(next.t) - Number(f.t);
    return Number.isFinite(d) ? Math.min(1000, Math.max(60, d)) : 111;
  });
  const quant = [];
  const raw = [];
  for (const f of frames) {
    const q = await sharp(f.buf).resize({ width, withoutEnlargement: true })
      .png({ palette: true, colours, dither, compressionLevel: 0, effort: 1 }).toBuffer();
    quant.push(q);
    // 逐像素比较用（调色板不同，不能直接比索引）
    raw.push(await sharp(f.buf).resize({ width, withoutEnlargement: true }).greyscale().raw().toBuffer());
  }
  const kept = [];
  for (let i = 0; i < quant.length; i++) {
    const q = quant[i];
    const prev = kept[kept.length - 1];
    if (prev) {
      const same = prev.buf.length === q.length && prev.buf.equals(q);
      // 近似相同（只有花瓣等少量像素在动）也合并：省体积，节奏用累加延时保住
      const near = !same && prev.raw && prev.raw.length === raw[i].length && diffRatio(prev.raw, raw[i]) < tol;
      if (same || near) { prev.delayMs += delays[i]; continue; }
    }
    kept.push({ buf: q, raw: raw[i], delayMs: delays[i] });
  }
  const gif = buildGif(kept.map((k) => ({ ...decodePalettePng(k.buf), delayMs: k.delayMs })));
  const secs = (kept.reduce((a, c) => a + c.delayMs, 0) / 1000).toFixed(1);
  console.log(`${name}: ${width}px/${colours}色/抖动${dither}/容差${tol} → ${kept.length} 帧（原 ${frames.length}） · ${secs}s · ${Math.round(gif.length / 1024)}KB`);
  return { gif, out: path.join(OUT_DIR, FILES[name]) };
}

/** 两张灰度图里「明显不同」的像素占比 */
function diffRatio(a, b) {
  let diff = 0;
  const step = 1;                       // 逐像素；图不大，够快
  for (let i = 0; i < a.length; i += step) {
    if (Math.abs(a[i] - b[i]) > 12) diff++;
  }
  return diff / (a.length / step);
}

const args = process.argv.slice(2);
const only = args[0] && NAMES.includes(args[0]) ? args[0] : null;
const width = Number(args[1]) || 760;
const colours = Number(args[2]) || 144;
const dither = args[3] !== undefined ? Number(args[3]) : 0.4;
const tol = args[4] !== undefined ? Number(args[4]) : 0;      // 0 = 只合并完全相同的帧

for (const name of NAMES) {
  if (only && only !== name) continue;
  const r = await encode(name, width, colours, dither, tol);
  if (r) {
    fs.writeFileSync(r.out, r.gif);
    console.log("  →", path.basename(r.out));
  }
}
