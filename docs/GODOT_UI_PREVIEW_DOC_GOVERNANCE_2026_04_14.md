# Godot UI Preview 文档治理（第二轮，2026-04-14）

> 状态：历史 / preview 侧线治理文档。  
> 当前产品主线已切回原生 SLG 客户端，不再以 preview 文档为默认入口。  
> 现行主线请改读：[NATIVE_SLG_MAINLINE_INDEX.md](NATIVE_SLG_MAINLINE_INDEX.md)

## 1. 目的

这份文档用于把 `UI Preview Sandbox` 相关文档压成三层，减少新窗口和新代理在 `docs/` 里的首读噪声。

本轮治理只处理 `UI Preview Sandbox` 主线，不处理整仓所有 Godot 文档。

## 2. 三层规则

### 2.1 current execution

这层是默认最小上下文，代表“当前正式执行口径”。

默认先读：

1. [GODOT_UI_PREVIEW_THREE_LINE_INDEX_2026_04_14.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_THREE_LINE_INDEX_2026_04_14.md)
2. [GODOT_UI_PREVIEW_SANDBOX_ARCHITECTURE_2026_04_12.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_SANDBOX_ARCHITECTURE_2026_04_12.md)
3. [GODOT_UI_PREVIEW_SANDBOX_STORY_SPEC_2026_04_12.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_SANDBOX_STORY_SPEC_2026_04_12.md)
4. [GODOT_UI_PREVIEW_DOC_GOVERNANCE_2026_04_14.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_DOC_GOVERNANCE_2026_04_14.md)

使用原则：

1. 新窗口默认只读这层，不默认吞 `handoff` 和 `archive evidence`。
2. 判断正式入口、story 链、validator、regression、editor plugin 时，以这层为准。
3. 若与代码事实冲突，以代码和正式入口验证为准。

### 2.2 handoff

这层是“交接/模块上下文层”，只在需要继续某条 UI 主线、组件语义或视觉收口时再读。

当前归入 handoff：

1. [GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md)
2. [GODOT_MAP_MACRO_COMPONENTS_2026_04_13.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_MAP_MACRO_COMPONENTS_2026_04_13.md)
3. [GODOT_PROVINCE_WARZONE_PREFAB_SEMANTICS_2026_04_13.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_PROVINCE_WARZONE_PREFAB_SEMANTICS_2026_04_13.md)
4. [GODOT_MAP_SURFACE_GENERALPIC_PACK_2026_04_13.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_MAP_SURFACE_GENERALPIC_PACK_2026_04_13.md)

使用原则：

1. 继续 `map_surface / province / warzone / nation / ui_canvas` 收口时再读。
2. 这层主要解决“怎么接着上个窗口干”，不是定义正式链。
3. 若 handoff 口径与 current execution 不一致，以 current execution 为准。

### 2.3 archive evidence

这层是“证据/审计/阶段性验证层”，默认不进最小上下文，只在对账、审计、追溯时读取。

当前归入 archive evidence：

1. [GODOT_SLG_UI_PHASE1_VALIDATION_2026_04_12.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_SLG_UI_PHASE1_VALIDATION_2026_04_12.md)
2. [GODOT_MAP_SURFACE_SOURCE_AUDIT_2026_04_13.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_MAP_SURFACE_SOURCE_AUDIT_2026_04_13.md)

使用原则：

1. 不作为新窗口首读入口。
2. 只在回答“当时怎么验证”“素材从哪来”“那轮审计结论是什么”时再读。
3. 这层用于补证据，不用于驱动当前执行。

## 3. 当前不纳入这三层的 Godot 文档

以下文档与 `UI Preview Sandbox` 有关系，但不属于本次三层治理主范围：

1. [GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md)
2. [GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md)
3. [GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md)
4. [GODOT_AI_PLAYER_ANIMATION_FALLBACK_2026_04_10.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_AI_PLAYER_ANIMATION_FALLBACK_2026_04_10.md)

原因：

1. 它们要么是 broader Godot 控制面，要么是视觉替换主链，要么是 AI 动画兜底，不等于 `UI Preview Sandbox` 文档主线。
2. 它们可在三线索引或 quick-nav 中按需进入，但不应默认塞进 UI Preview 最小上下文。

## 4. 新窗口推荐读取顺序

### 4.1 只想确认正式链

1. [AGENTS.md](C:/Users/Buffoon%20Queer/Desktop/8989/AGENTS.md)
2. [AGENTS_EXECUTION_CURRENT_2026_04.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/AGENTS_EXECUTION_CURRENT_2026_04.md)
3. [GODOT_UI_PREVIEW_THREE_LINE_INDEX_2026_04_14.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_THREE_LINE_INDEX_2026_04_14.md)
4. [GODOT_UI_PREVIEW_DOC_GOVERNANCE_2026_04_14.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_DOC_GOVERNANCE_2026_04_14.md)

### 4.2 要继续 UI 主线开发

1. 先读 4.1
2. 再读 [GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md)
3. 再按当前模块选读 `MAP_MACRO_COMPONENTS / PREFAB_SEMANTICS / GENERALPIC_PACK`

### 4.3 要做历史追溯或审计

1. 先读 4.1
2. 再读 `archive evidence`
3. 必要时再补 `GODOT_MCP_CLI_CONTROL_SURFACE / VISUAL_*`

## 5. 第二轮治理结论

1. `UI Preview Sandbox` 主线现在可以按 `current execution / handoff / archive evidence` 三层读取。
2. 新窗口默认不应把 `handoff` 和 `archive evidence` 整包吞入。
3. `three-line index` 已成为这条主线的最短入口。
