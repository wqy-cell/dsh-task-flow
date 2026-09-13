// scripts/record-demo.mjs — 一键录制 README 用的三张演示动图。
//
// 为什么要在「普通终端 / 双击」里跑：DSH 沙箱会拦截 Edge 的启动（0x80000003 崩溃），
// 也会在命令结束时回收整棵进程树，所以录制必须由你的桌面进程发起。
//
// 用法（Windows）：
//   双击工作区里的  录制演示动图.bat
//   或  node scripts/record-demo.mjs            # 录全部
//       node scripts/record-demo.mjs gif2       # 只重录某一张
//
// 产物：
//   assets/demo/gif1-一句话长出星图.gif / gif2-AI推进星图点亮.gif / gif3-任务历史.gif
//   原始帧留在 <工作区>/.demo-frames/<name>/NNN.png（+ times.json 记录每帧真实时刻），
//   想换编码参数不用重录：帧还在，直接调 TIERS 重新编码即可。
import { spawn } from "node:child_process";
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
const OUT_DIR = path.join(PLUGIN_ROOT, "assets", "demo");
const FRAME_DIR = path.join(WORKSPACE, ".demo-frames");
const LOG_FILE = path.join(WORKSPACE, "record-demo.log");

const VIEW = { width: 1040, height: 720 };
const FPS = 9;                       // 目标采样帧率（截图慢时会自然降速，延时会按真实间隔写）
const FRAME_MS = Math.round(1000 / FPS);
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...a) {
  const line = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch (e) { /* ignore */ }
}

/* ---------- 定位依赖（ws / sharp）：录制在沙箱外跑，但编码还是用这两个包 ---------- */
function loadDep(name) {
  const roots = [
    path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx"),
    path.join(os.homedir(), ".dsh", "profiles", "node_modules"),
    path.join(WORKSPACE, "node_modules"),
    path.join(PLUGIN_ROOT, "node_modules")
  ];
  try { return require(name); } catch (e) { /* 继续找 */ }
  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(root).map((d) => path.join(root, d, "node_modules", name)).filter((p) => fs.existsSync(p));
    } catch (e) { /* ignore */ }
    entries.push(path.join(root, name));
    for (const p of entries) {
      try { return require(p); } catch (e) { /* 继续 */ }
    }
  }
  throw new Error("找不到依赖 " + name + "，请先 npm i -D " + name);
}

/* ---------- 极简 CDP 客户端（页面级 WebSocket） ---------- */
class Cdp {
  constructor(WebSocketImpl, wsUrl) {
    this.ws = new WebSocketImpl(wsUrl);
    this.id = 0;
    this.pending = new Map();
  }
  async open() {
    await new Promise((res, rej) => { this.ws.on("open", res); this.ws.on("error", rej); });
    this.ws.on("message", (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      }
    });
  }
  send(method, params = {}) {
    const i = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(i, { res, rej });
      this.ws.send(JSON.stringify({ id: i, method, params }));
      setTimeout(() => { if (this.pending.has(i)) { this.pending.delete(i); rej(new Error("CDP 超时: " + method)); } }, 30000);
    });
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails.exception && (r.exceptionDetails.exception.description || r.exceptionDetails.exception.value);
      throw new Error("eval: " + (d || r.exceptionDetails.text));
    }
    return r.result ? r.result.value : undefined;
  }
  async waitFor(expression, timeoutMs = 90000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try { if (await this.eval(expression)) return true; } catch (e) { /* ignore */ }
      await sleep(400);
    }
    return false;
  }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

