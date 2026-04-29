# Godot Map Surface Generalpic Pack

## 目的

`map_surface` 的二轮复用素材已经纳入正式导入链，当前可直接复用的 generalpic 资产包不是源仓库的 898 个文件全量，而是一个可控的 curated pack。

## 正式包路径

- 源素材根目录: `tmp/third_party/slgclient/assets/resources/generalpic`
- Godot 当前可用包: `godot-client/assets/themes/slgclient/current/generalpic/`
- exchange_bundle 同步包: `godot-client/assets/themes/slgclient/replacements/exchange_bundle/generalpic/`
- 包清单: `godot-client/assets/themes/slgclient/manifests/generalpic_manifest.json`
- AI 易读索引: `godot-client/assets/themes/slgclient/manifests/generalpic_index.json`
- 主资产清单入口: `godot-client/assets/themes/slgclient/manifests/slgclient_asset_manifest.json`

## 包内容

- `selectedIds`: 448 个 `card_*` 头像 id
- `fileCount`: 449
- 额外保留文件: `head_wrap.png`

## 选取规则

1. 以源目录 `tmp/third_party/slgclient/assets/resources/generalpic` 为准。
2. 选取全部 `card_*.png` 作为可复用头像 id。
3. 额外同步 `head_wrap.png`，用于与原项目头像壳层保持一致。
4. 不导入同目录下的 `.meta` 侧车，因此不是 898 文件全量。

## 供人和 AI 直接复用的定位方式

如果你要找 map_surface 二轮通用头像包，先看这两个目录：

1. `godot-client/assets/themes/slgclient/current/generalpic/`
2. `godot-client/assets/themes/slgclient/replacements/exchange_bundle/generalpic/`
3. `godot-client/assets/themes/slgclient/manifests/generalpic_index.json`

如果你要验证来源和选取范围，看：

1. `godot-client/assets/themes/slgclient/manifests/generalpic_manifest.json`
2. `godot-client/assets/themes/slgclient/manifests/generalpic_index.json`
3. `godot-client/assets/themes/slgclient/manifests/slgclient_asset_manifest.json`

## 正式导入入口

```text
py -3.11 godot-client/tools/import_slgclient_theme_assets.py
```
