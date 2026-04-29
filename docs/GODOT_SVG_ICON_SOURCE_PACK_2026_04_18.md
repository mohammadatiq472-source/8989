# Godot SVG 图标源资产包（2026-04-18）

> 状态：现行源资产文档。  
> 用途：记录当前自制 SVG 图标源资产的位置、命名和后续接入原则。

## 0. 关联文档

1. [Godot 原生 SLG 主壳布局对齐（2026-04-18）](GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md)
2. [原生 SLG 正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md)
3. [AI 快速导航索引](AI_QUICK_NAV_INDEX_2026_04_10.md)

## 1. 资产位置

当前 SVG 源资产目录：

- [godot-client/assets/themes/slgclient/source/svg_shell_icons](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons)

索引文件：

1. [README.md](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/README.md)
2. [manifest.json](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/manifest.json)

## 2. 当前已补齐的图标

1. [battle_report.svg](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/battle_report.svg)
2. [mail_notice.svg](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/mail_notice.svg)
3. [task_board.svg](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/task_board.svg)
4. [activity_seal.svg](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/activity_seal.svg)
5. [coin_copper.svg](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/coin_copper.svg)
6. [jade_token.svg](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/jade_token.svg)
7. [alliance_banner.svg](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/alliance_banner.svg)
8. [ai_emblem.svg](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/ai_emblem.svg)
9. [help_badge.svg](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/help_badge.svg)
10. [close_badge.svg](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/close_badge.svg)
11. [back_badge.svg](/C:/Users/26739/Desktop/8989/godot-client/assets/themes/slgclient/source/svg_shell_icons/back_badge.svg)

## 3. 当前原则

1. 先保留为 `SVG` 源资产，不急着一次性接成运行时贴图。
2. 需要稳定纹理表现时，再从这些源文件导出 PNG 或 atlas。
3. 命名按语义走，不按截图编号走，避免后续 UI 场景绑定混乱。
4. 当前优先服务于：`主壳顶栏 / 战报 / 任务 / 活动 / 货币 / 帮助 / 关闭 / 返回`。

## 4. 下一步

下一轮更值得继续补的源资产：

1. 主入口五按钮的统一图标
2. 战报面板的胜/负/奖励/回放图标
3. 顶栏资源的小图标（木 / 铁 / 石 / 粮）
4. 更接近原生 SLG 的单色/双色变体
