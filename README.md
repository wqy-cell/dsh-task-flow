# dsh-task-flow · 任务星图

一个 DeepSeek Harness（DSH）Web 客户端插件：**点一下左下角「任务星图」按钮，用一条会发光的樱花星链告诉你 —— 任务进行到哪一步、如何继续、面前有哪些分支。**

视觉风格：樱花（花苞 → 绽放），与「雪霁蓝 + 樱花」现有主题同调。

## P1 功能（当前版本）

- **一眼看清进度**：纵向任务链，已完成的步骤绽放成花、打上 ✓；当前步骤带双层扩散涟漪 +「你在这里」标签；被放弃的支线灰化锁标
- **如何继续**：右侧详情卡给出当前步骤的目标、做法（如何继续）、预计耗时、标签
- **可选分支**：到达分支节点时，分支卡牌依次飞出（推荐说明 + 难度标签）；点选后能量波沿选中路线闪传，未选支线碎成花瓣消散；随时可「重新选择分支」反悔
- **推进 / 回退**：完成此步、跳过、回退一步、回退到任意一步、重新开始，全部基于历史事件回放，天然可逆
- **里程碑与庆祝**：里程碑完成有奖杯，整条流程完成时花瓣雨 + 完成横幅
- **多流程**：流程切换 chips、新建；JSON 导入 / 导出
- **快捷键**：`Q` 开关面板、`Esc` 关闭
- **动效降级**：遵循 `prefers-reduced-motion`
- **首屏自带示例流程**（「发布一篇公众号文章」，7 步 3 分支），点开按钮即见完整效果

## 结构

```
dsh-task-flow/
├── package.json      # dsh.client 声明（platform: web, immediately: true）
├── lib/index.js      # host 半边（P1 无路由；P3 将加 /task-flow/* 接口）
├── lib/client.js     # 浏览器半边（数据模型 + 樱花星链 + 全部动效）
└── test/mock-boot.cjs # 离线自测（node test/mock-boot.cjs）
```

## 安装（web profile）

1. 复制到 `<DSH_HOME>/profiles/web/plugins/dsh-task-flow/`
2. `package.json` 增加依赖 `"dsh-task-flow": "file:./plugins/dsh-task-flow"`
3. `cordis.patch.yml` 增加：
   ```yaml
   - insert:
       - id: task-flow
         name: dsh-task-flow
   ```
4. 在 web profile 目录执行 `pnpm install`
5. **重启 `dsh web`**（插件集合在启动时扫描，首次安装必须重启）
6. 刷新页面，左下角「设置」旁出现「任务星图」按钮

之后修改 `lib/client.js` 无需重启：服务端每 500ms 轮询插件 bundle，内容变化会通过 HMR 通道自动热更新。

## 数据

- 只存本机浏览器 localStorage（key `dsh-task-flow:v1`），零网络请求
- 流程 JSON 格式（导入/导出同构）：

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

## 路线图

- **P2**：SVG 星图视图（拖拽缩放）+ 可视化编辑器 + 完成庆祝（流星雨/成就横幅）升级
- **P3**：AI 拆解（一句话生成流程）、`POST /task-flow/advance` 让 Agent 自动推进、Goal 主线星联动（`useProjection("goal")`）、输入框 HUD（`conversation.input.dock`）
