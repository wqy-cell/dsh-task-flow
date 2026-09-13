// mock-host.cjs — host 半边离线测试（S1.1 路由骨架 / S1.2 LLM 调用 / S1.3 校验与重试）
// 运行：node test/mock-host.cjs
const path = require("path");
const { pathToFileURL } = require("url");

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? "  PASS " : "  FAIL ") + name + (extra ? " — " + extra : ""));
  if (!ok) failures++;
}

/* ---------- mock ctx：llm 按脚本逐次吐文本；'THROW' 表示抛错 ---------- */
function makeCtx(llmScript) {
  const script = llmScript.slice();
  const calls = [];
  const llm = {
    stream: async function* (opts) {
      calls.push(opts);
      const text = script.shift();
      if (text === "THROW") throw new Error("mock stream failure");
      const pieces = (text || "").match(/[\s\S]{1,9}/g) || [];
      for (const p of pieces) yield { type: "text-delta", text: p };
    }
  };
  const captured = [];
  const ctx = {
    get: (k) => (k === "llm" ? llm : k === "agentDefaultModel" ? { source: () => ({ provider: "deepseek", model: "deepseek-chat" }) } : undefined),
    effect: (fn) => { fn(); },
    webServer: { register: (r) => { captured.push(r); } }
  };
  return { ctx, calls, captured };
}

function makeReq(url, method, body) {
  return {
    url, method,
    async *[Symbol.asyncIterator]() {
      if (body) {
        const s = typeof body === "string" ? body : body.join("");
        const n = 100;
        for (let i = 0; i < s.length; i += n) yield s.slice(i, i + n);
      }
    }
  };
}
function makeRes() {
  const r = { status: 0, headers: {}, body: "" };
  r.writeHead = (s, h) => { r.status = s; Object.assign(r.headers, h || {}); };
  r.end = (b) => { r.body = b; };
  return r;
}
async function call(captured, url, method, body) {
  const res = makeRes();
  await captured[0].handler(makeReq(url, method, body), res);
  return res;
}
function json(res) { return JSON.parse(res.body); }

const VALID_PLAN = JSON.stringify({
  title: "给父母策划云南旅行",
  nodes: [
    { id: "n1", kind: "task", title: "确定档期与预算", how: "问父母时间，定预算上限", est: "30分钟" },
    { id: "n2", kind: "choice", title: "出行方式", branches: [
      { label: "高铁", hint: "舒适稳定", to: "n3a", difficulty: "低" },
      { label: "飞机", hint: "省时间", to: "n3b", difficulty: "低" }
    ] },
    { id: "n3a", kind: "task", title: "订高铁票", how: "12306 下单", est: "20分钟" },
    { id: "n3b", kind: "task", title: "订机票", how: "比价平台下单", est: "20分钟" },
    { id: "n4", kind: "task", title: "订酒店", how: "按路线选酒店", est: "30分钟" },
    { id: "n5", kind: "milestone", title: "✅ 产出：行程单" }
  ],
  edges: [
    { from: "n1", to: "n2" }, { from: "n3a", to: "n4" }, { from: "n3b", to: "n4" }, { from: "n4", to: "n5" }
  ]
});

