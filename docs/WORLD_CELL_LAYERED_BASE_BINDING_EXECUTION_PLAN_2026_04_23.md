# World Cell 分层底盘 / 建筑绑定正式执行计划（2026-04-23）

## 0. 文档状态

- 状态：正式执行口径
- 优先级：高
- 适用范围：Godot 世界地图 cell 视觉接入、footprint contract、placement contract、hover/selection 层级、资源地/城池/关口/要塞/码头/未来山脉河流的统一占地语义
- 直接关联文档：
  - `docs/WORLD_CELL_FOOTPRINT_PLACEMENT_CONTRACT_2026_04_23.md`
  - `docs/WORLD_RESOURCE_GENERATION_AUTHORITY_HANDOFF_2026_04_22.md`
  - `docs/WORLD_RESOURCE_WORKSTREAM_SPLIT_2026_04_22.md`

## 1. 正式结论

从本文件生效起，世界地图对象的正式路线固定为：

`方案 B = 底盘固定 + 建筑绑定 + 扩建后资源格转建筑格`

这意味着：

1. 世界地图对象不能继续以“先有资源格，再临时往格子上叠一个建筑 PNG”的方式作为正式实现。
2. 资源地、玩家主城、AI 主城、系统城池、关口、要塞、码头、未来山脉/河流都必须先进入统一的 world cell footprint / placement / composite contract。
3. hover / selection / debug overlay 继续保持在最上层，不被底盘、建筑、资源、城墙压住。
4. 后续新开 AI 窗口、重开 Codex 窗口、补做系统城池或河流山脉时，都不应再把方案 A 误判为当前正式方案。

## 2. 方案 A 的定位

`方案 A = 直接往格子上叠建筑 PNG / 沿用 resource overlay 链做非资源节点显示`

方案 A 现在只保留为：

1. 已经走过的一段验证历史。
2. 用来解释为什么截图里会出现“建筑像糊在格子上”“锚点错位后整体吊高”“语义仍停留在 resource_1x1”的问题。
3. 如必须做一次性视觉试摆时的临时验证手段。

方案 A 明确不再作为：

1. 正式数据建模方案。
2. 正式地图对象渲染方案。
3. 后续山脉/河流/城池/关口/要塞/码头扩展的执行基础。

## 3. 为什么必须现在切到方案 B

### 3.1 语义会乱

如果继续把非资源对象挂在 `resource overlay` 链上，客户端很容易把：

- 资源地 authority
- 非资源 world node
- 城池占地
- 扩建后的建筑格

混成一套临时视觉逻辑。后续 AI 窗口和新开的实现窗口会更难分辨“哪个格是资源 authority，哪个格是节点占地”。

### 3.2 交互闭环不完整

世界地图的 tile/cell 是：

- SLG 操作单位
- 移动单位
- 占领单位
- 交互选择单位

如果继续叠单张建筑 PNG：

1. hit test 仍然落在底层 tile/resource 语义上。
2. 扩建后周边格如何转成建筑格、城墙格、底盘格，会变成临时 if/else。
3. 同一对象的底盘、建筑、外围城墙、内部格线、hover/selection 都没有稳定 contract。

### 3.3 未来对象会持续返工

后面还要接：

- 系统城池多级 footprint
- 关口
- 要塞
- 码头
- 河流
- 山脉
- 州界与阻隔带

这些对象都不是“在资源格上临时叠个图”能解决的。继续用 A，会让后面每接一个对象都多一层特判。

## 4. 当前代码事实

以下是本计划编写时已经确认的代码事实。

### 4.1 `map_grid.gd` 已有分层绘制顺序

Godot 当前绘制顺序已经是：

1. `cell_base`
2. `resource_cell`
3. `world_node`
4. `debug_overlay`
5. `selection_overlay`
6. `hover_overlay`

这说明当前运行态天然更适合方案 B，而不是继续把所有对象塞回资源链。

### 4.2 `map_grid.gd` 已有“底盘 hook”，但没有正式生产者

`godot-client/scripts/map/map_grid.gd` 中：

- `_draw_world_cell_node()` 会先读 `_world_cell_city_base_by_tmx_key`
- 再画 anchor/building frame

这说明“底盘先画、建筑后画”的读取口已经存在，但还缺正式生产链。

### 4.3 城市已部分接近方案 B，非城市节点还没有

当前 manifest / export 链里：

