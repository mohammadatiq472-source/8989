# Godot AI 管理页横屏移动端验收记录（2026-04-28）

> 状态：已接入主线 visual smoke 验证。  
> 读取时机：当任务涉及 Godot `AI` 二级面板、AI玩家页、聊天记忆、主界面聊天频道桥接、或 `godot:mainline:visual-smoke --click-action ai_panel_open_chat_channel` 时读取。  
> 边界：只覆盖 Godot UI / Godot 读取适配 / visual smoke。不要据此改后端合同、provider pool、BYOK、外部 scheduler、`WorldService` 或 `shared/domain/rules`。

## 1. 本轮已完成

1. `AI` 管理页移动横屏布局已经从工程字段展示改为玩家阅读优先：
   - 第一屏只消费并展示 `modelStatus` 关键信息：模型名、来源、预算档位、secret configured、fallback 状态。
   - 侧边栏承接分区导航，减少第一屏说明文字密度。
   - 候选动作、失败原因、战报、提案按玩家阅读优先级重排，不再堆成工程日志。
2. 原 `军师` 语义已收口为 `AI玩家`：
   - UI 文案不再把 AI 角色称为“军师”。
   - `AI玩家` 子页用于头像、名称、身份文件入口。
   - 图片上传入口暂不开放真实识别炼入；当前优先使用已有头像或自选头像，避免绕过审核链。
3. 原 `聊天记录` 已收口为 `聊天记忆`：
   - 上半部分显示记忆摘要与后续关注点。
   - 下半部分默认折叠最近对话，避免把聊天流水压到第一眼。
   - 聊天内容复用主界面聊天频道历史读取适配层。
4. 主聊天入口保持在主界面聊天频道：
   - AI 管理页内新增 `打开聊天频道` 按钮。
   - 点击后关闭 AI 管理页，并打开主界面聊天频道。
   - AI 管理页只负责回看、摘要、身份与状态管理，不作为新的聊天输入主入口。
5. visual smoke 新增白名单点击动作：
   - 参数：`--click-action ai_panel_open_chat_channel`
   - 只允许点击 AI 管理页内文本为 `打开聊天频道` 的可见按钮。
   - 验证目标：点击后 `panelClosed=true`、`chatOverlayVisibleAfter=true`、`activePanelId=""`。

## 2. 关键文件

本记录对应的 Godot UI / visual smoke 文件：

1. `godot-client/scripts/ui/presenters/ai_panel_presenter.gd`
   - AI 管理页结构与文案。
   - `聊天记忆` 页面摘要、折叠最近对话、`打开聊天频道` 按钮 payload。
   - `AI玩家` 子页头像、名称、身份文件入口。
2. `godot-client/scripts/ui/ai_panel.gd`
   - 处理 `ai_player_open_chat_channel` 动作。
   - 查找 `MainChatOverlay` 并调用 `open_ai_player_channel(...)`。
3. `godot-client/scripts/ui/slg_snapshot_section_page.gd`
   - 通用 snapshot 子页渲染。
   - 新增折叠聊天时间线内容块 `collapsible_chat_timeline`。
4. `godot-client/scripts/ui/main_chat_overlay.gd`
   - 新增 `open_ai_player_channel(ai_player_id := "")`，供 AI 管理页跳回主聊天频道。
5. `godot-client/tools/run_mainline_visual_smoke.py`
   - 新增 `--click-action ai_panel_open_chat_channel` 白名单参数。
   - 传递 `SLG_MAINLINE_VISUAL_SMOKE_CLICK_ACTION` 给 Godot 运行时。
6. `godot-client/scripts/app/main.gd`
   - visual smoke 运行时执行白名单点击动作。
   - 注意：该文件是主壳热文件，历史上已有大量并行改动；后续窗口只应在明确需要 smoke 编排时改这里。

## 3. 正式验证入口

### 3.1 AI 管理页打开并显示聊天记忆

1600x900：

```powershell
npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --window-width 1600 --window-height 900 --evidence-dir tmp/screenshots/ai_panel_chat_memory_final_20260428_1600x900 --timeout-sec 90
```

2388x1080：

```powershell
npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --window-width 2388 --window-height 1080 --evidence-dir tmp/screenshots/ai_panel_chat_memory_final_20260428_2388x1080 --timeout-sec 90
```

