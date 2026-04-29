# AI 后端执行计划（2026-04-19）

## 1. 目标

本计划文档只服务于 AI 玩家 / 后端系统主线。

关注范围：

- `server/src/**`
- `shared/**`
- 必要时的 Godot adapter / presenter 消费合同确认

明确不做：

- `godot-client/scenes/ui/**` 布局调整
- battle report 布局
- 主壳按钮样式
- SVG / 页面排版

## 2. 当前主线目标

1. 持续下钻 `advanceTick` 的真实热点，而不是扩 UI。
2. 稳定 `runtime-load / runtime-capacity / mainline` 正式验证链。
3. 防止重型 gate 和压测再次把本机内存、commit、驱动进程一起挤爆。

## 3. 安全清场方案

### 3.1 执行前检查

每次跑重型 gate 前，必须先做以下检查：

1. 确认 Windows 已处于稳定状态。
2. 确认没有上轮残留的 `node.exe / tsx / test server` 进程。
3. 确认没有并行中的本仓库 HTTP server / websocket load / combo load。
4. 确认当前只跑一条重型正式链，不与其它 gate 并行。

### 3.2 清场原则

如果发现残留测试进程：

1. 先识别是否为本仓库 `C:\\Users\\26739\\Desktop\\8989` 的测试 / gate / app 进程。
2. 只清本仓库相关残留，不误伤用户其它工作负载。
3. 清完后再启动下一条 gate。

### 3.3 严禁事项

- 严禁并行跑 `gate:ai:runtime-load`、`gate:ai:runtime-capacity`、`gate:ai:mainline:stability`。
- 严禁在 `runtime-load` 过程中再起新的 combo/load/http 合同测试。
- 严禁把多条重型 Node 门禁堆在同一轮并行执行。

## 4. 串行 gate 策略

重型正式链按以下顺序执行：

1. `npm run build`
2. `npm run test:ai:runtime-observability`
3. `npm run test:ai:runtime-http-contract`
4. `npm run test:world:mutation-load`
5. `npm run test:runtime:combo-load`
6. `npm run gate:ai:runtime-load`
7. `npm run gate:ai:runtime-capacity`
8. `npm run gate:ai:mainline:stability`
9. `npm run gate:godot:week1`

执行规则：

- 上一条未结束，不启动下一条。
- 若上一条出现 OOM / 超时，先记录，再回到清场步骤。
- 不允许“边跑 gate 边继续开新的压力测试”。

## 5. 内存保护策略

### 5.1 原则

- 优先减少并行度，而不是继续叠加更大压力。
- 先确认是否是进程残留或并发门禁导致的 OOM，再判断是否为代码回归。
- 如果 `mainline` 或 `runtime-capacity` 因 Node 堆限制失败，可临时提高 `NODE_OPTIONS=--max-old-space-size=4096` 复核，但要在结果里明确说明。

### 5.2 OOM 处理步骤

1. 记录是哪条正式入口报错。
2. 记录是否出现 `JavaScript heap out of memory`、`Data cannot be cloned, out of memory`、长时间无退出。
3. 检查 gate 产物是否已写出。
4. 若产物已写出，区分“测试逻辑失败”和“进程清理/退出失败”。
5. 重新清场后串行复跑，不立刻做结论。

## 6. 当前后端下钻优先级

当前继续优先处理：

1. `advance_world_state.directors_and_theater`
2. `reflect_world_tick.collect_context`
3. `advance_world_state.commit_world_state.record_intel_diff`

更细一级的优先点：

1. `buildTheaterSnapshot -> summarize_macro_regions`
2. `build_report_drafts.match_tiles`
3. `record_intel_diff.scan_next_intel.compare_entries`

## 7. 当前执行纪律

本轮开始后，默认遵守：

- 先清场，再 gate。
- 先串行，再结论。
- 先后端主线，再 UI。
- 若只影响 UI，不在本窗口顺手处理。

