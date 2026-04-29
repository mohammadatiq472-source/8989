# 新机器 AI 开工提示词（4060 机器 / 迁移后）

> 用途：给迁移到新机器后的第一个 AI 窗口直接使用，避免从零解释项目，也避免只说“去读文档”导致理解过慢。

关联入口：

1. [原生 SLG 正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md)
2. [原生 SLG 正式组件文档](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)
3. [USB 迁移审计（5GB U 盘约束）](USB_MIGRATION_AUDIT_2026_04_17.md)
4. [USB 迁移执行说明（E 盘 / 4060 机器）](USB_MIGRATION_EXECUTION_2026_04_17.md)
5. [USB 迁移后路径重写说明](USB_MIGRATION_PATH_REWRITE_2026_04_17.md)
6. [AI 快速导航索引](AI_QUICK_NAV_INDEX_2026_04_10.md)
7. [Codex 主线记忆锚点](../CODEX.md)
8. [仓库主入口 README](../README.md)

## 1. 推荐直接复制给新窗口的提示词

```text
当前工作目录是迁移到新机器后的 8989 仓库。你现在接手的是“原生 SLG 主壳 + AI 变量”主线，不是 preview sandbox 主线。

先做 6 件事：

1. 先确认当前仓库实际根路径。
2. 先读：
   - AGENTS.md
   - docs/AGENTS_EXECUTION_CURRENT_2026_04.md
   - docs/NATIVE_SLG_MAINLINE_INDEX.md
   - docs/NATIVE_SLG_COMPONENT_ARCHITECTURE.md
   - docs/USB_MIGRATION_AUDIT_2026_04_17.md
   - docs/USB_MIGRATION_EXECUTION_2026_04_17.md
   - docs/USB_MIGRATION_PATH_REWRITE_2026_04_17.md
   - docs/AI_QUICK_NAV_INDEX_2026_04_10.md
   - CODEX.md
   - README.md
3. 如果当前仓库根路径不再等于：
   C:\Users\26739\Desktop\8989
   不要全仓盲改路径。先按 docs/USB_MIGRATION_PATH_REWRITE_2026_04_17.md 的规则，只检查 Markdown 证据绝对路径。
4. 然后按正式入口验证：
   - npm run build
   - npm run test:world:mutation-lock
   - Godot headless 主入口
   - interior_panel / troop_panel / general_panel / ai_panel 独立场景 smoke
5. 验证通过后，再继续当前主线任务，不要回 preview 线。
6. 任何结论都优先以“当前代码事实 + 正式验证链 + 主线文档”三者交叉确认。

项目高信号摘要：

- 这是一个 Node.js authoritative backend + Godot client 的 AI 原生同盟战争项目。
- 后端负责 world action、general / AI / agenda / save-slot 等权威状态。
- Godot 前端负责原生 SLG 主壳、全屏功能面板、运行态展示与交互，不负责规则裁决。
- 当前已经完成大部分主线重构，处于收尾和联调阶段，不是从零做骨架。
- 当前重点是：
  - main.gd 继续收薄
  - general / ai 权威链继续收口
  - 原生 SLG 的 troop / interior / alliance / recruit / general / ai 面板继续正式化
- 迁移到这台机器前，推荐开发迁移包已经准备好并复制完成；不要再去追整个 tmp 历史垃圾目录。

你开工后的输出顺序应该是：

1. 当前仓库根路径确认
2. 读取了哪些主线文档
3. 正式验证结果
4. 当前主线已完成到哪
5. 风险项 / 阻塞项 / 下一步

不要：

- 不要默认从 UI preview sandbox 开始
- 不要把历史附录当成现行主线
- 不要全仓批量替换旧绝对路径
- 不要把 tmp/gates、tmp/b3c08_*、tmp/world_save_slots_archive 当成必须资产
```

## 2. 要不要额外讲“项目是什么 / 技术是什么 / 目标是什么”

答案是：**要讲，但只讲高信号摘要，不要长篇重讲全项目历史。**

最合适的做法是：

1. 在开工提示词里讲清楚：
   - 这是什么项目
   - 技术栈是什么
   - 当前主线是什么
   - 当前进度大概到哪里
   - 不要走什么错误方向
2. 具体细节再让它去读主线文档。

也就是说：

- **不能只说“你自己读文档”**
- 也**不需要**在提示词里重写一整份 PRD

## 3. 这条主线最该让新窗口立刻知道的事

1. 这不是普通 UI 原型项目，而是：
   - `Node.js authoritative backend`
   - `Godot 原生客户端`
   - `AI 原生 SLG`
2. 当前不是在做抽象概念，而是在把“世界主壳 / 部队 / 内政 / 同盟 / 招募 / 武将 / AI”这些真实面板链和权威状态链落地。
3. 这条线已经做到了“可运行、可验证、可迁移”，但还在收尾，不是已经彻底封板。
4. 迁移后首先做的是：
   - 验证
   - 路径检查
   - 接着继续主线
   不是重新做架构讨论。

## 4. 当前建议

到新机器后，最稳的动作就是：

1. 直接把上面的提示词发给新窗口
2. 让它先跑正式验证
3. 验证过后再继续当前主线任务