(async () => {
  /* ---- S1.1 路由骨架 ---- */
  console.log("场景 1：路由注册与探针");
  const env1 = makeCtx([]);
  const mod = await import(pathToFileURL(path.resolve(__dirname, "../lib/index.js")).href);
  check("导出 name=task-flow", mod.name === "task-flow");
  check("导出 inject 含 webServer", Array.isArray(mod.inject) && mod.inject.includes("webServer"));
  let regErr = null;
  try { mod.apply(env1.ctx); } catch (e) { regErr = e; }
  check("apply 注册路由不抛异常", regErr === null, regErr && regErr.message);
  check("register 被调用一次", env1.captured.length === 1);
  const route = env1.captured[0];
  check("prefix 路由 /task-flow", route && route.kind === "prefix" && route.path === "/task-flow", JSON.stringify(route));
  const ping = await call(env1.captured, "http://x/task-flow/ping", "GET");
  check("ping 返回 200 ok", ping.status === 200 && json(ping).ok === true && json(ping).pkg === "dsh-task-flow");
  const notFound = await call(env1.captured, "http://x/task-flow/nope", "GET");
  check("未知路径 404", notFound.status === 404);

  console.log("场景 2：ai-plan 参数校验");
  const bad1 = await call(env1.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({}));
  check("空 goal → 400", bad1.status === 400);
  const bad2 = await call(env1.captured, "http://x/task-flow/ai-plan", "POST", "not-json{{");
  check("非法 JSON body → 400", bad2.status === 400);
  const bad3 = await call(env1.captured, "http://x/task-flow/ai-plan", "GET");
  check("GET ai-plan → 405", bad3.status === 405);
  const big = await call(env1.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "x".repeat(70 * 1024) }));
  check("超大 body → 413", big.status === 413);

  /* ---- S1.2 LLM 调用 + S1.3 校验重试 ---- */
  console.log("场景 3：正常拆解");
  const env3 = makeCtx([VALID_PLAN]);
  mod.apply(env3.ctx);
  const r3 = await call(env3.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "给父母策划一次云南旅行" }));
  check("正常拆解 → 200", r3.status === 200, "status=" + r3.status);
  const j3 = json(r3);
  check("flow.schema=2 且 meta.origin=ai", j3.ok && j3.flow.schema === 2 && j3.flow.meta.origin === "ai");
  check("节点数 6", j3.ok && j3.flow.nodes.length === 6, "len=" + (j3.flow && j3.flow.nodes.length));
  check("task 节点默认 exec.mode=agent", j3.ok && j3.flow.nodes.every((n) => n.kind !== "task" || (n.exec && n.exec.mode === "agent")));
  check("choice 保留 2 条分支", j3.ok && j3.flow.nodes.find((n) => n.id === "n2").branches.length === 2);
  check("edges 推导出 next", j3.ok && j3.flow.nodes.find((n) => n.id === "n1").next === "n2");
  check("attempts=1 且无 warnings", j3.attempts === 1 && j3.warnings.length === 0);
  check("LLM 收到 system 与 goal", env3.calls.length === 1 && /任务拆解器/.test(env3.calls[0].system) && /云南旅行/.test(env3.calls[0].messages[0].content[0].text));

  console.log("场景 4：带围栏与解释文字的 JSON");
  const env4 = makeCtx(["好的，以下是流程图：\n```json\n" + VALID_PLAN + "\n```\n希望对你有帮助！"]);
  mod.apply(env4.ctx);
  const r4 = await call(env4.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "test" }));
  check("围栏+解释 → 200 且拆解成功", r4.status === 200 && json(r4).ok === true);

  console.log("场景 5：首次输出非法 → 重试成功");
  const env5 = makeCtx(["这不是 JSON，抱歉", VALID_PLAN]);
  mod.apply(env5.ctx);
  const r5 = await call(env5.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "test" }));
  check("重试后 → 200", r5.status === 200 && json(r5).ok === true);
  check("attempts=2", json(r5).attempts === 2);
  check("第二次调用带错误反馈", env5.calls.length === 2 && /上一轮输出不合格/.test(env5.calls[1].system));

  console.log("场景 6：两次都非法 → 502 + rawText");
  const env6 = makeCtx(["垃圾输出", "还是垃圾"]);
  mod.apply(env6.ctx);
  const r6 = await call(env6.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "test" }));
  check("两次失败 → 502", r6.status === 502 && json(r6).ok === false);
  check("返回 rawText 与 attempts=2", typeof json(r6).rawText === "string" && json(r6).attempts === 2);

  console.log("场景 7：结构错误（缺 title / nodes 空）");
  const env7 = makeCtx([JSON.stringify({ nodes: [{ id: "a" }] }), JSON.stringify({ title: "x", nodes: [] })]);
  mod.apply(env7.ctx);
  const r7a = await call(env7.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "test" }));
  check("缺 title → 502", r7a.status === 502);
  const r7b = await call(env7.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "test" }));
  check("nodes 空 → 502", r7b.status === 502);

  console.log("场景 8：可修复问题（坏分支/分支不足/超量/重复 id）");
  const FIXABLE = JSON.stringify({
    title: "测试修复",
    nodes: [
      { id: "n1", kind: "task", title: "甲", how: "h", est: "e" },
      { id: "n1", kind: "task", title: "乙" },                     // 重复 id → 重命名
      { id: "n2", kind: "choice", title: "选", branches: [
        { label: "左", to: "n9" },                                  // 目标不存在 → 丢弃
        { label: "右", to: "n1" }
      ] },
      { id: "bad", kind: "weird", title: "丙" }                     // 非法 kind → task
    ],
    edges: [{ from: "n1", to: "n2" }]
  });
  const env8 = makeCtx([FIXABLE]);
  mod.apply(env8.ctx);
  const r8 = await call(env8.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "test" }));
  const j8 = json(r8);
  check("可修复输入 → 200", r8.status === 200 && j8.ok === true, j8.error);
  check("重复 id 已重命名", j8.flow.nodes.some((n) => n.id === "n1-2"));
  check("坏分支丢弃告警在列（warnings 含「已丢弃」）", j8.warnings.some((w) => /已丢弃/.test(w)));
  check("分支不足 → 降级 task 且清空分支", j8.flow.nodes.find((n) => n.id === "n2").kind === "task" && j8.flow.nodes.find((n) => n.id === "n2").branches.length === 0);
  check("非法 kind → task", j8.flow.nodes.find((n) => n.id === "bad").kind === "task");
  check("产生 warnings ≥3", j8.warnings.length >= 3, j8.warnings.join(";"));

  console.log("场景 9：LLM 服务不可用 / 无默认模型 / 流抛错");
  const ctxNoLlm = { get: () => undefined, effect: (fn) => { fn(); }, webServer: { register: (r) => { ctxNoLlm._r = r; } } };
  mod.apply(ctxNoLlm);
  const res9 = makeRes();
  await ctxNoLlm._r.handler(makeReq("http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "test" })), res9);
  check("无 llm 服务 → 502 LLM 服务不可用", res9.status === 502 && /LLM 服务不可用/.test(json(res9).error));
  const env9b = makeCtx(["THROW"]);
  mod.apply(env9b.ctx);
  const r9b = await call(env9b.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "test" }));
  check("流抛错 → 502 模型调用失败", r9b.status === 502 && /模型调用失败/.test(json(r9b).error));

  console.log("场景 10：非法 JSON 十连发（无脏数据、无崩溃）");
  const badTexts = [
    "这不是 JSON", "```json\n{broken", "<html>页面</html>", "{\"title\":", "[1,2,3]",
    "{\"title\":\"x\",\"nodes\":{}}", "{\"title\":\"x\",\"nodes\":[{\"id\":\"a\"}]}", "null", "12345", ""
  ];
  const env10 = makeCtx(badTexts.slice(0, 5).concat(badTexts.slice(0, 5).map((t) => t + " 再错")));
  mod.apply(env10.ctx);
  let allHandled = true;
  for (let i = 0; i < 10; i++) {
    const r = await call(env10.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "test" }));
    if (r.status !== 502) { allHandled = false; console.log("    第 " + (i + 1) + " 次返回 status=" + r.status); }
  }
  check("十连发全部 502（无崩溃无脏数据）", allHandled && env10.calls.length === 20);

  console.log("场景 11：advance / events / state（Agent 进度总线）");
  const env11 = makeCtx([VALID_PLAN]);
  mod.apply(env11.ctx);
  const r11a = await call(env11.captured, "http://x/task-flow/advance", "GET");
  check("缺 flow/node → 400", r11a.status === 400);
  const r11b = await call(env11.captured, "http://x/task-flow/advance?flow=f1&node=n1&action=boom", "GET");
  check("非法 action → 400", r11b.status === 400);
  const r11c = await call(env11.captured, "http://x/task-flow/advance?flow=f1&node=n1&action=complete&note=" + "x".repeat(201), "GET");
  check("note 超长 → 400", r11c.status === 400);
  const r11d = await call(env11.captured, "http://x/task-flow/advance?flow=f1&node=n1&action=complete&note=ok", "GET");
  check("合法 complete → 200 且返回 seq", r11d.status === 200 && json(r11d).ok === true && typeof json(r11d).seq === "number");
  await call(env11.captured, "http://x/task-flow/advance?flow=f1&node=n2&action=skip", "GET");
  await call(env11.captured, "http://x/task-flow/advance?flow=f1&node=n3&action=fail&note=boom", "GET");
  const r11g = await call(env11.captured, "http://x/task-flow/events?since=0", "GET");
  check("events 返回全部 3 条", json(r11g).events.length === 3 && json(r11g).lastSeq === 3);
  check("events 字段完整（action/note/at）", json(r11g).events[2].action === "fail" && json(r11g).events[2].note === "boom" && typeof json(r11g).events[2].at === "number");
  const r11h = await call(env11.captured, "http://x/task-flow/events?since=2", "GET");
  check("since 增量只返回第 3 条", json(r11h).events.length === 1 && json(r11h).events[0].seq === 3);
  const r11i = await call(env11.captured, "http://x/task-flow/state", "GET");
  check("state 返回计数", json(r11i).count === 3 && json(r11i).events.length === 3);
  for (let i = 0; i < 520; i++) await call(env11.captured, "http://x/task-flow/advance?flow=f9&node=n9&action=skip", "GET");
  const r11j = await call(env11.captured, "http://x/task-flow/state", "GET");
  check("事件缓冲封顶 500", json(r11j).count === 500, "count=" + json(r11j).count);
  const r11k = await call(env11.captured, "http://x/task-flow/advance?flow=f1&node=n1&action=complete", "POST");
  check("POST advance → 405", r11k.status === 405);
  const r11l = await call(env11.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "x" }));
  check("协作协议已写入拆解 system prompt", r11l.status === 200 && env11.calls.length === 1 && /协作协议/.test(env11.calls[0].system) && /task-flow\/advance/.test(env11.calls[0].system), "ai-plan status=" + r11l.status);

  console.log("场景 12：JSON 截断修复（maxTokens 截断）");
  const TRUNC = VALID_PLAN.slice(0, VALID_PLAN.indexOf('"n5"') + 22);   // 切在 n5 对象中间
  const env12 = makeCtx([TRUNC]);
  mod.apply(env12.ctx);
  const r12 = await call(env12.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "test" }));
  const j12 = json(r12);
  check("截断输出 → 修复后 200", r12.status === 200 && j12.ok === true, "status=" + r12.status + " err=" + j12.error);
  check("警告含「已自动修复」", Array.isArray(j12.warnings) && j12.warnings.some((w) => /已自动修复/.test(w)));
  check("修复后节点数 ≥5", j12.flow && j12.flow.nodes.length >= 5, "nodes=" + (j12.flow && j12.flow.nodes.length));
  const env12b = makeCtx([JSON.stringify({ title: "x", nodes: [] }), JSON.stringify({ title: "x", nodes: [] })]);
  mod.apply(env12b.ctx);
  const r12b = await call(env12b.captured, "http://x/task-flow/ai-plan", "POST", JSON.stringify({ goal: "test" }));
  check("无法修复（空节点）→ 502", r12b.status === 502);

  console.log("场景 13：服务端任务库 /task-flow/library（v2.1）");
  {
    // 用临时 DSH_HOME，别碰真实任务库
    const os = require("os");
    const fs = require("fs");
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-tf-lib-"));
    process.env.DSH_HOME = tmpHome;
    check("任务库落在 DSH_HOME/storages 下", mod.libraryFile() === path.join(tmpHome, "storages", "task-flow-library.json"));

    const env13 = makeCtx([]);
    mod.apply(env13.ctx);

    const r13a = await call(env13.captured, "http://x/task-flow/library", "GET");
    check("空任务库 → 200 且 0 个任务", r13a.status === 200 && json(r13a).ok === true && json(r13a).count === 0);

    const mkFlow = (id, title, ts, hist) => ({
      id, title, theme: "sakura", schema: 2, createdAt: ts, updatedAt: ts,
      meta: { origin: "manual", planPrompt: null },
      nodes: [{ id: "n1", kind: "task", title: "甲" }],
      history: new Array(hist || 0).fill(0).map((_, i) => ({ n: "n1", kind: "task", ts: ts + i }))
    });

    const r13b = await call(env13.captured, "http://x/task-flow/library", "POST", JSON.stringify({ flows: [mkFlow("a", "任务A", 1000)] }));
    check("写入任务库 → 200 且 count=1", r13b.status === 200 && json(r13b).count === 1);
    check("落盘文件存在", fs.existsSync(mod.libraryFile()));

    // 第二个窗口推自己的任务：只能做并集，不能把 A 抹掉
    const r13c = await call(env13.captured, "http://x/task-flow/library", "POST", JSON.stringify({ flows: [mkFlow("b", "任务B", 2000)] }));
    check("第二个窗口写入后共 2 个任务", r13c.status === 200 && json(r13c).count === 2 && json(r13c).added === 1);
    const r13d = await call(env13.captured, "http://x/task-flow/library", "GET");
    check("两个任务都在（旧的没被覆盖）", json(r13d).flows.map((f) => f.id).sort().join(",") === "a,b");

    // 同 id 新版本胜出
    await call(env13.captured, "http://x/task-flow/library", "POST", JSON.stringify({ flows: [mkFlow("b", "任务B-新", 3000, 2)] }));
    const r13e = await call(env13.captured, "http://x/task-flow/library", "GET");
    const bNow = json(r13e).flows.find((f) => f.id === "b");
    check("同 id 取 updatedAt 更新的一份", bNow.title === "任务B-新" && bNow.history.length === 2);

    // 旧副本（时间更早）不能把新数据顶回去
    await call(env13.captured, "http://x/task-flow/library", "POST", JSON.stringify({ flows: [mkFlow("b", "任务B-旧", 500)] }));
    const r13f = await call(env13.captured, "http://x/task-flow/library", "GET");
    check("陈旧副本不会覆盖新数据", json(r13f).flows.find((f) => f.id === "b").title === "任务B-新");

    // 删除墓碑：删掉的任务不会被别的窗口推回来
    await call(env13.captured, "http://x/task-flow/library", "POST", JSON.stringify({ flows: [], deleted: { b: 9999 } }));
    const r13g = await call(env13.captured, "http://x/task-flow/library", "GET");
    check("墓碑生效：删除的任务不再返回", !json(r13g).flows.some((f) => f.id === "b") && json(r13g).flows.length === 1);
    await call(env13.captured, "http://x/task-flow/library", "POST", JSON.stringify({ flows: [mkFlow("b", "又推回来", 8000)] }));
    const r13h = await call(env13.captured, "http://x/task-flow/library", "GET");
    check("墓碑之后推来的旧副本仍被挡住", !json(r13h).flows.some((f) => f.id === "b"));
    await call(env13.captured, "http://x/task-flow/library", "POST", JSON.stringify({ flows: [mkFlow("b", "重新建的同名任务", 99999)] }));
    const r13i = await call(env13.captured, "http://x/task-flow/library", "GET");
    check("墓碑之后更新的版本可以重新入库", json(r13i).flows.some((f) => f.id === "b" && f.title === "重新建的同名任务"));

    // 参数校验
    const r13j = await call(env13.captured, "http://x/task-flow/library", "POST", JSON.stringify({ nope: 1 }));
    check("缺 flows → 400", r13j.status === 400);
    const r13k = await call(env13.captured, "http://x/task-flow/library", "PUT");
    check("PUT → 405", r13k.status === 405);
    const r13l = await call(env13.captured, "http://x/task-flow/library", "POST", JSON.stringify({ flows: null }));
    check("flows 非数组 → 400", r13l.status === 400);

    // 损坏文件：备份后重来，不锁死任务库
    fs.mkdirSync(path.dirname(mod.libraryFile()), { recursive: true });
    fs.writeFileSync(mod.libraryFile(), "{ broken json", "utf8");
    const r13m = await call(env13.captured, "http://x/task-flow/library", "GET");
    check("损坏文件 → 200 空库 + error 标记", r13m.status === 200 && json(r13m).count === 0 && json(r13m).error === "corrupt");
    const corruptBackups = fs.readdirSync(path.dirname(mod.libraryFile())).filter((f) => f.includes(".corrupt-"));
    check("损坏文件已备份", corruptBackups.length === 1);
    const r13n = await call(env13.captured, "http://x/task-flow/library", "POST", JSON.stringify({ flows: [mkFlow("c", "任务C", 12345)] }));
    check("损坏后仍可写入", r13n.status === 200 && json(r13n).count === 1);

    // 字段修复：脏数据不会让接口 500
    const r13o = await call(env13.captured, "http://x/task-flow/library", "POST", JSON.stringify({
      flows: [null, 42, { id: "d" }, { id: "e", title: "  ", nodes: "bad", history: [{}] }]
    }));
    const d13 = json(r13o);
    check("脏数据被逐条修复/丢弃（无 500）", r13o.status === 200 && d13.ok === true);
    const r13p = await call(env13.captured, "http://x/task-flow/library", "GET");
    const ids13 = json(r13p).flows.map((f) => f.id);
    check("旧任务保留、脏数据被丢弃（只剩 c/d/e）", ids13.includes("c") && ids13.includes("d") && ids13.includes("e") && ids13.length === 3);
    check("缺失字段被补齐", json(r13p).flows.every((f) => typeof f.title === "string" && Array.isArray(f.nodes) && Array.isArray(f.history)));

    fs.rmSync(tmpHome, { recursive: true, force: true });
    delete process.env.DSH_HOME;
  }

  console.log(failures === 0 ? "== host 全部通过 ==" : "== host 有 " + failures + " 项失败 ==");
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
