# Window 8B Formal Pack Handoff Prompt

工作目录：`C:\Users\26739\Desktop\8989`

只允许修改：
- `godot-client/scenes/ui/formal_pack/**`
- `godot-client/scripts/ui/formal_pack/**`
- 必要截图：`tmp/screenshots/formal_pack/**`

禁止修改主线壳、后端、地图、presenter、assets。

## 当前组件约定

### 数据层

1. `RecruitPoolCatalog`
   - 字段：`poolId`、`displayName`、`cost`、`openState`、`candidateHeroTemplateIds`、`rateText`、`coverAssetKey`。
   - 首次进游戏时不假设所有卡池都开放；招募页必须能只渲染后端返回的可见卡包，未开放/资源不足/容量不足只展示状态，不本地抽取。
2. `HeroTemplateCatalog`
   - 字段：`templateId`、`rarity`、`star`、`troopType`、`levelPreview`、`portraitAssetKey`。
   - 阵营显示必须归一为两字政治谱系：`曹魏`、`季汉`、`东吴`、`群雄`。`魏/蜀/吴/群` 只允许作为兼容输入，不能直接显示到卡面。
   - 卡池候选只展示模板预览，不写入玩家拥有状态。
3. `OwnedHeroState`
   - 字段：`heroInstanceId`、`templateId`、`level`、`soldierCount`、`team`、`owner`、`status`。
   - 新号可能为空；总武将页必须能显示空状态，而不是假设一定有 12 张卡。

### 组件层

1. `components/hero_card_view.gd`
   - 共用模式：`pool_preview`、`owned_roster`、`draw_result`。
   - `pool_preview` 默认隐藏姓名、归属、部队编号、兵力，只保留等级/稀有度/兵种等模板预览。
   - `owned_roster` 显示拥有实例信息：姓名、阵营、兵力、部队、归属、状态。
   - `draw_result` 显示获得结果，后续由后端 authority 返回的模板 id、资产、稀有度、实例 id 覆盖。
   - 后端/真实资产接入时可直接传：
     - `name` / `displayName`
     - `faction` / `campName`
     - `rarity` / `quality`
     - `level`
     - `troop` / `troopType`
     - `power` / `soldierCount`
     - `team` / `armyName`
     - `owner`
     - `status`
     - `heroTemplateId`
     - `heroInstanceId` / `instanceId` / `heroCardInstanceId`
      - `portraitAssetKey`
    - 卡面会按阵营归一结果决定边框和左侧身份条色彩：曹魏蓝、季汉绿、东吴赤、群雄金；样例 `tone` 不再作为主色权威。
    - `portraitAssetKey` 交给 `components/formal_pack_asset_registry.gd`，按 `godot-client/assets/formal_pack/portraits/card/postprocessed/formal_pack_card_portraits_postprocessed_handoff.preview.json` 的 `portraitAssetKey -> resPath` 动态加载卡面立绘。
    - 组件内部会归一成卡面字段，不自动生成“武将01”这类显示名。

2. `components/formal_pack_close_button.gd`
   - 隔离 preview 内复用的红色 `CloseButton`。
   - 尺寸和视觉参考主线 `full_screen_panel_host.gd` / `general_panel.gd` 的关闭按钮。
   - 按钮必须命名为 `CloseButton`，方便后续 visual smoke 定位。

3. 招募结果页
   - `FORMAL_PACK_DRAW_MODE=single` 时显示单抽结果，只提供 `再招募 1 次`。
   - 默认或 `FORMAL_PACK_DRAW_MODE=five` 时显示五连结果，只提供 `再招募 5 次`。
   - 继续招募按钮贴近结果卡下方，不再放页面底部；标题旁和底部都不显示“回执/弱接入位”调试条。
   - 不做真实随机、不扣库存、不写入后端；receipt 字段只在代码/交接说明中保留接入约定，不抢玩家主视觉。

4. 空态预览分支
   - `components/formal_pack_preview_adapter.gd` 是临时 future-adapter 接口层。
   - 招募页只读取 adapter 的 `visiblePools`；`FORMAL_PACK_EMPTY_POOLS=1` 时 adapter 返回 `visiblePools=[]`，页面渲染“暂无可用卡池”，保留底部资源条，不本地创建默认卡池。
   - 总武将页只读取 adapter 的 `ownedHeroes`；`FORMAL_PACK_EMPTY_ROSTER=1` 时 adapter 返回 `ownedHeroes=[]`，页面渲染“暂无武将”，保留搜索/筛选/关闭栏，不假设已有武将卡。
   - 空态 UI 只放玩家能理解的短文案；`visiblePools` / `ownedHeroes` 等技术字段只保留在 adapter 和交接说明中。
   - 默认不设置环境变量时，保持已认可的招募页和总武将页主视觉比例。

5. `components/formal_pack_asset_registry.gd`
   - 统一读取窗口 12 产出的封面与卡面 manifest。
   - 招募页只传 `coverAssetKey`，registry 按 `godot-client/assets/formal_pack/recruit_pack_cover_manifest.preview.json` 解析到 `res://` 封面路径。
   - `HeroCardView` 只传 `portraitAssetKey`，registry 按卡面立绘 manifest 解析到 `res://` 立绘路径。
   - UI 脚本不再维护单独的硬编码资源路径表；贴图缺失时回落到原有色块，不影响 preview scene 启动。

### 流程层

1. 招募页点击卡包，只展示 `RecruitPoolCatalog` 配置和候选池，不本地随机。
2. 点击单抽/五连，请求后端 authority。
3. 后端返回抽卡结果和玩家新武将实例。
4. 客户端更新 `OwnedHeroState`。
5. 总武将页出现新卡；点击卡调用现有单武将详情：`open_hero_profile:<heroInstanceId>`。

## 必跑验证

```powershell
npm run godot:headless:smoke -- --scene res://scenes/ui/formal_pack/recruit_formal_pack_preview.tscn
npm run godot:headless:smoke -- --scene res://scenes/ui/formal_pack/general_roster_formal_pack_preview.tscn
npm run godot:headless:smoke -- --scene res://scenes/ui/formal_pack/draw_result_formal_pack_preview.tscn
git diff --check -- godot-client/scenes/ui/formal_pack godot-client/scripts/ui/formal_pack
```

截图优先使用 scene 内部 viewport 保存；headless dummy renderer 不产出截图时，用 Godot GUI 运行同一 scene 触发内部截图，不使用 OS 截屏。
