# NATIVE_SLG_SHELL_HANDOFF_2026_04_20

## 0. 目的

这份文档是 `native_slg_shell / 主壳文案单源 / runtime HUD 合同化 / 主壳与 SLG 参考 UI 对齐` 这一条线的最新交接文档。  
用途：

- 给新窗口里的 AI 直接接手
- 让 Obsidian 内能快速恢复上下文
- 减少再次回溯长线程造成的运行时压力

补充总览文档：

- [docs/GODOT_UI_STRUCTURE_PROGRESS_SUMMARY_2026_04_19.md](GODOT_UI_STRUCTURE_PROGRESS_SUMMARY_2026_04_19.md)
- [docs/GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md](GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md)
- [docs/NATIVE_SLG_SHELL_KNOWLEDGE_MAP_2026_04_20.md](NATIVE_SLG_SHELL_KNOWLEDGE_MAP_2026_04_20.md)
- [docs/NATIVE_SLG_SHELL_KNOWLEDGE_MAP_2026_04_20.json](NATIVE_SLG_SHELL_KNOWLEDGE_MAP_2026_04_20.json)
- [docs/NATIVE_SLG_SHELL_AI_QUICK_ENTRY_2026_04_20.json](NATIVE_SLG_SHELL_AI_QUICK_ENTRY_2026_04_20.json)

---

## 1. 必读顺序

新窗口继续前，先按这个顺序读：

1. `C:\Users\26739\Desktop\8989\AGENTS.md`
2. `C:\Users\26739\Desktop\8989\docs\AGENTS_EXECUTION_CURRENT_2026_04.md`
3. `C:\Users\26739\Desktop\8989\CODEX.md`
4. `C:\Users\26739\Desktop\8989\docs\GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md`
5. 本文档
6. `C:\Users\26739\Desktop\8989\docs\NATIVE_SLG_SHELL_KNOWLEDGE_MAP_2026_04_20.md`
7. `C:\Users\26739\Desktop\8989\docs\NATIVE_SLG_SHELL_KNOWLEDGE_MAP_2026_04_20.json`
8. `C:\Users\26739\Desktop\8989\docs\NATIVE_SLG_SHELL_AI_QUICK_ENTRY_2026_04_20.json`
9. 如需更大背景，再看：
   - `C:\Users\26739\Desktop\8989\docs\GODOT_UI_STRUCTURE_PROGRESS_SUMMARY_2026_04_19.md`

---

## 2. 当前范围与硬边界

当前只做这一条线：

- `native_slg_shell`
- 主壳文案单源
- runtime HUD 从产品主壳剥离
- 主壳与本地视频/截图和主流 SLG 参考的层级、比例、密度对齐

不要扩到这些边界：

- `server/src/**`
- `shared/**`
- AI 玩家执行系统
- 服务器容量/并发治理
- 地图性能/材质装饰线
- 编辑器插件、Web 原型、后端故障排查

---

## 3. 已完成内容

### 3.1 更大 UI 结构线

更大范围的 `battle_report / alliance / interior / recruit / general / ai` 收口已经做过，详见：

- [docs/GODOT_UI_STRUCTURE_PROGRESS_SUMMARY_2026_04_19.md](GODOT_UI_STRUCTURE_PROGRESS_SUMMARY_2026_04_19.md)

当前这次 handoff 只聚焦 `native_slg_shell`。

### 3.2 native_slg_shell 已完成的关键事实

#### A. runtime HUD 已经从 NativeShell 剥离

之前 `MapHover / Perf / ExportStatus / RuntimeLabel` 在 `NativeShell` 里。现在已经拆走：

