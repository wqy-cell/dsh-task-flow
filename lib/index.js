// dsh-task-flow — host half. AI 觉醒（S1/S3）：/task-flow 路由
// 路由（前缀 /task-flow，注册方式与 dsh-gh-publish / dsh-url-trace 同款）：
//   GET  /task-flow/ping        存活探针（调试/健康检查）
//   POST /task-flow/ai-plan     一句话拆解：调用 DSH 默认模型生成流程 JSON（S1.2/S1.3）
//   GET  /task-flow/advance     Agent 写进度（GET+query，DSH Agent 的 web_fetch 工具可直接调用）（S3.3）
//   GET  /task-flow/events      增量拉取 Agent 进度事件（since=N）（S3.3）
//   GET  /task-flow/state       读取最近 100 条进度事件（调试/观测）（S3.3）
//   GET  /task-flow/library     读取服务端任务库（v2.1：跨标签页/跨浏览器/跨 profile 的同一份过往任务）
//   POST /task-flow/library     合并写入任务库（并集，绝不用旧副本覆盖新数据）
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const name = "task-flow";
export const inject = ["webServer"];

/* ================= M1：AI 拆解 ================= */

/** 拆解 system prompt（S3.5：末尾追加协作协议段落）。 */
const PLAN_SYSTEM_PROMPT = [
  "你是任务星图（dsh-task-flow）的任务拆解器。把用户的一句话目标拆成一张可执行的任务流程图，输出严格 JSON（不要任何解释、不要 markdown 围栏）。",
  "",
  "输出契约：",
  '{',
  '  "title": "流程标题（≤12 字，动宾短语）",',
  '  "nodes": [',
  '    { "id": "n1", "kind": "task", "title": "步骤标题（≤12字）", "icon": "idea", "desc": "这一步做什么（一句话）", "how": "具体怎么做（≤30字）", "est": "预计耗时（如 30分钟）", "tags": ["分类"] },',
  '    { "id": "n2", "kind": "choice", "title": "分支标题", "desc": "选择什么", "branches": [ { "label": "选项（≤8字）", "hint": "利弊一句话", "to": "n3a", "difficulty": "低/中/高" } ] }',
  '  ],',
  '  "edges": [ { "from": "n1", "to": "n2" } ]',
  '}',
  "",
  "硬性规则：",
  "1. 节点总数 5–9 个，最多不超过 12；",
  "2. 每个 task 节点必须有 how 和 est；每个节点必须有 id、title；",
  "3. choice 节点 2–3 条分支，每条必须有 label 和 to（to 必须指向其它节点的 id）；",
  "4. 至少 1 个 kind 为 milestone 的节点（放在流程最后或关键产出处），title 形如「✅ 产出：xxx」；",
  "5. edges 覆盖全部流转关系：每个 task 的下一步、choice 每条分支的去向都要有对应边（from/to 均为单条字符串）；",
  "6. 全部使用中文；只输出 JSON 对象本身；",
  "7. 直接输出 JSON，不要输出思考过程、不要解释、不要任何 JSON 之外的前后缀内容。",
  "",
  "【协作协议】这张流程图会显示在用户的任务星图面板里，你的执行过程也会实时反映在星图上。",
  "当用户让你执行流程中的某一步、且你确认该步的实际工作已经完成时，可以调用本插件的主机接口推进星图进度：",
  "GET /task-flow/advance?flow=<流程id>&node=<节点id>&action=complete&note=<一句话说明>",
  "action 可选：complete（完成）| skip（跳过）| fail（失败，把失败原因放进 note）。",
  "注意：只有当你确实完成了该节点的实际工作后才调用；不确定就不要调用，直接向用户说明进度即可。"
].join("\n");

const KINDS = new Set(["task", "choice", "milestone", "gate"]);

