# dsh-task-flow · 任务星图 (Task Star Map)

[English](#task-star-map--dsh-task-flow) · MIT · [一键安装](#安装)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness)（DSH）Web 客户端插件：**点一下聊天输入栏的 🌸 按钮，用一张会发光的「星图」告诉你 —— 任务进行到哪一步、如何继续、面前有哪些分支。** 而这张图，可以由 AI 一句话长出来，也可以跟着 AI 干活实时点亮。

## ✨ 核心功能

### 任务可视化（P1/P2）

- **星图视图**：所有步骤自动分层排布成星座图，流光连线连接前后步骤；滚轮缩放、拖拽平移、一键适配；走过的路亮蓝色实线、未走过的暗虚线
- **迷你星图 / 列表视图**：随时切换，已完成步骤可折叠
- **一眼看清进度**：完成的步骤绽放成花、打 ✓；当前步骤光环脉动；被放弃的支线变暗
- **分支卡牌**：分支依次飞出（推荐说明 + 难度标签）；悬停预览路线；点选后能量波沿路线闪传，未选支线碎成花瓣；随时反悔重选
- **可视化编辑器**：双击空白新建、拖动节点、增删分支、自由连线——纯手工搭出带分支的星图
- **推进 / 回退**：完成、跳过、回退一步、回退到任意一步、重新开始，全部基于历史事件回放，天然可逆
- **庆祝**：里程碑奖杯；整条流程完成时花瓣雨 + 完成横幅

### AI 觉醒（P3，v2.0.0 新增）

- **✨ 一句话长出星图**：面板输入「帮我做一个 xxx」→ 调用 DSH 默认模型自动拆解为带分支、验收标准的星图，节点逐颗「发芽→绽放」；生成前自动快照，可一键撤销
- **⚡ 执行流侧栏**：Agent 的每一次工具调用实时变成「执行星点」（运行中旋转 / 完成点亮 / 失败变红 + 错误摘要）；面板不打开时，按钮上显示本会话动作计数徽标
- **🤖 Agent 自动推进**：AI 生成的流程默认「可交给 AI」；Agent 完成任务后可通过 `GET /task-flow/advance` 接口自己推进星图（已通过 system prompt 协作协议告知模型）；你在星图上也能一键「⚡ 交给 AI 执行」
- **★ 会话主线星**：星图顶部实时显示 DSH Goal 状态（进行中/暂停/受阻/完成 + 第 N/M 轮）；受阻时显示原因、星图当前节点同步染红；可直接从星图暂停/恢复/完成主线目标，完成时全图花瓣雨

### 其它

- **⚡ 下达指令**：当前步骤一键发送「继续执行」指令给 DSH
- **多流程**：流程下拉切换、新建；JSON 导入 / 导出（schema v2）
- **窗口自由**：面板可拖动、可调大小；快捷键 `Q` 开关、`Esc` 关闭
- **动效降级**：遵循 `prefers-reduced-motion`
- **首屏示例**：「发布一篇公众号文章」+「DSH 插件开发总进度」两张内置流程

## 安装

### 方式 A：从 GitHub 一键安装（推荐）

```powershell
dsh plugin --profile web add github:wqy-cell/dsh-task-flow
```

安装完成后重启 `dsh web`，刷新页面即可在聊天输入栏左侧看到 🌸 按钮。

### 方式 B：本地手动安装

1. 克隆/复制本仓库到 `<DSH_HOME>/profiles/web/plugins/dsh-task-flow/`
2. 在 web profile 的 `package.json` 增加依赖 `"dsh-task-flow": "file:./plugins/dsh-task-flow"`
3. `cordis.patch.yml` 增加：
   ```yaml
   - insert:
       - id: task-flow
         name: dsh-task-flow
   ```
4. 在 web profile 目录执行 `pnpm install`
5. 重启 `dsh web`，刷新页面

## 环境要求

- DSH Web profile（插件客户端 `dsh.client` 声明 `platform: web, immediately: true`）
- 无额外运行时依赖：数据只存浏览器 localStorage，动画纯 CSS/SVG
- AI 拆解需要已配置 DSH 默认模型；未配置时其余功能不受影响

## 隐私

- 流程数据只存本机浏览器 localStorage（key `dsh-task-flow:v2`，旧 v1 数据自动迁移并备份），无遥测、无第三方服务
- 「AI 拆解」仅把你的目标描述发给你的本地 DSH 默认模型；「Agent 自动推进」的事件只在本机内存与浏览器间传递（`/task-flow/events` 轮询）
- 「向 DSH 下达指令」只向你的本地会话发送你点选的内容
- 开源代码不包含任何个人数据：无硬编码路径、无凭据、无日志

## 结构

```
dsh-task-flow/
├── package.json        # dsh.client 声明（platform: web, immediately: true）
├── cordis.patch.yml    # dsh plugin add 使用的挂载声明
├── LICENSE             # MIT
├── lib/index.js        # host 半边：/task-flow/ai-plan、advance、events、state
├── lib/client.js       # 浏览器半边：数据模型 + 星图渲染 + 编辑器 + AI 面板 + 执行流 + 主线星
├── docs/schema-v2.md   # 流程数据契约 v2（迁移规则 / 校验规则）
├── sync-plugin.ps1     # 开发辅助：工作区源码同步到线上装载目录
└── test/               # 离线自测：mock-boot.cjs（客户端）+ mock-host.cjs（host 路由）
```

## 数据格式

流程 JSON 格式（导入/导出同构，schema v2）：

```jsonc
{
  "title": "流程名",
  "schema": 2,
  "meta": { "origin": "manual", "planPrompt": null },
  "nodes": [
    { "id": "n1", "kind": "task", "title": "步骤名", "desc": "说明", "how": "如何继续", "est": "10 分钟", "tags": ["标签"], "next": "n2", "exec": { "mode": "agent", "linked": false } },
    { "id": "n2", "kind": "choice", "title": "分支节点",
      "branches": [ { "label": "分支名", "hint": "推荐说明", "to": "n3a", "difficulty": "低" } ] },
    { "id": "n3a", "kind": "milestone", "title": "里程碑" }
  ],
  "history": [ { "n": "n1", "kind": "task", "ts": 1234567890, "source": "user", "note": null } ]
}
```

## 开发者

客户端自测（模拟 DSH 环境 + 真实 react SSR）：

```powershell
node test/mock-boot.cjs
```

host 半边路由自测（LLM / 校验 / 重试 / 事件总线全场景 mock）：

```powershell
node test/mock-host.cjs
```

测试通过 `DSH_TEST_NODE_MODULES`（或 `DSH_HOME`，默认 `~/.dsh/profiles/node_modules`）定位 React 等真实依赖：

```powershell
$env:DSH_TEST_NODE_MODULES = "你的/dsh/profiles/node_modules"
node test/mock-boot.cjs
```

- 修改 `lib/client.js` 后无需重启，DSH 的 HMR 通道自动热更新；修改 `lib/index.js`（host 半边）需重启 `dsh web`
- 改完代码后运行 `sync-plugin.ps1` 把工作区源码同步到线上插件装载目录（多副本一致性）

## 路线图

- **P3 已完成**：AI 拆解、Agent 自动推进（advance 接口 + 协作协议）、Goal 主线星联动
- **后续候选**：输入框 HUD（`conversation.input.dock`）、主题皮肤（星轨/霓虹）、成就徽章、模板库、步骤计时/专注模式

---

# Task Star Map · dsh-task-flow

A [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) (DSH) web-client plugin: click the 🌸 button next to the chat input, and a glowing star map shows **where the task is, how to continue, and which branches lie ahead** — with the twist that the map can be **grown by AI from one sentence** and **lights up live while your agent works**.

## Highlights

- **Star-map view**: auto-layered constellation layout with glowing edges; zoom / pan / fit; walked paths light up, unwalked ones stay dashed
- **Live execution stream**: every agent tool call becomes a pulsing star (running → done / failed with error summary), with an activity badge on the sidebar button
- **One-sentence planning**: describe a goal → the default DSH model plans the flow; nodes sprout one by one; undoable via snapshot
- **Agent auto-advance**: AI-planned nodes default to agent mode; the agent can advance the map itself via `GET /task-flow/advance` (a cooperation protocol is embedded in the planner's system prompt)
- **Goal mainline star**: live DSH Goal status on top of the map (active/paused/blocked/complete + round counter); pause/resume/complete from the map; blocked goals tint the current node red, completing one showers the map in petals
- **Branch cards, visual editor, undo/rollback, multi-flow, JSON import/export, milestone celebrations**, all animations respecting `prefers-reduced-motion`

## Install

```powershell
dsh plugin --profile web add github:wqy-cell/dsh-task-flow
```

Then restart `dsh web` and refresh.

## Privacy

- Flow data lives in browser localStorage only (`dsh-task-flow:v2`, auto-migrated from v1 with backup); no telemetry, no third-party services
- AI planning sends only your goal text to your local default model; agent-advance events stay between local memory and the browser
- No personal data in the source: no hardcoded paths, no credentials, no logs

## Structure / Data format / Developer

See the Chinese sections above — the flow JSON contract is documented in `docs/schema-v2.md`, and both offline test suites (`test/mock-boot.cjs`, `test/mock-host.cjs`) run with plain `node`.

## License

[MIT](./LICENSE)
