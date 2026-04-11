# CLAUDE.md — Claude Code 项目入口

> 本文件由 Claude Code 自动读取。核心愿景和完整规则见 `AGENTS.md`。

---

## 项目本质

AI 原生 SLG 同盟战争系统。不是辅助工具、不是聊天机器人、不是外挂。

**核心范式**：人类玩家（盟主）→ CommanderAgent（强模型）→ GeneralAgent×N（中等/规则）→ 规则引擎（advanceTick，最终裁决者）

## 技术栈（已锁定）

| 层 | 技术 |
|----|------|
| 后端 | Node.js + TypeScript, `node:http`, Zod, XState |
| 前端 |UNity|
| Agent 通信 | CopilotKit (AG-UI) |
| LLM 网关 | OpenAI 兼容协议 (http://216.40.86.55:3100/) |
| 记忆 | Mem0 (降级 InMemory) |

## 黄金原则

1. AI 只能提案，不能改世界 — `advanceTick` 规则引擎裁决一切
2. 规则引擎 `shared/domain/rules.ts` 不可被 AI 替换
3. 将领是有状态角色（个性/忠诚度/记忆），不是无状态工具
4. AI-First API — 每个接口先问"LLM 基于这个做决策需要什么"
5. 低幻觉 — 输出必须过 Zod schema，缺情报时优先侦察

## 编码安全（Windows 环境必读）

本仓库含大量中文。Windows PowerShell 默认编码 GBK，Node.js 输出 UTF-8，终端显示必乱码。

- **禁止** `node -e`、`Get-Content`、shell 重定向输出中文
- **必须** 用 Python 3.11 + `encoding='utf-8'` 处理中文文件
- 终端操作前：`chcp 65001; export PYTHONIOENCODING=utf-8`
- 文件工具 (read_file/grep) 安全，终端 cat/type 不安全

## 关键文件索引

```
AGENTS.md                                    ← 项目最高优先级提示词（完整版）
shared/contracts/game.ts                     ← WorldState 权威类型定义
shared/domain/rules.ts                       ← 规则引擎（禁改）
server/src/agents/commander/CommanderAgent.ts ← 指挥官 Agent
server/src/agents/general/GeneralAgent.ts    ← 将领 Agent
server/src/evals/runMultiFactionSimulation.ts ← 13州模拟主入口
docs/P0_PLAYABLE_ALPHA_EXECUTION_PLAN.md     ← 当前迭代计划
docs/HANDOFF_2026_03_19.md                   ← 最新交接状态

Godot 客户端（必读）:
godot-client/project.godot                         ← Godot 工程入口
godot-client/scenes/app/main.tscn                  ← 主场景入口
godot-client/scripts/app/main.gd                   ← 启动链（bootstrap/join/world/map）
godot-client/scripts/map/map_grid.gd               ← 地图基础渲染（含裁剪/缩放/拖拽/hover/FPS）
godot-client/autoload/world_store.gd               ← 世界状态与 map_layout 存储
server/src/app.ts                                  ← 后端 API 主路由（Godot 通过 /api/* 接入）
scripts/generate_all_provinces_map.py              ← 区划数据离线生成（tmp/map_data）
```

## Godot 地图系统架构（当前主链）

当前项目已切换为 **Godot + Node.js 后端** 主链；旧引擎客户端与兼容路由均已下线。

### 坐标系与网格规格
- **WorldStore.map_layout.chunk**：后端下发的地图块（当前 MVP 以基础 tile 渲染）
- **MapGrid 视口裁剪**：仅绘制可见区域，避免大图全量重绘
- **全国区划网格**：1500×1500（离线脚本输出，`pos = x*10000 + y`，X 南↓ Y 东→）

### 关键脚本
| 脚本 | 位置 | 功能 |
|------|------|------|
| `main.gd` | `godot-client/scripts/app/` | 启动时串联 session/world/map 拉取，并刷新 HUD |
| `map_grid.gd` | `godot-client/scripts/map/` | 地图瓦片绘制、缩放/拖拽、hover、可见裁剪、性能统计 |
| `backend_api_client.gd` | `godot-client/scripts/infra/http/` | Godot 侧 HTTP 调用封装 |
| `WorldService.ts` | `server/src/application/world/` | 世界快照与 map layout 输出 |
| `generate_all_provinces_map.py` | `scripts/` | 生成 `tmp/map_data/map_regions.json` |
| `generate_tile_regions.py` | `scripts/` | 生成 `tmp/map_data/map_tile_regions.json` |

### 数据流
```
Node server `/api/world` + `/api/world/map-layout`
                ↓
      Godot `backend_api_client.gd`
                ↓
      `WorldStore` 写入 world/map_layout
                ↓
          `MapGrid` 基础 tile 渲染
   （含可见裁剪 + FPS/FrameMs + baseline 导出）
```

### 状态说明
- 旧引擎客户端、旧兼容接口、旧编辑器链路已移除。
- 保留的是地图离线数据脚本与后端规则引擎主线，前端统一由 Godot 承接。

## 验证命令

```bash
npx tsc -p tsconfig.server.json --noEmit          # 编译检查
npx tsx server/src/evals/runMultiFactionSimulation.ts --mode mock --ticks 5 --output tmp/test.json
npx tsx server/src/evals/runMultiFactionSimulation.ts --mode gateway --ticks 1 --verbose --output tmp/gw.json
```

## 非目标

- 不做完整 MMO / 正式多人联机（当前阶段）
- 不把规则引擎逻辑挪进 prompt
- 不在前端保留 authoritative 规则分支
- 不直接从浏览器请求模型 endpoint
- 不做 mock UI 当正式交付
- 不在 `tmp/` 以外新建一次性验证脚本