/** 层 1：剥离 ```json 围栏与解释文字。 */
function stripFence(text) {
  let t = String(text || "").replace(/```(?:json)?/gi, "```");
  const f1 = t.indexOf("```");
  if (f1 >= 0) {
    const f2 = t.indexOf("```", f1 + 3);
    if (f2 > f1) t = t.slice(f1 + 3, f2);
  }
  return t.trim();
}

/**
 * 层 1.5：JSON 截断修复（模型输出被 maxTokens 截断时的保守补全）。
 * 从尾部逐元素裁剪并尝试闭合未完成的 {/[，直到解析成功或放弃。
 */
function salvageJson(text) {
  let t = String(text || "");
  for (let cut = 0; cut < 300 && t.length > 0; cut++) {
    try { return { ok: true, obj: JSON.parse(t) }; } catch (e) { /* 继续裁剪 */ }
    const pos = t.lastIndexOf(",");
    if (pos < 0) break;
    const head = t.slice(0, pos);
    const stack = [];
    for (const ch of head) {
      if (ch === "{" || ch === "[") stack.push(ch);
      else if ((ch === "}" && stack[stack.length - 1] === "{") || (ch === "]" && stack[stack.length - 1] === "[")) stack.pop();
    }
    const close = stack.slice().reverse().map((c) => (c === "{" ? "}" : "]")).join("");
    try { return { ok: true, obj: JSON.parse(head + close) }; } catch (e) { /* 继续 */ }
    t = head;
  }
  return { ok: false };
}

/**
 * 层 2+3：截取 JSON → 结构校验 → 逐节点归一化。
 * 返回 { ok, flow?, warnings, error? }；失败绝不抛异常、绝不产生脏数据。
 */
function normalizePlan(rawText, planPrompt) {
  const warnings = [];
  const cleaned = stripFence(rawText);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "模型输出中未找到 JSON 对象", warnings };
  let obj;
  try { obj = JSON.parse(cleaned.slice(start, end + 1)); }
  catch (e) {
    // 截断修复：模型输出被 maxTokens 截断时，裁掉不完整的尾元素并闭合
    const salvaged = salvageJson(cleaned.slice(start, end + 1));
    if (salvaged.ok) {
      obj = salvaged.obj;
      warnings.push("模型输出被截断，已自动修复（丢弃末尾不完整内容）");
    } else {
      return { ok: false, error: "JSON 解析失败: " + String((e && e.message) || e), warnings };
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, error: "JSON 根必须是对象", warnings };

  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim().slice(0, 40) : null;
  if (!title) return { ok: false, error: "缺少 title 字段", warnings };
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : null;
  if (!rawNodes || rawNodes.length === 0) return { ok: false, error: "nodes 为空数组", warnings };
  if (rawNodes.length > 9) warnings.push("节点数 " + rawNodes.length + " 超过 9，已保留全部");

  const nodes = [];
  const ids = new Set();
  for (let i = 0; i < rawNodes.length; i++) {
    const rn = rawNodes[i];
    if (!rn || typeof rn !== "object") { warnings.push("第 " + (i + 1) + " 个节点不是对象，已跳过"); continue; }
    let id = typeof rn.id === "string" && rn.id.trim() ? rn.id.trim().slice(0, 30) : "n" + (i + 1);
    if (ids.has(id)) { id = id + "-" + (i + 1); warnings.push("节点 id 重复，已重命名为 " + id); }
    ids.add(id);
    const kind = KINDS.has(rn.kind) ? rn.kind : "task";
    if (typeof rn.kind === "string" && rn.kind !== kind) warnings.push("节点 " + id + " 的 kind 非法，已改为 task");
    nodes.push({
      id,
      kind,
      title: (typeof rn.title === "string" && rn.title.trim() ? rn.title.trim() : "未命名步骤").slice(0, 40),
      icon: typeof rn.icon === "string" && rn.icon.trim() ? rn.icon.trim() : null,
      desc: typeof rn.desc === "string" ? rn.desc.trim().slice(0, 200) : "",
      how: typeof rn.how === "string" ? rn.how.trim().slice(0, 120) : "",
      est: typeof rn.est === "string" ? rn.est.trim().slice(0, 20) : "",
      tags: Array.isArray(rn.tags) ? rn.tags.filter((t) => typeof t === "string").slice(0, 5) : [],
      next: null,
      branches: [],
      exec: { mode: "agent", linked: false } // M1 生成的 task 默认可交给 AI（S3 起用，client 手动可切）
    });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));

  // 流转：edges 优先（AI 契约），否则回退到节点自带 next
  const edgesRaw = Array.isArray(obj.edges) ? obj.edges : null;
  if (edgesRaw) {
    for (const e of edgesRaw) {
      if (!e || typeof e !== "object") continue;
      if (typeof e.from === "string" && typeof e.to === "string" && byId.has(e.from) && byId.has(e.to) && byId.get(e.from).kind !== "choice") {
        byId.get(e.from).next = e.to;
      }
    }
  } else {
    for (let i = 0; i < rawNodes.length && i < nodes.length; i++) {
      const rn = rawNodes[i];
      const node = nodes[i];
      if (typeof rn.next === "string" && byId.has(rn.next) && node.kind !== "choice") node.next = rn.next;
    }
  }

  // 分支
  for (let i = 0; i < rawNodes.length && i < nodes.length; i++) {
    const rn = rawNodes[i];
    const node = nodes[i];
    if (node.kind !== "choice") continue;
    const brs = Array.isArray(rn.branches) ? rn.branches : [];
    for (const b of brs) {
      if (!b || typeof b !== "object") continue;
      const label = typeof b.label === "string" && b.label.trim() ? b.label.trim().slice(0, 20) : null;
      const to = typeof b.to === "string" && byId.has(b.to) ? b.to : null;
      if (label && to) {
        node.branches.push({
          label,
          hint: typeof b.hint === "string" ? b.hint.trim().slice(0, 60) : "",
          to,
          difficulty: typeof b.difficulty === "string" ? b.difficulty.trim().slice(0, 10) : ""
        });
      } else if (!to) {
        warnings.push("节点 " + node.id + " 有一条分支目标无效，已丢弃");
      }
    }
    if (node.branches.length < 2) {
      node.kind = "task";
      node.branches = [];
      warnings.push("节点 " + node.id + " 分支不足 2 条，已降级为普通步骤");
    }
    node.next = null;
  }

  const flow = {
    id: "ai-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
    title,
    theme: "sakura",
    createdAt: Date.now(),
    schema: 2,
    meta: { origin: "ai", planPrompt: String(planPrompt || "").slice(0, 500) },
    nodes,
    history: []
  };
  return { ok: true, flow, warnings };
}