- 城市已经有 footprint + composite + foundation/wall layer 的雏形
- `resource_1x1 / pass_1x1 / fort_1x1 / dock_1x1` 还没有完整进入同样的 composite contract

也就是说，现在代码是“城市半只脚进了 B，其他 world cell 还停在混合态”。

### 4.4 `_rebuild_world_cell_city_entries()` 只覆盖城池

当前 world-cell 预留与 anchor 生产主要还是围绕 city entries 重建。非城市的 pass / fort / dock / future river / mountain 还没有同等级别的正式 builder。

### 4.5 “建筑绑定到格”的辅助逻辑存在，但未接入运行时

`map_grid.gd` 内部已经存在按 group 内单格返回建筑元数据的辅助逻辑，但它还没有接入正式绘制链。  
当前主路径仍然更接近“整块 composite 渲染”，不是“逐格建筑绑定渲染”。

### 4.5 占地格命中代理还不完整

当前命中链会优先查 preview tile / 实际 tile，但普通 reserved footprint 还不是正式命中代理。  
这意味着方案 B 如果要真正可交互，必须把“被占用格 -> 锚点实体”的命中回跳补完整。

### 4.6 manifest 里已有 policy 字段，但运行时尚未完整消费

当前 footprint manifest 里已经有：

- `placement_policy`
- `draw_layer`
- `anchor_rule`
- `draw_order`

但运行时真正稳定消费的仍主要是：

- `footprint_tiles`
- `cell_offsets`
- `default_composite_id`

因此，当前很多 policy 仍然只是清单事实，不是统一执行事实。

### 4.7 `main.gd` 的定位应保持为运行态编排

`godot-client/scripts/app/main.gd` 目前负责：

- boot flow
- world / city display mode
- runtime orchestration
- 截图与运行入口

它不应该成为：

- tile 投影规则中心
- world cell 扩建规则中心
- 占地/命中/层级的业务中心

方案 B 的核心规则仍应落在 world-cell contract、manifest、`map_grid.gd` 的 world-cell builder 与 draw chain。

## 5. 目标架构

## 5.1 统一 world cell 语义

世界地图对象一律走统一 world cell 语义：

- `resource_1x1`
- `player_city_3x3_initial`
- `ai_city_3x3_initial`
- `system_city_l03_l04_3x3`
- `system_city_l05_l06_5x5`
- `system_city_l07_l08_7x7`
- `system_city_l09_9x9`
- `pass_1x1`
- `fort_1x1`
- `dock_1x1`
- `mountain_barrier_*`
- `river_corridor_*`

## 5.2 统一分层

每个 world cell 对象都应拆成至少以下层语义：

1. `base`
   - 占地底盘
   - 与 footprint 一一对应
   - 负责无缝接入地图格
2. `structure`
   - 建筑主体 / 资源主体 / 节点主体
   - 绑定到锚点 cell 或指定 cell
3. `perimeter`
   - 城墙外圈、边界线、节点边界强调
   - 默认只给需要外围边界的对象
4. `interaction`
   - hover / selection / debug / edit
   - 永远画在最上层

对于资源地，`base` 不等于“额外浅色底盘”。  
资源地的 base 可以是资源对象自身的地面承托，但必须满足：

- 不额外生成一块浅色盘子
- 不重新露出旧地图贴图
- 不让资源 PNG 漂浮

## 5.3 统一占地

所有 world cell 对象先做 footprint reservation，再做资源生成：

1. 山脉 / 河流 / 水域通道
2. 玩家主城 / AI 主城 / 系统城池 / 关口 / 要塞 / 码头
3. 粮 / 木 / 石 / 铁资源地
4. 其他普通空地或未来可开发空地

这条顺序是为了避免任何对象后续叠在资源格上。

## 5.4 统一交互

交互命中必须遵守：

1. 占地内任意 cell 都能命中到所属 world cell anchor / entity。
2. 默认展示与交互展示分离。
3. 内部格线不是常驻视觉，只有交互态、debug 态或编辑态才显示。

## 6. 重点对象的正式口径

### 6.1 资源地 `1x1`

资源地不是 UI 装饰，而是 world cell 基础显示的一部分。

要求：

1. 严格贴合一个菱形格单位。
2. 继续使用后端 authority 的 `resourceKind/resourceLevel`。
3. level clamp 到 `1-9`。
4. 客户端不生成随机资源分布。
5. 不出现额外底盘。
6. 不压住 hover / selection。

正式实现方向：

