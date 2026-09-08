// dsh-task-flow 客户端 bundle 的本地模拟测试：
// 模拟 DSH 客户端环境（模块加载器 + 最小 ctx + react/react-dom 真实包），
// 完整走一遍 物化 → apply → 插槽声明 → 按钮/面板渲染 + 流程状态机逻辑。
// 依赖解析：优先环境变量 DSH_TEST_NODE_MODULES，其次 DSH_HOME，最后 ~/.dsh。
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const NODE_MODULES = process.env.DSH_TEST_NODE_MODULES
  || path.join(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), "profiles", "node_modules");
const BUNDLE = path.resolve(__dirname, "../lib/client.js");

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? "  PASS " : "  FAIL ") + name + (extra ? " — " + extra : ""));
  if (!ok) failures++;
}

/* ---------- 模拟 document / window / localStorage ---------- */
function makeElementMock() {
  return {
    dataset: {}, textContent: "", isConnected: true, style: {},
    appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
    querySelectorAll() { return []; }, closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
  };
}
const documentMock = {
  head: makeElementMock(),
  body: makeElementMock(),
  createElement: () => makeElementMock(),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null
};
const localStorageMock = (() => {
  let data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
})();
const windowMock = {
  __ModuleLoader__: { load: (handoff) => { throw new Error("window.__ModuleLoader__.load replaced before bundle run"); } },
  confirm: () => true
};
let handoff = null;
windowMock.__ModuleLoader__.load = (h) => { handoff = h; };

const sandbox = {
  window: windowMock,
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  queueMicrotask: (fn) => fn(),
  localStorage: localStorageMock,
  document: documentMock,
  URL: require("url").URL,
  URLSearchParams: require("url").URLSearchParams
};
sandbox.globalThis = sandbox;

/* ---------- 运行 bundle（只注册 factory） ---------- */
vm.createContext(sandbox);
try {
  vm.runInContext(fs.readFileSync(BUNDLE, "utf8"), sandbox, { filename: "client.js" });
  check("bundle 执行并注册 factory", handoff !== null && handoff.id === "dsh-task-flow");
} catch (e) {
  check("bundle 执行并注册 factory", false, e.stack);
  process.exit(1);
}

/* ---------- 真实 react / react-dom ---------- */
const react = require(path.join(NODE_MODULES, "react"));
const reactDomServer = require(path.join(NODE_MODULES, "react-dom", "server"));

const requireMock = (spec) => {
  if (spec === "react") return react;
  if (spec === "react/jsx-runtime") return require(path.join(NODE_MODULES, "react", "jsx-runtime"));
  if (spec === "react-dom") return require(path.join(NODE_MODULES, "react-dom"));
  throw new Error("unexpected require in mock: " + spec);
};

/* ---------- 物化 ---------- */
let pluginModule;
try {
  pluginModule = handoff.factory(requireMock);
  check("factory 物化（require react/react-dom/jsx-runtime + localStorage）", true);
} catch (e) {
  check("factory 物化", false, e.stack);
  process.exit(1);
}
check("exports.apply 存在", typeof pluginModule.apply === "function");
check("exports.inject = ['slots']", Array.isArray(pluginModule.inject) && pluginModule.inject[0] === "slots");

const T = pluginModule.__test;
function resetStore() {
  const S = T.getStore();
  S.flows = [T.makeDemoFlow(Date.now())];
  S.activeFlowId = "demo";
  return S.flows[0];
}