/** 构造用户消息；离线测试环境拿不到 @deepseek-ai/dsh-llm 时用同形兜底。 */
async function buildUserMessage(goal) {
  try {
    const mod = await import("@deepseek-ai/dsh-llm");
    return mod.createUserMessage({ content: [{ type: "text", text: goal }], source: { kind: "plugin", plugin: "dsh-task-flow" } });
  } catch (e) {
    return { role: "user", content: [{ type: "text", text: goal }], source: { kind: "plugin", plugin: "dsh-task-flow" } };
  }
}

/** 单次 LLM 调用（S1.2）：照抄 dsh-url-trace 已验证的 llm.stream 模式。 */
async function aiPlanOnce(ctx, goal, feedback) {
  const llm = ctx.get("llm");
  const dm = ctx.get("agentDefaultModel");
  if (!llm || !dm) return { error: "LLM 服务不可用" };
  let sel = null;
  try { sel = dm.source(); } catch (e) { sel = null; }
  if (!sel || !sel.provider || !sel.model) return { error: "未配置默认模型" };
  let text = "";
  let reasoning = "";
  try {
    const message = await buildUserMessage(goal);
    const system = PLAN_SYSTEM_PROMPT + (feedback ? "\n\n【上一轮输出不合格，原因：" + feedback + "】请只输出修正后的 JSON，不要解释。" : "");
    for await (const chunk of llm.stream({
      provider: sel.provider,
      model: sel.model,
      system,
      messages: [message],
      maxTokens: 4000,
      temperature: 0.3
    })) {
      // 思考型模型把正文放在 reasoning-delta；两者都收，正文优先
      if (chunk && chunk.type === "text-delta" && typeof chunk.text === "string") text += chunk.text;
      else if (chunk && chunk.type === "reasoning-delta" && typeof chunk.text === "string") reasoning += chunk.text;
    }
  } catch (e) {
    return { error: "模型调用失败: " + String((e && e.message) || e) };
  }
  return { text: text || reasoning };
}