- 资源也进入统一 world cell composite contract。
- 资源主体与资源占地地面属于同一个正式对象，而不是继续挂在临时 resource overlay 历史链上作为长期实现。

### 6.2 玩家主城 / AI 主城 `3x3`

要求：

1. footprint 固定 `3x3`
2. 初始只在中心格放城主府
3. 9 格底盘颜色统一、大小统一、无缝缝入地图
4. 默认只画外围城墙线
5. 内部格线只在交互态出现
6. 扩建后，周围 8 格从预留城市格转成正式建筑格

### 6.3 系统普通城池

要求：

1. 只使用奇数 footprint，保证唯一中心格
2. 等级与 footprint 对应：
   - L03-L04 = `3x3`
   - L05-L06 = `5x5`
   - L07-L08 = `7x7`
   - L09 = `9x9`
3. 默认只画外围城墙线
4. 内部格线只在交互态出现
5. 中心格放城主府；非中心格按等级和模板决定扩建建筑

### 6.4 关口 / 要塞 / 码头 `1x1`

要求：

1. 视觉体量允许显得厚重，但实际投影必须收进单格 footprint
2. 不允许超出一个格子的正式占地语义
3. 码头必须和水域 contract 对齐，但不依赖后叠的错误水面覆盖
4. 关口保留 SW / SE 双朝向 frame
5. 关口 / 要塞 / 码头当前正式目标仍是 `1x1`，不得因为参考城池分层结构就改成 `3x3`
6. 参考城池结构只指“底盘格 + payload slot 绑定 + overlay 置顶”的绘制模型，不代表关口 / 要塞 / 码头继承城池的大 footprint

### 6.5 河流 / 山脉

现阶段先定义 contract：

1. 先预留 footprint
2. 先阻止资源生成
3. 视觉可以先占位
4. 后续再补正式资产 frame

## 7. 当前缺口清单

## 7.1 contract 缺口

还缺：

1. 非城市 world cell 的 `default_composite_id`
2. 明确的 layer semantics：`base / structure / perimeter / interaction`
3. “资源地也是正式 world cell composite”的明示 contract
4. 占地格命中代理 contract
5. 扩建后周边格从 `reserved city cell -> actual building/base cell` 的转化 contract
6. `placement_policy` 从“manifest 文本”升级为“运行时统一执行规则”
7. `composite <-> footprint` 的一致性校验 contract

## 7.2 runtime 缺口

还缺：

1. `_world_cell_city_base_by_tmx_key` 的正式生产者
2. 非城市节点 builder
3. reserved footprint 到 anchor 实体的正式命中代理
4. 城市内部格的基础/建筑/城墙的统一 draw builder
5. 资源地正式迁入 world cell composite 后的兼容切换策略
6. 建筑格绑定渲染的正式接线，而不是只保留辅助函数
7. 扩建状态驱动的格类型切换模型

## 7.3 资产链缺口

还缺：

1. 资源地 base / structure 关系定义
2. 关口 / 要塞 / 码头进入统一 composite 语义
3. 系统城池 `5x5 / 7x7 / 9x9` 的统一底盘/外围城墙模板
4. 河流 / 山脉的基础占位 frame 规范
5. “固定底盘层 + 建筑绑定布局清单 + 阶段态映射”的正式导出产物

## 8. 分阶段改造顺序

## 8.1 Phase 0：文档 cutover

本阶段目标：

1. 把方案 B 写成唯一正式路线
2. 把方案 A 降为历史验证路线
3. 所有关联 authority / contract / workstream 文档显式回链本计划

正式完成条件：

- 后续 AI 窗口只要读 world-cell 相关 authority 文档，就不会再把 A 当正式方案。

## 8.2 Phase 1：contract 归一

本阶段要做：

1. 补齐 `world_cell_footprint_manifest_v1.json` 的对象 contract
2. 补齐 `world_cell_assets_manifest_v1.json` 的 composite contract
3. 定义非城市对象的 `default_composite_id`
4. 定义 layer 语义与 draw order
5. 定义资源地进入统一 composite 的兼容方案
6. 明确哪些 policy 字段需要被运行时真正消费
7. 明确 composite 与 footprint 的一致性校验方式

输出：

- 可被 `map_grid.gd` 直接消费的正式 contract

## 8.3 Phase 2：runtime builder 改造

本阶段要做：