/* ---------- 场景 0：首次加载自动播种示例流程 + 项目总进度 ---------- */
console.log("场景 0：首次加载自动播种");
const S0 = T.getStore();
check("activeFlowId = demo（全新数据默认演示流程）", S0.activeFlowId === "demo");
check("内置 2 张流程（示例 7 节点 + 总进度 14 节点）", S0.flows.length === 2 && S0.flows[0].nodes.length === 7 && S0.flows[1].nodes.length === 14, "len=" + S0.flows.length);
const st0 = T.replay(S0.flows[0]);
check("示例初始状态：n1 已完成、当前 n2", st0.done.has("n1") && st0.active === "n2", "active=" + st0.active);
check("n2 是 3 分支节点", S0.flows[0].nodes.find((n) => n.id === "n2").branches.length === 3);
const prog0 = S0.flows[1];
check("总进度 id=progress 且已推进 5 步", prog0.id === "progress" && prog0.history.length === 5);
const stP0 = T.replay(prog0);
check("总进度当前停在 p6（安装方式分支）", stP0.active === "p6" && stP0.done.size === 5, "active=" + stP0.active);
check("p6 有 3 个安装分支", prog0.nodes.find((n) => n.id === "p6").branches.length === 3);

/* ---------- 场景 0.5：存量数据迁移（加入总进度并设为当前） ---------- */
console.log("场景 0.5：存量数据迁移");
localStorageMock.setItem("dsh-task-flow:v1", JSON.stringify({ v: 1, activeFlowId: "demo", flows: [T.makeDemoFlow(Date.now())] }));
T.reloadStore();
check("迁移后含 progress 流程", T.getStore().flows.some((f) => f.id === "progress"));
check("迁移后 progress 为当前流程", T.getStore().activeFlowId === "progress");
check("迁移写入 v2 并备份 v1、删除 v1", localStorageMock.getItem(T.STORE_KEY()) !== null && localStorageMock.getItem(T.STORE_KEY_BACKUP()) !== null && localStorageMock.getItem(T.STORE_KEY_V1()) === null);
const v2store = JSON.parse(localStorageMock.getItem(T.STORE_KEY()));
check("v2 数据带 schema/exec/source 缺省", v2store.v === 2 && v2store.flows[0].schema === 2 && v2store.flows[0].nodes[0].exec.mode === "manual" && v2store.flows[0].history[0].source === "user");
const progCount = T.getStore().flows.filter((f) => f.id === "progress").length;
T.reloadStore();
check("再次加载幂等（不重复添加）", T.getStore().flows.filter((f) => f.id === "progress").length === progCount);

/* ---------- 场景 1：状态机（选择分支 / 推进 / 回退 / 重开 / 跳过） ---------- */
console.log("场景 1：流程状态机");
let flow = resetStore();
T.chooseBranch(flow, "n2", "n3b");
let st = T.replay(flow);
check("选观点评论 → 当前 n3b", st.active === "n3b" && st.chosen["n2"] === "n3b", "active=" + st.active);
const unch = T.unchosenSet(flow, st.chosen);
check("未选支线被标记", unch.has("n3a") && unch.has("n3c") && !unch.has("n4"), [...unch].join(","));
T.completeTask(flow, "n3b");
T.completeTask(flow, "n4");
st = T.replay(flow);
check("连过两关 → 当前 n5", st.active === "n5");
T.completeTask(flow, "n5");
st = T.replay(flow);
check("完成终点 → active=null（流程完成）", st.active === null && st.done.size === 5, "done=" + st.done.size);

T.rollbackToEvent(flow, "n4");
st = T.replay(flow);
check("回退到 n4 → n5 未完成", st.active === "n4" && !st.done.has("n5"), "active=" + st.active);

T.rollbackOne(flow);
st = T.replay(flow);
check("回退一步 → 回到 n3b（撤销 n3b 的完成）", st.active === "n3b" && !st.done.has("n3b") && !st.done.has("n4"), "active=" + st.active);

T.rollbackToEvent(flow, "n2");
st = T.replay(flow);
check("回退到 n2 → 分支重置、当前 n2", st.active === "n2" && !st.chosen["n2"] && !st.done.has("n2"));

T.restartFlow(flow);
st = T.replay(flow);
check("重新开始 → 当前 n1", st.active === "n1" && st.done.size === 0);

T.skipNode(flow, "n1");
st = T.replay(flow);
check("跳过 n1 → 当前 n2、n1 记为跳过", st.active === "n2" && st.skipped.has("n1") && !st.done.has("n1"));

