# 迁移后路径重写与注意事项（给后续 AI）

> 用途：当 `8989` 从当前机器迁移到另一台机器后，如果仓库根路径发生变化，让后续 AI 能快速判断哪些绝对路径证据链接需要改、哪些内容不能乱动。

关联入口：

1. [USB 迁移审计（5GB U 盘约束）](USB_MIGRATION_AUDIT_2026_04_17.md)
2. [USB 迁移执行说明（E 盘 / 4060 机器）](USB_MIGRATION_EXECUTION_2026_04_17.md)
3. [原生 SLG 正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md)
4. [AI 快速导航索引](AI_QUICK_NAV_INDEX_2026_04_10.md)
5. [Codex 主线记忆锚点](../CODEX.md)

## 1. 当前旧根路径

当前仓库旧根路径是：

`C:\Users\Buffoon Queer\Desktop\8989`

后续 AI 如果发现新机器上的仓库根路径不是这个，就要进入“证据绝对路径重写检查”。

## 2. 哪些内容可能会失效

最容易失效的是文档里的**绝对本地路径链接**，尤其指向：

1. `C:\Users\Buffoon Queer\Desktop\8989\tmp\...`
2. `C:\Users\Buffoon Queer\Desktop\8989\docs\...`
3. `C:\Users\Buffoon Queer\Desktop\8989\godot-client\...`
4. `C:\Users\Buffoon Queer\Desktop\8989\*.mp4`

代码本身通常不受这个影响。  
受影响的是：

1. Obsidian 点击链接
2. 桌面端文件跳转
3. 基于文档证据链继续校对结构时的可追溯性

## 3. 不要乱改的东西

迁移后，后续 AI **不要**一上来就全仓替换所有 `C:\Users\Buffoon Queer\Desktop\8989`。

要先区分：

1. 文档证据链接
2. 代码里的真实运行路径/工具路径
3. 历史记录和审计快照

优先只改：

1. Markdown 文档里的证据绝对路径
2. 明确是“仓库内文件跳转用途”的绝对路径

默认不要改：

1. 历史快照文档里带审计意义的原始路径说明
2. 与本机软件安装位置有关的固定工具路径
   - 例如 `D:\Apps\Godot\...`
3. 非仓库根路径下的外部档案路径说明

## 4. 迁移后优先检查的文档

后续 AI 到新机器后，优先检查这些文档里的绝对路径：

1. [NATIVE_SLG_MAINLINE_INDEX.md](NATIVE_SLG_MAINLINE_INDEX.md)
2. [USB_MIGRATION_AUDIT_2026_04_17.md](USB_MIGRATION_AUDIT_2026_04_17.md)
3. [USB_MIGRATION_EXECUTION_2026_04_17.md](USB_MIGRATION_EXECUTION_2026_04_17.md)
4. [CODEX.md](../CODEX.md)
5. [README.md](../README.md)

## 5. 建议检查命令

迁移到新机器后，先在仓库根目录执行：

```powershell
rg -n "C:\\\\Users\\\\Buffoon Queer\\\\Desktop\\\\8989" docs README.md CODEX.md godot-client
```

用途：

1. 找出还残留旧根路径的地方
2. 让 AI 判断哪些属于证据链接，哪些只是历史说明

## 6. 推荐处理规则

如果新机器上的仓库实际根路径是：

`<NEW_ROOT>`

那么后续 AI 应按下面规则处理：

1. 如果命中的内容是 Markdown 链接目标，并且目标文件确实已经迁过去：
   - 可改成 `<NEW_ROOT>` 对应的新绝对路径
2. 如果命中的内容只是“历史说明 / 审计记录 / 旧环境说明”：
   - 保留原文，不强改
3. 如果命中的内容是外部软件路径：
   - 单独核对，不按仓库根路径规则替换

## 7. 给后续 AI 的最短提示

如果你在新机器上开新窗口，可以直接把下面这段给 AI：

```text
先读：
1. docs/NATIVE_SLG_MAINLINE_INDEX.md
2. docs/USB_MIGRATION_AUDIT_2026_04_17.md
3. docs/USB_MIGRATION_EXECUTION_2026_04_17.md
4. docs/USB_MIGRATION_PATH_REWRITE_2026_04_17.md
5. CODEX.md

当前仓库已经从旧机器迁移过来。请先检查仓库当前实际根路径是否仍然等于：
C:\\Users\\Buffoon Queer\\Desktop\\8989

如果不等于，不要全仓盲改。先用 rg 搜索旧根路径残留，只处理 Markdown 文档中的仓库内证据绝对路径，把它们重写到新根路径；保留历史说明、外部软件路径和审计原文。
```

## 8. 当前判断

这份文档的目的不是要求“迁移后立刻大改路径”，而是避免后续 AI 因为看见旧路径就全仓误替换。  
正确顺序是：

1. 先确认新机器实际根路径
2. 再筛出文档证据链接
3. 最后只改需要继续点击和取证的那部分