/** 拆解入口（S1.3）：解析失败自动重试 1 次（带错误反馈）。 */
async function aiPlan(ctx, goal) {
  const first = await aiPlanOnce(ctx, goal, "");
  if (first.error) return { ok: false, error: first.error };
  const res1 = normalizePlan(first.text, goal);
  if (res1.ok) return { ok: true, flow: res1.flow, warnings: res1.warnings, attempts: 1 };
  const second = await aiPlanOnce(ctx, goal, res1.error + (res1.warnings.length ? "；附加提示：" + res1.warnings.join("；") : ""));
  if (second.error) return { ok: false, error: second.error, rawText: first.text, attempts: 1 };
  const res2 = normalizePlan(second.text, goal);
  if (res2.ok) return { ok: true, flow: res2.flow, warnings: res2.warnings, attempts: 2 };
  return { ok: false, error: res2.error, rawText: second.text, warnings: res2.warnings, attempts: 2 };
}

/* ================= 路由 ================= */

async function readRequestBody(req, limitBytes) {
  let raw = "";
  let size = 0;
  for await (const chunk of req) {
    const piece = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    size += piece.length;
    if (size > limitBytes) throw new Error("request body too large");
    raw += piece;
  }
  return raw;
}

/* ================= v2.1：服务端任务库（跨标签页 / 跨浏览器 / 跨 profile 的同一份过往任务） =================
 * 浏览器 localStorage 会因「换 profile / 换浏览器 / 多窗口互相覆盖 / 存储被清」而丢任务；
 * 这里把任务库落到 <DSH_HOME>/storages/task-flow-library.json，客户端打开面板时合并回来。
 * 写入策略与客户端一致：永远是并集（同 id 取 updatedAt 更新的一份，尊重删除墓碑），
 * 因此任何一次写入都不可能把别的窗口新建的任务抹掉。
 */

const MAX_LIBRARY_FLOWS = 200;
const MAX_LIBRARY_TOMBSTONES = 200;
const MAX_LIBRARY_HISTORY = 500;
const MAX_LIBRARY_BYTES = 2 * 1024 * 1024;      // 请求体上限
const MAX_LIBRARY_BYTES_READ = 4 * 1024 * 1024; // 落盘文件读取上限

export function libraryFile() {
  const home = process.env.DSH_HOME || join(homedir(), ".dsh");
  return join(home, "storages", "task-flow-library.json");
}

function flowTs(f) { return (f && (f.updatedAt || f.createdAt)) || 0; }

/** 单个流程的宽松校验（与客户端 normalizeFlow 语义一致，服务端只做保守裁剪）。 */
export function normalizeServerFlow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : null;
  if (!id) return null;
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes.filter((n) => n && typeof n === "object" && n.id).slice(0, 800)
    : [];
  const history = Array.isArray(raw.history)
    ? raw.history.filter((e) => e && typeof e === "object" && e.n).slice(-MAX_LIBRARY_HISTORY)
    : [];
  return {
    id,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.slice(0, 60) : "未命名任务",
    theme: typeof raw.theme === "string" && raw.theme ? raw.theme : "sakura",
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : (typeof raw.createdAt === "number" ? raw.createdAt : 0),
    schema: 2,
    meta: (raw.meta && typeof raw.meta === "object") ? raw.meta : { origin: "manual", planPrompt: null },
    nodes,
    history
  };
}