/* ---------- 场景 2：BFS 排序 ---------- */
console.log("场景 2：BFS 排序");
flow = resetStore();
const ordered = T.orderedIds(flow);
check("顺序为 n1,n2,n3a,n3b,n3c,n4,n5", ordered.join(",") === "n1,n2,n3a,n3b,n3c,n4,n5", ordered.join(","));

/* ---------- 场景 3：导入 / 导出校验 ---------- */
console.log("场景 3：导入校验");
const before = T.getStore().flows.length;
check("缺 nodes → 报错", T.importFlowJson({}).ok === false);
check("缺 title → 报错", T.importFlowJson({ nodes: [{ id: "a" }] }).ok === false);
const r1 = T.importFlowJson({
  title: "测试流程",
  nodes: [
    { id: "a", title: "甲", next: "b" },
    { id: "b", title: "乙", kind: "choice", branches: [{ label: "左", to: "c" }, { label: "坏", to: "zzz" }] },
    { id: "c", title: "丙" },
    { title: "丁" } // 无 id → 自动补
  ]
});
check("合法导入 ok", r1.ok === true && T.getStore().flows.length === before + 1);
const imp = T.getStore().flows[T.getStore().flows.length - 1];
check("坏分支目标被丢弃", imp.nodes.find((n) => n.id === "b").branches.length === 1);
check("无 id 节点自动补 id", imp.nodes.length === 4 && imp.nodes[3].id === "n4");
check("导入后成为当前流程", T.getStore().activeFlowId === r1.id);

/* ---------- 场景 4：apply + 插槽声明（两种时序） ---------- */
console.log("场景 4：apply 与插槽时序");
function makeCtx() {
  const slots = {
    declared: new Set(),
    pending: new Map(),
    registrations: [],
    inject(key, cb) {
      if (this.declared.has(key)) { ctx.effect(cb, "slots.inject(" + key + ")"); }
      else { this.pending.set(key, cb); }
    },
    declare(key) {
      this.declared.add(key);
      const cb = this.pending.get(key);
      if (cb) { this.pending.delete(key); ctx.effect(cb, "slots.inject(" + key + ")"); }
    },
    register(options, component) {
      this.registrations.push({ options, component });
      return () => {};
    }
  };
  const ctx = {
    slots,
    effect: (fn, desc) => {
      try { return fn(); } catch (e) { throw new Error("effect failed [" + desc + "]: " + (e && e.stack || e)); }
    }
  };
  return ctx;
}
const ctx1 = makeCtx();
try { pluginModule.apply(ctx1); check("apply（未声明插槽）不抛异常", true); }
catch (e) { check("apply（未声明插槽）不抛异常", false, e.stack); }
check("未声明时 register 不提前调用", ctx1.slots.registrations.length === 0);
try { ctx1.slots.declare("conversation.input.left"); } catch (e) { check("插槽声明后 inject 回调执行", false, e.stack); }
check("插槽声明后 register 被调用", ctx1.slots.registrations.length === 1);
const reg = ctx1.slots.registrations[0];
check("注册选项正确", reg && reg.options.name === "conversation.input.left" && reg.options.id === "dsh-task-flow.view", reg && JSON.stringify(reg.options));
try {
  const htmlComp = reactDomServer.renderToString(react.createElement(reg.component, {}));
  check("输入栏工具行按钮渲染（紧凑图标版）", htmlComp.includes("tf-button-composer") && htmlComp.includes("tf-button-icon"));
} catch (e) { check("输入栏工具行按钮渲染", false, e.stack); }

const ctx2 = makeCtx();
ctx2.slots.declared.add("conversation.input.left");
try { pluginModule.apply(ctx2); check("apply（已声明插槽）立即 register", ctx2.slots.registrations.length === 1); }
catch (e) { check("apply（已声明插槽）", false, e.stack); }