证据截图：

1. `tmp/screenshots/ai_panel_chat_memory_final_20260428_1600x900/01_ready_world_hub_panel.png`
2. `tmp/screenshots/ai_panel_chat_memory_final_20260428_2388x1080/01_ready_world_hub_panel.png`

### 3.2 点击“打开聊天频道”并回到主聊天频道

1600x900：

```powershell
npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --click-action ai_panel_open_chat_channel --window-width 1600 --window-height 900 --evidence-dir tmp/screenshots/ai_panel_open_chat_channel_click_20260428_1600x900 --timeout-sec 90
```

2388x1080：

```powershell
npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --click-action ai_panel_open_chat_channel --window-width 2388 --window-height 1080 --evidence-dir tmp/screenshots/ai_panel_open_chat_channel_click_20260428_2388x1080 --timeout-sec 90
```

通过条件写在 `mainline_visual_smoke_summary.json`：

```json
{
  "clickAction": "ai_panel_open_chat_channel",
  "clickActionRequirementOk": true,
  "clickActionResult": {
    "clicked": true,
    "panelClosed": true,
    "chatOverlayVisibleAfter": true,
    "activePanelId": "",
    "reason": "chat_channel_open"
  }
}
```

证据截图：

1. `tmp/screenshots/ai_panel_open_chat_channel_click_20260428_1600x900/01_after_ai_panel_open_chat_channel.png`
2. `tmp/screenshots/ai_panel_open_chat_channel_click_20260428_2388x1080/01_after_ai_panel_open_chat_channel.png`

### 3.3 基础启动链

```powershell
npm run godot:headless:smoke
```

当前通过，仍有既有 Godot 退出警告：

```text
WARNING: ObjectDB instances leaked at exit (run with --verbose for details).
```

该 warning 是既有风险，不是本轮 AI 管理页布局或 visual smoke 点击动作新增。

## 4. 后续窗口注意事项

1. 不要再把这件事标记为“未做”：
   - AI 管理页横屏移动端布局已进入可验收状态。
   - `聊天记忆` 已接入主聊天频道历史读取适配。
   - `打开聊天频道` 已有正式 visual smoke 点击验证。
2. 后续如果继续微调，只允许在 Godot UI / visual smoke 白名单内做：
   - `godot-client/scripts/ui/presenters/ai_panel_presenter.gd`
   - `godot-client/scripts/ui/ai_panel.gd`
   - `godot-client/scripts/ui/slg_snapshot_section_page.gd`
   - `godot-client/scripts/ui/main_chat_overlay.gd`
   - `godot-client/tools/run_mainline_visual_smoke.py`
   - 必要时才改 `godot-client/scripts/app/main.gd`，且只限 visual smoke 编排或主壳 UI 入口胶水。
3. 不要把 AI 管理页扩成新聊天入口：
   - 主聊天仍在主界面聊天频道。
   - AI 管理页只做摘要、回看、身份、状态与跳转。
4. 不要在本页面接真实图片识别或上传审核链：
   - 当前只保留头像选择/身份文件入口。
   - 图片识别炼入需要单独产品与审核方案。
5. 继续保持后端边界：
   - 不改 provider pool。
   - 不改 BYOK 分账。
   - 不改外部 scheduler 队列。
   - 不改 `WorldService`。
   - 不改 `shared/domain/rules`。

## 5. 推荐回归组合

后续涉及 AI 管理页时，最小回归组合：

```powershell
git diff --check -- godot-client/scripts/ui/presenters/ai_panel_presenter.gd godot-client/scripts/ui/ai_panel.gd godot-client/scripts/ui/slg_snapshot_section_page.gd godot-client/scripts/ui/main_chat_overlay.gd godot-client/tools/run_mainline_visual_smoke.py godot-client/scripts/app/main.gd
npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --click-action ai_panel_open_chat_channel --window-width 1600 --window-height 900 --evidence-dir tmp/screenshots/ai_panel_open_chat_channel_click_latest_1600x900 --timeout-sec 90
npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --click-action ai_panel_open_chat_channel --window-width 2388 --window-height 1080 --evidence-dir tmp/screenshots/ai_panel_open_chat_channel_click_latest_2388x1080 --timeout-sec 90
npm run godot:headless:smoke
```