export function mergeLibrary(baseFlows, incomingFlows, deleted) {
  const out = [];
  const index = new Map();
  const add = (raw) => {
    const f = normalizeServerFlow(raw);
    if (!f) return;
    const tomb = deleted && deleted[f.id];
    if (tomb && tomb >= flowTs(f)) return;
    const hit = index.get(f.id);
    if (hit) {
      const win = flowTs(f) > flowTs(hit) ? f
        : flowTs(f) < flowTs(hit) ? hit
        : ((f.history || []).length > (hit.history || []).length ? f : hit);
      out[out.indexOf(hit)] = win;
      index.set(f.id, win);
      return;
    }
    index.set(f.id, f);
    out.push(f);
  };
  (baseFlows || []).forEach(add);
  (incomingFlows || []).forEach(add);
  return out.slice(0, MAX_LIBRARY_FLOWS);
}

export function mergeTombstones(a, b) {
  const out = Object.assign({}, a || {});
  Object.keys(b || {}).forEach((k) => {
    const t = Number(b[k]) || 0;
    if (!out[k] || out[k] < t) out[k] = t;
  });
  const keys = Object.keys(out);
  if (keys.length <= MAX_LIBRARY_TOMBSTONES) return out;
  const trimmed = {};
  keys.sort((x, y) => out[y] - out[x]).slice(0, MAX_LIBRARY_TOMBSTONES).forEach((k) => { trimmed[k] = out[k]; });
  return trimmed;
}

export function readLibrary() {
  const file = libraryFile();
  if (!existsSync(file)) return { v: 1, updatedAt: 0, flows: [], deleted: {} };
  let raw = "";
  try {
    const buf = readFileSync(file);
    if (buf.length > MAX_LIBRARY_BYTES_READ) return { v: 1, updatedAt: 0, flows: [], deleted: {}, error: "file too large" };
    raw = buf.toString("utf8");
  } catch (e) {
    return { v: 1, updatedAt: 0, flows: [], deleted: {}, error: String((e && e.message) || e) };
  }
  try {
    const data = JSON.parse(raw);
    return {
      v: 1,
      updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
      flows: Array.isArray(data.flows) ? data.flows : [],
      deleted: (data.deleted && typeof data.deleted === "object") ? data.deleted : {}
    };
  } catch (e) {
    // 文件损坏：备份一份再重来，别让坏文件把任务库锁死
    try { renameSync(file, file + ".corrupt-" + Date.now()); } catch (e2) { /* ignore */ }
    return { v: 1, updatedAt: 0, flows: [], deleted: {}, error: "corrupt" };
  }
}