/* ---------- 场景 5：组件 SSR 渲染 ---------- */
console.log("场景 5：组件 SSR 渲染");
function render(comp, props) {
  return reactDomServer.renderToString(react.createElement(comp, props || {}));
}
flow = resetStore();
try {
  const htmlWide = render(T.components.SidebarButton, { wide: true });
  check("按钮渲染（展开态）不抛异常", true);
  check("展开态包含「任务星图」", htmlWide.includes("任务星图"));
  check("展开态含进度环", htmlWide.includes("tf-ring"));
  const htmlRail = render(T.components.SidebarButton, { wide: false });
  check("按钮渲染（收起态）不抛异常", true);
  check("收起态只显示图标", htmlRail.includes("tf-button-icon") && !htmlRail.includes("tf-button-label"));
} catch (e) { check("按钮渲染", false, e.stack); }

try {
  const html = render(T.components.PanelContent, { onClose: () => {} });
  check("面板渲染不抛异常（默认星图视图）", true, "len=" + html.length);
  check("面板含「任务星图」标题", html.includes("任务星图"));
  check("含进度 1/7", html.includes("1/7"));
  check("当前节点标「当前」", html.includes("tf-here") && html.includes("当前"));
  check("头部含流程切换下拉", html.includes("tf-flow-select"));
  check("头部含视图切换与编辑按钮", html.includes("tf-view-toggle") && html.includes("tf-view-btn"));
  check("含 3 张分支卡牌（干货教程/观点评论/故事叙事）", html.includes("干货教程") && html.includes("观点评论") && html.includes("故事叙事"));
  check("分支卡含「⚡ 下达」指令按钮", html.includes("tf-branch-cmd") && html.includes("⚡ 下达"));
  check("含「如何继续」详情", html.includes("如何继续"));
  check("SVG 星图视图存在", html.includes("tf-mapwrap") && html.includes("tf-map-svg") && html.includes("tf-mnode"));
  check("星图连线带流光", html.includes("tf-medge lit pulse"), "edge class 存在");
  check("英雄详情卡存在", html.includes("tf-hero"));
  check("英雄卡含大花图标", html.includes("tf-hero-icon"));
  check("头部步骤点串存在", html.includes("tf-progress-dots"));
  check("英雄卡含水印序号", html.includes("tf-hero-watermark"));
  check("页脚含「🐋 鲸鱼让位」", html.includes("鲸鱼让位"));

  // 列表视图（旧版迷你星图）
  const htmlList = render(T.components.PanelContent, { onClose: () => {}, initialView: "list" });
  check("列表视图：迷你星图导航存在", htmlList.includes("tf-map") && htmlList.includes("tf-map-toggle"));
  check("列表视图：段亮起且带流光", htmlList.includes("tf-seg lit pulse"));

  // 编辑模式（无选中节点 → 引导页）
  const htmlEdit = render(T.components.PanelContent, { onClose: () => {}, initialEditing: true });
  check("编辑模式引导页存在", htmlEdit.includes("tf-editguide") && htmlEdit.includes("编辑模式"));

  // 空流程 → 添加第一个步骤
  const SEmpty = T.getStore();
  SEmpty.flows = [{ id: "empty", title: "空流程", theme: "sakura", createdAt: Date.now(), nodes: [], history: [] }];
  SEmpty.activeFlowId = "empty";
  const htmlEmpty = render(T.components.PanelContent, { onClose: () => {} });
  check("空流程含「添加第一个步骤」", htmlEmpty.includes("添加第一个步骤"));
  SEmpty.flows = [flow];
  SEmpty.activeFlowId = flow.id;
} catch (e) { check("面板渲染", false, e.stack); }

