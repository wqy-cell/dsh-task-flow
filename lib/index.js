// dsh-task-flow — host half. AI 觉醒（S1）：/task-flow 路由
// 路由（前缀 /task-flow，注册方式与 dsh-gh-publish / dsh-url-trace 同款）：
//   GET  /task-flow/ping        存活探针（调试/健康检查）
//   POST /task-flow/ai-plan     一句话拆解：调用 DSH 默认模型生成流程 JSON（S1.2/S1.3）
// S3 将在此增加：GET /task-flow/advance（Agent 写进度）、GET /task-flow/state、内存事件总线。
export const name = "task-flow";
export const inject = ["webServer"];

/* ================= M1：AI 拆解 ================= */

/** 拆解 system prompt（S3.5 将在其后追加协作协议段落）。 */
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
  "6. 全部使用中文；只输出 JSON 对象本身。"
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
  catch (e) { return { ok: false, error: "JSON 解析失败: " + String((e && e.message) || e), warnings }; }
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
  try {
    const message = await buildUserMessage(goal);
    const system = PLAN_SYSTEM_PROMPT + (feedback ? "\n\n【上一轮输出不合格，原因：" + feedback + "】请只输出修正后的 JSON，不要解释。" : "");
    for await (const chunk of llm.stream({
      provider: sel.provider,
      model: sel.model,
      system,
      messages: [message],
      maxTokens: 2400,
      temperature: 0.4
    })) {
      if (chunk && chunk.type === "text-delta" && typeof chunk.text === "string") text += chunk.text;
    }
  } catch (e) {
    return { error: "模型调用失败: " + String((e && e.message) || e) };
  }
  return { text };
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
        send(404, JSON.stringify({ ok: false, error: "not found" }));
      } catch (e) {
        send(500, JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
      }
    }
  }));
}