- `C:\Users\26739\Desktop\8989\godot-client\scenes\app\main.tscn`
- `C:\Users\26739\Desktop\8989\godot-client\scripts\app\main.gd`
- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\native_slg_shell.gd`
- `C:\Users\26739\Desktop\8989\godot-client\scenes\ui\native_slg_shell.tscn`

现在 runtime/dev HUD 在 `main.tscn` 的独立 `HoverLayer`，不再属于产品主壳。

#### B. native_slg_shell 场景里的重复默认文案已大幅收回脚本单源

当前 `.tscn` 不再承担大批动态默认文案；主要文案由：

- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\native_slg_shell.gd`
- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\presenters\native_shell_presenter.gd`

单源提供。

#### C. 主入口按钮/utility 按钮文案已收回脚本

`内政 / 招募 / 武将 / 同盟 / AI / 战报 / 活动 / 帮助` 这批按钮文案不再在 scene 本体里双持。

#### D. LeftRail 已继续从“摘要板”往“任务条 + 队列感”推进

这轮最新已做：

- presenter 把 `taskBody / cityStateSummary / cityTechSummary / troopSummary` 再压薄
- shell 里把左栏顺序重排成：
  1. `TaskHeaderRow`
  2. `TaskBody`
  3. `TroopSectionTitle`
  4. `TroopSummary`
  5. `TroopSlotList`
  6. `CityStateTitle`
  7. `CityStateSummary`
  8. `CityTechSummary`
  9. `InteriorQuickLinks`
- `TroopSlot` 文本改成更像两行队列卡片

#### E. TopStrip / CenterStage / BottomNav 又压过一轮比例

当前方向是：

- `TopStrip` 更薄
- `CenterStage` 更小、更弱说明卡感
- `BottomNav` 更像左下入口簇，不再那么像侧向操作面板

---

## 4. 当前代码事实

### 4.1 关键文件

- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\presenters\native_shell_presenter.gd`
- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\native_slg_shell.gd`
- `C:\Users\26739\Desktop\8989\godot-client\scenes\ui\native_slg_shell.tscn`
- `C:\Users\26739\Desktop\8989\godot-client\scripts\app\main.gd`
- `C:\Users\26739\Desktop\8989\godot-client\scenes\app\main.tscn`

### 4.2 native_slg_shell 最新落点

当前已经可以假定这些事实为真：

- `native_slg_shell.gd` 里已经没有 `set_runtime_hud_contract(...)`
- runtime HUD 不再挂在 `NativeShell`
- `LeftRail` 已经通过 `_reorder_left_rail_layout()` 做了左栏结构重排
- `set_city_overview(...)` 现在更偏单行压缩，不再把左栏当大段说明板
- `set_troop_summary(...)` 目前标题是 `队列`
- `CenterStage` 在 `city` 模式下进一步弱化：
  - `StageBody` 不再是主城模式下的主要可见块
  - `CityFocus / EntryStatus / EntryGrid` 才是主城模式核心

### 4.3 这一轮具体文件变化

最新一轮主要改动文件：

- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\presenters\native_shell_presenter.gd`
- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\native_slg_shell.gd`
- `C:\Users\26739\Desktop\8989\godot-client\scenes\ui\native_slg_shell.tscn`

---

## 5. 正式验证链

这条线继续时，优先复用正式入口，不要自己造临时脚本。

推荐顺序：

```powershell
npm run godot:headless:smoke -- --scene res://scenes/ui/native_slg_shell.tscn
npm run godot:mainline:runtime -- --quit-after 1
npm run gate:godot:week1
npm run gate:godot:week1:compat:debug-only
```

注意：

- `week1` 和 `compat` 不要并行跑
- 之前并行时出现过一次 `template-replay-seed` 假红，不是 UI 回归，是资源竞争
- 串行复跑后已经恢复绿

最新通过结果：

- `C:\Users\26739\Desktop\8989\tmp\gates\godot_week1_gate_20260420_110900.json`
- `C:\Users\26739\Desktop\8989\tmp\gates\godot_week1_gate_20260420_110911.json`

---

## 6. 本机注意事项

### 6.1 编码

- 中文读写一律优先 `python` + `encoding='utf-8'`
- 禁止 shell 重定向直接改中文文件
- 改完必须做 UTF-8 回读

### 6.2 运行环境差异

本机这次会话里已经碰到过：

- `py` 不在 PATH
- `rg.exe` 偶发 `Access is denied`
- Codex 长线程中途出现过 allocator failure / memory allocation failed

建议：

- Python 直接用 bundled runtime：
  - `C:\Users\26739\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`
- 搜索失败时优先用：
  - `Select-String`
  - 或 bundled python 读文件

### 6.3 上下文稳定性

这个主题在旧窗口已经跑了很长时间，并且出现过 Codex 运行时内存错误。  
因此：

- 建议新窗口继续
- 新窗口只做 `native_slg_shell`，不要顺手扩到别的主题

---

## 7. 当前最值钱的后续任务

### 第一优先级

把 `LeftRail` 再从“压缩后的摘要板”推进到更像真实手游的：

- 任务条
- 队列条
- 五队卡列

更具体地说：

- 继续减少 `taskBody / cityStateSummary / cityTechSummary` 的文字面板气质
- 让 `TroopSlotList` 成为左栏真正主视觉
- 如果要补结构，优先补更像条目/胶囊/状态条的表达，而不是再堆多行说明文字

### 第二优先级

继续弱化 `CenterStage` 的菜单板感：

- 主城模式下尽量少靠长说明占视觉
- 让地图继续成为主视区
- `EntryGrid` 保持入口语义，但不要让它重新变成主菜单卡片

### 第三优先级

继续压 `TopStrip / BottomNav` 的视觉角色：

- `TopStrip` 更像薄状态带
- `BottomNav` 更像左下功能簇
- `UtilityRow` 不要和主导航抢权重

---

## 8. 不建议现在做的事

当前不要切去：

- battle_report
- alliance/interior 结构线
- 后端 runtime 故障
- Godot 编辑器插件
- Web 原型
- 另一个 UI 域

否则上下文会重新发散，窗口又会变重。

---

## 9. 可直接复制的新窗口提示词

下面这段可以直接给新窗口：

```text
继续在这个窗口里只做 native_slg_shell 这条线，不要切去别的主题。