// 完成全部流程后的面板
T.chooseBranch(flow, "n2", "n3a");
{
  const htmlMid = render(T.components.PanelContent, { onClose: () => {} });
  check("当前任务步骤含「🤖 让 DSH 继续」", htmlMid.includes("让 DSH 继续"));
}
T.completeTask(flow, "n3a");
T.completeTask(flow, "n4");
T.completeTask(flow, "n5");
try {
  const html = render(T.components.PanelContent, { onClose: () => {} });
  check("完成态面板含「全部完成」", html.includes("全部完成"));
  check("完成态含奖杯与重新开始", html.includes("tf-trophy") && html.includes("重新开始"));
} catch (e) { check("完成态面板渲染", false, e.stack); }

// 项目总进度星图渲染
{
  const SP = T.getStore();
  SP.flows.push(T.makeProgressFlow(Date.now()));
  SP.activeFlowId = "progress";
  try {
    const htmlP = render(T.components.PanelContent, { onClose: () => {} });
    check("进度星图含「插件驿站 · 安装方式」", htmlP.includes("插件驿站 · 安装方式"));
    check("进度星图含 3 张安装分支卡", htmlP.includes("继续自动安装") && htmlP.includes("我自己手动装") && htmlP.includes("暂不安装"));
    check("进度星图显示 5/14", htmlP.includes("5/14"));
  } catch (e) { check("进度星图渲染", false, e.stack); }
}

/* ---------- 场景 5.5：P2 星图布局与编辑操作 ---------- */
console.log("场景 5.5：P2 布局与编辑器");
flow = resetStore();
const lp = T.layoutFlow(flow);
check("布局覆盖全部 7 节点", Object.keys(lp).length === 7, "len=" + Object.keys(lp).length);
check("同层分支同列（x 相同）", lp["n3a"].x === lp["n3b"].x && lp["n3b"].x === lp["n3c"].x, lp["n3a"].x + "," + lp["n3c"].x);
check("列随深度递增", lp["n2"].x > lp["n1"].x && lp["n4"].x > lp["n3a"].x && lp["n5"].x > lp["n4"].x);
const edP2 = T.edgesOf(flow);
check("边数量 8（含 3 条分支）", edP2.length === 8, "len=" + edP2.length);
check("边指向有效节点", edP2.every((e) => lp[e.from] && lp[e.to]));

const nNew = T.newFlowNode(flow, 100, 100);
check("新建节点 id 唯一", flow.nodes.filter((x) => x.id === nNew.id).length === 1);
check("自定义 pos 生效于布局", T.layoutFlow(flow)[nNew.id].x === 100 && T.layoutFlow(flow)[nNew.id].y === 100);
T.updateFlowNode(flow, nNew.id, { title: "改名了", est: "5 分钟", tags: ["a", "b"] });
check("更新节点字段", flow.nodes.find((x) => x.id === nNew.id).title === "改名了");
T.moveFlowNode(flow, nNew.id, 222, 333);
check("拖动节点更新位置", T.layoutFlow(flow)[nNew.id].x === 222 && T.layoutFlow(flow)[nNew.id].y === 333);
T.deleteFlowNode(flow, "n2");
check("删除节点及其连线", !flow.nodes.some((x) => x.id === "n2") && flow.nodes.find((x) => x.id === "n1").next === null);
check("删除后边列表清理", T.edgesOf(flow).every((e) => e.from !== "n2" && e.to !== "n2"));

// EditorForm SSR（分支节点 / 普通节点）
flow = resetStore();
try {
  const htmlChoice = render(T.components.EditorForm, {
    flow: flow, node: flow.nodes.find((x) => x.id === "n2"),
    onUpdate: () => {}, onDelete: () => {}
  });
  check("编辑器（分支节点）含分支编辑区", htmlChoice.includes("分支选项") && htmlChoice.includes("加分支") && htmlChoice.includes("编辑节点"));
  const htmlTask = render(T.components.EditorForm, {
    flow: flow, node: flow.nodes.find((x) => x.id === "n1"),
    onUpdate: () => {}, onDelete: () => {}
  });
  check("编辑器（普通节点）含下一步选择", htmlTask.includes("下一步") && htmlTask.includes("（终点）"));
} catch (e) { check("编辑器渲染", false, e.stack); }

