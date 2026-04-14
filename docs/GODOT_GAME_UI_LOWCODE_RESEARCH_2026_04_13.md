# Godot 游戏 UI 低代码 / 可视化工作流研究（2026-04-13）

## 读取文档

本研究在落稿前已读取并遵守以下文档：

1. `C:/Users/Buffoon Queer/Desktop/8989/AGENTS.md`
2. `C:/Users/Buffoon Queer/Desktop/8989/docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
3. `C:/Users/Buffoon Queer/Desktop/8989/godot-client/README.md`

## 结论先行

游戏 UI 的“低代码 / 可视化”并不是单纯把控件拖到画布上，而是把一个 UI 系统拆成四层：

1. 结构层：场景 / 布局 / 组件树，通常是可序列化的树或图。
2. 逻辑层：事件表、视觉脚本、蓝图、信号连接、状态机。
3. 资源层：现成素材、图集、主题、Prefab、可复用组件。
4. 反馈层：实时预览、调试器、热重载、截图回归、播放/回放。

真正成熟的低代码平台，核心竞争力都不在“画布”，而在“结构 + 逻辑 + 资源 + 反馈”是否能形成闭环。

对我们当前的 `Godot + UI Preview Sandbox` 路线来说，最接近成熟低代码平台的部分已经具备：

1. 场景级结构复用。
2. Story 级 payload 驱动。
3. 预览工作台与正式入口统一。
4. 截图回归与可复现验证链。

我们现在缺的不是“能不能做 UI”，而是“能不能像低代码平台一样，把 UI 资产导入、拼装、预览、迭代、回归这一整条链做成稳定工作流”。

## 低代码 / 可视化平台的底层原理

### 1. 视觉编辑器只是前端，真正的核心是中间表示

Construct、GDevelop、Unity UI Builder、Unreal UMG 这些系统，本质上都在维护一个可序列化的中间表示（IR）：

1. 布局树或场景树。
2. 事件图或脚本节点图。
3. 样式资源和主题资源。
4. 资源引用关系和实例化关系。

编辑器里看到的是拖拽界面；真正落盘的是结构化资产，运行时再把这些资产装配成界面。

### 2. 逻辑通常不是“写死在 UI 节点里”，而是“事件 / 蓝图 / 绑定”

成熟平台都会把逻辑拆成两种层次：

1. 可视逻辑层：事件表、条件-动作、蓝图、事件函数。
2. 代码扩展层：当可视逻辑不够时，允许插入脚本或自定义扩展。

这类设计的目标不是取代代码，而是让 80% 的常见 UI 交互能够被非程序化地完成，剩下 20% 再下沉到代码。

### 3. 资产导入不是“贴图进来就完了”，而是“资源语义化”

低代码平台要真正适合游戏 UI，必须把资源导入成可复用资产，而不是单张图片：

1. 图集或切片资源。
2. 主题/样式资源。
3. 可复用组件或 Prefab。
4. 预设布局或模板。

这也是为什么很多成熟平台会强调 asset store、prefab、template、theme、style、behavior 这些概念。它们不是附属品，而是工作流本身的一部分。

### 4. 预览和回归是低代码体验的另一半

如果没有实时预览、调试器、热重载、截图回归，所谓“可视化”很快就会退化为“拖完再猜”。

游戏 UI 比企业表单更需要这一层，因为它有：

1. 分辨率变化。
2. 叠层和遮罩。
3. 动画和交互状态。
4. 资源密度和性能约束。

所以成熟平台一般都会把 live preview、debugger、profiler、hot reload 作为核心能力，而不是可选能力。

## 成熟平台对比

### 1. Construct 3

官方文档明确把项目分成布局（Layouts）和事件表（Event Sheets），并支持事件表复用和包含（includes）。这使它很像“页面 + 逻辑模块”的组合工作流。

适合点：

1. 2D 页面和流程拼装很直接。
2. 事件系统适合非代码快速迭代。
3. Layout 与 Event Sheet 的分离适合把“视觉”和“行为”拆开。
4. 官方还有资产库和模板，利于导入现成素材快速搭建。

局限：

1. 更偏浏览器式 / 工具式生态，不是引擎级深度集成。
2. 复杂项目最终仍会被事件表复杂度拖住。
3. 如果目标是深度嵌入某个游戏引擎运行时，它更像原型和流程平台，而不是最终主运行时。

### 2. GDevelop

GDevelop 的官方资料显示它有场景、无代码事件系统、行为（behaviors）、Prefab（可复用对象）、热重载、资产商店，以及 JavaScript 扩展能力。

适合点：

1. 对资产导入和流程拼装很友好。
2. Prefab 和行为封装非常适合“模块化 UI / 互动流程”。
3. 热重载让迭代速度更接近网页开发。
4. 开源，便于研究其工作流和结构。

局限：

1. 复杂大项目会逐渐需要脚本/扩展来兜底。
2. 可视化非常强，但最终仍取决于你如何管理场景、对象和事件的边界。
3. 更适合快速构建和原型验证，不一定是最强的深度引擎内 UI 主框架。

### 3. Unity UI Toolkit + UI Builder

Unity 官方文档说明 UI Builder 是可视化的 UXML / USS 编辑器，设计师可以用它搭结构和样式，开发者再用 C# 做行为绑定和自定义控件。

适合点：

1. 编辑器内可视化设计。
2. UXML / USS 结构与样式分离，利于组件化。
3. 适合复杂编辑器 UI 和游戏内 UI 共享一套思路。
4. UI Debugger 便于检查层级和样式。

局限：

1. 不是纯低代码，代码参与度仍然较高。
2. 真正的“导入资产 -> 直接拼装流程”体验不如专门的 no-code 产品。
3. 对小团队而言，学习和工程化成本较高。

### 4. Unreal UMG

Epic 的文档把 Widget Blueprint / UMG 作为 UI 设计入口，编辑器提供面板、层级、动画等可视化能力，并通过 Blueprint 接入行为。

适合点：

1. UI 编辑器成熟。
2. 适合游戏 HUD、菜单、交互界面。
3. 蓝图让逻辑可视化，能与引擎深度耦合。

局限：

1. 工程重量大。
2. 对“只做 2D 互动 UI 迭代”的场景来说，明显偏重。
3. 适合大型项目，但不是最轻量的流程拼装平台。

### 5. Godot + UI Preview Sandbox

Godot 官方文档的核心是场景树、Control、Theme、PackedScene、Scene instancing。它天然支持可复用场景、主题和局部覆盖，这其实已经具备低代码平台最重要的结构底座。

我们当前在项目里额外加了：

1. Story 注册表。
2. payload 驱动。
3. Sandbox 统一入口。
4. 组件化 story。
5. 截图回归和正式验证链。

这意味着我们的路线不是“直接复制 Construct/GDevelop”，而是把 Godot 的场景系统包装成一层更像低代码平台的工作流。

适合点：

1. 可控、可审计、可与游戏运行时直接对接。
2. 结构和运行时都在同一个引擎里，不需要额外桥接层。
3. 对本项目的 AI 协作最友好，因为每个 story 都是正式入口，可被人和 AI 共同读取。

局限：

1. 需要我们自己建立规范，不像低代码平台那样开箱即用。
2. 缺少现成的“事件表式”产品体验，需要用 story / payload / navigation / validation 自己搭。
3. 如果不把组件、资源、状态和回归做硬规范，很容易退化成普通 Godot 工程。

## 和我们当前路线的对比

### 我们现在的路线更像什么

当前的 `Godot + UI Preview Sandbox` 更接近“引擎内的低代码工作台”，而不是“独立低代码产品”。

它的关键特征是：

1. 以 scene/story 为最小可视单元。
2. 以 payload 为数据边界。
3. 以 sandbox 为唯一正式预览入口。
4. 以 regression report 和 screenshot 为验收证据。

这和低代码平台的思路是一致的，只是我们把“可视化编排层”嵌进了游戏引擎项目，而不是做成独立 SaaS。

### 当前路线的优点

1. 资产和运行时一致，避免导出/转换失真。
2. 可复现性强，适合多人和多 AI 并行协作。
3. Story 规范能约束“每次改 UI 都有入口、有 payload、有截图”。
4. 对 SLG 这种层级很深、状态很多的 UI，比纯拖拽式工具更容易落到真实工程。

### 当前路线的不足

1. 没有成熟低代码平台那种现成的“流程图式编排体验”。
2. 组件浏览、素材索引、模板库、数据绑定面板还可以继续增强。
3. 如果没有持续维护规范，工作流会回退到普通场景拼接。

## 哪些平台更适合“导入现成资产 -> 拼装页面/流程 -> 持续迭代”

按适配度排序，我的判断是：

1. GDevelop：最接近“资产导入 + no-code 逻辑 + 可复用组件 + 快速迭代”。
2. Construct 3：最接近“布局 + 事件表 + 模板复用”的页面/流程拼装体验。
3. Unity UI Toolkit / UI Builder：适合有 Unity 生态、愿意接受一定代码参与的团队。
4. Unreal UMG：适合大型项目和重引擎集成，但不轻。
5. Godot + UI Preview Sandbox：最适合我们当前仓库，因为它能直接复用 Godot 运行时和现有资产，而且能做成严格的正式入口。

如果目标是“真正低代码”，GDevelop 和 Construct 3 更像答案。

如果目标是“在游戏引擎内把 UI 工作流做成可视化、可复现、可持续迭代”，Godot + Sandbox 更像我们的答案。

## 对我们项目的建议

1. 继续把 `UI Preview Sandbox` 当成唯一正式 UI 工作台。
2. 把 story 的粒度固定成：
   - `scene`
   - `payload`
   - `capture_targets`
   - `validation`
3. 把现成素材继续语义化：
   - 图集 / 主题 / 面板 / Prefab / 图标 / 读板区
4. 继续把 `map_surface -> province -> warzone -> nation` 这条链做成连续点击流程，而不是静态看图。
5. 对应 story_id 链为 `map_surface -> province_layer -> warzone_layer -> nation_layer`，方便人和 AI 统一定位入口。
5. 后续如果要进一步提升“低代码感”，优先补这三件事：
   - 素材索引浏览器
   - story / payload 模板生成器
   - 更强的数据绑定与状态切换面板

## 参考来源

以下为本次调研使用的官方资料：

1. Construct 3 Project structure
   - https://www.construct.net/en/make-games/manuals/construct-3/overview/project-structure
2. Construct 3 Event sheets
   - https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/events/event-sheets
3. Construct 3 Event Sheet View
   - https://www.construct.net/en/make-games/manuals/construct-3/interface/event-sheet-view
4. Construct 3 Asset Library / Game Templates
   - https://www.construct.net/en/game-assets/game-templates/construct-asset-library-4390
5. GDevelop features
   - https://gdevelop.io/features
6. GDevelop using JavaScript
   - https://gdevelop.io/page/using-javascript-with-gdevelop
7. GDevelop core architecture
   - https://docs.gdevelop.io/GDCore%20Documentation/
8. Unity UI Toolkit introduction
   - https://docs.unity3d.com/current/Manual/ui-systems/introduction-ui-toolkit.html
9. Unity UI Builder and USS workflow
   - https://docs.unity3d.com/2022.2/Manual/UIE-add-style-to-uxml.html
10. Unreal Widget Blueprints in UMG
    - https://dev.epicgames.com/documentation/en-us/unreal-engine/widget-blueprints-in-umg-for-unreal-engine
11. Unreal displaying UMG UI in the viewport
    - https://dev.epicgames.com/documentation/en-us/unreal-engine/displaying-your-umg-ui-in-the-viewport-in-unreal-engine
12. Godot scene system and UI theming
    - https://docs.godotengine.org/en/stable/tutorials/ui/gui_using_theme_editor.html
    - https://docs.godotengine.org/en/stable/classes/class_theme.html
    - https://docs.godotengine.org/en/stable/getting_started/step_by_step/instancing.html
    - https://docs.godotengine.org/en/stable/classes/class_packedscene.html
