# GitHub Copilot 仓库级指令

> 本文件由 GitHub Copilot 在仓库范围内自动加载。
> 核心愿景和完整规则见根目录 `AGENTS.md`。

---

## 项目一句话



## 黄金原则

1. **AI 只能提案，不能改世界** — 所有 world mutation 必须经过 `advanceTick` 规则引擎
2. **规则引擎不可被 AI 替换** — `shared/domain/rules.ts` 是最有价值的代码
3. **将领是有状态角色** — `GeneralProfile` 有个性、忠诚度、记忆，不是无状态工具
4. **AI-First API Design** — 每个接口设计先问"LLM 基于这个做决策需要什么"
5. **低幻觉** — AI 输出必须过 Zod schema，缺情报时优先侦察而非瞎猜

## 编码规则

### 中文编码安全（最高优先级）

- **禁止** `node -e`、`Get-Content`、shell 重定向输出中文到终端
- **必须** 用 `py -3.11 + encoding='utf-8'` 处理中文文件读写
- 终端操作前先 `chcp 65001; $env:PYTHONIOENCODING='utf-8'`
- `read_file` / `grep_search` 工具是安全的，终端 cat/type 不安全

### TypeScript 规范

- 严格类型，不用 `any`
- 共享类型统一放 `shared/contracts/`，Schema 放 `shared/schemas/`
- 服务端代码在 `server/src/`，前端代码在 `src/`
- 不在前端保留 authoritative 规则分支
- 不直接从浏览器请求模型 endpoint

### 文件组织

```
shared/contracts/game.ts   ← WorldState 权威类型（必读）
shared/domain/rules.ts     ← 规则引擎（禁止 AI 替换）
server/src/agents/          ← AI Agent 层
server/src/evals/           ← 模拟验证
src/components/             ← React 前端
```

## 关键命令

```bash
# 编译检查
npx tsc -p tsconfig.server.json --noEmit

# Mock 快速验证（无 LLM）
npx tsx server/src/evals/runMultiFactionSimulation.ts --mode mock --ticks 5 --output tmp/test.json

# Gateway 真实 LLM
npx tsx server/src/evals/runMultiFactionSimulation.ts --mode gateway --ticks 1 --verbose --output tmp/gw.json

# 启动后端/前端
npx tsx server/src/app.ts
npm run dev
```

## 成本金字塔

- CommanderAgent: 强模型，每 Tick 一次
- GeneralAgent: 中等模型，数次
- UnitAgent: 小模型/规则，数百次近零成本

## 非目标

- 不做完整 MMO / 正式多人联机
- 不把规则引擎逻辑挪进 AI prompt
- 不做 mock UI 当正式交付
- 不在 `tmp/` 以外新建一次性验证脚本