/* ---------- 场景 5.6：P3 S1 AI 拆解面板与落库 ---------- */
console.log("场景 5.6：AI 面板与落库");
flow = resetStore();
try {
  const htmlAi = render(T.components.PanelContent, { onClose: () => {} });
  check("AI 条渲染（输入框+生成按钮）", htmlAi.includes("tf-ai-bar") && htmlAi.includes("tf-ai-input") && htmlAi.includes("tf-ai-btn"));
  check("占位文案「星图自己长出来」", htmlAi.includes("星图自己长出来"));
  check("生成按钮文案「✨ 生成」", htmlAi.includes("✨ 生成"));
} catch (e) { check("AI 条渲染", false, e.stack); }

const beforeCount = T.getStore().flows.length;
const aiRes = T.aiApplyHostFlow({
  flow: {
    id: "ai-1", title: "AI 流程", createdAt: Date.now(), schema: 2,
    meta: { origin: "ai", planPrompt: "test" },
    nodes: [
      { id: "a1", kind: "task", title: "甲", how: "h", est: "e" },
      { id: "a2", kind: "choice", title: "选", branches: [{ label: "左", to: "a3" }, { label: "右", to: "a3" }] },
      { id: "a3", kind: "milestone", title: "✅ 产出" }
    ]
  },
  warnings: []
});
check("AI 落库成功且成为当前流程", aiRes.ok === true && T.getStore().flows.length === beforeCount + 1 && T.getStore().activeFlowId === "ai-1");
const aiFlow = T.getStore().flows[T.getStore().flows.length - 1];
check("AI 流程 schema=2 / meta.origin=ai", aiFlow.schema === 2 && aiFlow.meta.origin === "ai");
check("节点补 exec 缺省（agent 模式）", aiFlow.nodes.every((n) => n.exec && n.exec.mode === "agent"));
check("生长序列覆盖全部节点", aiRes.growSeq.size === 3 && aiRes.growSeq.get("a2") === 1);
const snap = JSON.parse(aiRes.snapshot);
T.getStore().flows = snap.flows;
T.getStore().activeFlowId = snap.activeFlowId;
check("快照撤销恢复原状", T.getStore().flows.length === beforeCount && T.getStore().activeFlowId === "demo");
const badAi = T.aiApplyHostFlow({ flow: { id: "x", title: "y", nodes: [] } });
check("空 nodes → 拒绝落库", badAi.ok === false);
const warnAi = T.aiApplyHostFlow({ flow: { id: "ai-2", title: "W", nodes: [{ id: "w1", title: "一" }] }, warnings: ["已自动修正"] });
check("warnings 透传", warnAi.ok === true && warnAi.warnings.length === 1);

