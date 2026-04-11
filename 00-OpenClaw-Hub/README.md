# OpenClaw + Obsidian 协同中枢 / Collaboration Hub

## 目录说明 / Directory Map

1. `01-Prompts`：给 OpenClaw / Claude Code 的可复用提示词。  
   EN: Reusable prompts for OpenClaw and Claude Code.
2. `02-KnowledgeGraph`：知识图谱节点与关系维护区。  
   EN: Knowledge graph nodes and relationship maintenance.
3. `03-Handoffs`：无人值守接手和交接记录。  
   EN: Unattended handoff records and execution continuity logs.
4. `04-Runbooks`：可执行操作手册。  
   EN: Executable runbooks for repeatable operations.
5. `05-Code-Indexes`：项目代码索引与摘要。  
   EN: Project code indexes and structured summaries.

## 最小执行闭环 / Minimum Execution Loop

1. 在 `05-Code-Indexes` 写入最新项目索引。  
   EN: Update latest project indexes in `05-Code-Indexes`.
2. 用 `01-Prompts` 模板生成任务。  
   EN: Generate tasks from templates in `01-Prompts`.
3. 执行完成后写入 `03-Handoffs`。  
   EN: Write completion records to `03-Handoffs`.
4. 将关键实体与关系回写到 `02-KnowledgeGraph`。  
   EN: Feed key entities and relations back into `02-KnowledgeGraph`.

## 项目路径 / Project Path

- 当前项目路径：`C:\Users\Buffoon Queer\Desktop\openclaw`
- EN: Active project path for execution and indexing.
