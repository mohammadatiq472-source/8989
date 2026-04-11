# DOCS 图谱与时效审计（2026-04-09）

## 审计方法

1. 关系图来源（Obsidian CLI）：
   - `obsidian files folder='docs' ext=md`
   - `obsidian backlinks path=<doc> total`
   - `obsidian links path=<doc> total`
2. 时效来源：
   - 文件系统 `mtime`
   - `git log -1 --format=%cs -- <doc>`
3. 审计快照：
   - `tmp/docs_obsidian_graph_audit_2026_04_09.json`
   - `tmp/docs_freshness_graph_snapshot_2026_04_09.json`

## 总览结果

| 指标 | 数值 |
| --- | --- |
| docs 下 md 总数（清理前） | 81 |
| docs 下 md 总数（清理后） | 61 |
| 在图谱中有关系（backlinks 或 outlinks > 0） | 3 |
| 图谱孤立（清理前） | 78 |
| 图谱孤立（清理后） | 58 |
| mtime 近 30 天 | 81 |
| git 最近提交在 14 天内 | 80 |
| git 无历史（untracked） | 1 |

## 时效判断结论

- 按“修改时间”无法可靠识别过时文档：本批 docs 大多近期统一变更过，时间戳几乎全部较新。
- 当前“是否过时”更应看语义与图谱位置，而不是只看时间。

## 仍在关系图中的文档（建议保留）

| 文档 | backlinks | outlinks |
| --- | --- | --- |
| `docs/archive/HANDOFF_2026_03_18.md` | 0 | 2 |
| `docs/archive/HANDOFF_STZB_REVERSE_COMPLETE.md` | 1 | 0 |
| `docs/STZB_REVERSE_DESIGN_INSIGHTS.md` | 1 | 0 |

## 图谱孤立文档分布（清理前：78）

| 目录 | 数量 |
| --- | --- |
| `docs/root` | 33 |
| `docs/modules_v2` | 20 |
| `docs/archive/modules_legacy_2026_03_25` | 19 |
| `docs/archive`（不含 legacy 子目录） | 2 |
| `docs/prompts` | 2 |
| `docs/templates` | 2 |

## 已执行清理（2026-04-09）

已删除（21）：

- `docs/archive/HANDOFF_2026_03_17_EDITOR_SESSION.md`
- `docs/archive/HANDOFF_2026_03_19.md`
- `docs/archive/modules_legacy_2026_03_25/*`（19 个）

执行后复扫快照：

- `tmp/docs_obsidian_graph_audit_2026_04_09_after_cleanup.json`

## 候选“过时/可清理”集合（语义判定）

以下集合同时满足：`archive/legacy` + 图谱孤立：

- 本批已完成清理，不再作为候选。

说明：
- 这批文件看起来是历史归档，不在当前图谱关系中。
- 但是否直接删除仍需按团队“历史追溯保留策略”确认（建议先确认再删）。
