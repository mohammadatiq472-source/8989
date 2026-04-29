[Memory Document Rule / Must Follow]

If a user message includes a memory reference starting with `codex://threads/`, do not assume it is stored in the repo.
Always search C drive first.

Primary lookup paths:
- `C:\Users\Buffoon Queer\.codex\sessions\YYYY\MM\DD\rollout-*-<thread_id>.jsonl`
- `C:\Users\Buffoon Queer\.codex\.codex-global-state.json` (for thread context lookup)

Required read order:
1. Read the top section of the session file as the summary source.
2. Then read the latest relevant conversation blocks in the same file.
3. Do not conclude "no memory found" before finishing C-drive lookup.

---

## 【最高优先级：中文编码安全规则 — 必须先读并遵守】

本仓库包含大量中文注释、中文前端文案、中文业务内容。  
使用不安全的文件读写方式极易造成中文乱码，引发灾难性仓库污染。

### 编码强制规则（适用于 Copilot / Claude / 任何 AI 助手）

1. **禁止直接用 `node -e`、`Get-Content`、shell 重定向等方式输出中文内容到终端**。  
2. **涉及中文读写优先用 `py -3.11`，并显式 `encoding='utf-8'`**。  
3. **终端输出中文前先执行**：
   - `chcp 65001`
   - `$env:PYTHONIOENCODING = 'utf-8'`
4. **中文文件写入禁止使用 PowerShell `Out-File` 或 shell 重定向**。  
5. **修改中文后必须做 UTF-8 回读校验**。  
6. `read_file / grep_search / file_search` 安全；PowerShell/cmd 直接 `cat/type/node` 输出中文不安全。  
7. 新会话先检查 `[Console]::OutputEncoding.WebName`，不是 utf-8 先切换。

### 开发提速规则（快速迭代）

- 能并行就并行。
- 先复用正式入口，再考虑新建脚本。
- `tmp/` 之外禁止放一次性验证脚本。
- 临时脚本必须标注“临时验证、不可作为正式交付入口”。
- 最终结论必须可由正式入口复现。

---

## 【双文件执行结构（2026-04 起）】

`AGENTS.md` 现在只保留全局硬规则与导航。  
项目语义和执行策略分离为双文件：

1. 现行执行版（当前唯一执行口径）  
   [docs/AGENTS_EXECUTION_CURRENT_2026_04.md](docs/AGENTS_EXECUTION_CURRENT_2026_04.md)
2. 历史保留版（2026-03 提示词追溯）  
   [docs/AGENTS_HISTORY_2026_03.md](docs/AGENTS_HISTORY_2026_03.md)

### 读取顺序

1. 本文件（硬规则）
2. 现行执行版
3. 历史保留版（仅在需要追溯时）

### 冲突处理

- 若历史口径与现行口径冲突，以现行执行版为准。
- 若文档口径与代码实现冲突，以“可验证代码事实 + 正式入口验证”结论为准。

### 并行工作树入口（多窗口协作）

- 快速入口：`WORKTREE_PARALLEL_QUICKSTART_2026_04_11.md`
- 提示词减噪治理：`docs/AI_PROMPT_CONTEXT_GOVERNANCE_2026_04_11.md`
