// dsh-task-flow 客户端 bundle 的本地模拟测试：
// 模拟 DSH 客户端环境（模块加载器 + 最小 ctx + react/react-dom 真实包），
// 完整走一遍 物化 → apply → 插槽声明 → 按钮/面板渲染 + 流程状态机逻辑。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const NODE_MODULES = "C:/Users/wqy20/.dsh/profiles/node_modules";
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
  check("面板渲染不抛异常", true, "len=" + html.length);
  check("面板含「任务星图」标题", html.includes("任务星图"));
  check("含进度 1/7", html.includes("1/7"));
  check("当前节点标「当前」", html.includes("tf-here") && html.includes("当前"));
  check("头部含流程切换下拉", html.includes("tf-flow-select"));
  check("头部不含旧 chips 行", !html.includes("tf-chips"));
  check("含 3 张分支卡牌（干货教程/观点评论/故事叙事）", html.includes("干货教程") && html.includes("观点评论") && html.includes("故事叙事"));
  check("分支卡含「⚡ 下达」指令按钮", html.includes("tf-branch-cmd") && html.includes("⚡ 下达"));
  check("含「如何继续」详情", html.includes("如何继续"));
  check("迷你星图导航存在", html.includes("tf-map"));
  check("英雄详情卡存在", html.includes("tf-hero"));
  check("英雄卡含大花图标", html.includes("tf-hero-icon"));
  check("头部步骤点串存在", html.includes("tf-progress-dots"));
  check("英雄卡含水印序号", html.includes("tf-hero-watermark"));
  check("迷你星图含折叠开关", html.includes("tf-map-toggle"));
  check("页脚含「🐋 鲸鱼让位」", html.includes("鲸鱼让位"));
  check("n1→n2 段亮起且带流光", html.includes("tf-seg lit pulse"), "seg class 存在");
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

/* ---------- 场景 6：拖拽边界 ---------- */
console.log("场景 6：拖拽边界（clampPanel）");
const c1 = T.clampPanel(500, 400, 700, 500, 1200, 800);
check("常规位置不夹紧", c1.x === 500 && c1.y === 400);
const c2 = T.clampPanel(-999, -999, 700, 500, 1200, 800);
check("左上越界夹紧（至少保留 60px 可见）", c2.x === 60 - 700 && c2.y === 60 - 500, c2.x + "," + c2.y);
const c3 = T.clampPanel(9999, 9999, 700, 500, 1200, 800);
check("右下越界夹紧", c3.x === 1200 - 60 && c3.y === 800 - 60, c3.x + "," + c3.y);

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