/* ---------- 注入到页面里的演示辅助：假光标 + 点击涟漪 + 字幕 ---------- */
const OVERLAY_JS = `
window.__demo = (() => {
  if (window.__demo && window.__demo.ready) return window.__demo;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));   // 页面侧自己的等待，别用 Node 的 sleep
  const el = document.createElement('div');
  el.id = 'tf-demo-cursor';
  el.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transition:transform .28s cubic-bezier(.4,0,.2,1);transform:translate(-100px,-100px)';
  el.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8.5-6.2 1.4L9.6 19z" fill="#fff" stroke="#1b1b22" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const cap = document.createElement('div');
  cap.id = 'tf-demo-caption';
  cap.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483646;pointer-events:none;padding:8px 16px;border-radius:999px;font:600 15px/1.4 system-ui,-apple-system,"Microsoft YaHei",sans-serif;color:#fff;background:rgba(24,26,38,.86);box-shadow:0 6px 24px rgba(0,0,0,.35);opacity:0;transition:opacity .18s ease;white-space:nowrap';
  const ripple = document.createElement('div');
  ripple.id = 'tf-demo-ripple';
  ripple.style.cssText = 'position:fixed;left:0;top:0;width:12px;height:12px;border-radius:50%;border:2px solid #ff8ec2;z-index:2147483647;pointer-events:none;opacity:0';
  document.body.append(el, cap, ripple);
  const api = {
    ready: true,
    /** 把字幕放到面板内部靠下的位置（截屏按面板区域裁剪，字幕必须落在裁剪框里） */
    place(left, top, width) {
      cap.style.left = Math.round(left + width / 2) + 'px';
      cap.style.bottom = 'auto';
      cap.style.top = Math.round(top) + 'px';
      return true;
    },
    move(x, y) { el.style.transform = 'translate(' + (x - 3) + 'px,' + (y - 2) + 'px)'; return wait(320); },
    async rect(sel) {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    },
    async moveTo(sel, dy) {
      const t = await api.rect(sel);
      if (!t) return false;
      return api.move(t.x + t.w / 2, t.y + t.h / 2 + (dy || 0));
    },
    async click(sel, dy) {
      const t = await api.rect(sel);
      if (!t) return false;
      const x = t.x + t.w / 2, y = t.y + t.h / 2 + (dy || 0);
      await api.move(x, y);
      ripple.style.transition = 'none';
      ripple.style.opacity = '0.95';
      ripple.style.transform = 'translate(' + (x - 6) + 'px,' + (y - 6) + 'px) scale(1)';
      void ripple.offsetWidth;
      ripple.style.transition = 'transform .45s ease-out, opacity .45s ease-out';
      ripple.style.transform = 'translate(' + (x - 6) + 'px,' + (y - 6) + 'px) scale(3.2)';
      ripple.style.opacity = '0';
      document.querySelector(sel).click();
      await wait(180);
      return true;
    },
    caption(text) {
      cap.textContent = text || '';
      cap.style.opacity = text ? '1' : '0';
    },
    /** 逐字输入（React 受控输入：每次都要用原生 setter 触发 input 事件） */
    async type(sel, text, perChar) {
      const e = document.querySelector(sel);
      if (!e) return false;
      e.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      let cur = '';
      for (const ch of text) {
        cur += ch;
        setter.call(e, cur);
        e.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(perChar || 90);
      }
      return true;
    },
    /** 通过 host 接口推进星图（与 Agent 真实调用的是同一个接口）；返回 true 或 HTTP 状态串 */
    async advance(flowId, nodeId, action, note) {
      const r = await fetch('/task-flow/advance?flow=' + encodeURIComponent(flowId) + '&node=' + encodeURIComponent(nodeId)
        + '&action=' + encodeURIComponent(action || 'complete') + '&note=' + encodeURIComponent(note || ''), { method: 'GET' });
      return r.ok ? true : ('HTTP ' + r.status);
    },
    flow() {
      const f = window.__dshTaskFlow && window.__dshTaskFlow.getActiveFlow();
      if (!f) return null;
      return { id: f.id, title: f.title, nodes: f.nodes.map((n) => ({ id: n.id, kind: n.kind })) };
    }
  };
  window.__demo = api;
  return api;
})();
true;
`;

