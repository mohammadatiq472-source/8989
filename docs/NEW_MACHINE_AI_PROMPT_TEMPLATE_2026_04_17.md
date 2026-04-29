# 新机器 AI 提示词模板（基础版 / 高信息版）

> 用途：给迁移到新机器后的 AI 窗口直接粘贴使用。  
> 原则：先给高信号摘要，再把细节下放给正式主线文档、组件文档和迁移文档。

关联入口：

1. [新机器 AI 开工提示词](NEW_MACHINE_AI_START_PROMPT_2026_04_17.md)
2. [原生 SLG 正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md)
3. [原生 SLG 正式组件文档](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)
4. [USB 迁移执行说明](USB_MIGRATION_EXECUTION_2026_04_17.md)
5. [USB 迁移后路径重写说明](USB_MIGRATION_PATH_REWRITE_2026_04_17.md)
6. [AI 快速导航索引](AI_QUICK_NAV_INDEX_2026_04_10.md)
7. [Codex 主线记忆锚点](../CODEX.md)
8. [仓库主入口 README](../README.md)

## 1. 怎么用

建议只保留两种模板：

1. **基础模板**
   适合：你只想让新窗口先快速接上主线。
2. **高信息模板**
   适合：你希望它一开始就知道项目是什么、技术栈是什么、当前做到哪一步、不要走错方向。

默认建议：**优先发高信息模板**。

## 2. 基础提示词模板

```text
当前目录是 8989 仓库的新机器迁移副本。你接手的是“原生 SLG 主壳 + AI 变量”主线，不是 preview sandbox 主线。

先按这个顺序执行：

1. 确认当前仓库实际根路径。
2. 先读：
   - AGENTS.md
   - docs/AGENTS_EXECUTION_CURRENT_2026_04.md
   - docs/NATIVE_SLG_MAINLINE_INDEX.md
   - docs/NATIVE_SLG_COMPONENT_ARCHITECTURE.md
   - docs/USB_MIGRATION_EXECUTION_2026_04_17.md
   - docs/USB_MIGRATION_PATH_REWRITE_2026_04_17.md
   - docs/AI_QUICK_NAV_INDEX_2026_04_10.md
   - CODEX.md
   - README.md
3. 如果当前根路径不等于：
   C:\\Users\\26739\\Desktop\\8989
   不要全仓盲改路径。先只检查 Markdown 文档里的仓库内证据绝对路径。
4. 先跑正式验证：
   - npm run build
   - npm run test:world:mutation-lock
   - Godot headless 主入口
   - interior_panel / troop_panel / general_panel / ai_panel 独立场景 smoke
5. 验证后再汇报：
   - 当前根路径
   - 已读文档
   - 验证结果
   - 当前主线已完成到哪
   - 风险项 / 阻塞项 / 下一步

不要：
- 不要默认从 UI preview sandbox 开始
- 不要把历史附录当现行主线
- 不要全仓批量替换旧绝对路径
- 不要把 tmp/gates、tmp/b3c08_*、tmp/world_save_slots_archive 当成必须资产
```

## 3. 高信息提示词模板

```text
当前目录是迁移到新机器后的 8989 仓库。你现在接手的是“原生 SLG 主壳 + AI 变量”主线，不是 preview sandbox 主线。

项目高信号摘要：

- 这是一个 AI 原生同盟战争项目，本质是“Node.js authoritative backend + Godot 原生客户端”。
- 后端负责 world action、save-slot、general、AI、agenda、session 等权威状态。
- Godot 负责原生 SLG 主壳、全屏功能面板、运行态展示和交互，不负责规则裁决。
- 当前不是从零做概念，而是在把世界主壳、部队、内政、同盟、招募、武将、AI 这些真实域和状态链正式落地。
- 当前阶段已经进入收尾和联调，不是重新做大骨架。
- 迁移前，推荐开发迁移包已经完成并复制到 U 盘；不要再追整个 tmp 历史垃圾目录。

你先做这些：

1. 确认当前仓库实际根路径。
2. 先读：
   - AGENTS.md
   - docs/AGENTS_EXECUTION_CURRENT_2026_04.md
   - docs/NATIVE_SLG_MAINLINE_INDEX.md
   - docs/NATIVE_SLG_COMPONENT_ARCHITECTURE.md
   - docs/USB_MIGRATION_AUDIT_2026_04_17.md
   - docs/USB_MIGRATION_EXECUTION_2026_04_17.md
   - docs/USB_MIGRATION_PATH_REWRITE_2026_04_17.md
   - docs/AI_QUICK_NAV_INDEX_2026_04_10.md
   - docs/NEW_MACHINE_AI_START_PROMPT_2026_04_17.md
   - CODEX.md
   - README.md
3. 如果当前根路径不再等于：
   C:\\Users\\26739\\Desktop\\8989
   不要全仓盲改。先只处理 Markdown 文档中的仓库内证据绝对路径。
4. 跑正式验证：
   - npm run build
   - npm run test:world:mutation-lock
   - D:\\Apps\\Godot\\Godot_v4.6.2-stable_win64_console.exe --headless --quit --path godot-client
   - Godot 面板场景 smoke：interior / troop / general / ai
5. 验证通过后，再继续当前主线任务，不要回 preview 线。

你开工后的输出顺序应该是：

1. 当前仓库根路径
2. 读取的主线文档
3. 正式验证结果
4. 当前主线已完成到哪
5. 风险项
6. 阻塞项
7. 下一步

你要特别记住：

- 当前主线技术栈是 Node.js authoritative backend + Godot client
- 当前游戏引擎是 Godot
- 当前默认产品路径是原生 SLG 主壳，不是 preview sandbox
- 任何结论优先以“当前代码事实 + 正式验证链 + 主线文档”三者交叉确认
- 不要在没有确认的情况下清理 tmp 大目录或重写历史文档
```

## 4. 什么时候用基础版，什么时候用高信息版

1. 如果你只是想让它先接上主线：
   - 用基础版
2. 如果你希望它一开窗就知道项目背景、技术、目标、完成度、禁止事项：
   - 用高信息版

当前默认建议：**高信息版**

## 5. 为什么不能只说“去读文档”

因为只靠文档会有两个问题：

1. 新窗口定位会更慢
2. 它可能不知道“什么是当前主线，什么是不能回去的旧线”

所以最稳的结构是：

1. 提示词先给高信号摘要
2. 然后把细节下放给：
   - 主线文档
   - 组件文档
   - 迁移文档
   - 快速导航

## 6. 当前建议

到 4060 那台机器后，默认直接发：

1. [NEW_MACHINE_AI_START_PROMPT_2026_04_17.md](NEW_MACHINE_AI_START_PROMPT_2026_04_17.md)
2. 如果你想直接粘贴模板，就发本文件里的“高信息提示词模板”