export function writeLibrary(lib) {
  const file = libraryFile();
  const payload = JSON.stringify({
    v: 1, updatedAt: Date.now(), flows: lib.flows || [], deleted: lib.deleted || {}
  });
  mkdirSync(dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  writeFileSync(tmp, payload, "utf8");
  renameSync(tmp, file);     // 原子替换：不会读到写了一半的文件
  return { count: (lib.flows || []).length, bytes: payload.length };
}

/* ================= S3：Agent 进度事件总线 ================= */
const MAX_EVENTS = 500;
const ACTIONS = new Set(["complete", "skip", "fail"]);
const flowEvents = [];      // { seq, flowId, nodeId, action, note, at }
let eventSeq = 0;

function pushAgentEvent(ev) {
  flowEvents.push(ev);
  if (flowEvents.length > MAX_EVENTS) flowEvents.splice(0, flowEvents.length - MAX_EVENTS);
  return ev.seq;
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/task-flow",
    handler: async (req, res) => {
      const u = new URL(req.url ?? "/", "http://x");
      const send = (status, body) => {
        res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
        res.end(body);
      };
      try {
        if (u.pathname === "/task-flow/ping") {
          if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
          send(200, JSON.stringify({ ok: true, pkg: "dsh-task-flow", time: Date.now() }));
          return;
        }
        if (u.pathname === "/task-flow/ai-plan") {
          if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
          let body = "";
          try { body = await readRequestBody(req, 64 * 1024); }
          catch (e) { send(413, JSON.stringify({ ok: false, error: "请求体过大（≤64KB）" })); return; }
          let goal = "";
          try { const j = JSON.parse(body); goal = typeof j.goal === "string" ? j.goal.trim() : ""; }
          catch (e) { goal = ""; }
          if (!goal) { send(400, JSON.stringify({ ok: false, error: "goal 不能为空" })); return; }
          if (goal.length > 2000) { send(400, JSON.stringify({ ok: false, error: "goal 过长（≤2000 字）" })); return; }
          const r = await aiPlan(ctx, goal);
          if (r.ok) send(200, JSON.stringify({ ok: true, flow: r.flow, warnings: r.warnings || [], attempts: r.attempts }));
          else send(502, JSON.stringify({ ok: false, error: r.error, warnings: r.warnings || [], attempts: r.attempts, rawText: r.rawText || null }));
          return;
        }
        if (u.pathname === "/task-flow/advance") {
          if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
          const flowId = (u.searchParams.get("flow") || "").trim();
          const nodeId = (u.searchParams.get("node") || "").trim();
          const action = (u.searchParams.get("action") || "").trim();
          const note = (u.searchParams.get("note") || "").trim();
          if (!flowId || !nodeId) { send(400, JSON.stringify({ ok: false, error: "缺少 flow 或 node 参数" })); return; }
          if (flowId.length > 80 || nodeId.length > 80) { send(400, JSON.stringify({ ok: false, error: "flow/node 过长" })); return; }
          if (!ACTIONS.has(action)) { send(400, JSON.stringify({ ok: false, error: "action 必须是 complete/skip/fail" })); return; }
          if (note.length > 200) { send(400, JSON.stringify({ ok: false, error: "note 过长（≤200 字）" })); return; }
          const seq = pushAgentEvent({ seq: ++eventSeq, flowId, nodeId, action, note, at: Date.now() });
          send(200, JSON.stringify({ ok: true, seq }));
          return;
        }
        if (u.pathname === "/task-flow/events") {
          if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
          let since = 0;
          const s = u.searchParams.get("since");
          if (s !== null && /^\d+$/.test(s)) since = parseInt(s, 10);
          const events = flowEvents.filter((e) => e.seq > since).slice(-200);
          send(200, JSON.stringify({ ok: true, events, lastSeq: flowEvents.length ? flowEvents[flowEvents.length - 1].seq : eventSeq }));
          return;
        }
        if (u.pathname === "/task-flow/state") {
          if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
          send(200, JSON.stringify({ ok: true, events: flowEvents.slice(-100), count: flowEvents.length }));
          return;
        }
        if (u.pathname === "/task-flow/library") {
          if (req.method === "GET" || req.method === "HEAD") {
            const lib = readLibrary();
            send(200, JSON.stringify({
              ok: true, v: 1, count: lib.flows.length, updatedAt: lib.updatedAt,
              flows: lib.flows, deleted: lib.deleted, error: lib.error || null
            }));
            return;
          }
          if (req.method === "POST") {
            let body = "";
            try { body = await readRequestBody(req, MAX_LIBRARY_BYTES); }
            catch (e) { send(413, JSON.stringify({ ok: false, error: "请求体过大（≤2MB）" })); return; }
            let incoming = null;
            let incomingDeleted = {};
            try {
              const j = JSON.parse(body);
              incoming = Array.isArray(j.flows) ? j.flows : null;
              if (j.deleted && typeof j.deleted === "object") incomingDeleted = j.deleted;
            } catch (e) { incoming = null; }
            if (!incoming) { send(400, JSON.stringify({ ok: false, error: "需要 flows 数组" })); return; }
            const current = readLibrary();
            const deleted = mergeTombstones(current.deleted, incomingDeleted);
            const flows = mergeLibrary(current.flows, incoming, deleted);
            let written = null;
            try { written = writeLibrary({ flows: flows, deleted: deleted }); }
            catch (e) { send(500, JSON.stringify({ ok: false, error: "写入任务库失败：" + String((e && e.message) || e) })); return; }
            send(200, JSON.stringify({ ok: true, count: written.count, added: Math.max(0, flows.length - (current.flows || []).length), bytes: written.bytes }));
            return;
          }
          res.writeHead(405); res.end();
          return;
        }
        send(404, JSON.stringify({ ok: false, error: "not found" }));
      } catch (e) {
        send(500, JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
      }
    }
  }));
}
