# dsh-task-flow 数据契约 schema v2

> 定稿：S0.4（2026-08）· 依据 P1 实际实现（history 事件驱动）与《任务星图P3-实施方案》
> v1 → v2 新增三类字段：`flow.meta`（来源）、`node.exec`（执行模式）、`history[].source/note`（事件来源与备注）。其余与 P1 完全兼容。
> v2.1（2026-09）新增：`flow.updatedAt`（合并判新旧）、store 级 `deleted`（删除墓碑）、`dsh-task-flow:v2-corrupt`（损坏原文备份）、服务端任务库镜像。老数据缺这些字段时自动补齐，无需手工迁移。

## 1. 存储键与 Store 形状

| 键 | 用途 |
|---|---|
| `dsh-task-flow:v2` | 现行数据（本契约） |
| `dsh-task-flow:v1-backup` | 迁移前的 v1 原始串备份（迁移成功后写入，永不覆盖） |
| `dsh-task-flow:v2-corrupt` | 最近一次读不懂的原文备份（人工恢复用） |
| `<DSH_HOME>/storages/task-flow-library.json` | 服务端任务库镜像（跨标签页 / 跨浏览器 / 跨 profile） |

```jsonc
{
  "v": 2,
  "activeFlowId": "flow-1",
  "flows": [ /* FlowV2，见 §2 */ ],
  "deleted": { "flow-9": 1720000000000 },  // v2.1：删除墓碑（id → 删除时间）
  "savedAt": 1720000000000                 // v2.1：最近一次成功落盘时间
}
```

## 2. FlowV2

```jsonc
{
  "id": "flow-1",                 // 唯一，创建时生成
  "title": "发布一篇公众号文章",     // 非空，≤40 字（v2.1 起上限放宽到 60）
  "theme": "sakura",              // sakura | star | neon（当前实现固定 sakura）
  "createdAt": 1720000000000,     // 毫秒时间戳
  "updatedAt": 1720000000000,     // v2.1：最近一次被改动的时间（合并判新旧；缺省回退 createdAt）
  "schema": 2,                    // 新增：数据契约版本
  "meta": {                       // 新增：缺省 { origin: "manual", planPrompt: null }
    "origin": "manual",           // manual | ai
    "planPrompt": null            // origin=ai 时保存原始一句话，用于面板展示与复现
  },
  "nodes": [ /* NodeV2，见 §3 */ ],
  "history": [ /* EventV2，见 §4 */ ]
}
```

## 3. NodeV2（与 P1 同构 + exec）

```jsonc
{
  "id": "n1",                     // 流程内唯一，字符串
  "kind": "task",                 // task | choice | milestone | gate
  "title": "确定选题",             // 非空，≤40 字
  "icon": "idea",                 // 缺省补 "task"
  "desc": "……",                   // 可空
  "how": "……",                    // 可空，≤120 字
  "est": "10 分钟",                // 可空
  "tags": ["内容"],                // 可空数组
  "next": "n2",                   // task/milestone/gate 的下一步；终点为 null
  "branches": [                   // 仅 kind=choice：2–3 条
    { "label": "干货教程", "hint": "……", "to": "n3a", "difficulty": "低" }
  ],
  "exec": {                       // 新增：缺省 { mode: "manual", linked: false }
    "mode": "manual",             // manual | agent（agent=可交给 AI 执行）
    "linked": false               // true=与执行流星点双向绑定（S3 起用）
  }
}
```

## 4. EventV2（history 数组元素）

P1 为 `{ n, kind, to?, ts }`，v2 增加 `source` 与 `note`。当前步骤/已完成/分支选择/跳过全部由 `replay(flow)` 从 history 推导（保持 P1 机制不变）。

```jsonc
{ "n": "n1", "kind": "task", "ts": 1234567890, "source": "user", "note": null }
{ "n": "n2", "kind": "choice", "to": "n3b", "ts": 1234567900, "source": "user", "note": null }
{ "n": "n3", "kind": "skip", "ts": 1234567910, "source": "agent", "note": "API 限流，跳过" }
```

| 字段 | 说明 |
|---|---|
| `source` | `"user"`（手动操作）\| `"agent"`（AI 推进）\| `"goal"`（Goal 联动推进）；缺省按 `"user"` 处理 |
| `note` | ≤200 字符，Agent 写入的备注；可空 |

## 5. 校验规则（导入与 AI 生成共用）

1. flow：`title` 非空；`nodes` 为数组且 ≥1；节点数 ≤100；
2. node：`id` 流程内唯一；`kind` 在白名单内；`choice` 必须含 2–3 条合法分支（`to` 指向存在节点，否则丢弃该分支）；
3. 引用完整性：`next` / `branches[].to` 必须指向存在节点，否则置 null / 丢弃；
4. 幂等修复：缺 `icon` 补默认值、缺 `exec` 补默认值、id 重复自动重命名（`n3→n3-2`）。

## 6. v1 → v2 迁移规则（client 迁移器，S1.6 实现）

1. 读 `dsh-task-flow:v1`：无则结束；有 `dsh-task-flow:v2` 且合法则跳过（幂等）；
2. 原串写入 `dsh-task-flow:v1-backup`；
3. 逐 flow：补 `schema:2`、`meta:{origin:"manual",planPrompt:null}`；逐 node 补 `exec:{mode:"manual",linked:false}`；逐 history 事件补 `source:"user"`；
4. 写 `dsh-task-flow:v2`，删除 `dsh-task-flow:v1`；
5. 迁移失败（JSON 损坏等）：保留 v1 与备份，抛可恢复错误，不影响已有 v2 数据。

## 7. 兼容原则

- client 读取时对未知字段一律容忍（向前兼容）；
- 导入的流程 JSON 若缺 `schema` 字段，按 v1 结构处理并自动升级为 v2；
- AI 拆解（M1）输出经 host `normalizePlan` 归一化后即为合法 FlowV2（schema:2、meta.origin:"ai"、task 节点默认 exec.mode:"agent"）；
- v2.1 起老数据缺 `updatedAt` / `deleted` 时按「缺省即最旧」处理：`updatedAt` 回退 `createdAt`，绝不伪造成「刚改过」，因此不会把别的窗口的新进度顶回去。

## 8. 服务端任务库（v2.1）

`GET/POST /task-flow/library`（host 半边，落盘 `<DSH_HOME>/storages/task-flow-library.json`）：

```jsonc
// GET  → { ok, v:1, count, updatedAt, flows:[FlowV2], deleted:{}, error }
// POST { flows:[FlowV2], deleted:{} }  → { ok, count, added, bytes }
```

- POST 是**合并写**：服务端读回现有任务库，与新数据取并集（同 §2.1 规则）后原子替换（写 `.tmp` 再 rename）；
- 请求体上限 2MB、文件上限 4MB、流程数上限 200；脏数据逐条修复或丢弃，接口不返回 5xx；
- 文件损坏自动改名备份为 `task-flow-library.json.corrupt-<时间戳>` 并重新开始，不会把任务库锁死；
- 客户端在打开面板时 GET 合并（只增不减），变更后防抖 1.2s POST；路由不存在（未重启 dsh web）时静默降级，面板显示「任务库未启用」。