/* ---------- 录制器：后台按固定帧率抓帧，并记下每帧真实时刻 ---------- */
class Recorder {
  constructor(cdp, clip) {
    this.cdp = cdp;
    this.clip = Object.assign({ scale: 1 }, clip);   // clip 必须带 scale，否则 CDP 直接报参数错误
    this.frames = [];
    this.timer = null;
    this.busy = false;
    this.failures = 0;
    this.firstError = null;
  }
  start() {
    this.timer = setInterval(async () => {
      if (this.busy) return;
      this.busy = true;
      try {
        const r = await this.cdp.send("Page.captureScreenshot", {
          format: "png", captureBeyondViewport: false, clip: this.clip
        });
        // 记下抓帧的真实时刻：GIF 每帧延时就按它算，播放速度才和实际操作一致
        this.frames.push({ buf: Buffer.from(r.data, "base64"), t: Date.now() });
      } catch (e) {
        this.failures++;
        if (!this.firstError) this.firstError = (e && e.message) || String(e);
      }
      this.busy = false;
    }, FRAME_MS);
  }
  async stop() {
    clearInterval(this.timer);
    await sleep(FRAME_MS * 2);
    if (this.failures) log(`  （抓帧失败 ${this.failures} 次，首次原因：${this.firstError}）`);
    if (!this.frames.length) throw new Error("一帧都没抓到" + (this.firstError ? "：" + this.firstError : "") + "（clip=" + JSON.stringify(this.clip) + "）");
    return this.frames;
  }
}

/** 每帧播放延时 = 与下一帧的真实间隔（夹在 60ms–1s；异常值退回 FRAME_MS，绝不让 NaN 混进来） */
function frameDelays(frames) {
  return frames.map((f, i) => {
    const next = frames[i + 1];
    if (!next) return FRAME_MS;
    const d = Number(next.t) - Number(f.t);
    if (!Number.isFinite(d)) return FRAME_MS;
    return Math.min(1000, Math.max(60, d));
  });
}

/** 采样统计：平均间隔一眼看出抓帧够不够快、时间戳是否完整 */
function sampleStats(frames) {
  const ts = frames.map((f) => Number(f.t)).filter((t) => Number.isFinite(t));
  if (ts.length < 2) return { span: 0, avg: 0, ok: ts.length === frames.length };
  const span = (ts[ts.length - 1] - ts[0]) / 1000;
  return { span, avg: Math.round((span * 1000) / (ts.length - 1)), ok: ts.length === frames.length };
}

/* ---------- 编码：量化 → 去重 → 打包 GIF（体积超预算自动降档） ---------- */
const SIZE_BUDGET = 1.5 * 1024 * 1024;          // 单张 GIF 目标上限
const TIERS = [
  { width: 720, colours: 160, dither: 0.6 },
  { width: 660, colours: 112, dither: 0.3 },
  { width: 600, colours: 80, dither: 0 }
];

async function encodeGif(sharp, frames, outFile) {
  const delays = frameDelays(frames);
  const st = sampleStats(frames);
  log(`  采样：${frames.length} 帧 / ${st.span.toFixed(1)}s · 平均 ${st.avg}ms/帧（时间戳完整=${st.ok}）`);
  let last = null;
  for (let t = 0; t < TIERS.length; t++) {
    const tier = TIERS[t];
    const quant = [];
    for (const f of frames) {
      quant.push(await sharp(f.buf).resize({ width: tier.width, withoutEnlargement: true })
        .png({ palette: true, colours: tier.colours, dither: tier.dither, compressionLevel: 0, effort: 1 }).toBuffer());
    }
    // 连续相同帧合并（静止段落只留一帧 + 累加真实延时），既省体积又不掉节奏
    const kept = [];
    for (let i = 0; i < quant.length; i++) {
      const q = quant[i];
      const prev = kept[kept.length - 1];
      if (prev && prev.buf.length === q.length && prev.buf.equals(q)) { prev.delayMs += delays[i]; continue; }
      kept.push({ buf: q, delayMs: delays[i] });
    }
    const gif = buildGif(kept.map((k) => ({ ...decodePalettePng(k.buf), delayMs: k.delayMs })));
    const secs = (kept.reduce((a, c) => a + c.delayMs, 0) / 1000).toFixed(1);
    last = { gif, kept, tier, secs };
    log(`   档位 ${t + 1}/${TIERS.length}（${tier.width}px/${tier.colours}色）→ ${kept.length} 帧 · ${secs}s · ${Math.round(gif.length / 1024)}KB`);
    if (gif.length <= SIZE_BUDGET) break;
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, last.gif);
  log(`   GIF 已生成: ${path.basename(outFile)} · ${frames.length} 帧采样 → ${last.kept.length} 帧 · ${last.secs}s · ${Math.round(last.gif.length / 1024)}KB`);
  return { frames: last.kept.length, seconds: Number(last.secs), bytes: last.gif.length };
}

