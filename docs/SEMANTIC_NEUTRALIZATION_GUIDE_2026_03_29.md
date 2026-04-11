# Semantic Neutralization Guide (Godot Mainline)

Last Updated: 2026-04-08

## 1. 目标
- 统一项目主客户端为 Godot。
- 移除旧引擎运行链路、兼容路由、构建/验收门禁中的旧依赖。
- 保留后端规则引擎与共享契约，确保迁移是“前端引擎替换”而不是“玩法重写”。

## 2. 当前主链（唯一有效）
- Client: `godot-client/`
- Server: `server/src/app.ts`
- Shared contracts: `shared/contracts/*`, `shared/schemas/*`
- Runtime API:
  - `GET /api/session/runtime`
  - `POST /api/session/join`
  - `GET /api/world`
  - `GET /api/world/map-layout`
  - `POST /api/world/action` (`{"action":"advanceTick"}`)

## 3. 已移除内容
- 旧客户端工程目录已移除。
- 旧兼容 API（legacy 前缀）已移除。
- 旧专用脚本与 gate 已移除：
  - `scripts/validate_contract_sync.ts`
  - 旧 MCP 启动脚本
- 旧文档目录（legacy 客户端专题）已移除。
- 旧地图脚本链已移除（`generate_youzhou_map*`, `generate_ldtk_project.py`, `trace_youzhou_boundary.py`）。

## 4. 保留并迁移后的地图离线脚本
- `scripts/generate_all_provinces_map.py`
  - 输出: `tmp/map_data/map_regions.json`
- `scripts/generate_tile_regions.py`
  - 输入: `tmp/map_data/map_regions.json`
  - 输出: `tmp/map_data/map_tile_regions.json`
- `scripts/generate_map_v2.py`
  - 输入: `tmp/map_data/map_regions.json`
  - 输出: `tmp/map_data/map_tile_regions.json`

## 5. 验证命令
```bash
npm run build
py -3.11 -m py_compile scripts/generate_all_provinces_map.py scripts/generate_tile_regions.py scripts/generate_map_v2.py
D:/Apps/Godot/Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client --quit-after 1
```

## 6. 历史说明
- 历史旧引擎设计/交接信息仅用于回溯，不再作为开发入口。
- 若需查阅历史，请优先看 `docs/archive/`，不要恢复旧引擎运行链。