先按顺序读取：
1. C:\\Users\\26739\\Desktop\\8989\\AGENTS.md
2. C:\\Users\\26739\\Desktop\\8989\\docs\\AGENTS_EXECUTION_CURRENT_2026_04.md
3. C:\\Users\\26739\\Desktop\\8989\\CODEX.md
4. C:\\Users\\26739\\Desktop\\8989\\docs\\GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md
5. C:\\Users\\26739\\Desktop\\8989\\docs\\NATIVE_SLG_SHELL_HANDOFF_2026_04_20.md

当前范围只允许围绕：
- native_slg_shell
- 主壳文案单源
- runtime HUD 已经从主壳剥离后的继续收口
- 主壳与本地视频/截图、主流 SLG UI 的层级/比例/密度对齐

不要扩到：
- server/src/**
- shared/**
- AI 玩家系统
- 编辑器插件
- Web 原型
- 其他 UI 域

先只读确认下面几个文件的最新状态：
- C:\\Users\\26739\\Desktop\\8989\\godot-client\\scripts\\ui\\presenters\\native_shell_presenter.gd
- C:\\Users\\26739\\Desktop\\8989\\godot-client\\scripts\\ui\\native_slg_shell.gd
- C:\\Users\\26739\\Desktop\\8989\\godot-client\\scenes\\ui\\native_slg_shell.tscn
- C:\\Users\\26739\\Desktop\\8989\\godot-client\\scripts\\app\\main.gd
- C:\\Users\\26739\\Desktop\\8989\\scenes\\app\\main.tscn

当前已知事实：
- runtime HUD 已经不在 NativeShell，而在 main.tscn 的 HoverLayer
- LeftRail 已经重排成更偏任务条/队列感的顺序
- StageBody 在 city 模式下已经被弱化
- TopStrip / CenterStage / BottomNav 已经再压过一轮比例
- week1 / compat 已绿

当前最值钱的任务：
1. 继续把 LeftRail 从“压缩摘要板”推进到更像真手游的“任务条 + 队列条 + 五队卡列”
2. 继续弱化 CenterStage 的菜单板感，让地图更像主视区
3. 继续校正 TopStrip / BottomNav 的视觉角色，不让 UtilityRow 抢主导航层级

开发要求：
- 可以开多个子代理，但子代理只能只读审计，先读对应 docs，禁止再次创建子代理
- 主代理自己改码
- 中文读写一律用 utf-8
- 修改后必须做 UTF-8 回读
- 正式验证只用：
  - npm run godot:headless:smoke -- --scene res://scenes/ui/native_slg_shell.tscn
  - npm run godot:mainline:runtime -- --quit-after 1
  - npm run gate:godot:week1
  - npm run gate:godot:week1:compat:debug-only
- week1 和 compat 必须串行跑，不能并行

本机注意事项：
- py 可能不在 PATH
- rg 可能偶发 Access is denied
- 如果要读中文文件，优先用 bundled python：
  C:\\Users\\26739\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe
- 这个主题之前在长线程里出现过 Codex allocator/memory 错误，所以保持单轴，不要扩题

最终输出仍按：
通过项 / 风险项 / 阻塞项 / 下一步

并额外告诉我：
- 这轮有没有上下文污染迹象
- 是否还适合继续留在同一个窗口
```

---

## 10. 简短结论

这条线现在已经不是“先修结构债”，而是开始进入：

- 主壳视觉角色收口
- 主壳与 SLG 参考样式对齐
- 把左栏真正从摘要板改成任务条/队列栏

新窗口应该继续做这一条，不要跳题。
