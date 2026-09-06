// dsh-task-flow — 任务星图 · 樱花主题（P1 视觉核心）
// 点开左下角按钮：一条会发光的「星链」告诉你任务进行到哪一步、如何继续、有哪些分支。
//   1) 数据：localStorage（dsh-task-flow:v1），多流程，历史事件可回退/反悔分支；
//   2) 侧边栏按钮（sidebar.footer.action）：樱花图标 + 实时进度环 + 悬停气泡；
//   3) 面板：纵向任务链（花苞 → 绽放）+ 分支卡牌飞出 + 详情卡（如何继续）；
//   4) 动效：节点依次点亮、当前节点涟漪、流光推进、星尘爆发、完成时花瓣雨。
// 全部动画纯 CSS/SVG，颜色走 --dsw-* token + 樱花自定义变量，自动适配明暗主题。
window.__ModuleLoader__.load({
  id: "dsh-task-flow",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    let react_dom = require("react-dom");
    let jsxRuntime = require("react/jsx-runtime");

    /** jsx-runtime 的 children 必须放在 props.children；h() 统一成 createElement 风格。
     *  key 通过 jsx-runtime 第三参数传递，避免「key 被 spread 进 props」的警告。 */
    function h(type, props, ...children) {
      let key;
      const p = props ? Object.assign({}, props) : {};
      if (props && props.key !== undefined) { key = props.key; delete p.key; }
      if (children.length === 1) p.children = children[0];
      else if (children.length > 1) p.children = children;
      return children.length > 1 ? jsxRuntime.jsxs(type, p, key) : jsxRuntime.jsx(type, p, key);
    }

    /* ================= 向 DSH 下达指令 ================= */

    /** 会话服务（apply 时捕获；拿不到时优雅降级）。 */
    let sessionsSvc = null;

    /** 当前会话 id（list 快照里的 current）。 */
    function currentSessionId() {
      try {
        const list = sessionsSvc && sessionsSvc.list;
        const snap = list && typeof list.getSnapshot === "function" ? list.getSnapshot() : null;
        return snap && typeof snap.current === "string" ? snap.current : null;
      } catch (e) { return null; }
    }
    /** 向当前会话的 DSH 发送一条消息。 */
    function sendCommand(text) {
      if (!sessionsSvc) return { ok: false, error: "会话服务不可用" };
      try {
        const id = currentSessionId();
        if (!id) return { ok: false, error: "当前没有打开的会话" };
        const scoped = sessionsSvc.scope(id);
        const conv = scoped ? scoped.get("conversation") : null;
        if (!conv || typeof conv.send !== "function") return { ok: false, error: "会话发送接口不可用" };
        const p = conv.send(text);
        if (p && typeof p.catch === "function") p.catch(() => { /* 发送失败由界面提示 */ });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
      }
    }

    /** 把小鲸鱼挂件（dsh-whale-widget）请回右下角，避免挡住左侧按钮。
     *  写其锚点记忆（dshw-pos，刷新后永久生效）+ 立即移动当前 DOM。 */
    function moveWhaleRight() {
      try {
        localStorage.setItem("dshw-pos", JSON.stringify({ v: 2, hAnchor: "right", hDist: 0, vAnchor: "bottom", vDist: 0 }));
        const el = document.querySelector(".dshwv-root");
        if (el) {
          const w = el.offsetWidth || 122;
          const h = el.offsetHeight || 122;
          el.style.left = Math.max(0, (window.innerWidth || 1200) - w) + "px";
          el.style.top = Math.max(0, (window.innerHeight || 800) - h) + "px";
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
      }
    }

    /* ================= 图标 ================= */

    const ICONS = {
      bud: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 21v-6.2" stroke="#c2457d" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M12 15.4c-1.6 1.4-3.4 1.9-5 1.5M12 15.4c1.6 1.4 3.4 1.9 5 1.5" stroke="#c2457d" stroke-width="1.4" stroke-linecap="round" fill="none"/><path d="M12 13.2C9.2 13.2 7.3 10.8 7.3 8 7.3 5.4 9.4 3.4 12 3.4S16.7 5.4 16.7 8c0 2.8-1.9 5.2-4.7 5.2z" fill="#f7b3cd"/><path d="M12 3.4c.9 2.1 0 3.9-.4 4.9M12 3.4c-.9 2.1 0 3.9.4 4.9" stroke="#d94f8e" stroke-width="1.1" stroke-linecap="round" fill="none"/></svg>',
      bloom: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><g fill="#f7aacb"><ellipse cx="12" cy="6.8" rx="3" ry="4.4"/><ellipse cx="12" cy="6.8" rx="3" ry="4.4" transform="rotate(72 12 12)"/><ellipse cx="12" cy="6.8" rx="3" ry="4.4" transform="rotate(144 12 12)"/><ellipse cx="12" cy="6.8" rx="3" ry="4.4" transform="rotate(216 12 12)"/><ellipse cx="12" cy="6.8" rx="3" ry="4.4" transform="rotate(288 12 12)"/></g><circle cx="12" cy="12" r="2.6" fill="#ffd9e8"/><circle cx="12" cy="12" r="1.2" fill="#ec6da5"/></svg>',
      lock: '<svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z"/></svg>',
      check: '<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7"/></svg>',
      close: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
      upload: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="M6 10l6-6 6 6"/><path d="M4 20h16"/></svg>',
      download: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12"/><path d="M6 10l6 6 6-6"/><path d="M4 20h16"/></svg>',
      refresh: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
      plus: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
      trophy: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M6 3h12v2h3v3c0 2.8-2 5-4.6 5.4A6 6 0 0 1 13 18.4V20h3v2H8v-2h3v-1.6a6 6 0 0 1-3.4-5C4.9 13 3 10.8 3 8V5h3V3zm9 2H9v5c0 1.7 1.3 3 3 3s3-1.3 3-3V5zM5 7v1c0 1.4.9 2.5 2.1 2.9A5.2 5.2 0 0 1 6.4 8H5zm14 0h-1.4a5.2 5.2 0 0 1-.7 2.9C18.1 10.5 19 9.4 19 8V7z"/></svg>',
      sparkle: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-.94 2.06L16 18l2.06.94L19 21l.94-2.06L22 18l-2.06-.94L19 15z"/></svg>',
      clock: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      undo: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
      arrow: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13"/><path d="M13 6l6 6-6 6"/></svg>',
      idea: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0-3.8 10.7c.5.5.8 1.2.8 1.8V17h6v-1.5c0-.6.3-1.3.8-1.8A6 6 0 0 0 12 3z"/><path d="M10 20.5h4M9.5 3.5v2M14.5 3.5v2"/></svg>',
      pen: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1L19 8l-3-3L5 16l-1 4z"/><path d="M14 6l3 3"/></svg>',
      chart: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M4 20h16"/></svg>',
      flag: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4"/><path d="M6 4c4-2.6 8 1 12 0v9c-4 1-8-2.6-12 0"/></svg>',
      cross: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2.2"/><path d="M12 2v6.5M12 15.5V22M2 12h6.5M15.5 12H22"/></svg>'
    };

    const KIND_META = {
      task: { label: "步骤", cls: "kind-task" },
      choice: { label: "分支", cls: "kind-choice" },
      milestone: { label: "里程碑", cls: "kind-milestone" },
      gate: { label: "条件", cls: "kind-gate" }
    };

    /** 花瓣粒子背景（与雪霁蓝主题同款樱花瓣） */
    const PETAL_URI = "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 130"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd9e8"/><stop offset="1" stop-color="#f7b3cd"/></linearGradient></defs><path d="M50 125 C80 108 82 52 63 26 C59 18 54 16 50 34 C46 16 41 18 37 26 C18 52 20 108 50 125 Z" fill="url(#g)"/><ellipse cx="50" cy="72" rx="18" ry="28" fill="white" opacity="0.22"/></svg>'
    );

    /* ================= 存储（localStorage） ================= */

    const STORE_KEY = "dsh-task-flow:v1";

    /** 首次打开自带的示例流程：打开面板即见「已完成的第 1 步 + 当前分支节点 + 3 张分支卡」。 */
    function makeDemoFlow(now) {
      return {
        id: "demo",
        title: "发布一篇公众号文章",
        theme: "sakura",
        createdAt: now,
        nodes: [
          {
            id: "n1", kind: "task", title: "确定选题", icon: "idea",
            desc: "从近期热点和读者反馈里挑出 3 个候选，最终定一个方向。",
            how: "对比最近 30 天文章数据，选阅读完成率最高的方向。",
            est: "10 分钟", tags: ["内容"], next: "n2"
          },
          {
            id: "n2", kind: "choice", title: "写作方向", icon: "cross",
            desc: "这篇文章用哪种调性来写？不同调性决定后续的写作步骤。",
            how: "按读者画像选择：教程适合涨收藏，观点适合涨传播，故事适合涨读完率。",
            branches: [
              { label: "干货教程", hint: "稳妥 · 收藏率高", to: "n3a", difficulty: "低" },
              { label: "观点评论", hint: "传播性强 · 有一定风险", to: "n3b", difficulty: "中" },
              { label: "故事叙事", hint: "可读性强 · 更花时间", to: "n3c", difficulty: "高" }
            ]
          },
          { id: "n3a", kind: "task", title: "写教程初稿", icon: "pen", desc: "结构：痛点 → 步骤拆解 → 示例 → 总结。", how: "先列大纲再填充，每个步骤配一张示意图。", est: "40 分钟", tags: ["写作"], next: "n4" },
          { id: "n3b", kind: "task", title: "写观点稿", icon: "pen", desc: "立论 → 论证 → 金句收尾，观点要鲜明。", how: "先写 100 字核心论点再展开；结尾留一个互动问题。", est: "50 分钟", tags: ["写作"], next: "n4" },
          { id: "n3c", kind: "task", title: "写故事稿", icon: "pen", desc: "用一个人物的故事带出观点，弱化说教感。", how: "开头 3 句必须钩住人；中间埋 2 个转折。", est: "60 分钟", tags: ["写作"], next: "n4" },
          { id: "n4", kind: "milestone", title: "排版发布", icon: "flag", desc: "排版、配图、标题打磨，定时发布。", how: "编辑器排版并配 3-5 张图；标题拟 3 个备选让朋友挑。", est: "20 分钟", tags: ["发布"], next: "n5" },
          { id: "n5", kind: "task", title: "复盘数据", icon: "chart", desc: "发布 24 小时后看数据，沉淀可复用的经验。", how: "对比同选题历史数据，把结论写进自己的选题库。", est: "15 分钟", tags: ["复盘"] }
        ],
        history: [{ n: "n1", kind: "task", ts: now - 3600000 }]
      };
    }

    /** 项目总进度星图：DSH 插件开发的真实进度（内置，随版本更新）。 */
    function makeProgressFlow(now) {
      return {
        id: "progress",
        title: "DSH 插件开发总进度",
        theme: "sakura",
        createdAt: now,
        nodes: [
          { id: "p1", kind: "task", title: "任务星图 · 方案与选型", icon: "idea",
            desc: "视觉系任务流程插件：点开按钮即见任务进行到哪一步、如何继续、有哪些分支。",
            how: "已确定：樱花视觉 · 先做 P1 · AI 联动放 P3。",
            est: "已定稿", tags: ["方案"], next: "p2" },
          { id: "p2", kind: "task", title: "任务星图 · P1 开发", icon: "pen",
            desc: "侧边栏按钮 + 樱花星链面板 + 分支卡牌 + 花瓣动效 + 推进/回退/跳过。",
            how: "mock 自测 42 项全绿，已安装到 web profile。",
            est: "已完成", tags: ["开发"], next: "p3" },
          { id: "p3", kind: "task", title: "任务星图 · 联调修正", icon: "chart",
            desc: "按反馈迭代：修复面板不居中、支持标题栏拖动、换主题雪霁蓝配色、面板加大到 980×740。",
            how: "已同步两份 bundle，服务端已验证分发新版。",
            est: "已完成", tags: ["联调"], next: "p4" },
          { id: "p4", kind: "task", title: "插件驿站 · 方案", icon: "idea",
            desc: "把本地插件一键发布到 GitHub：扫描 → 建仓 → 推送 → 实时日志。",
            how: "已确定：📦 驿站视觉 · gh 优先 + PAT 双路线 · 先做 P1。",
            est: "已定稿", tags: ["方案"], next: "p5" },
          { id: "p5", kind: "task", title: "插件驿站 · P1 开发", icon: "pen",
            desc: "host 发布流水线（git/gh/PAT）+ 面板（选目录/设置/认证/清单/日志/成功页）。",
            how: "host 26 项 + client 23 项测试全绿；代码在工作区 dsh-gh-publish。",
            est: "已完成", tags: ["开发"], next: "p6" },
          { id: "p6", kind: "choice", title: "插件驿站 · 安装方式", icon: "cross",
            desc: "P1 已开发完，下一步怎么装进 DSH？",
            how: "在下方三个分支里选一个继续。",
            branches: [
              { label: "继续自动安装", hint: "我来复制 + pnpm install + 定时重启", to: "p6a", difficulty: "低" },
              { label: "我自己手动装", hint: "我把安装步骤发给你", to: "p6b", difficulty: "低" },
              { label: "暂不安装", hint: "代码留在工作区，想装再说", to: "p6c", difficulty: "低" }
            ] },
          { id: "p6a", kind: "task", title: "自动安装并重启", icon: "flag",
            desc: "复制到 profiles/web/plugins、登记 package.json 与 cordis.patch.yml、pnpm install、重启后验证 /gh-publish/scan。",
            how: "喊我继续即可。", est: "5 分钟", tags: ["安装"], next: "p7" },
          { id: "p6b", kind: "task", title: "手动安装", icon: "flag",
            desc: "按 README 六步：复制 → 依赖 → patch → pnpm install → 重启 → 刷新。",
            how: "需要步骤说明的话找我要。", est: "10 分钟", tags: ["安装"], next: "p7" },
          { id: "p6c", kind: "task", title: "暂缓安装", icon: "flag",
            desc: "插件代码保留在工作区，随时可以继续。",
            how: "想装的时候说一声。", est: "—", tags: ["暂缓"], next: "p7" },
          { id: "p7", kind: "milestone", title: "首次真实发布验收", icon: "flag",
            desc: "用插件驿站把 dsh-task-flow 发布到 GitHub，走通完整闭环。",
            how: "在驿站面板选 dsh-task-flow → 认证 → 一键发布 → 打开仓库链接。",
            est: "待进行", tags: ["里程碑"], next: "p8" },
          { id: "p8", kind: "task", title: "任务星图 P2", icon: "pen",
            desc: "SVG 星图视图（拖拽缩放的全景任务地图）+ 可视化编辑器 + 导入导出增强。",
            how: "P1 看满意后开工。", est: "未开始", tags: ["P2"], next: "p9" },
          { id: "p9", kind: "task", title: "插件驿站 P2", icon: "pen",
            desc: "推送到已有仓库（仓库下拉）、发布历史、tag/Release、错误友好化。",
            how: "首次发布验收后开工。", est: "未开始", tags: ["P2"], next: "p10" },
          { id: "p10", kind: "task", title: "任务星图 P3", icon: "idea",
            desc: "AI 拆解（一句话生成流程）、Goal 主线联动、输入框 HUD。",
            how: "依赖 DSH 内部接口，做静默降级。", est: "未开始", tags: ["P3"], next: "p11" },
          { id: "p11", kind: "task", title: "插件驿站 P3", icon: "idea",
            desc: "Gitee 适配器、多插件批量发布、README 徽章自动生成。",
            how: "按需挑着做。", est: "未开始", tags: ["P3"] }
        ],
        history: [
          { n: "p1", kind: "task", ts: now - 5 * 3600000 },
          { n: "p2", kind: "task", ts: now - 4 * 3600000 },
          { n: "p3", kind: "task", ts: now - 3 * 3600000 },
          { n: "p4", kind: "task", ts: now - 2 * 3600000 },
          { n: "p5", kind: "task", ts: now - 3600000 }
        ]
      };
    }

    function loadStore() {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data && data.v === 1 && Array.isArray(data.flows)) {
            if (data.flows.length === 0) data.flows = [makeDemoFlow(Date.now())];
            if (!data.flows.some((f) => f.id === data.activeFlowId)) data.activeFlowId = data.flows[0].id;
            // 迁移：把「项目总进度」星图加入已有数据（一次性，并设为当前）
            if (!data.flows.some((f) => f.id === "progress")) {
              data.flows.push(makeProgressFlow(Date.now()));
              data.activeFlowId = "progress";
            }
            return data;
          }
        }
      } catch (e) { /* 损坏则重建 */ }
      const now = Date.now();
      return { v: 1, activeFlowId: "demo", flows: [makeDemoFlow(now), makeProgressFlow(now)] };
    }

    let store = loadStore();
    const storeListeners = new Set();

    function save() {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* 忽略配额错误 */ }
      storeListeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
    }
    function onStoreChange(fn) {
      storeListeners.add(fn);
      return () => { storeListeners.delete(fn); };
    }
    function activeFlow() {
      return store.flows.find((f) => f.id === store.activeFlowId) || null;
    }

    /* ================= 图推导 ================= */

    function nodeById(flow, id) {
      return flow.nodes.find((n) => n.id === id) || null;
    }
    function firstNodeId(flow) {
      return flow.nodes.length ? flow.nodes[0].id : null;
    }
    function nextTarget(flow, nodeId, chosen) {
      const node = nodeById(flow, nodeId);
      if (!node) return null;
      if (node.kind === "choice") return chosen[nodeId] || null;
      return node.next || null;
    }

    /** BFS 排序（分支目标紧跟分支节点），用于纵向链的行顺序。 */
    function orderedIds(flow) {
      const out = [];
      const seen = new Set();
      const start = firstNodeId(flow);
      if (!start) return out;
      const queue = [start];
      while (queue.length) {
        const id = queue.shift();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        const node = nodeById(flow, id);
        if (!node) continue;
        if (node.kind === "choice") {
          (node.branches || []).forEach((b) => { if (b.to) queue.push(b.to); });
        } else if (node.next) queue.push(node.next);
      }
      return out;
    }

    /** 由历史事件回放当前状态：done / skipped / chosen / active。 */
    function replay(flow) {
      const done = new Set();
      const skipped = new Set();
      const chosen = {};
      let active = firstNodeId(flow);
      for (const ev of flow.history || []) {
        if (ev.kind === "skip") { skipped.add(ev.n); continue; }
        if (ev.n) done.add(ev.n);
        if (ev.kind === "choice" && ev.to) chosen[ev.n] = ev.to;
      }
      const last = (flow.history || []).length ? flow.history[flow.history.length - 1] : null;
      if (last) {
        if (last.kind === "choice" && last.to) active = last.to;
        else if (last.kind === "task" || last.kind === "skip") active = nextTarget(flow, last.n, chosen);
      }
      return { done, skipped, chosen, active };
    }

    /** 被放弃的支线：在已选分支约束下不可达的节点。 */
    function unchosenSet(flow, chosen) {
      const reach = new Set();
      const start = firstNodeId(flow);
      if (start) {
        const stack = [start];
        while (stack.length) {
          const id = stack.pop();
          if (!id || reach.has(id)) continue;
          reach.add(id);
          const node = nodeById(flow, id);
          if (!node) continue;
          if (node.kind === "choice") {
            const c = chosen[id];
            if (c) stack.push(c);
            else (node.branches || []).forEach((b) => { if (b.to) stack.push(b.to); });
          } else if (node.next) stack.push(node.next);
        }
      }
      const out = new Set();
      flow.nodes.forEach((n) => { if (!reach.has(n.id)) out.add(n.id); });
      return out;
    }

    /* ================= 进度操作（历史事件 + 回放 = 天然可回退） ================= */

    function completeTask(flow, nodeId) {
      flow.history.push({ n: nodeId, kind: "task", ts: Date.now() });
      save();
    }
    function chooseBranch(flow, nodeId, to) {
      flow.history.push({ n: nodeId, kind: "choice", to: to, ts: Date.now() });
      save();
    }
    function skipNode(flow, nodeId) {
      flow.history.push({ n: nodeId, kind: "skip", ts: Date.now() });
      save();
    }
    function rollbackOne(flow) {
      if (!flow.history.length) return;
      flow.history.pop();
      save();
    }
    /** 回退到该节点最后一次被完成/选择之前（重选分支 = 回退 + 再选）。 */
    function rollbackToEvent(flow, nodeId) {
      const idx = (flow.history || []).map((e) => e.n).lastIndexOf(nodeId);
      if (idx < 0) return;
      flow.history = flow.history.slice(0, idx);
      save();
    }
    function restartFlow(flow) {
      flow.history = [];
      save();
    }
    function resetDemoFlow(flow) {
      flow.history = [{ n: "n1", kind: "task", ts: Date.now() }];
      save();
    }
    function newFlow() {
      const id = "flow-" + Date.now().toString(36);
      store.flows.push({ id, title: "新流程", theme: "sakura", createdAt: Date.now(), nodes: [], history: [] });
      store.activeFlowId = id;
      save();
    }
    /** 导入流程 JSON（宽松校验 + 目标补全/裁剪）。 */
    function importFlowJson(obj) {
      if (!obj || typeof obj !== "object" || !Array.isArray(obj.nodes) || obj.nodes.length === 0) {
        return { ok: false, error: "需要 nodes 数组（至少一个步骤）" };
      }
      const nodes = [];
      const seen = new Set();
      for (let i = 0; i < obj.nodes.length; i++) {
        const n = obj.nodes[i] || {};
        if (!n.title) return { ok: false, error: "第 " + (i + 1) + " 个步骤缺少 title" };
        let id = String(n.id || "n" + (i + 1));
        if (seen.has(id)) id = id + "-" + i;
        seen.add(id);
        const kind = n.kind === "milestone" ? "milestone" : n.kind === "choice" ? "choice" : "task";
        nodes.push({
          id: id,
          title: String(n.title),
          kind: kind,
          desc: String(n.desc || ""),
          how: String(n.how || ""),
          est: String(n.est || ""),
          icon: n.icon || null,
          tags: Array.isArray(n.tags) ? n.tags.map(String).slice(0, 5) : [],
          next: n.next ? String(n.next) : null,
          branches: (kind === "choice" && Array.isArray(n.branches))
            ? n.branches.filter((b) => b && b.label && b.to).map((b) => ({
                label: String(b.label), hint: String(b.hint || ""),
                to: String(b.to), difficulty: String(b.difficulty || "中")
              }))
            : []
        });
      }
      // 目标校验：指向不存在节点的 next / 分支目标 → 裁剪为终节点 / 丢弃
      nodes.forEach((n) => {
        if (n.next && !seen.has(n.next)) n.next = null;
        n.branches = n.branches.filter((b) => seen.has(b.to));
      });
      const flow = {
        id: "flow-" + Date.now().toString(36),
        title: String(obj.title || "导入的流程"),
        theme: "sakura",
        createdAt: Date.now(),
        nodes: nodes,
        history: Array.isArray(obj.history)
          ? obj.history.filter((ev) => ev && ev.n && seen.has(ev.n)).slice(0, 500)
          : []
      };
      store.flows.push(flow);
      store.activeFlowId = flow.id;
      save();
      return { ok: true, id: flow.id };
    }
    function exportFlow(flow) {
      const payload = JSON.stringify(
        { title: flow.title, theme: flow.theme, nodes: flow.nodes, history: flow.history },
        null, 2
      );
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (flow.title || "task-flow") + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } }, 1000);
    }

    /* ================= 粒子（花瓣爆发 / 花瓣雨） ================= */

    let particleLayer = null;
    function ensureParticleLayer() {
      if (!particleLayer || !particleLayer.isConnected) {
        particleLayer = document.createElement("div");
        particleLayer.className = "tf-particles";
        particleLayer.setAttribute("aria-hidden", "true");
        document.body.appendChild(particleLayer);
      }
      return particleLayer;
    }
    function reducedMotion() {
      try {
        return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch (e) { return false; }
    }
    function elementCenter(el) {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }
    /** 在 (x, y) 爆出一圈花瓣。gray=true 时是灰调（被放弃的支线）。 */
    function burstAt(x, y, count, gray) {
      if (reducedMotion()) return;
      const layer = ensureParticleLayer();
      for (let i = 0; i < count; i++) {
        const p = document.createElement("div");
        p.className = "tf-particle" + (gray ? " gray" : "");
        const ang = Math.random() * Math.PI * 2;
        const dist = 34 + Math.random() * 84;
        p.style.left = x + "px";
        p.style.top = y + "px";
        p.style.setProperty("--dx", (Math.cos(ang) * dist).toFixed(1) + "px");
        p.style.setProperty("--dy", (Math.sin(ang) * dist - 24).toFixed(1) + "px");
        p.style.setProperty("--rot", (Math.random() * 540 - 270).toFixed(0) + "deg");
        p.style.setProperty("--sc", (0.6 + Math.random() * 0.9).toFixed(2));
        p.style.animationDelay = (Math.random() * 0.12).toFixed(2) + "s";
        p.style.animationDuration = (0.7 + Math.random() * 0.6).toFixed(2) + "s";
        layer.appendChild(p);
        p.addEventListener("animationend", () => p.remove(), { once: true });
      }
    }
    /** 全屏花瓣雨（流程完成时的庆祝）。 */
    function petalRain(count) {
      if (reducedMotion()) return;
      const layer = ensureParticleLayer();
      const w = window.innerWidth || 1200;
      const h = window.innerHeight || 800;
      for (let i = 0; i < count; i++) {
        const p = document.createElement("div");
        p.className = "tf-particle rain";
        const size = 12 + Math.random() * 9;
        p.style.left = (Math.random() * w).toFixed(0) + "px";
        p.style.top = "-30px";
        p.style.width = size + "px";
        p.style.height = (size * 1.25).toFixed(0) + "px";
        p.style.setProperty("--fall", (h + 160).toFixed(0) + "px");
        p.style.setProperty("--sway", (Math.random() * 160 - 80).toFixed(0) + "px");
        p.style.setProperty("--rot", (Math.random() * 720 - 360).toFixed(0) + "deg");
        p.style.animationDuration = (2.6 + Math.random() * 1.8).toFixed(2) + "s";
        p.style.animationDelay = (-Math.random() * 3).toFixed(2) + "s";
        layer.appendChild(p);
        p.addEventListener("animationend", () => p.remove(), { once: true });
      }
    }

    /* ================= 组件 ================= */

    /** 节点图标元素注册表（供粒子爆发定位）。 */
    const iconEls = new Map();

    function ProgressRing({ fraction, size }) {
      const stroke = size >= 20 ? 3 : 2.5;
      const R = (size - stroke) / 2;
      const C = 2 * Math.PI * R;
      const f = Math.max(0, Math.min(1, fraction || 0));
      return h("svg", { className: "tf-ring", width: size, height: size, viewBox: "0 0 " + size + " " + size, "aria-hidden": "true" },
        h("circle", { className: "tf-ring-bg", cx: size / 2, cy: size / 2, r: R, fill: "none", strokeWidth: stroke }),
        h("circle", {
          className: "tf-ring-fg", cx: size / 2, cy: size / 2, r: R, fill: "none",
          strokeWidth: stroke, strokeLinecap: "round",
          style: { strokeDasharray: C.toFixed(1), strokeDashoffset: (C * (1 - f)).toFixed(1) }
        })
      );
    }

    function KindChip({ kind }) {
      const meta = KIND_META[kind] || KIND_META.task;
      return h("span", { className: "tf-kind-chip " + meta.cls }, meta.label);
    }

    function BranchCard({ branch, index, onPick, onHover, onLeave, onCommand }) {
      const diffCls = branch.difficulty === "低" ? "tf-diff-low" : branch.difficulty === "高" ? "tf-diff-high" : "tf-diff-mid";
      return h("button", {
        type: "button",
        className: "tf-branch",
        style: { animationDelay: (index * 70) + "ms" },
        onClick: onPick,
        onMouseEnter: onHover,
        onMouseLeave: onLeave
      },
        h("span", { className: "tf-branch-label" }, branch.label),
        h("span", { className: "tf-branch-hint" }, branch.hint || ""),
        h("span", { className: "tf-branch-diff " + diffCls }, branch.difficulty || "中"),
        h("span", { className: "tf-branch-arrow", dangerouslySetInnerHTML: { __html: ICONS.arrow } }),
        onCommand
          ? h("span", {
              className: "tf-branch-cmd",
              role: "button",
              title: "直接向 DSH 下达此分支指令",
              onClick: (e) => { e.stopPropagation(); onCommand(); }
            }, "⚡ 下达")
          : null
      );
    }

    function NodeRow({ node, index, status, chosenTo, entryDelay, onSelect, onComplete, onChoose, onSkip }) {
      const isChoice = node.kind === "choice";
      const pickedLabel = isChoice && chosenTo
        ? ((node.branches || []).find((b) => b.to === chosenTo) || {}).label
        : null;
      const titleIcon = ICONS[node.icon] || null;
      const metaText = [node.est || "", ...(node.tags || [])].filter(Boolean).join(" · ");
      return h("div", { className: "tf-row " + status, style: { animationDelay: entryDelay + "ms" } },
        h("div", { className: "tf-rail-col" },
          h("div", {
            className: "tf-node-icon " + status,
            ref: (el) => { iconEls.set(node.id, el); }
          },
            h("span", {
              className: "tf-node-svg" + (status === "done" ? " bloom" : ""),
              dangerouslySetInnerHTML: { __html: status === "done" ? ICONS.bloom : ICONS.bud }
            }),
            status === "done"
              ? h("span", { className: "tf-node-check", dangerouslySetInnerHTML: { __html: ICONS.check } })
              : null,
            status === "unchosen"
              ? h("span", { className: "tf-node-lock", dangerouslySetInnerHTML: { __html: ICONS.lock } })
              : null
          )
        ),
        h("div", { className: "tf-card" + (status === "active" ? " active" : ""), onClick: () => onSelect(node.id) },
          h("div", { className: "tf-title-line" },
            (node.kind === "choice" || node.kind === "milestone") ? h(KindChip, { kind: node.kind }) : null,
            titleIcon
              ? h("span", { className: "tf-node-emoji", dangerouslySetInnerHTML: { __html: titleIcon } })
              : null,
            h("span", { className: "tf-title" }, node.title),
            status === "active" ? h("span", { className: "tf-here" }, "当前") : null,
            status === "unchosen" ? h("span", { className: "tf-badge-unchosen" }, "未选择") : null,
            status === "skipped" ? h("span", { className: "tf-badge-skip" }, "已跳过") : null
          ),
          metaText
            ? h("div", { className: "tf-meta-line" }, metaText)
            : null,
          isChoice && pickedLabel
            ? h("div", { className: "tf-picked" },
                h("span", { className: "tf-meta-icon", dangerouslySetInnerHTML: { __html: ICONS.arrow } }),
                "已选：" + pickedLabel)
            : null,
          status === "active" && isChoice
            ? h("div", { className: "tf-branch-list" },
                (node.branches || []).map((b, i) =>
                  h(BranchCard, { key: b.to, branch: b, index: i, onPick: () => onChoose(node.id, b.to) })
                ))
            : null,
          status === "active" && !isChoice
            ? h("div", { className: "tf-row-actions" },
                h("button", {
                  type: "button", className: "tf-btn-primary",
                  onClick: (e) => { e.stopPropagation(); onComplete(node.id); }
                },
                  h("span", { className: "tf-btn-icon", dangerouslySetInnerHTML: { __html: ICONS.check } }),
                  node.kind === "milestone" ? "完成里程碑" : "完成此步"),
                h("button", {
                  type: "button", className: "tf-btn-ghost",
                  onClick: (e) => { e.stopPropagation(); onSkip(node.id); }
                }, "跳过"))
            : null
        )
      );
    }

    function HeroDetail({ flow, st, unchosen, selectedId, onComplete, onSkip, onChoose, onRollback, onRestart, onBranchHover, onBranchLeave, onCommand }) {
      if (!flow || !st) return h("div", { className: "tf-hero" }, "暂无流程");

      if (st.active === null && st.done.size > 0) {
        return h("div", { className: "tf-hero tf-hero-complete" },
          h("span", { className: "tf-trophy", dangerouslySetInnerHTML: { __html: ICONS.trophy } }),
          h("div", { className: "tf-complete-title" }, "全部完成！"),
          h("p", { className: "tf-complete-sub" }, "整条流程已经走完，花瓣为你而落 🌸"),
          h("div", { className: "tf-complete-actions" },
            h("button", { type: "button", className: "tf-btn-primary", onClick: onRestart }, "重新开始"),
            h("button", { type: "button", className: "tf-btn-ghost", onClick: () => exportFlow(flow) }, "导出这份流程"))
        );
      }

      const node = selectedId
        ? nodeById(flow, selectedId)
        : (st.active ? nodeById(flow, st.active) : flow.nodes[0]);
      if (!node) return h("div", { className: "tf-hero" }, "这张星图还没有步骤");

      const status = st.done.has(node.id) ? "done"
        : st.skipped.has(node.id) ? "skipped"
        : node.id === st.active ? "active"
        : unchosen.has(node.id) ? "unchosen" : "pending";
      const isChoice = node.kind === "choice";
      const pickedLabel = isChoice && st.chosen[node.id]
        ? ((node.branches || []).find((b) => b.to === st.chosen[node.id]) || {}).label
        : null;
      const idx = flow.nodes.findIndex((n) => n.id === node.id);
      const metaText = [node.est || "", ...(node.tags || [])].filter(Boolean).join(" · ");

      return h("div", { className: "tf-hero" },
        h("span", { className: "tf-hero-watermark", "aria-hidden": "true" },
          String(idx + 1).padStart(2, "0")),
        h("div", { className: "tf-hero-icon" },
          h("span", {
            className: "tf-hero-icon-inner" + (status === "done" ? " bloom" : ""),
            dangerouslySetInnerHTML: { __html: status === "done" ? ICONS.bloom : ICONS.bud }
          })),
        h("div", { className: "tf-hero-top" },
          h(KindChip, { kind: node.kind }),
          metaText ? h("span", { className: "tf-hero-meta" }, metaText) : null,
          status === "active" ? h("span", { className: "tf-here" }, "当前") : null,
          status === "unchosen" ? h("span", { className: "tf-badge-unchosen" }, "未选择") : null,
          status === "skipped" ? h("span", { className: "tf-badge-skip" }, "已跳过") : null),
        h("div", { className: "tf-hero-title" }, node.title),
        node.desc ? h("p", { className: "tf-hero-desc" }, node.desc) : null,
        h("div", { className: "tf-detail-how" },
          h("div", { className: "tf-how-head" },
            h("span", { className: "tf-meta-icon", dangerouslySetInnerHTML: { __html: ICONS.sparkle } }),
            h("b", null, "如何继续")),
          h("p", { className: "tf-how-text" },
            node.how || (isChoice ? "在下方选择一个分支继续。" : "点击「完成此步」推进到下一步。"))
        ),
        status === "active" && isChoice
          ? h("div", { className: "tf-branch-grid" },
              (node.branches || []).map((b, i) =>
                h(BranchCard, {
                  key: b.to, branch: b, index: i,
                  onPick: () => onChoose(node.id, b.to),
                  onHover: () => onBranchHover(b.to),
                  onLeave: onBranchLeave,
                  onCommand: () => onCommand(node.id, b.to)
                })
              ))
          : null,
        isChoice && pickedLabel
          ? h("div", { className: "tf-picked" },
              h("span", { className: "tf-meta-icon", dangerouslySetInnerHTML: { __html: ICONS.arrow } }),
              "已选：" + pickedLabel)
          : null,
        status === "active" && !isChoice
          ? h("div", { className: "tf-hero-actions" },
              h("button", { type: "button", className: "tf-btn-primary", onClick: () => onComplete(node.id) },
                h("span", { className: "tf-btn-icon", dangerouslySetInnerHTML: { __html: ICONS.check } }),
                node.kind === "milestone" ? "完成里程碑" : "完成此步"),
              h("button", { type: "button", className: "tf-btn-ghost tf-btn-cmd", onClick: () => onCommand(node.id, null) },
                "🤖 让 DSH 继续"),
              h("button", { type: "button", className: "tf-btn-ghost", onClick: () => onSkip(node.id) }, "跳过"))
          : null,
        status === "done"
          ? h("div", { className: "tf-hero-actions" },
              h("button", { type: "button", className: "tf-btn-ghost", onClick: () => onRollback(node.id) },
                h("span", { className: "tf-btn-icon", dangerouslySetInnerHTML: { __html: ICONS.undo } }),
                isChoice ? "重新选择分支" : "回退到此步"))
          : null,
        status === "pending"
          ? h("p", { className: "tf-detail-wait" }, "前面的步骤完成后，这里就会亮起来。")
          : null,
        status === "unchosen"
          ? h("p", { className: "tf-detail-wait" }, "这条支线没有被选择。")
          : null
      );
    }

    function PanelContent({ onClose, onHeaderPointerDown }) {
      const [, bump] = react.useReducer((x) => x + 1, 0);
      const [selectedId, setSelectedId] = react.useState(null);
      const [importError, setImportError] = react.useState(null);
      const [pulseSeg, setPulseSeg] = react.useState(null);
      const [previewTo, setPreviewTo] = react.useState(null);   // 分支悬停预览的目标节点
      const [collapseDone, setCollapseDone] = react.useState(false);
      const [menu, setMenu] = react.useState(null);             // 右键菜单 {nodeId, x, y}
      const [mapTip, setMapTip] = react.useState(null);         // 星图节点悬停气泡 {nodeId, x, y}
      const [sentMsg, setSentMsg] = react.useState(null);       // 「已向 DSH 发送指令」提示
      const fileRef = react.useRef(null);
      const pulseTimer = react.useRef(null);
      const menuRef = react.useRef(null);
      const sentTimer = react.useRef(null);
      react.useEffect(() => onStoreChange(bump), []);

      // 右键菜单：点外部 / Esc 关闭
      react.useEffect(() => {
        if (!menu) return;
        const onDown = (e) => {
          if (menuRef.current && menuRef.current.contains(e.target)) return;
          setMenu(null);
        };
        const onKey = (e) => { if (e.key === "Escape") setMenu(null); };
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        return () => {
          document.removeEventListener("mousedown", onDown, true);
          document.removeEventListener("keydown", onKey, true);
        };
      }, [menu ? menu.nodeId + "|" + menu.x + "|" + menu.y : ""]);

      const flow = activeFlow();
      const st = flow ? replay(flow) : null;
      const unchosen = flow ? unchosenSet(flow, st.chosen) : new Set();
      const ordered = flow ? orderedIds(flow) : [];
      const done = st ? st.done.size : 0;
      const total = flow ? flow.nodes.length : 0;
      const activeId = st ? st.active : null;

      // 详情卡默认跟随当前步骤；切流程/推进时同步
      react.useEffect(() => { setSelectedId(activeId); }, [flow ? flow.id : "", activeId || ""]);

      // 打开时（及每步推进后）自动把当前节点滚到视野内
      react.useEffect(() => {
        const id = activeId;
        if (!id) return;
        const t = setTimeout(() => {
          const el = iconEls.get(id);
          if (!el || !el.closest) return;
          const list = el.closest(".tf-map");
          if (!list || !list.scrollTo) return;
          const dr = list.getBoundingClientRect();
          const er = el.getBoundingClientRect();
          list.scrollTo({ top: list.scrollTop + (er.top - dr.top) - 96, behavior: "smooth" });
        }, 620);
        return () => clearTimeout(t);
      }, [flow ? flow.id : "", activeId || ""]);

      function flashSegment(fromId, toId) {
        setPulseSeg({ from: fromId, to: toId });
        clearTimeout(pulseTimer.current);
        pulseTimer.current = setTimeout(() => setPulseSeg(null), 750);
      }

      function handleComplete(nodeId) {
        if (!flow) return;
        const node = nodeById(flow, nodeId);
        if (!node) return;
        const el = iconEls.get(nodeId);
        if (el) { const p = elementCenter(el); burstAt(p[0], p[1], 14); }
        const next = node.next || null;
        completeTask(flow, nodeId);
        if (next) flashSegment(nodeId, next);
        else petalRain(46);
      }

      function handleSkip(nodeId) {
        if (!flow) return;
        const node = nodeById(flow, nodeId);
        if (!node) return;
        const el = iconEls.get(nodeId);
        if (el) { const p = elementCenter(el); burstAt(p[0], p[1], 8, true); }
        const next = node.next || null;
        skipNode(flow, nodeId);
        if (next) flashSegment(nodeId, next);
      }

      function handleChoose(nodeId, to) {
        if (!flow) return;
        const node = nodeById(flow, nodeId);
        if (!node) return;
        const el = iconEls.get(nodeId);
        if (el) { const p = elementCenter(el); burstAt(p[0], p[1], 16); }
        (node.branches || []).forEach((b) => {
          if (b.to === to) return;
          const el2 = iconEls.get(b.to);
          if (el2) { const p2 = elementCenter(el2); burstAt(p2[0], p2[1], 10, true); }
        });
        chooseBranch(flow, nodeId, to);
        const target = nodeById(flow, to);
        if (target && !target.next && target.kind !== "choice") petalRain(46);
        else flashSegment(nodeId, to);
      }

      function handleRollback(nodeId) {
        if (!flow) return;
        rollbackToEvent(flow, nodeId);
        const el = iconEls.get(nodeId);
        if (el) { const p = elementCenter(el); burstAt(p[0], p[1], 10); }
      }

      /** 向 DSH 下达指令：to 存在 = 分支指令（同时选定分支并推进）。 */
      function handleCommand(nodeId, to) {
        if (!flow) return;
        const node = nodeById(flow, nodeId);
        if (!node) return;
        let text;
        if (to) {
          const branch = (node.branches || []).find((b) => b.to === to);
          if (!branch) return;
          text = "【任务星图指令】流程「" + flow.title + "」：分支节点「" + node.title + "」已选择「" + branch.label
            + "」，请按这条路线继续执行" + (node.how ? "（" + node.how + "）" : "")
            + "。完成后告诉我结果，我会在星图里更新进度。";
          chooseBranch(flow, nodeId, to);
          const target = nodeById(flow, to);
          if (target && !target.next && target.kind !== "choice") petalRain(46);
          else flashSegment(nodeId, to);
        } else {
          text = "【任务星图指令】流程「" + flow.title + "」：请继续执行当前步骤「" + node.title + "」"
            + (node.how ? "，如何继续：" + node.how : "")
            + "。完成后告诉我结果，我会在星图里更新进度。";
        }
        const res = sendCommand(text);
        setSentMsg(res.ok ? "已向 DSH 发送指令 ✉️" : ("指令发送失败：" + res.error));
        clearTimeout(sentTimer.current);
        sentTimer.current = setTimeout(() => setSentMsg(null), 3500);
      }

      function handleRestart() {
        if (!flow) return;
        restartFlow(flow);
        setTimeout(() => {
          const first = flow.nodes[0];
          if (!first) return;
          const el = iconEls.get(first.id);
          if (el) { const p = elementCenter(el); burstAt(p[0], p[1], 12); }
        }, 80);
      }

      function handleImportFile(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const obj = JSON.parse(String(reader.result));
            const res = importFlowJson(obj);
            if (!res.ok) setImportError(res.error || "格式不正确");
            else { setImportError(null); setSelectedId(null); }
          } catch (err) {
            setImportError("JSON 解析失败：" + ((err && err.message) || err));
          }
        };
        reader.readAsText(file);
      }

      const useDemo = () => {
        if (!store.flows.some((f) => f.id === "demo")) store.flows.push(makeDemoFlow(Date.now()));
        store.activeFlowId = "demo";
        save();
        setSelectedId(null);
      };

      if (!flow) {
        return h("div", { className: "tf-panel-inner" },
          h("div", { className: "tf-head", onPointerDown: onHeaderPointerDown },
            h("div", { className: "tf-head-title" },
              h("span", { className: "tf-head-icon", dangerouslySetInnerHTML: { __html: ICONS.bloom } }),
              "任务星图"),
            h("div", { className: "tf-head-right" },
              h("button", { type: "button", className: "tf-iconbtn", title: "关闭 (Esc)", onClick: onClose, dangerouslySetInnerHTML: { __html: ICONS.close } }))
          ),
          h("div", { className: "tf-list tf-empty" },
            h("span", { className: "tf-empty-icon", dangerouslySetInnerHTML: { __html: ICONS.bloom } }),
            h("div", { className: "tf-empty-title" }, "还没有任何流程"),
            h("p", { className: "tf-empty-sub" }, "先用示例流程感受一下，或导入一份流程 JSON。"),
            h("div", { className: "tf-empty-actions" },
              h("button", { type: "button", className: "tf-btn-primary", onClick: useDemo }, "使用示例流程"),
              h("button", { type: "button", className: "tf-btn-ghost", onClick: () => fileRef.current && fileRef.current.click() }, "导入 JSON")))
        );
      }

      const statusOf = (id) => st.done.has(id) ? "done"
        : st.skipped.has(id) ? "skipped"
        : id === activeId ? "active"
        : unchosen.has(id) ? "unchosen" : "pending";

      // 左列：迷你星图导航（可折叠已完成、悬停气泡、右键菜单、分支预览高亮）
      const visible = ordered.filter((id) => !(collapseDone && statusOf(id) === "done"));
      const mapItems = [h("button", {
        key: "__toggle",
        type: "button",
        className: "tf-map-toggle",
        onClick: () => setCollapseDone((v) => !v)
      }, (collapseDone ? "▸ " : "▾ ") + "已完成 " + done)];
      visible.forEach((id, i) => {
        const node = nodeById(flow, id);
        if (!node) return;
        const status = statusOf(id);
        mapItems.push(h("button", {
          key: id,
          type: "button",
          className: "tf-map-item " + status
            + (selectedId === id ? " sel" : "")
            + (previewTo === id ? " preview" : ""),
          onClick: () => setSelectedId(id),
          onMouseEnter: (e) => setMapTip({ nodeId: id, x: e.clientX, y: e.clientY }),
          onMouseLeave: () => setMapTip((t) => (t && t.nodeId === id ? null : t)),
          onContextMenu: (e) => {
            e.preventDefault();
            setMenu({ nodeId: id, x: e.clientX, y: e.clientY });
          }
        },
          h("span", {
            className: "tf-map-dot",
            ref: (el) => { iconEls.set(id, el); }
          },
            h("span", {
              className: "tf-map-dot-inner" + (status === "done" ? " bloom" : ""),
              dangerouslySetInnerHTML: { __html: status === "done" ? ICONS.bloom : ICONS.bud }
            }),
            status === "done"
              ? h("span", { className: "tf-map-check", dangerouslySetInnerHTML: { __html: ICONS.check } })
              : null),
          h("span", { className: "tf-map-label" }, node.title)
        ));
        if (i < visible.length - 1) {
          const nextId = visible[i + 1];
          const segCls = "tf-seg"
            + (st.done.has(id) && (st.done.has(nextId) || nextId === activeId) ? " lit" : "")
            + (nextId === activeId && st.done.has(id) ? " pulse" : "")
            + (pulseSeg && pulseSeg.from === id && pulseSeg.to === nextId ? " energize" : "");
          mapItems.push(h("div", { key: "seg-" + id, className: segCls }));
        }
      });

      const mapEl = total === 0
        ? h("div", { className: "tf-empty tf-empty-wide" },
            h("span", { className: "tf-empty-icon", dangerouslySetInnerHTML: { __html: ICONS.bud } }),
            h("div", { className: "tf-empty-title" }, "这张星图还是空的"),
            h("p", { className: "tf-empty-sub" }, "P2 将提供可视化编辑器；现在可以导入一份流程 JSON，或先用示例流程感受一下。"),
            h("div", { className: "tf-empty-actions" },
              h("button", { type: "button", className: "tf-btn-primary", onClick: useDemo }, "使用示例流程"),
              h("button", { type: "button", className: "tf-btn-ghost", onClick: () => fileRef.current && fileRef.current.click() }, "导入 JSON")))
        : h("div", { className: "tf-map" }, mapItems);

      return h("div", { className: "tf-panel-inner" },
        h("div", { className: "tf-head", onPointerDown: onHeaderPointerDown },
          h("div", { className: "tf-head-title" },
            h("span", { className: "tf-head-icon", dangerouslySetInnerHTML: { __html: ICONS.bloom } }),
            "任务星图"),
          h("select", {
            className: "tf-flow-select",
            value: flow.id,
            title: "切换流程",
            onChange: (e) => {
              if (e.target.value === "__new") { newFlow(); setSelectedId(null); }
              else { store.activeFlowId = e.target.value; save(); setSelectedId(null); }
            }
          },
            store.flows.map((f) =>
              h("option", { key: f.id, value: f.id }, f.title)),
            h("option", { value: "__new" }, "＋ 新建流程…")),
          h("div", { className: "tf-progress" },
            h("div", { className: "tf-progress-dots" },
              ordered.map((id) => {
                const node = nodeById(flow, id);
                return h("span", {
                  key: id,
                  className: "tf-progress-dot " + statusOf(id),
                  title: (node ? node.title : id) + "（点击查看）",
                  onClick: () => setSelectedId(id)
                });
              })),
            h("span", { className: "tf-progress-num" }, done + "/" + total)),
          h("button", {
            type: "button", className: "tf-iconbtn tf-close", title: "关闭 (Esc)",
            onClick: onClose,
            dangerouslySetInnerHTML: { __html: ICONS.close }
          })
        ),
        importError ? h("div", { className: "tf-import-error" }, importError) : null,
        sentMsg ? h("div", { className: "tf-sent-banner" }, sentMsg) : null,
        h("div", { className: "tf-body" },
          mapEl,
          total === 0
            ? null
            : h(HeroDetail, {
                flow: flow, st: st, unchosen: unchosen, selectedId: selectedId,
                onComplete: handleComplete, onSkip: handleSkip, onChoose: handleChoose,
                onRollback: handleRollback, onRestart: handleRestart,
                onBranchHover: (to) => setPreviewTo(to),
                onBranchLeave: () => setPreviewTo(null),
                onCommand: handleCommand
              })
        ),
        h("div", { className: "tf-foot" },
          h("div", { className: "tf-foot-actions" },
            h("button", {
              type: "button", className: "tf-btn-ghost tf-foot-btn",
              disabled: !flow.history.length,
              onClick: () => rollbackOne(flow)
            },
              h("span", { className: "tf-btn-icon", dangerouslySetInnerHTML: { __html: ICONS.undo } }),
              "回退一步"),
            h("button", {
              type: "button", className: "tf-btn-ghost tf-foot-btn",
              onClick: () => { if (flow.id === "demo") resetDemoFlow(flow); else restartFlow(flow); }
            },
              h("span", { className: "tf-btn-icon", dangerouslySetInnerHTML: { __html: ICONS.refresh } }),
              flow.id === "demo" ? "重置示例" : "重新开始"),
            h("button", {
              type: "button", className: "tf-btn-ghost tf-foot-btn", title: "导入流程 JSON",
              onClick: () => fileRef.current && fileRef.current.click()
            },
              h("span", { className: "tf-btn-icon", dangerouslySetInnerHTML: { __html: ICONS.upload } }),
              "导入"),
            h("button", {
              type: "button", className: "tf-btn-ghost tf-foot-btn", title: "导出当前流程 JSON",
              onClick: () => exportFlow(flow)
            },
              h("span", { className: "tf-btn-icon", dangerouslySetInnerHTML: { __html: ICONS.download } }),
              "导出"),
            h("button", {
              type: "button", className: "tf-btn-ghost tf-foot-btn",
              title: "把小鲸鱼挂件请回右下角，避免挡住左侧按钮",
              onClick: () => {
                const r = moveWhaleRight();
                setSentMsg(r.ok ? "🐋 鲸鱼已回到右下角（刷新后永久生效）" : ("操作失败：" + r.error));
                clearTimeout(sentTimer.current);
                sentTimer.current = setTimeout(() => setSentMsg(null), 3500);
              }
            }, "🐋 鲸鱼让位")),
          h("span", { className: "tf-foot-hint" }, "Q / Esc 关闭 · 拖动标题栏移动 · 右键节点快捷操作 · ⚡ 可直接向 DSH 下达指令")),
        mapTip && nodeById(flow, mapTip.nodeId)
          ? react_dom.createPortal(
              h("div", {
                className: "tf-map-tip",
                style: {
                  left: Math.min(mapTip.x + 14, (window.innerWidth || 1200) - 260) + "px",
                  top: (mapTip.y + 12) + "px"
                }
              },
                h("div", { className: "tf-map-tip-title" }, nodeById(flow, mapTip.nodeId).title),
                nodeById(flow, mapTip.nodeId).desc
                  ? h("div", { className: "tf-map-tip-desc" }, nodeById(flow, mapTip.nodeId).desc)
                  : null,
                nodeById(flow, mapTip.nodeId).est
                  ? h("div", { className: "tf-map-tip-est" }, "⏱ " + nodeById(flow, mapTip.nodeId).est)
                  : null),
              document.body
            )
          : null,
        menu && nodeById(flow, menu.nodeId)
          ? react_dom.createPortal(
              (() => {
                const mNode = nodeById(flow, menu.nodeId);
                const mStatus = statusOf(mNode.id);
                return h("div", {
                  className: "tf-ctx",
                  ref: menuRef,
                  style: {
                    left: Math.min(menu.x, (window.innerWidth || 1200) - 210) + "px",
                    top: Math.min(menu.y, (window.innerHeight || 800) - 220) + "px"
                  }
                },
                  h("div", { className: "tf-ctx-title" }, mNode.title),
                  mStatus === "active" && mNode.kind === "choice"
                    ? (mNode.branches || []).map((b) =>
                        h("button", {
                          key: b.to, type: "button", className: "tf-ctx-item",
                          onClick: () => { handleChoose(mNode.id, b.to); setMenu(null); }
                        },
                          h("span", { className: "tf-btn-icon", dangerouslySetInnerHTML: { __html: ICONS.arrow } }),
                          "选择：" + b.label))
                    : null,
                  mStatus === "active" && mNode.kind !== "choice"
                    ? h("button", {
                        type: "button", className: "tf-ctx-item",
                        onClick: () => { handleComplete(mNode.id); setMenu(null); }
                      },
                        h("span", { className: "tf-btn-icon", dangerouslySetInnerHTML: { __html: ICONS.check } }),
                        mNode.kind === "milestone" ? "完成里程碑" : "完成此步")
                    : null,
                  mStatus === "active" && mNode.kind !== "choice"
                    ? h("button", {
                        type: "button", className: "tf-ctx-item",
                        onClick: () => { handleSkip(mNode.id); setMenu(null); }
                      }, "跳过")
                    : null,
                  mStatus === "done"
                    ? h("button", {
                        type: "button", className: "tf-ctx-item",
                        onClick: () => { handleRollback(mNode.id); setMenu(null); }
                      },
                        h("span", { className: "tf-btn-icon", dangerouslySetInnerHTML: { __html: ICONS.undo } }),
                        mNode.kind === "choice" ? "重新选择分支" : "回退到此步")
                    : null,
                  mStatus === "active"
                    ? h("button", {
                        type: "button", className: "tf-ctx-item",
                        onClick: () => { handleCommand(mNode.id, null); setMenu(null); }
                      }, "⚡ 下达指令给 DSH")
                    : null,
                  h("div", { className: "tf-ctx-sep" }),
                  h("button", {
                    type: "button", className: "tf-ctx-item",
                    onClick: () => { setSelectedId(mNode.id); setMenu(null); }
                  }, "查看详情"));
              })(),
              document.body
            )
          : null,
        h("input", {
          ref: fileRef, type: "file", accept: "application/json,.json",
          style: { display: "none" }, onChange: handleImportFile
        })
      );
    }

    /** 拖拽边界：面板至少保留 60px 在视口内，拖不丢。 */
    function clampPanel(x, y, w, h, vw, vh) {
      return {
        x: Math.round(Math.max(60 - w, Math.min(x, vw - 60))),
        y: Math.round(Math.max(60 - h, Math.min(y, vh - 60)))
      };
    }

    function Panel({ onClose }) {
      const panelRef = react.useRef(null);
      const dragRef = react.useRef(null);
      const [pos, setPos] = react.useState(null); // null = 居中；{x,y} = 拖动后的左上角坐标
      const [dragging, setDragging] = react.useState(false);

      react.useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
      }, []);

      react.useEffect(() => {
        if (!dragging) return;
        const move = (e) => {
          const d = dragRef.current;
          const panel = panelRef.current;
          if (!d || !panel) return;
          setPos(clampPanel(
            d.startX + (e.clientX - d.pointerX),
            d.startY + (e.clientY - d.pointerY),
            panel.offsetWidth, panel.offsetHeight,
            window.innerWidth, window.innerHeight
          ));
        };
        const up = () => setDragging(false);
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        return () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
        };
      }, [dragging]);

      // 拖到自定义位置后，窗口缩放时重新夹紧到视口内
      react.useEffect(() => {
        if (!pos) return;
        const onResize = () => {
          const panel = panelRef.current;
          if (!panel) return;
          setPos(clampPanel(pos.x, pos.y, panel.offsetWidth, panel.offsetHeight, window.innerWidth, window.innerHeight));
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
      }, [pos ? pos.x + "|" + pos.y : ""]);

      /** 标题栏按下开始拖动（按钮除外，保证导入/导出/关闭可点）。 */
      const startDrag = (e) => {
        if (e.target && e.target.closest && e.target.closest("button")) return;
        const panel = panelRef.current;
        if (!panel) return;
        const r = panel.getBoundingClientRect();
        dragRef.current = { startX: r.left, startY: r.top, pointerX: e.clientX, pointerY: e.clientY };
        setDragging(true);
        if (e.cancelable) e.preventDefault();
      };

      const panelStyle = pos
        ? { left: pos.x + "px", top: pos.y + "px", transform: "none", animation: "none" }
        : null;

      return react_dom.createPortal(
        h("div", {
          className: "tf-overlay",
          onClick: (e) => { if (e.target === e.currentTarget) onClose(); }
        },
          h("div", {
            ref: panelRef,
            className: "tf-panel" + (dragging ? " dragging" : ""),
            style: panelStyle,
            onClick: (e) => e.stopPropagation()
          },
            h(PanelContent, { onClose: onClose, onHeaderPointerDown: startDrag })
          )
        ),
        document.body
      );
    }

    /* ================= 聊天输入栏工具行按钮（原侧边栏位置被聊天页覆盖，迁移至此） ================= */

    function SidebarButton({ wide, variant }) {
      const [, bump] = react.useReducer((x) => x + 1, 0);
      const [open, setOpen] = react.useState(false);
      const [tip, setTip] = react.useState(null); // {x, y, text} | null —— 气泡渲染到 body 顶层，避免被裁剪
      const btnRef = react.useRef(null);
      react.useEffect(() => onStoreChange(bump), []);
      react.useEffect(() => {
        const onKey = (e) => {
          if (e.key !== "q" && e.key !== "Q") return;
          const t = e.target;
          if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          setOpen((v) => !v);
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
      }, []);

      const flow = activeFlow();
      const st = flow ? replay(flow) : null;
      const total = flow ? flow.nodes.length : 0;
      const done = st ? st.done.size : 0;
      const activeNode = flow && st && st.active ? nodeById(flow, st.active) : null;
      const tipText = flow
        ? (activeNode
            ? ("当前：第 " + (done + 1) + " 步 · " + activeNode.title
                + (activeNode.kind === "choice" ? "（" + (activeNode.branches || []).length + " 个分支）" : ""))
            : (st && st.done.size > 0 ? "🎉 已全部完成" : "开始第一步"))
        : "还没有任务流程";

      const showTip = () => {
        const el = btnRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (!r || r.width === 0) return;
        setTip({
          title: "任务星图",
          sub: tipText,
          x: Math.min(Math.max(r.left + r.width / 2, 130), (window.innerWidth || 1200) - 130),
          y: Math.max(r.top - 10, 46)
        });
      };
      const hideTip = () => setTip(null);

      return h("div", { className: "tf-button-wrap" + (variant === "composer" ? " tf-button-wrap-composer" : "") },
        h("button", {
          ref: btnRef,
          type: "button",
          className: "tf-button" + (variant === "composer" ? " tf-button-composer" : ""),
          title: "任务星图 — 任务进行到哪一步、如何继续、有哪些分支",
          "aria-label": "任务星图",
          onClick: () => setOpen((v) => !v),
          onMouseEnter: showTip,
          onMouseLeave: hideTip,
          onFocus: showTip,
          onBlur: hideTip
        },
          h("span", { className: "tf-button-icon", dangerouslySetInnerHTML: { __html: ICONS.bloom } }),
          wide ? h("span", { className: "tf-button-label" }, "任务星图") : null,
          flow ? h("span", { className: "tf-button-badge" },
            h(ProgressRing, { fraction: total ? done / total : 0, size: 20 })) : null
        ),
        tip
          ? react_dom.createPortal(
              h("div", {
                className: "dsh-plugin-tip",
                role: "status",
                style: { left: tip.x + "px", top: tip.y + "px" }
              },
                h("div", { className: "dsh-plugin-tip-title" }, tip.title),
                h("div", { className: "dsh-plugin-tip-sub" }, tip.sub)),
              document.body
            )
          : null,
        open ? h(Panel, { onClose: () => setOpen(false) }) : null
      );
    }

    /* ================= 样式 ================= */

    const CSS = `
.tf-button-wrap { position: relative; }
.tf-button {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  background: none;
  color: var(--dsw-alias-label-secondary, #6b7280);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.4;
}
.tf-button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
  color: var(--dsw-alias-label-primary, #1f2937);
}
.tf-button-icon { display: inline-flex; flex: none; color: #ec6da5; }
.tf-button-label { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tf-button-badge { flex: none; display: inline-flex; }
.tf-ring { transform: rotate(-90deg); display: block; }
.tf-ring-bg { stroke: var(--dsw-alias-border-l3, rgba(127,127,127,0.25)); }
.tf-ring-fg {
  stroke: var(--dsw-static-deepseek-500, #4A8FBE);
  transition: stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  filter: drop-shadow(0 0 3px rgba(74, 143, 190, 0.6));
}
.tf-tip {
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%) translateX(6px);
  width: 200px;
  padding: 8px 11px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2937);
  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease;
  z-index: 9998;
}
.tf-button:hover .tf-tip, .tf-button:focus-visible .tf-tip {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}

/* ============ 面板 ============ */
.tf-overlay {
  position: fixed;
  inset: 0;
  z-index: 9997;
  background: rgba(36, 12, 28, 0.30);
  backdrop-filter: blur(2px);
  animation: tf-fade-in 0.25s ease-out;
}
.tf-panel {
  /* 与当前 DSH 主题同源：表面/文字/描边走主题 token，主调为雪霁蓝，樱花粉只留给花与庆祝 */
  --tf-accent: var(--dsw-static-deepseek-500, #4A8FBE);
  --tf-accent-soft: var(--dsw-static-deepseek-400, #77AED6);
  --tf-accent-deep: var(--dsw-static-deepseek-600, #3B7BAA);
  --tf-bg: linear-gradient(165deg, var(--dsw-alias-bg-layer-3, #E9F5FC), var(--dsw-alias-bg-layer-1, #D9EDF8));
  --tf-card: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.72));
  --tf-card-active: var(--dsw-alias-bg-overlay, rgba(255, 255, 255, 0.97));
  --tf-ink: var(--dsw-alias-label-primary, #1f2937);
  --tf-ink-2: var(--dsw-alias-label-secondary, #6b7280);
  --tf-line: var(--dsw-alias-border-l2, rgba(43, 90, 130, 0.16));
  --tf-petal: #f7b3cd;
  --tf-petal-deep: #d94f8e;
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(980px, calc(100vw - 40px));
  height: min(740px, calc(100vh - 96px));
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  background: var(--tf-bg);
  color: var(--dsw-alias-label-primary, #1f2937);
  border: 1px solid var(--dsw-alias-border-l2, rgba(43, 90, 130, 0.16));
  border-radius: 18px;
  box-shadow: 0 24px 80px rgba(23, 49, 79, 0.35);
  overflow: hidden;
  transform-origin: 0% 100%;
  animation: tf-panel-in 0.42s cubic-bezier(0.22, 1.2, 0.36, 1);
  font-size: 14px;
}
body[data-ds-dark-theme] .tf-panel {
  --tf-petal: #f3a7c6;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}
.tf-panel-inner { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* ============ 头部 ============ */
.tf-head { display: flex; align-items: center; gap: 14px; padding: 14px 18px 8px; cursor: grab; touch-action: none; }
.tf-head:active { cursor: grabbing; }
.tf-panel.dragging { user-select: none; }
.tf-panel.dragging .tf-head { cursor: grabbing; }
.tf-head-title { display: inline-flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 800; white-space: nowrap; }
.tf-head-icon { display: inline-flex; color: var(--tf-petal-deep); }
.tf-progress { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 60px; }
.tf-progress-track { flex: 1; height: 8px; border-radius: 99px; background: var(--tf-line); overflow: hidden; }
.tf-progress-fill {
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, var(--dsw-static-deepseek-400, #77AED6), var(--dsw-static-deepseek-500, #4A8FBE));
  box-shadow: 0 0 10px rgba(74, 143, 190, 0.55);
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.tf-progress-num { font-size: 12.5px; color: var(--tf-ink-2); font-weight: 700; white-space: nowrap; }
.tf-head-right { display: inline-flex; align-items: center; gap: 4px; }
.tf-iconbtn {
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: none;
  color: var(--tf-ink-2);
  border-radius: 7px; cursor: pointer;
}
.tf-iconbtn:hover { background: rgba(74, 143, 190, 0.14); color: var(--tf-accent-deep); }
.tf-import-error {
  margin: 0 18px 4px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
}

/* ============ 流程 chips ============ */
.tf-chips { display: flex; gap: 6px; padding: 2px 18px 10px; align-items: center; flex-wrap: wrap; }
.tf-chip {
  border: 1px solid var(--tf-line);
  background: var(--tf-card);
  border-radius: 99px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  color: var(--tf-ink);
  font-family: inherit;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.tf-chip:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(74, 143, 190, 0.20); }
.tf-chip.active {
  background: linear-gradient(135deg, var(--dsw-static-deepseek-450, #6BA6D2), var(--dsw-static-deepseek-500, #4A8FBE));
  color: #fff;
  border-color: transparent;
  font-weight: 700;
  box-shadow: 0 3px 10px rgba(74, 143, 190, 0.35);
}
.tf-chip-add { border-style: dashed; display: inline-flex; align-items: center; gap: 4px; }
.tf-chip-plus { display: inline-flex; }

/* ============ 主体 ============ */
.tf-body { flex: 1; min-height: 0; display: flex; }
.tf-list { flex: 1.3; min-width: 0; overflow-y: auto; padding: 12px 16px 16px 20px; }
.tf-detail {
  flex: 1;
  min-width: 300px;
  max-width: 360px;
  border-left: 1px solid var(--tf-line);
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
@media (max-width: 720px) {
  .tf-body { flex-direction: column; }
  .tf-detail { max-width: none; min-width: 0; border-left: none; border-top: 1px solid var(--tf-line); max-height: 42%; }
}

/* ============ 星链行 ============ */
.tf-row { display: flex; gap: 12px; animation: tf-row-in 0.5s cubic-bezier(0.22, 1.2, 0.36, 1) both; }
.tf-rail-col { flex: none; width: 42px; display: flex; justify-content: center; padding-top: 10px; }
.tf-node-icon {
  position: relative;
  width: 40px; height: 40px;
  border-radius: 50%;
  background: var(--tf-card);
  border: 2px solid var(--dsw-alias-border-l3, rgba(43, 90, 130, 0.28));
  display: grid;
  place-items: center;
  z-index: 1;
  transition: background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease, transform 0.2s ease;
}
.tf-node-svg { display: inline-flex; }
.tf-node-svg svg { width: 23px; height: 23px; }
.tf-node-icon:hover { transform: scale(1.06); }
.tf-node-icon.active {
  background: linear-gradient(135deg, var(--dsw-static-deepseek-100, #E0EEF6), var(--dsw-static-deepseek-200, #D0E7F5));
  border-color: rgba(74, 143, 190, 0.85);
  box-shadow: 0 0 0 5px rgba(74, 143, 190, 0.18), 0 0 26px rgba(74, 143, 190, 0.7);
}
.tf-node-icon.active::before, .tf-node-icon.active::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid rgba(74, 143, 190, 0.8);
  animation: tf-ripple 2.4s cubic-bezier(0.2, 0.6, 0.4, 1) infinite;
  pointer-events: none;
}
.tf-node-icon.active::after { animation-delay: 1.2s; }
.tf-node-icon.done {
  background: linear-gradient(135deg, #ffe3ef, #fbc9dd);
  border-color: rgba(217, 79, 142, 0.5);
  box-shadow: 0 0 14px rgba(236, 109, 165, 0.5);
}
.tf-node-icon.unchosen { opacity: 0.45; filter: grayscale(0.45); }
.tf-node-icon.skipped { opacity: 0.5; filter: grayscale(0.6); }
.tf-node-svg { display: inline-flex; }
.tf-node-svg.bloom { animation: tf-bloom-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1); }
.tf-node-check {
  position: absolute;
  right: -5px; bottom: -5px;
  width: 19px; height: 19px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ec6da5, #d94f8e);
  color: #fff;
  display: grid;
  place-items: center;
  box-shadow: 0 2px 7px rgba(217, 79, 142, 0.55);
  animation: tf-check-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tf-node-check svg { width: 12px; height: 12px; }
.tf-node-lock {
  position: absolute;
  right: -5px; bottom: -5px;
  width: 19px; height: 19px;
  border-radius: 50%;
  background: #9aa0ae;
  color: #fff;
  display: grid;
  place-items: center;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.25);
}
.tf-node-lock svg { width: 10px; height: 10px; }
.tf-seg {
  position: relative;
  width: 3px; height: 28px;
  margin-left: 19px;
  border-radius: 2px;
  background: var(--tf-line);
  transition: background 0.4s ease, box-shadow 0.4s ease;
}
.tf-seg.lit {
  background: linear-gradient(180deg, var(--dsw-static-deepseek-200, #D0E7F5), var(--dsw-static-deepseek-500, #4A8FBE));
  box-shadow: 0 0 6px rgba(74, 143, 190, 0.5);
}
.tf-seg.pulse::after {
  content: "";
  position: absolute;
  left: -3.5px; top: -2px;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 10px var(--dsw-static-deepseek-400, #77AED6);
  animation: tf-dot 1.8s ease-in-out infinite;
}
.tf-seg.energize::before {
  content: "";
  position: absolute;
  left: -3px; right: -3px; top: 0; bottom: 0;
  transform: translateY(-105%);
  border-radius: 2px;
  background: linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.95), rgba(255,255,255,0));
  animation: tf-sweep 0.6s cubic-bezier(0.35, 0.7, 0.4, 1) forwards;
}

/* ============ 步骤卡片 ============ */
.tf-card {
  flex: 1;
  min-width: 0;
  background: var(--tf-card);
  border: 1px solid var(--tf-line);
  border-radius: 14px;
  padding: 15px 18px;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, opacity 0.4s ease;
}
.tf-card:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(74, 143, 190, 0.2); }
.tf-card.active {
  background: var(--tf-card-active);
  border-color: rgba(74, 143, 190, 0.65);
  box-shadow: 0 0 0 2px rgba(74, 143, 190, 0.28), 0 12px 32px rgba(74, 143, 190, 0.3);
}
.tf-row.unchosen .tf-card { opacity: 0.5; }
.tf-row.skipped .tf-card { opacity: 0.55; }
.tf-title-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tf-kind-chip {
  flex: none;
  font-size: 11px;
  line-height: 1;
  padding: 4px 9px;
  border-radius: 99px;
  font-weight: 700;
}
.kind-task { background: rgba(74, 143, 190, 0.15); color: #2E6189; }
.kind-choice { background: rgba(217, 79, 142, 0.13); color: #C24874; }
.kind-milestone { background: rgba(240, 185, 92, 0.18); color: #b07d24; }
.kind-gate { background: rgba(124, 201, 166, 0.16); color: #3f9d74; }
body[data-ds-dark-theme] .kind-task { color: #9cc8e8; }
body[data-ds-dark-theme] .kind-choice { color: #f39cc4; }
body[data-ds-dark-theme] .kind-milestone { color: #ecc07a; }
.tf-node-emoji { display: inline-flex; color: var(--tf-accent); flex: none; }
.tf-node-emoji svg { width: 15px; height: 15px; }
.tf-title { font-size: 16px; font-weight: 700; }
.tf-row.skipped .tf-title { text-decoration: line-through; }
.tf-here {
  flex: none;
  background: linear-gradient(135deg, var(--dsw-static-deepseek-450, #6BA6D2), var(--dsw-static-deepseek-500, #4A8FBE));
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 99px;
  animation: tf-here-pulse 2s ease-in-out infinite;
}
.tf-badge-unchosen, .tf-badge-skip {
  flex: none;
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 99px;
  background: rgba(127, 127, 127, 0.14);
  color: var(--tf-ink-2);
}
.tf-meta-line { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.tf-meta { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; color: var(--tf-ink-2); }
.tf-meta-icon { display: inline-flex; }
.tf-tag {
  font-size: 11.5px;
  padding: 2px 9px;
  border-radius: 99px;
  background: var(--tf-line);
  color: var(--tf-ink-2);
}
.tf-picked { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; color: var(--tf-accent-deep); }
body[data-ds-dark-theme] .tf-picked { color: #9cc8e8; }
.tf-row-actions { display: flex; gap: 8px; margin-top: 12px; }
.tf-row-actions .tf-btn-primary { padding: 10px 18px; font-size: 14px; }
.tf-row-actions .tf-btn-ghost { padding: 10px 14px; font-size: 13.5px; }

/* ============ 分支卡牌 ============ */
.tf-branch-list { display: flex; flex-direction: column; gap: 9px; margin-top: 12px; }
.tf-branch {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  border: 1px solid var(--tf-line);
  background: var(--tf-card);
  border-radius: 13px;
  padding: 12px 15px;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
  animation: tf-branch-in 0.5s cubic-bezier(0.22, 1.2, 0.36, 1) both;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.tf-branch:hover {
  transform: translateY(-2px) scale(1.015);
  border-color: rgba(74, 143, 190, 0.6);
  box-shadow: 0 8px 22px rgba(74, 143, 190, 0.28);
}
.tf-branch-label { font-weight: 700; font-size: 15px; white-space: nowrap; }
.tf-branch-hint { flex: 1; font-size: 12.5px; color: var(--tf-ink-2); }
.tf-branch-diff { flex: none; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 99px; }
.tf-diff-low { background: rgba(124, 201, 166, 0.16); color: #3f9d74; }
.tf-diff-mid { background: rgba(232, 180, 90, 0.18); color: #b07d24; }
.tf-diff-high { background: rgba(220, 80, 120, 0.14); color: #c24874; }
.tf-branch-arrow { display: inline-flex; color: var(--tf-accent); flex: none; }

/* ============ 详情卡 ============ */
.tf-detail-top { display: flex; }
.tf-detail-title { font-size: 18px; font-weight: 800; line-height: 1.35; }
.tf-detail-desc { margin: 0; font-size: 13px; line-height: 1.7; color: var(--tf-ink-2); }
.tf-detail-how {
  background: linear-gradient(135deg, rgba(74, 143, 190, 0.12), rgba(119, 174, 214, 0.08));
  border: 1px dashed rgba(74, 143, 190, 0.35);
  border-radius: 12px;
  padding: 12px 14px;
}
.tf-how-head { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--tf-accent-deep); }
.tf-how-head .tf-meta-icon { color: var(--tf-accent); }
.tf-how-text { margin: 6px 0 0; font-size: 13px; line-height: 1.65; }
.tf-detail-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tf-detail-branches { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.tf-detail-actions { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.tf-detail-wait { margin: 0; font-size: 12px; color: var(--tf-ink-2); }

/* ============ 按钮 ============ */
.tf-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, var(--dsw-static-deepseek-450, #6BA6D2), var(--dsw-static-deepseek-500, #4A8FBE));
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 9px 16px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 4px 14px rgba(74, 143, 190, 0.4);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.tf-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 7px 20px rgba(74, 143, 190, 0.5); }
.tf-btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--tf-line);
  color: var(--tf-ink-2);
  border-radius: 10px;
  padding: 9px 13px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.tf-btn-ghost:hover { border-color: rgba(74, 143, 190, 0.5); color: var(--tf-accent-deep); }
.tf-btn-ghost:disabled { opacity: 0.45; cursor: default; }
.tf-btn-icon { display: inline-flex; }

/* ============ 完成庆祝 ============ */
.tf-complete { align-items: center; text-align: center; padding-top: 34px; }
.tf-trophy {
  width: 64px; height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffe9c9, #f0b95c);
  display: inline-grid;
  place-items: center;
  color: #9a6b1f;
  box-shadow: 0 0 0 10px rgba(240, 185, 92, 0.15), 0 10px 30px rgba(240, 185, 92, 0.4);
  animation: tf-bloom-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tf-trophy svg { width: 30px; height: 30px; }
.tf-complete-title { font-size: 17px; font-weight: 800; margin-top: 14px; }
.tf-complete-sub { margin: 4px 0 0; font-size: 12.5px; color: var(--tf-ink-2); }
.tf-complete-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; justify-content: center; }

/* ============ 空状态 ============ */
.tf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  height: 100%;
  min-height: 240px;
  padding: 30px;
}
.tf-empty-icon { display: inline-flex; color: #ec6da5; opacity: 0.9; }
.tf-empty-icon svg { width: 40px; height: 40px; }
.tf-empty-title { font-size: 15px; font-weight: 800; }
.tf-empty-sub { margin: 0; max-width: 340px; font-size: 12.5px; line-height: 1.7; color: var(--tf-ink-2); }
.tf-empty-actions { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; justify-content: center; }

/* ============ 页脚 ============ */
.tf-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 18px;
  border-top: 1px solid var(--tf-line);
  font-size: 11.5px;
  color: var(--tf-ink-2);
}
.tf-foot-hint { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tf-foot-actions { display: flex; gap: 8px; flex: none; }
.tf-foot-btn { padding: 5px 10px; font-size: 11.5px; }

/* ============ 粒子 ============ */
.tf-particles { position: fixed; inset: 0; pointer-events: none; z-index: 9998; }
.tf-particle {
  position: absolute;
  width: 13px; height: 16px;
  background: url("${PETAL_URI}") no-repeat center / 100% 100%;
  filter: drop-shadow(0 0 5px rgba(247, 179, 205, 0.8));
  animation: tf-petal-fly 0.8s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
  will-change: transform, opacity;
}
.tf-particle.gray { filter: grayscale(0.7) brightness(0.8); }
.tf-particle.rain { animation-name: tf-petal-rain; animation-timing-function: linear; }

/* ============ keyframes ============ */
@keyframes tf-fade-in { from { opacity: 0; } }
@keyframes tf-panel-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.92) translateY(16px); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes tf-row-in {
  from { opacity: 0; transform: translateY(14px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes tf-ripple {
  from { transform: scale(0.6); opacity: 0.9; }
  to { transform: scale(2.1); opacity: 0; }
}
@keyframes tf-bloom-pop {
  0% { transform: scale(0.3) rotate(-30deg); opacity: 0; }
  60% { transform: scale(1.15) rotate(6deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
@keyframes tf-check-in {
  0% { transform: scale(2.2); opacity: 0; }
  60% { transform: scale(0.92); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes tf-branch-in {
  from { opacity: 0; transform: translateY(12px) scale(0.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes tf-dot {
  0% { top: -2px; opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  100% { top: calc(100% - 6px); opacity: 0; }
}
@keyframes tf-sweep { to { transform: translateY(105%); } }
@keyframes tf-here-pulse { 50% { box-shadow: 0 0 0 5px rgba(74, 143, 190, 0.18); } }
@keyframes tf-petal-fly {
  0% { transform: translate(-50%, -50%) rotate(0deg) scale(0.5); opacity: 1; }
  100% {
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy)))
               rotate(var(--rot)) scale(var(--sc));
    opacity: 0;
  }
}
@keyframes tf-petal-rain {
  0% { transform: translateY(-40px) translateX(0) rotate(0deg); opacity: 0; }
  8% { opacity: 0.95; }
  100% {
    transform: translateY(var(--fall, 110vh)) translateX(var(--sway, 0px)) rotate(var(--rot, 540deg));
    opacity: 0.9;
  }
}

/* ============ 动效降级 ============ */
@media (prefers-reduced-motion: reduce) {
  .tf-panel, .tf-row, .tf-branch, .tf-overlay, .tf-node-check, .tf-node-svg.bloom, .tf-trophy {
    animation: none !important;
  }
  .tf-node-icon.active::before, .tf-node-icon.active::after,
  .tf-seg.pulse::after, .tf-here, .tf-particle { animation: none !important; }
  .tf-panel, .tf-card, .tf-branch, .tf-chip { transition: none !important; }
}

/* ============ 精简重设计（2026）：留白 + 细线 + 单一强调色 ============ */
.tf-head { gap: 12px; padding: 16px 20px 12px; }
.tf-head-title { font-size: 17px; }
.tf-flow-select {
  appearance: none;
  border: 1px solid var(--tf-line);
  background-color: var(--tf-card);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239b7f94' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 14px;
  color: var(--tf-ink);
  border-radius: 99px;
  padding: 6px 30px 6px 14px;
  font-size: 12.5px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  max-width: 240px;
}
.tf-flow-select:focus { outline: none; border-color: rgba(74, 143, 190, 0.6); }
.tf-flow-select option { color: var(--dsw-alias-label-primary, #1f2937); background: var(--dsw-alias-bg-layer-2, #ffffff); }
.tf-progress { gap: 10px; flex: 1; }
.tf-progress-track { height: 4px; }
.tf-progress-fill { box-shadow: 0 0 8px rgba(74, 143, 190, 0.45); }
.tf-progress-num { font-size: 12px; font-variant-numeric: tabular-nums; }
.tf-close { width: 30px; height: 30px; }
.tf-import-error { margin: 0 20px 4px; }

/* 星链：更多留白 */
.tf-list { padding: 18px 20px 20px; }
.tf-row { gap: 14px; }
.tf-rail-col { width: 44px; padding-top: 12px; }
.tf-seg { margin-left: 21px; height: 30px; }
.tf-seg.energize::before { left: -4px; right: -4px; }

/* 卡片：去噪，用左侧光条标识当前 */
.tf-card { padding: 14px 18px 14px 20px; border-radius: 16px; position: relative; overflow: hidden; }
.tf-card.active::before {
  content: "";
  position: absolute;
  left: 0; top: 12px; bottom: 12px;
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: linear-gradient(180deg, var(--dsw-static-deepseek-400, #77AED6), var(--dsw-static-deepseek-500, #4A8FBE));
}
.tf-title-line { gap: 8px; }
.tf-title { font-size: 16px; letter-spacing: 0.01em; }
.kind-task { display: none; }
.kind-choice, .kind-milestone { font-size: 10.5px; padding: 3px 8px; }
.tf-meta-line {
  margin-top: 5px;
  font-size: 12.5px;
  color: var(--tf-ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tf-here { font-size: 10.5px; padding: 2px 9px; }
.tf-badge-unchosen, .tf-badge-skip {
  font-size: 10.5px;
  padding: 1px 8px;
  background: none;
  border: 1px solid var(--tf-line);
}
.tf-picked { margin-top: 7px; font-size: 12px; }
.tf-row-actions { justify-content: flex-end; margin-top: 14px; }

/* 分支卡：更轻 */
.tf-branch { border-radius: 14px; padding: 13px 16px; }
.tf-branch-label { font-size: 15px; }
.tf-branch-hint { font-size: 12.5px; opacity: 0.9; }
.tf-branch-diff { background: none; padding: 0; font-size: 10.5px; }
.tf-branch-arrow { opacity: 0.55; }

/* 详情列：呼吸感 */
.tf-detail { max-width: 340px; padding: 22px 20px; gap: 12px; }
.tf-detail-title { font-size: 19px; }
.tf-detail-desc { font-size: 13px; }
.tf-detail-how { border-radius: 14px; padding: 14px 16px; }
.tf-detail-meta .tf-meta, .tf-detail-meta .tf-tag { font-size: 12.5px; }
.tf-detail-meta .tf-tag { background: none; padding: 0; }
.tf-detail-actions { flex-direction: column; align-items: stretch; }
.tf-detail-actions .tf-btn-primary, .tf-detail-actions .tf-btn-ghost { justify-content: center; }
.tf-detail-wait {
  margin: 0;
  background: var(--tf-card);
  border: 1px dashed var(--tf-line);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12.5px;
}

/* 页脚 */
.tf-foot { padding: 12px 20px; }
.tf-foot-actions { gap: 6px; }
.tf-foot-btn { border-radius: 8px; }

/* ============ 高级感 v2：玻璃拟态 · 发丝描边 · 深海军蓝 · 慢动画 ============ */
.tf-overlay { background: rgba(13, 22, 34, 0.42); backdrop-filter: blur(7px); }
.tf-panel {
  border-radius: 20px;
  border: 1px solid rgba(148, 178, 208, 0.30);
  background: linear-gradient(160deg, rgba(250, 252, 255, 0.82), rgba(238, 246, 253, 0.68));
  backdrop-filter: blur(28px) saturate(1.25);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.7) inset,
    0 24px 70px rgba(23, 49, 79, 0.22),
    0 4px 18px rgba(23, 49, 79, 0.10);
  animation: tf-panel-in 0.55s cubic-bezier(0.16, 1, 0.3, 1);
}
body[data-ds-dark-theme] .tf-panel {
  border-color: rgba(255, 255, 255, 0.10);
  background: linear-gradient(160deg, rgba(26, 40, 57, 0.85), rgba(15, 24, 36, 0.78));
  backdrop-filter: blur(28px) saturate(1.1);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.08) inset,
    0 24px 70px rgba(0, 0, 0, 0.55);
}
.tf-panel-inner { background: none; }

/* 头部：渐变发丝线 + 渐变标题字 */
.tf-head { gap: 14px; padding: 18px 22px 14px; border-bottom: none; position: relative; }
.tf-head::after {
  content: "";
  position: absolute;
  left: 22px; right: 22px; bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(120, 150, 185, 0.38), transparent);
}
.tf-head-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.05em;
  background: linear-gradient(120deg, #2c5a80, #4a8fbe);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
body[data-ds-dark-theme] .tf-head-title {
  background: linear-gradient(120deg, #cfe3f2, #77aed6);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.tf-flow-select {
  border-color: rgba(148, 178, 208, 0.30);
  background-color: rgba(255, 255, 255, 0.55);
  font-weight: 500;
  letter-spacing: 0.02em;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.tf-flow-select:hover { border-color: rgba(74, 143, 190, 0.5); }
body[data-ds-dark-theme] .tf-flow-select { background-color: rgba(255, 255, 255, 0.06); }

/* 进度：细线 + 发光端点 */
.tf-progress { gap: 12px; }
.tf-progress-track { height: 3px; background: rgba(120, 150, 185, 0.20); overflow: visible; }
.tf-progress-fill {
  position: relative;
  background: linear-gradient(90deg, #77aed6, #4a8fbe);
  box-shadow: 0 0 8px rgba(74, 143, 190, 0.5);
}
.tf-progress-fill::after {
  content: "";
  position: absolute;
  right: -3px; top: 50%;
  transform: translateY(-50%);
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 10px rgba(74, 143, 190, 0.95);
}
.tf-progress-num { font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em; }
.tf-close { color: var(--tf-ink-2); opacity: 0.75; }
.tf-close:hover { opacity: 1; }

/* 星链：行距舒展、入场更柔 */
.tf-list { padding: 20px 22px 22px; }
.tf-row { gap: 16px; animation-duration: 0.6s; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
.tf-rail-col { width: 46px; padding-top: 14px; }

/* 节点：玻璃圆 + 内高光 */
.tf-node-icon {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.92), rgba(233, 243, 251, 0.85));
  border: 1px solid rgba(148, 178, 208, 0.34);
  box-shadow: 0 2px 8px rgba(23, 49, 79, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.95);
}
body[data-ds-dark-theme] .tf-node-icon {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.04));
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.tf-node-icon.active {
  background: linear-gradient(160deg, #f0f7fc, #dcecf8);
  border-color: rgba(74, 143, 190, 0.75);
  box-shadow: 0 0 0 5px rgba(74, 143, 190, 0.13), 0 0 24px rgba(74, 143, 190, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.95);
}
body[data-ds-dark-theme] .tf-node-icon.active {
  background: linear-gradient(160deg, rgba(74, 143, 190, 0.28), rgba(74, 143, 190, 0.12));
  box-shadow: 0 0 0 5px rgba(119, 174, 214, 0.14), 0 0 24px rgba(119, 174, 214, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.tf-node-icon.active::before, .tf-node-icon.active::after {
  inset: -5px;
  border: 1.5px solid rgba(74, 143, 190, 0.5);
}
.tf-node-icon.done {
  border-color: rgba(217, 79, 142, 0.35);
  box-shadow: 0 0 14px rgba(236, 109, 165, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

/* 轨道：发丝线 + 渐变亮段 */
.tf-seg { width: 2px; margin-left: 21px; height: 32px; background: rgba(148, 178, 208, 0.24); }
.tf-seg.lit { background: linear-gradient(180deg, #a8cbe6, #4a8fbe); box-shadow: 0 0 6px rgba(74, 143, 190, 0.35); }

/* 卡片：白玻璃 + 悬停轻浮 */
.tf-card {
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.40));
  border: 1px solid rgba(148, 178, 208, 0.22);
  border-radius: 18px;
  padding: 16px 20px 16px 24px;
  box-shadow: 0 1px 2px rgba(23, 49, 79, 0.05);
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease, border-color 0.22s ease, opacity 0.4s ease;
}
body[data-ds-dark-theme] .tf-card {
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.025));
  border-color: rgba(255, 255, 255, 0.08);
}
.tf-card:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(23, 49, 79, 0.12); }
.tf-card.active {
  background: linear-gradient(165deg, rgba(234, 245, 252, 0.92), rgba(222, 238, 249, 0.82));
  border-color: rgba(74, 143, 190, 0.42);
  box-shadow: 0 0 0 1px rgba(74, 143, 190, 0.14), 0 12px 34px rgba(74, 143, 190, 0.20);
}
body[data-ds-dark-theme] .tf-card.active {
  background: linear-gradient(165deg, rgba(74, 143, 190, 0.16), rgba(74, 143, 190, 0.07));
}
.tf-card.active::before {
  width: 3px;
  top: 14px; bottom: 14px;
  border-radius: 0 2px 2px 0;
  background: linear-gradient(180deg, #77aed6, #2e6189);
  box-shadow: 0 0 12px rgba(74, 143, 190, 0.7);
}

/* 排版：克制的字重与字距 */
.tf-title { font-size: 15.5px; font-weight: 600; letter-spacing: 0.015em; }
.tf-meta-line { font-size: 12px; letter-spacing: 0.02em; opacity: 0.85; }
.tf-here { font-size: 10px; letter-spacing: 0.08em; padding: 2px 10px; box-shadow: 0 2px 8px rgba(74, 143, 190, 0.4); }
.tf-kind-choice, .tf-kind-milestone { letter-spacing: 0.05em; }
.tf-picked { font-weight: 600; }

/* 分支卡：玻璃 + 轻浮 */
.tf-branch {
  border-radius: 15px;
  border: 1px solid rgba(148, 178, 208, 0.22);
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.32));
  padding: 14px 17px;
}
body[data-ds-dark-theme] .tf-branch {
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  border-color: rgba(255, 255, 255, 0.08);
}
.tf-branch:hover { border-color: rgba(74, 143, 190, 0.45); box-shadow: 0 10px 26px rgba(23, 49, 79, 0.14); }
.tf-branch-label { font-weight: 600; }

/* 详情列：渐变发丝分隔 + 渐变边框重点块 */
.tf-detail { max-width: 350px; padding: 24px 22px; border-left: none; position: relative; }
.tf-detail::before {
  content: "";
  position: absolute;
  left: 0; top: 24px; bottom: 24px;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(120, 150, 185, 0.35), transparent);
}
.tf-detail-title { font-size: 20px; font-weight: 700; letter-spacing: 0.01em; }
.tf-detail-how {
  border: 1px solid transparent;
  border-radius: 15px;
  padding: 15px 17px;
  background:
    linear-gradient(var(--tf-card-active, rgba(255, 255, 255, 0.9)), var(--tf-card-active, rgba(255, 255, 255, 0.9))) padding-box,
    linear-gradient(135deg, rgba(74, 143, 190, 0.5), rgba(247, 179, 205, 0.35)) border-box;
}
body[data-ds-dark-theme] .tf-detail-how {
  background:
    linear-gradient(rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03)) padding-box,
    linear-gradient(135deg, rgba(119, 174, 214, 0.4), rgba(247, 179, 205, 0.28)) border-box;
}

/* 按钮：深海军蓝、克制阴影 */
.tf-btn-primary {
  background: linear-gradient(135deg, #3d6f96, #2c5a80);
  border-radius: 11px;
  box-shadow: 0 5px 14px rgba(44, 90, 128, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.18);
  letter-spacing: 0.03em;
}
body[data-ds-dark-theme] .tf-btn-primary {
  background: linear-gradient(135deg, #5b93ba, #3d6f96);
}
.tf-btn-primary:hover { box-shadow: 0 8px 22px rgba(44, 90, 128, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.18); }
.tf-btn-ghost { border-radius: 11px; letter-spacing: 0.02em; }

/* 页脚：渐变发丝线 */
.tf-foot { border-top: none; position: relative; padding: 13px 22px; }
.tf-foot::before {
  content: "";
  position: absolute;
  left: 22px; right: 22px; top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(120, 150, 185, 0.38), transparent);
}

/* ============ 设计感 v3：迷你星图导航 + 焦点英雄卡 ============ */
/* 头部步骤点串 */
.tf-progress { gap: 14px; }
.tf-progress-dots { display: flex; align-items: center; gap: 5px; flex: 1; min-width: 0; overflow: hidden; }
.tf-progress-dot {
  flex: none;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: rgba(120, 150, 185, 0.35);
  transition: background 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
}
.tf-progress-dot.done { background: linear-gradient(135deg, #f7aacb, #ec6da5); box-shadow: 0 0 4px rgba(236, 109, 165, 0.5); }
.tf-progress-dot.active {
  width: 10px; height: 10px;
  background: linear-gradient(135deg, #77aed6, #4a8fbe);
  box-shadow: 0 0 8px rgba(74, 143, 190, 0.85);
  animation: tf-here-pulse 2s ease-in-out infinite;
}
.tf-progress-dot.unchosen, .tf-progress-dot.skipped { opacity: 0.35; }

/* 左列：迷你星图 */
.tf-map {
  flex: 0 0 224px;
  min-width: 0;
  overflow-y: auto;
  padding: 18px 8px 18px 16px;
  display: flex;
  flex-direction: column;
}
.tf-map-item {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  border: none;
  background: none;
  padding: 5px 8px;
  margin: 0;
  border-radius: 10px;
  cursor: pointer;
  font-family: inherit;
  color: var(--tf-ink-2);
  transition: background 0.18s ease;
  position: relative;
}
.tf-map-item:hover { background: rgba(120, 150, 185, 0.10); }
.tf-map-item.sel { background: rgba(74, 143, 190, 0.10); }
.tf-map-dot {
  position: relative;
  flex: none;
  width: 26px; height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.92), rgba(233, 243, 251, 0.85));
  border: 1px solid rgba(148, 178, 208, 0.34);
  box-shadow: 0 1px 3px rgba(23, 49, 79, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.95);
}
body[data-ds-dark-theme] .tf-map-dot {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.04));
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.tf-map-dot-inner { display: inline-flex; }
.tf-map-dot-inner svg { width: 14px; height: 14px; }
.tf-map-dot-inner.bloom { animation: tf-bloom-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1); }
.tf-map-item.active .tf-map-dot {
  background: linear-gradient(160deg, #f0f7fc, #dcecf8);
  border-color: rgba(74, 143, 190, 0.75);
  box-shadow: 0 0 0 4px rgba(74, 143, 190, 0.13), 0 0 18px rgba(74, 143, 190, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.95);
}
body[data-ds-dark-theme] .tf-map-item.active .tf-map-dot {
  background: linear-gradient(160deg, rgba(74, 143, 190, 0.28), rgba(74, 143, 190, 0.12));
  box-shadow: 0 0 0 4px rgba(119, 174, 214, 0.14), 0 0 18px rgba(119, 174, 214, 0.4);
}
.tf-map-item.active .tf-map-dot::before, .tf-map-item.active .tf-map-dot::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1.5px solid rgba(74, 143, 190, 0.5);
  animation: tf-ripple 2.4s cubic-bezier(0.2, 0.6, 0.4, 1) infinite;
  pointer-events: none;
}
.tf-map-item.active .tf-map-dot::after { animation-delay: 1.2s; }
.tf-map-item.done .tf-map-dot {
  background: linear-gradient(135deg, #ffe3ef, #fbc9dd);
  border-color: rgba(217, 79, 142, 0.4);
  box-shadow: 0 0 10px rgba(236, 109, 165, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.95);
}
.tf-map-item.done { color: var(--tf-ink); }
.tf-map-item.unchosen { opacity: 0.42; }
.tf-map-item.skipped { opacity: 0.5; }
.tf-map-item.skipped .tf-map-label { text-decoration: line-through; }
.tf-map-label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tf-map-item.active .tf-map-label { font-weight: 700; color: var(--tf-ink); }
.tf-map-check {
  position: absolute;
  left: 24px; bottom: 0;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ec6da5, #d94f8e);
  color: #fff;
  display: grid;
  place-items: center;
  box-shadow: 0 1px 4px rgba(217, 79, 142, 0.5);
}
.tf-map-check svg { width: 7px; height: 7px; }
.tf-map .tf-here {
  position: absolute;
  left: 36px; top: -6px;
  font-size: 9px;
  padding: 1px 7px;
  letter-spacing: 0.06em;
  z-index: 2;
  box-shadow: 0 2px 6px rgba(74, 143, 190, 0.4);
}
.tf-map .tf-seg { margin-left: 12px; height: 14px; }
.tf-map .tf-seg.energize::before { left: -3px; right: -3px; }

/* 右列：英雄详情卡 */
.tf-hero {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 32px 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  position: relative;
}
.tf-hero::before {
  content: "";
  position: absolute;
  left: 0; top: 24px; bottom: 24px;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(120, 150, 185, 0.35), transparent);
}
.tf-hero-watermark {
  position: absolute;
  right: 20px; top: 6px;
  font-size: 92px;
  font-weight: 800;
  line-height: 1;
  color: transparent;
  -webkit-text-stroke: 1px rgba(74, 143, 190, 0.16);
  pointer-events: none;
  user-select: none;
}
body[data-ds-dark-theme] .tf-hero-watermark { -webkit-text-stroke-color: rgba(119, 174, 214, 0.14); }
.tf-hero-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tf-hero-meta { font-size: 12.5px; color: var(--tf-ink-2); letter-spacing: 0.02em; }
.tf-hero-title { font-size: 25px; font-weight: 700; letter-spacing: 0.01em; line-height: 1.3; padding-right: 70px; }
.tf-hero-desc { margin: 0; font-size: 14px; line-height: 1.75; color: var(--tf-ink-2); max-width: 580px; }
.tf-branch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
  margin-top: 2px;
}
.tf-branch-grid .tf-branch { flex-direction: column; align-items: flex-start; gap: 6px; padding: 16px 18px; }
.tf-branch-grid .tf-branch-hint { flex: none; }
.tf-branch-grid .tf-branch-arrow { align-self: flex-end; margin-top: 2px; }
.tf-hero-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
.tf-hero-complete { align-items: center; text-align: center; justify-content: center; }
.tf-hero-complete::before { display: none; }
.tf-hero .tf-detail-wait {
  margin: 0;
  background: var(--tf-card);
  border: 1px dashed var(--tf-line);
  border-radius: 12px;
  padding: 10px 14px;
}
.tf-empty-wide { width: 100%; }

/* ============ 颜色还原：回到主题色（新版式保留） ============ */
.tf-overlay { background: rgba(36, 12, 28, 0.32); backdrop-filter: blur(3px); }
.tf-panel {
  background: var(--tf-bg);
  border: 1px solid var(--dsw-alias-border-l2, rgba(43, 90, 130, 0.16));
}
body[data-ds-dark-theme] .tf-panel {
  background: var(--tf-bg);
  border-color: var(--dsw-alias-border-l2, rgba(247, 179, 205, 0.20));
}
.tf-head-title, body[data-ds-dark-theme] .tf-head-title {
  background: none;
  color: var(--tf-ink);
  -webkit-text-fill-color: var(--tf-ink);
}
.tf-flow-select { background-color: var(--tf-card); border-color: var(--tf-line); }
body[data-ds-dark-theme] .tf-flow-select { background-color: var(--tf-card); }
.tf-progress-track { background: var(--tf-line); }
.tf-progress-fill {
  background: linear-gradient(90deg, var(--dsw-static-deepseek-400, #77AED6), var(--dsw-static-deepseek-500, #4A8FBE));
}
.tf-node-icon, .tf-map-dot {
  background: var(--tf-card);
  border: 1px solid var(--dsw-alias-border-l3, rgba(43, 90, 130, 0.28));
  box-shadow: 0 2px 6px rgba(23, 49, 79, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.55);
}
body[data-ds-dark-theme] .tf-node-icon, body[data-ds-dark-theme] .tf-map-dot {
  background: var(--tf-card);
  border-color: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.12));
}
.tf-node-icon.active, .tf-map-item.active .tf-map-dot {
  background: linear-gradient(135deg, var(--dsw-static-deepseek-100, #E0EEF6), var(--dsw-static-deepseek-200, #D0E7F5));
  border-color: rgba(74, 143, 190, 0.85);
  box-shadow: 0 0 0 5px rgba(74, 143, 190, 0.18), 0 0 26px rgba(74, 143, 190, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.55);
}
.tf-card {
  background: var(--tf-card);
  border: 1px solid var(--tf-line);
}
body[data-ds-dark-theme] .tf-card { background: var(--tf-card); border-color: var(--tf-line); }
.tf-card.active {
  background: var(--tf-card-active);
  border-color: rgba(74, 143, 190, 0.65);
  box-shadow: 0 0 0 2px rgba(74, 143, 190, 0.22), 0 12px 32px rgba(74, 143, 190, 0.24);
}
.tf-card.active::before {
  background: linear-gradient(180deg, var(--dsw-static-deepseek-400, #77AED6), var(--dsw-static-deepseek-500, #4A8FBE));
}
.tf-seg.lit {
  background: linear-gradient(180deg, var(--dsw-static-deepseek-200, #D0E7F5), var(--dsw-static-deepseek-500, #4A8FBE));
}
.tf-branch {
  background: var(--tf-card);
  border: 1px solid var(--tf-line);
}
body[data-ds-dark-theme] .tf-branch { background: var(--tf-card); border-color: var(--tf-line); }
.tf-btn-primary {
  background: linear-gradient(135deg, var(--dsw-static-deepseek-450, #6BA6D2), var(--dsw-static-deepseek-500, #4A8FBE));
  box-shadow: 0 5px 14px rgba(74, 143, 190, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
body[data-ds-dark-theme] .tf-btn-primary {
  background: linear-gradient(135deg, var(--dsw-static-deepseek-450, #6BA6D2), var(--dsw-static-deepseek-500, #4A8FBE));
}

/* ============ 修复：迷你星图与英雄卡的文字重叠 ============ */
.tf-map .tf-here { display: none; }
.tf-map-check { left: auto; right: -4px; bottom: -4px; }
.tf-hero-watermark {
  font-size: 62px;
  top: 14px;
  right: 22px;
  -webkit-text-stroke-width: 1px;
}
.tf-hero-top { padding-right: 100px; }
.tf-hero-title { padding-right: 100px; }

/* ============ 悬浮气泡：Portal 到 body 顶层，不再被裁剪 ============ */
.tf-tip-float {
  position: fixed;
  transform: translateY(-50%);
  opacity: 1;
  pointer-events: none;
  z-index: 10000;
  animation: tf-tip-in 0.16s ease-out;
}
@keyframes tf-tip-in {
  from { opacity: 0; transform: translateY(-50%) translateX(-5px); }
  to { opacity: 1; transform: translateY(-50%) translateX(0); }
}

/* ============ 大气版 v5：大开大合 ============ */
.tf-panel { width: min(1080px, calc(100vw - 40px)); height: min(800px, calc(100vh - 96px)); border-radius: 24px; }
.tf-head { padding: 22px 28px 16px; gap: 16px; }
.tf-head::after { left: 28px; right: 28px; }
.tf-head-title { font-size: 19px; }
.tf-flow-select { padding: 8px 34px 8px 16px; font-size: 13px; }
.tf-progress-dots { gap: 7px; }
.tf-progress-dot { width: 9px; height: 9px; }
.tf-progress-dot.active { width: 13px; height: 13px; }
.tf-progress-num { font-size: 13px; }
.tf-close { width: 34px; height: 34px; }

/* 迷你星图：更宽、更舒展 */
.tf-map { flex: 0 0 248px; padding: 24px 10px 24px 20px; }
.tf-map-item { padding: 8px 10px; gap: 12px; border-radius: 12px; }
.tf-map-dot { width: 32px; height: 32px; }
.tf-map-dot-inner svg { width: 17px; height: 17px; }
.tf-map-label { font-size: 13px; }
.tf-map .tf-seg { height: 18px; margin-left: 15px; }
.tf-map-check { width: 14px; height: 14px; right: -5px; bottom: -5px; }
.tf-map-check svg { width: 8px; height: 8px; }

/* 英雄卡：大图标 + 大标题 + 大留白 */
.tf-hero { padding: 44px 48px 40px; gap: 20px; }
.tf-hero::before { top: 32px; bottom: 32px; }
.tf-hero-icon {
  width: 72px; height: 72px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--dsw-static-deepseek-100, #E0EEF6), var(--dsw-static-deepseek-200, #D0E7F5));
  border: 1px solid rgba(74, 143, 190, 0.4);
  box-shadow: 0 0 0 8px rgba(74, 143, 190, 0.10), 0 12px 30px rgba(74, 143, 190, 0.3);
}
.tf-hero-icon-inner { display: inline-flex; }
.tf-hero-icon-inner svg { width: 38px; height: 38px; }
.tf-hero-icon-inner.bloom { animation: tf-bloom-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
.tf-hero-top { gap: 12px; padding-right: 0; }
.tf-hero-meta { font-size: 13.5px; }
.tf-hero-title { font-size: 36px; font-weight: 800; line-height: 1.25; padding-right: 0; letter-spacing: 0; }
.tf-hero-desc { font-size: 15.5px; line-height: 1.85; max-width: 640px; }
.tf-detail-how { padding: 18px 20px; border-radius: 16px; }
.tf-how-head { font-size: 14px; }
.tf-how-text { font-size: 14px; }
.tf-branch-grid { gap: 16px; }
.tf-branch-grid .tf-branch { padding: 22px 20px; border-radius: 18px; gap: 8px; }
.tf-branch-grid .tf-branch-label { font-size: 17px; }
.tf-branch-grid .tf-branch-hint { font-size: 13px; }
.tf-branch-grid .tf-branch-diff { font-size: 11.5px; }
.tf-hero-actions { gap: 12px; }
.tf-hero-actions .tf-btn-primary { padding: 12px 28px; font-size: 15px; }
.tf-hero-actions .tf-btn-ghost { padding: 12px 20px; font-size: 14px; }
.tf-hero .tf-detail-wait { padding: 12px 16px; font-size: 13.5px; }

/* 巨型水印：右下角背景纹理，低透明度不再挡字 */
.tf-hero-watermark {
  font-size: 150px;
  top: auto;
  right: 24px;
  bottom: 16px;
  -webkit-text-stroke-color: rgba(74, 143, 190, 0.10);
}
body[data-ds-dark-theme] .tf-hero-watermark { -webkit-text-stroke-color: rgba(119, 174, 214, 0.10); }

/* 页脚：加大 */
.tf-foot { padding: 16px 28px; }
.tf-foot::before { left: 28px; right: 28px; }
.tf-foot-btn { padding: 9px 16px; font-size: 13px; }
.tf-foot-hint { font-size: 12.5px; }

/* ============ 可互动性 v6：悬停预览 / 气泡 / 右键菜单 / 折叠 ============ */
/* 分支悬停 → 目标节点高亮 */
.tf-map-item.preview .tf-map-dot {
  border-color: rgba(236, 109, 165, 0.85);
  box-shadow: 0 0 0 5px rgba(236, 109, 165, 0.16), 0 0 20px rgba(236, 109, 165, 0.55);
  animation: tf-ripple 1.2s cubic-bezier(0.2, 0.6, 0.4, 1) infinite;
}
.tf-map-item.preview .tf-map-label { font-weight: 700; }
.tf-map-item.preview .tf-map-label::after { content: " →"; color: #d94f8e; font-weight: 800; }

/* 进度点可点击 */
.tf-progress-dot { cursor: pointer; }
.tf-progress-dot:hover { transform: scale(1.4); }

/* 已完成折叠开关 */
.tf-map-toggle {
  align-self: flex-start;
  border: none;
  background: none;
  color: var(--tf-ink-2);
  font-size: 11.5px;
  letter-spacing: 0.06em;
  padding: 3px 10px;
  margin: 0 8px 6px;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s ease;
}
.tf-map-toggle:hover { background: rgba(120, 150, 185, 0.14); }

/* 节点悬停气泡 */
.tf-map-tip {
  position: fixed;
  z-index: 10001;
  max-width: 240px;
  padding: 10px 13px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2937);
  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  box-shadow: 0 12px 32px rgba(23, 49, 79, 0.26);
  font-size: 12px;
  pointer-events: none;
  animation: tf-tip-in-2 0.15s ease-out;
}
.tf-map-tip-title { font-weight: 700; font-size: 13px; }
.tf-map-tip-desc { margin-top: 4px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #6b7280); }
.tf-map-tip-est { margin-top: 5px; font-size: 11px; opacity: 0.8; }
@keyframes tf-tip-in-2 { from { opacity: 0; transform: translateY(4px); } }

/* 右键快捷菜单 */
.tf-ctx {
  position: fixed;
  z-index: 10001;
  min-width: 172px;
  padding: 6px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  box-shadow: 0 16px 44px rgba(23, 49, 79, 0.3);
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: tf-tip-in-2 0.12s ease-out;
}
.tf-ctx-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--dsw-alias-label-secondary, #6b7280);
  padding: 5px 10px 3px;
}
.tf-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: none;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  color: var(--dsw-alias-label-primary, #1f2937);
  transition: background 0.12s ease;
}
.tf-ctx-item:hover { background: rgba(74, 143, 190, 0.14); }
.tf-ctx-sep {
  height: 1px;
  background: var(--dsw-alias-border-l2, #eef0f4);
  margin: 4px 2px;
}

/* ============ 向 DSH 下达指令 ============ */
.tf-branch-cmd {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--tf-accent-deep, #3B7BAA);
  background: rgba(74, 143, 190, 0.10);
  border-radius: 99px;
  padding: 2px 9px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.tf-branch-cmd:hover { background: rgba(74, 143, 190, 0.2); }
.tf-branch-grid .tf-branch-cmd { align-self: flex-end; margin-top: 2px; }
.tf-btn-cmd { font-weight: 600; }
.tf-sent-banner {
  margin: 0 20px 4px;
  padding: 7px 12px;
  border-radius: 10px;
  font-size: 12.5px;
  color: #0e8a5f;
  background: rgba(52, 211, 153, 0.12);
  border: 1px solid rgba(52, 211, 153, 0.35);
}
body[data-ds-dark-theme] .tf-sent-banner { color: #4cc99a; }

/* ============ 按钮左置：星图右侧不放按钮 + 侧边栏按钮防溢出 ============ */
.tf-hero-actions { justify-content: flex-start; }
.tf-foot { justify-content: flex-start; gap: 12px; flex-wrap: wrap; }
.tf-foot-actions { margin-right: 6px; }
.tf-foot-hint { flex: 1; min-width: 120px; }
.tf-branch-grid .tf-branch-cmd { align-self: flex-start; }
.tf-button-wrap { position: relative; z-index: 40; }
.tf-button { min-width: 0; max-width: 100%; box-sizing: border-box; }

/* ============ 聊天输入栏工具行按钮（新家：紧凑图标按钮） ============ */
.tf-button-wrap-composer { position: relative; }
.tf-button-composer {
  width: auto;
  min-width: 36px;
  height: 36px;
  padding: 6px;
  justify-content: center;
  border-radius: 10px;
}
.tf-button-composer .tf-button-icon svg { width: 20px; height: 20px; }
.tf-button-composer .tf-button-badge { display: none; }

/* ============ 统一的悬停提示气泡（三个插件共用） ============ */
.dsh-plugin-tip {
  position: fixed;
  z-index: 10001;
  max-width: 270px;
  padding: 10px 14px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2937);
  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(23, 49, 79, 0.28);
  font-size: 12.5px;
  line-height: 1.55;
  text-align: left;
  pointer-events: none;
  transform: translate(-50%, -100%);
  animation: dsh-tip-in 0.15s ease-out;
}
.dsh-plugin-tip::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -5.5px;
  width: 10px;
  height: 10px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border-right: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  transform: translateX(-50%) rotate(45deg);
}
.dsh-plugin-tip-title { font-weight: 700; font-size: 13px; }
.dsh-plugin-tip-sub { margin-top: 3px; color: var(--dsw-alias-label-secondary, #6b7280); }
@keyframes dsh-tip-in {
  from { opacity: 0; transform: translate(-50%, calc(-100% - 5px)); }
  to { opacity: 1; transform: translate(-50%, -100%); }
}
`;

    /* ================= 插件入口 ================= */

    const inject = ["slots"];

    function apply(ctx) {
      // 捕获会话服务（用于「向 DSH 下达指令」）；拿不到时静默降级
      try { sessionsSvc = ctx.sessions; } catch (e) { /* ignore */ }
      if (!sessionsSvc && typeof ctx.get === "function") {
        try { sessionsSvc = ctx.get("sessions"); } catch (e2) { sessionsSvc = null; }
      }

      ctx.effect(() => {
        const style = document.createElement("style");
        style.dataset.plugin = "dsh-task-flow";
        style.dataset.pluginCss = "dsh-task-flow/style.css";
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => { if (style.isConnected) style.remove(); };
      }, "task-flow: styles");

      // 侧边栏底部区域在展开/收起状态下都会被聊天页盖住 → 按钮迁到聊天输入栏工具行
      ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
        name: "conversation.input.left",
        id: "dsh-task-flow.view",
        order: 1
      }, (props) => h(SidebarButton, Object.assign({}, props || {}, { variant: "composer" }))));
    }

    exports.apply = apply;
    exports.inject = inject;
    // 仅用于本地模拟测试（mock-boot.cjs）
    exports.__test = {
      getStore: () => store,
      reloadStore: () => { store = loadStore(); return store; },
      makeDemoFlow,
      makeProgressFlow,
      replay,
      unchosenSet,
      orderedIds,
      completeTask,
      chooseBranch,
      skipNode,
      rollbackOne,
      rollbackToEvent,
      restartFlow,
      resetDemoFlow,
      importFlowJson,
      clampPanel,
      sendCommand,
      moveWhaleRight,
      components: { SidebarButton, PanelContent }
    };
    return module.exports;
  }
});
