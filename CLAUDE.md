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

Unity 地图系统（必读）:
My project/Assets/Editor/Map/MapEditorWindow.cs   ← 幽州地图编辑器主窗口（菜单 YouZhou→Map Editor）
My project/Assets/Scripts/Map/Data/LogicalMapData.cs ← 300×106 逻辑网格，byte[] 地形
My project/Assets/Scripts/Map/Isometric/IsometricMapBuilder.cs ← 逻辑→视觉 Tilemap 渲染（900×318）
My project/Assets/StreamingAssets/youzhou_map.json  ← 幽州地形数据（编辑器输出）
My project/Assets/StreamingAssets/map_regions.json  ← 13州94郡区划数据（Python脚本输出）
scripts/generate_all_provinces_map.py               ← 全国区划数据生成脚本
```

## Unity 地图系统架构（幽州地图编辑器）

当前 Unity 工程已有一套**完整的幽州等距地图编辑器**，是全国地图开发的参考标准。

### 坐标系与网格规格
- **幽州逻辑网格**：300×106 格（每格 byte，存 TerrainType 0-11）
- **视觉 Tilemap**：900×318 格（每逻辑格 3×3 视觉 tile 扩展）
- **全国区划网格**：1500×1500（`map_regions.json`，`pos = x*10000 + y`，X 南↓ Y 东→）
- 两套坐标系**目前独立**，全国地图尚未接入 Tilemap 渲染

### 关键脚本
| 脚本 | 位置 | 功能 |
|------|------|------|
| `MapEditorWindow.cs` | Editor/Map/ | 编辑器主窗口，笔刷/桶填充/取色器，50步撤销，小地图预览 |
| `LdtkMapImporter.cs` | Editor/Map/ | 从 LDtk 文件导入地形数据 → `youzhou_map.json` |
| `AutoConfigureMapSprites.cs` | Editor/Map/ | 自动配置地形精灵 bitmask（16种边缘样式） |
| `IsometricMapBuilder.cs` | Scripts/Map/Isometric/ | 批量渲染逻辑格→Tilemap，auto-tiling 4邻居位掩码 |
| `MapPersistence.cs` | Scripts/Map/Isometric/ | 原子读写 `youzhou_map.json` |
| `MapRegionsData.cs` | Scripts/Map/Data/ | 加载全国区划 `map_regions.json`（94郡BBox） |
| `TileRegionsLoader.cs` | Scripts/Map/Data/ | 加载 `map_tile_regions.json` 逐格郡归属，提供 `GetJunxianIdAt(x,y)` |

### 12 种地形类型（TerrainType 枚举）
`Snow(0)` 雪地 / `SnowForest(1)` 雪地森林 / `IceLake(2)` 冰湖 / `SnowRoad(3)` 雪道 /
`Town(4)` 城镇 / `SnowMountain(5)` 雪山 / `Grass(6)` 草地 / `GrassForest(7)` 草地森林 /
`River(8)` 河流 / `IceRiver(9)` 冰河 / `Wall(10)` 城墙 / `Farmland(11)` 农田

### 数据流
```
Python 脚本 → map_regions.json (94郡BBox, 1500×1500坐标系)
                ↓ MapRegionsData.cs
                全国区划（州/郡/县归属判断）

generate_tile_regions.py → map_tile_regions.json (RLE格式, 1851×1501网格)
                ↓ TileRegionsLoader.cs
                GetJunxianIdAt(x,y) → junxian_id

MapEditorWindow → youzhou_map.json (300×106 地形byte[])
                ↓ IsometricMapBuilder.cs
                Unity Tilemap 900×318（auto-tile 渲染）
             ← Tilemap渲染与郡归属查询尚未打通 →
```

### map_tile_regions.json 格式
- 脚本: `scripts/generate_tile_regions.py`（Phase 1 BBox光栅化；`--image` 启用 Phase 2 图像精化）
- 格式: RLE行压缩，`rows["x"] = [[y_start, y_end, junxian_id], ...]`
- 网格: X=1~1851（含交州南端），Y=1~1501，坐标系同 map_regions.json
- 101郡: 94原始郡 + 交州合成7郡（id=1501-1507）
- Unity查询: `TileRegionsLoader.GetJunxianIdAt(int gameX, int gameY)` → junxian_id（0=海/沙漠）

### 待解决：BBox→Tile 地形问题
当前 `map_regions.json` 只有矩形 BBox 边界，不能直接用于 Tilemap 地形渲染。
`map_tile_regions.json` 提供逐格郡归属查询，但未链接地形贴图。
幽州编辑器是全国地图"形状化"的参考路径，属于中期目标。

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