1. 把 `_world_cell_city_base_by_tmx_key` 接成正式生产链
2. 把 world cell builder 从“只有 city”扩成“city + resource + pass + fort + dock + placeholder river/mountain”
3. 把 reserved footprint 命中代理补齐
4. 保持 hover / selection 继续在最上层
5. 把“建筑绑定到格”的辅助逻辑接成正式渲染链
6. 让 `placement_policy` 不再只是 scattered `if reserved then skip`

输出：

- `map_grid.gd` 不再依赖“叠建筑 PNG”来表达正式 world cell

## 8.4 Phase 3：玩家城池与系统城池闭环

本阶段要做：

1. 玩家/AI 主城 `3x3`：中心 hall only 初始态
2. 系统普通城池按等级切 `3x3 / 5x5 / 7x7 / 9x9`
3. 默认只画外围城墙线
4. 内部格线只在交互态出现
5. 扩建转格规则接入运行态
6. 明确扩建状态来源，是后端下发还是运行时临时态

输出：

- 城池从“摆图”变成“占地 + 底盘 + 建筑绑定 + 扩建转格”

## 8.5 Phase 4：关口 / 要塞 / 码头 / 河流 / 山脉并轨

本阶段要做：

1. 关口 / 要塞 / 码头进入同一套 composite contract
2. 河流 / 山脉先走 reservation + placeholder
3. 后续再补正式 frame，不影响当前 contract

输出：

- 世界地图对象统一走一套 contract，不再各走各的特殊链

## 9. 验证链

本计划后续每个阶段都必须优先复用正式入口：

```text
npm run godot:headless:smoke -- --scene res://scenes/app/main.tscn
npm run godot:mainline:runtime -- --quit-after 1
npm run gate:godot:week1
npm run gate:godot:week1:compat:debug-only
```

要求：

1. `week1` 和 `compat` 必须串行跑
2. 若 `week1` 因 `/api status=-1` 失败，可临时启动 `npm run start` 只用于验证，验证后停止服务
3. 必须补运行截图，能看清：
   - 资源地拼接
   - 城池底盘
   - 建筑绑定
   - hover / selection 层级

### 9.1 nodes 截图验收口径（2026-04-24 补充）

本节用于防止后续窗口再次混淆 `nodes_formal` 与 `nodes spec/interaction` 图。

1. `world_cell_runtime_preview_capture_nodes_formal_crop.png` 是 clean formal contract 图。
2. `world_cell_runtime_preview_capture_nodes_crop.png` 是 spec / interaction 图，会包含 hover、selection、命中演示，也可能包含山脉 / 河流 placeholder。
3. 2026-04-24 本轮人工验收中，旧的 `nodes_formal_crop.png` 视觉未通过，不能再被标记为“最新通过图”。
4. 2026-04-24 本轮人工认可的是后一种 `nodes spec / interaction` 方向图；后续若要交付 formal，必须重新生成一张不混入 placeholder、但视觉表现对齐该方向的 clean formal 图。
5. 后续回复必须明确区分截图 variant：
   - `formal`：干净 contract 图，适合做最终 clean 对比，但必须单独人工确认
   - `spec` / interaction：用于验证 hover / selection / hit / reserved footprint，不得冒充 live backend 回归
   - live backend：只有后端真实吐出 `pass / fort / dock` 后，才可称为非 preview runtime 回归图
6. 不得把未通过的 `nodes_formal_crop.png` 贴为“通过项”或“最新结果”；如果 formal 与 spec 结论不一致，必须在回复中显式说明差异和待修项。

## 10. 非目标

本计划明确不包含：

1. 后端资源生成算法重写
2. AI 玩家资源输送
3. 国战 / 事件 / 活动页
4. `native_slg_shell` 主壳样式
5. Web 原型
6. 任何把世界地图对象重新压回 resource overlay 作为正式长期方案的改法

## 11. 执行原则

1. 先改 contract，再改 runtime builder，再改视觉资产接入。
2. 不允许为了快，把非资源节点继续借 `resourceKind/resourceLevel` 表达。
3. 不允许把“临时 preview 摆图”写成正式 authority。
4. 不允许让后续窗口从文档里读出“方案 A 还是可继续正式推进”的错误结论。

## 12. 当前下一步

按本计划，下一步应直接进入：

1. Phase 1：contract 归一
2. 然后进入 Phase 2：runtime builder 改造

先把 world cell 的正式 contract 站稳，再继续资源地、城池、关口、要塞、码头、河流、山脉的资产接入。