function dumpFrames(name, frames) {
  try {
    const dir = path.join(FRAME_DIR, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    frames.forEach((f, i) => fs.writeFileSync(path.join(dir, String(i).padStart(4, "0") + ".png"), f.buf));
    fs.writeFileSync(path.join(dir, "times.json"), JSON.stringify(frames.map((f) => f.t)));
  } catch (e) { log("  （原始帧保存失败：" + e.message + "）"); }
}

/* ---------- 启动浏览器（沙箱外才行） ---------- */
function edgePath() {
  const cands = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ];
  return cands.find((p) => fs.existsSync(p)) || null;
}

async function launchBrowser(url, headless) {
  const exe = edgePath();
  if (!exe) throw new Error("找不到 msedge.exe");
  const profile = path.join(WORKSPACE, ".edge-record");
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  const args = [
    `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars",
    "--mute-audio", `--window-size=${VIEW.width},${VIEW.height}`
  ];
  if (headless) args.unshift("--headless=new");
  const child = spawn(exe, [...args, url], { stdio: "ignore", detached: false });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await sleep(700);
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return child;
    } catch (e) { /* 还没起来 */ }
  }
  try { child.kill(); } catch (e) { /* ignore */ }
  throw new Error("浏览器调试端口没起来（headless=" + headless + "）");
}

/* ---------- 主流程 ---------- */
async function main() {
  const only = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
  const WebSocketImpl = loadDep("ws");
  const sharp = loadDep("sharp");
  fs.writeFileSync(LOG_FILE, "");
  log("== 演示动图录制 ==", new Date().toLocaleString());

  const logPath = path.join(WORKSPACE, "dsh-web.log");
  if (!fs.existsSync(logPath)) throw new Error("找不到 " + logPath + "：先双击桌面「DeepSeek Harness」把 DSH 跑起来");
  const m = /https?:\/\/[^\s"']*\?token=[A-Za-z0-9_-]+/.exec(fs.readFileSync(logPath, "utf8"));
  if (!m) throw new Error("dsh-web.log 里没有带 token 的地址：重启一次 DSH（桌面「DeepSeek Harness」）再来");
  const url = m[0];
  log("DSH:", url.replace(/token=.*/, "token=***"));

  let child = null, cdp = null;
  for (const headless of [true, false]) {
    try {
      child = await launchBrowser(url, headless);
      log("浏览器已启动（headless=" + headless + "）");
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === "page" && t.url.includes("3080")) || list.find((t) => t.type === "page");
      cdp = new Cdp(WebSocketImpl, page.webSocketDebuggerUrl);
      await cdp.open();
      await cdp.send("Page.enable");
      await cdp.send("Runtime.enable");
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1, mobile: false }).catch(() => {});
      const ready = await cdp.waitFor("!!document.querySelector('.tf-button')", headless ? 60000 : 90000);
      if (ready) break;
      log("（headless=" + headless + " 没等到插件按钮，换另一种模式重试）");
    } catch (e) {
      log("（headless=" + headless + " 启动失败：" + e.message + "）");
    }
    try { cdp && cdp.close(); } catch (e) { /* ignore */ }
    try { child && child.kill(); } catch (e) { /* ignore */ }
    cdp = null; child = null;
  }
  if (!cdp || !child) throw new Error("浏览器起不来（headless / 有头都失败），看 " + LOG_FILE);

  await cdp.eval("if (!document.querySelector('.tf-panel')) document.querySelector('.tf-button').click()");
  if (!(await cdp.waitFor("!!document.querySelector('.tf-panel .tf-ai-input')", 20000))) throw new Error("面板没打开");
  await cdp.eval(OVERLAY_JS);
  await sleep(600);

  const panel = await cdp.eval("(() => { const r = document.querySelector('.tf-panel').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }; })()");
  // 裁到面板本身（外扩 10px 留阴影），并夹在视口内；缩放交给编码阶段做，抓帧才够快
  const clip = { x: Math.max(0, panel.x - 10), y: Math.max(0, panel.y - 10), width: 0, height: 0 };
  clip.width = Math.min(panel.width + 20, VIEW.width - clip.x);
  clip.height = Math.min(panel.height + 20, VIEW.height - clip.y);
  log("面板区域:", clip, "| 视口:", VIEW);
  // 字幕放在面板内靠下的空白处（截屏按面板区域裁剪，字幕必须落在裁剪框里）
  await cdp.eval(`window.__demo.place(${panel.x}, ${panel.y + panel.height - 112}, ${panel.width})`);
  const reducedMotion = (on) => cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: on ? "reduce" : "no-preference" }]
  }).catch(() => {});

  const results = {};
  const rec = new Recorder(cdp, clip);

  /* ===== GIF 1：一句话长出星图 ===== */
  if (!only || only === "gif1") {
    log("▶ 录制 gif1：一句话长出星图");
    await reducedMotion(false);              // 生长动画要留着
    await cdp.eval("window.__demo.move(-100, -100)");
    rec.frames = [];
    rec.start();
    await cdp.eval("window.__demo.caption('① 在面板里写一句目标')");
    await sleep(700);
    await cdp.eval("window.__demo.moveTo('.tf-ai-input')");
    await sleep(300);
    await cdp.eval("window.__demo.caption('① 写下一句话目标，比如「给父母策划一次云南旅行」')");
    await cdp.eval("window.__demo.type('.tf-ai-input', '给父母策划一次云南旅行', 95)");
    await sleep(400);
    await cdp.eval("window.__demo.caption('② 点「✨ 生成」，交给 DSH 默认模型拆解')");
    await cdp.eval("window.__demo.click('.tf-ai-btn')");
    await sleep(900);
    await cdp.eval("window.__demo.caption('③ 星图正在一颗颗长出来…')");
    for (let i = 0; i < 60; i++) {
      const st = await cdp.eval("(() => { const m = document.querySelector('.tf-ai-msg'); return m ? m.className : ''; })()");
      if (st.includes("ok") || st.includes("warn")) break;
      if (st.includes("error")) throw new Error("ai-plan 返回错误（模型未就绪或输出异常）");
      await sleep(400);
    }
    await sleep(1800);                       // 让生长动画播完
    await cdp.eval("window.__demo.caption('✓ 一张带分支和验收标准的星图长好了')");
    await sleep(1500);
    const frames = await rec.stop();
    results.gif1 = await encodeGif(sharp, frames, path.join(OUT_DIR, "gif1-一句话长出星图.gif"));
    dumpFrames("gif1", frames);
  }

  /* ===== GIF 2：Agent 干活，星图点亮 ===== */
  if (!only || only === "gif2") {
    log("▶ 录制 gif2：Agent 推进星图点亮");
    await reducedMotion(true);               // 关掉飘花瓣：静止段能合并，GIF 小很多
    const flow = await cdp.eval("window.__demo.flow()");
    if (!flow) throw new Error("读不到当前流程（gif1 是否生成成功？）");
    const targets = flow.nodes.filter((n) => n.kind !== "choice").slice(0, 5);
    await cdp.eval("window.__demo.move(-100, -100)");
    rec.frames = [];
    rec.start();
    await cdp.eval("window.__demo.caption('① Agent 每完成一步，就调用一次 /task-flow/advance')");
    await sleep(1300);
    for (const n of targets) {
      const ok = await cdp.eval(`window.__demo.advance(${JSON.stringify(flow.id)}, ${JSON.stringify(n.id)}, 'complete', 'Agent 已推进')`);
      if (ok !== true) throw new Error("advance 接口不可用（" + ok + "）——host 半边需要重启 dsh web 后才生效");
      await cdp.eval("window.__demo.caption('② 星图自己点亮：节点绽放 + 走到下一步')");
      await sleep(1600);                     // 等客户端 1.5s 轮询把事件应用上去
    }
    await cdp.eval("window.__demo.caption('③ 失败也会如实反馈（红色告警 + 执行流记录）')");
    const failRes = await cdp.eval(`window.__demo.advance(${JSON.stringify(flow.id)}, ${JSON.stringify(targets[0].id)}, 'fail', '接口限流，稍后重试')`);
    if (failRes !== true) log("  （fail 事件没发出去：" + failRes + "）");
    await sleep(2400);
    await cdp.eval("window.__demo.caption('✓ 进度、来源、失败原因，全都留在星图上')");
    await sleep(1500);
    const frames = await rec.stop();
    results.gif2 = await encodeGif(sharp, frames, path.join(OUT_DIR, "gif2-AI推进星图点亮.gif"));
    dumpFrames("gif2", frames);
  }

  /* ===== GIF 3：任务历史 ===== */
  if (!only || only === "gif3") {
    log("▶ 录制 gif3：任务历史（过往任务）");
    await reducedMotion(true);
    await cdp.eval("window.__demo.move(-100, -100)");
    rec.frames = [];
    rec.start();
    await cdp.eval("window.__demo.caption('① 点标题右侧的箭头，展开任务历史')");
    await sleep(1000);
    await cdp.eval("window.__demo.click('.tf-flow-picker')");
    await sleep(1200);
    await cdp.eval("window.__demo.caption('② 每个任务都带进度、节点数和最近使用时间')");
    await sleep(1700);
    const rowCount = await cdp.eval("document.querySelectorAll('.tf-library-row').length");
    if (rowCount > 1) {
      await cdp.eval("window.__demo.caption('③ 点一下就能切回过往任务，进度原样保留')");
      await cdp.eval("window.__demo.click('.tf-library-row:not(.active)')");
      await sleep(1900);
    }
    await cdp.eval("window.__demo.caption('✓ 还能改名 / 导出 / 删除，或整库导入导出')");
    await sleep(1700);
    const frames = await rec.stop();
    results.gif3 = await encodeGif(sharp, frames, path.join(OUT_DIR, "gif3-任务历史.gif"));
    dumpFrames("gif3", frames);
  }

  cdp.close();
  try { child.kill(); } catch (e) { /* ignore */ }
  // 顺手删掉废弃的旧文件名，避免 README 引用到它
  const legacy = path.join(OUT_DIR, "gif3-会话主线星.gif");
  if (fs.existsSync(legacy) && fs.existsSync(path.join(OUT_DIR, "gif3-任务历史.gif"))) fs.rmSync(legacy, { force: true });

  log("== 完成 ==");
  for (const [k, v] of Object.entries(results)) log(`  ${k}: ${v.frames} 帧 / ${v.seconds}s / ${Math.round(v.bytes / 1024)}KB`);
  log("产物目录:", OUT_DIR);
  log("原始帧目录:", FRAME_DIR, "（想改编码参数不用重录）");
  try {
    const first = path.join(OUT_DIR, "gif1-一句话长出星图.gif");
    if (fs.existsSync(first)) spawn("cmd", ["/c", "start", "", first], { stdio: "ignore", detached: true }).unref();
  } catch (e) { /* ignore */ }
  process.exit(0);
}

main().catch((e) => {
  log("失败:", e && e.message);
  if (e && e.stack) log(e.stack.split("\n").slice(1, 4).join("\n"));
  log("排查：1) 先双击桌面「DeepSeek Harness」确认 DSH 在跑；2) 看 " + LOG_FILE);
  process.exit(1);
});