/* ---------- 场景 5.7：S2 星图视图（暗虚线 / 生长动画 / 100 节点性能） ---------- */
console.log("场景 5.7：星图视图补差与性能");
{
  const srcCss = fs.readFileSync(BUNDLE, "utf8");
  check("未走边为暗虚线（stroke-dasharray）", /\.tf-medge\s*\{[^}]*stroke-dasharray:\s*3\s*5/.test(srcCss));
  check("已走边为亮实线（dasharray none）", /\.tf-medge\.lit\s*\{[^}]*stroke-dasharray:\s*none/.test(srcCss));
}
{
  const demoFlow = resetStore();
  const demoSt = T.replay(demoFlow);
  const growSeq = new Map([["n1", 0], ["n2", 1]]);
  try {
    const htmlGrow = render(T.components.MapView, {
      flow: demoFlow, st: demoSt, unchosen: T.unchosenSet(demoFlow, demoSt.chosen),
      selectedId: null, previewTo: null, editing: false, growSeq: growSeq,
      onSelect: () => {}, onAddNode: () => {}, onMoveNode: () => {}, onContextMenu: () => {}
    });
    const growOk = /tf-mnode [a-z]+ grow/.test(htmlGrow) && htmlGrow.includes("animation-delay:120ms");
    check("生长态节点带 grow 类与动画延迟", growOk, growOk ? "" : htmlGrow.match(/tf-mnode[^>]{0,80}/g).slice(0, 3).join(" | "));
  } catch (e) { check("生长态 MapView 渲染", false, e.stack); }
}
{
  // 100 节点链：布局 + SSR 渲染性能（阈值 2s，宽松防 CI 抖动）
  const perfNodes = [];
  for (let i = 1; i <= 100; i++) perfNodes.push({ id: "x" + i, kind: "task", title: "步骤 " + i, next: i < 100 ? "x" + (i + 1) : null });
  const perfFlow = { id: "perf", title: "压测", theme: "sakura", createdAt: Date.now(), nodes: perfNodes, history: [] };
  const perfSt = T.replay(perfFlow);
  const t0 = Date.now();
  const lp = T.layoutFlow(perfFlow);
  const htmlPerf = render(T.components.MapView, {
    flow: perfFlow, st: perfSt, unchosen: new Set(), selectedId: null, previewTo: null, editing: false, growSeq: null,
    onSelect: () => {}, onAddNode: () => {}, onMoveNode: () => {}, onContextMenu: () => {}
  });
  const ms = Date.now() - t0;
  check("100 节点布局覆盖全部", Object.keys(lp).length === 100);
  check("100 节点 SSR 渲染全部节点", (htmlPerf.match(/tf-mnode /g) || []).length >= 100);
  check("100 节点布局+渲染 < 2000ms", ms < 2000, ms + "ms");
}

/* ---------- 场景 6：拖拽边界 ---------- */
console.log("场景 6：拖拽边界（clampPanel）");
const c1 = T.clampPanel(500, 400, 700, 500, 1200, 800);
check("常规位置不夹紧", c1.x === 500 && c1.y === 400);
const c2 = T.clampPanel(-999, -999, 700, 500, 1200, 800);
check("左上越界夹紧（至少保留 60px 可见）", c2.x === 60 - 700 && c2.y === 60 - 500, c2.x + "," + c2.y);
const c3 = T.clampPanel(9999, 9999, 700, 500, 1200, 800);
check("右下越界夹紧", c3.x === 1200 - 60 && c3.y === 800 - 60, c3.x + "," + c3.y);
const rs1 = T.clampResize(900, 600, 1200, 800);
check("常规尺寸不夹紧", rs1.w === 900 && rs1.h === 600);
const rs2 = T.clampResize(100, 100, 1200, 800);
check("过小尺寸抬到最小", rs2.w === 560 && rs2.h === 420, rs2.w + "x" + rs2.h);
const rs3 = T.clampResize(9999, 9999, 1200, 800);
check("过大尺寸收到视口内", rs3.w === 1176 && rs3.h === 776, rs3.w + "x" + rs3.h);

/* ---------- 场景 7：向 DSH 下达指令（无会话服务时优雅失败） ---------- */
console.log("场景 7：向 DSH 下达指令");
const rCmd = T.sendCommand("测试指令");
check("无会话服务时优雅失败", rCmd.ok === false && /会话/.test(rCmd.error || ""), rCmd.error);

/* ---------- 场景 8：鲸鱼让位 ---------- */
console.log("场景 8：鲸鱼让位");
const rw = T.moveWhaleRight();
check("鲸鱼让位成功且写入锚点记忆", rw.ok === true && localStorageMock.getItem("dshw-pos") !== null, rw.error);
const pos8 = JSON.parse(localStorageMock.getItem("dshw-pos") || "{}");
check("锚点为右下角", pos8.hAnchor === "right" && pos8.vAnchor === "bottom" && pos8.v === 2, JSON.stringify(pos8));

console.log(failures === 0 ? "== 全部通过 ==" : "== 有 " + failures + " 项失败 ==");
process.exit(failures === 0 ? 0 : 1);
