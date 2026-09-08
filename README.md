# dsh-task-flow · 任务星图

一个 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness)（DSH）Web 客户端插件：**点一下聊天输入栏的 🌸 按钮，用一张会发光的「星图」告诉你 —— 任务进行到哪一步、如何继续、面前有哪些分支。**

视觉风格：樱花（花苞 → 绽放），与「雪霁蓝 + 樱花」主题同调。

## 功能

- **星图视图（全景任务地图）**：所有步骤自动分层排布成星座图，流光连线连接前后步骤；滚轮缩放、拖拽平移、一键适配全图；走过的路亮蓝色、通往当前节点的路带流动虚线
- **迷你星图 / 列表视图**：两种视图随时切换；迷你星图可折叠已完成步骤
- **一眼看清进度**：已完成的步骤绽放成花、打上 ✓；当前步骤带蓝色光环脉动；被放弃的支线变暗
- **如何继续**：详情卡给出当前步骤的目标、做法（如何继续）、预计耗时、标签
- **可选分支**：分支卡牌依次飞出（推荐说明 + 难度标签）；悬停分支可在星图上预览路线；点选后能量波沿选中路线闪传，未选支线碎成花瓣消散；随时可「重新选择分支」反悔
- **可视化编辑器**：双击空白新建步骤、拖动节点调整位置、增删分支、自由连线——纯手工搭出带分支的星图
- **推进 / 回退**：完成此步、跳过、回退一步、回退到任意一步、重新开始，全部基于历史事件回放，天然可逆
- **⚡ 直接向 DSH 下达指令**：当前步骤一键发送「继续执行」指令；分支卡可一键选定分支并指令 DSH 执行
- **里程碑与庆祝**：里程碑完成有奖杯，整条流程完成时花瓣雨 + 完成横幅
- **窗口自由**：面板可拖动、可拖右下角把手调整大小
- **多流程**：流程下拉切换、新建；JSON 导入 / 导出
- **快捷键**：`Q` 开关面板、`Esc` 关闭；右键节点快捷操作
- **动效降级**：遵循 `prefers-reduced-motion`
- **首屏自带示例**：「发布一篇公众号文章」+「DSH 插件开发总进度」两张内置流程，点开即见完整效果

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

## 隐私

- 数据只存本机浏览器 localStorage（key `dsh-task-flow:v1`），零网络请求
- 开源代码**不包含任何个人数据**：无硬编码路径、无凭据、无日志
- 「向 DSH 下达指令」只向你的本地会话发送你点选的内容

## 结构

```
dsh-task-flow/
├── package.json        # dsh.client 声明（platform: web, immediately: true）
├── cordis.patch.yml    # dsh plugin add 使用的挂载声明
├── LICENSE             # MIT
├── lib/index.js        # host 半边（P3 将加 /task-flow/* 接口）
├── lib/client.js       # 浏览器半边（数据模型 + 星图渲染 + 编辑器 + 全部动效）
└── test/mock-boot.cjs  # 离线自测（模拟 DSH 环境 + 真实 react SSR）
```

## 数据格式

流程 JSON 格式（导入/导出同构）：

```jsonc
{
  "title": "流程名",
  "nodes": [
    { "id": "n1", "kind": "task", "title": "步骤名", "desc": "说明", "how": "如何继续", "est": "10 分钟", "tags": ["标签"], "next": "n2" },
    { "id": "n2", "kind": "choice", "title": "分支节点",
      "branches": [ { "label": "分支名", "hint": "推荐说明", "to": "n3a", "difficulty": "低" } ] },
    { "id": "n3a", "kind": "milestone", "title": "里程碑" }
  ],
  "history": [ { "n": "n1", "kind": "task", "ts": 1234567890 } ]
}
```

## 开发者

客户端自测（模拟 DSH 环境 + 真实 react SSR）：

```powershell
node test/mock-boot.cjs
```

测试通过 `DSH_TEST_NODE_MODULES`（或 `DSH_HOME`，默认 `~/.dsh/profiles/node_modules`）定位 React 等真实依赖：

```powershell
$env:DSH_TEST_NODE_MODULES = "你的/dsh/profiles/node_modules"
node test/mock-boot.cjs
```

修改 `lib/client.js` 后无需重启，DSH 的 HMR 通道会自动热更新。

## 路线图

- **P3**：AI 拆解（一句话生成流程）、`POST /task-flow/advance` 让 Agent 自动推进、Goal 主线星联动（`useProjection("goal")`）、输入框 HUD（`conversation.input.dock`）

## License

[MIT](./LICENSE)
