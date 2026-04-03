# STZB 可复用资产快捷路径指南

> 本文档是率土之滨(STZB)逆向工程成果的完整索引，供后续 AI 助手快速定位和复用数据。
> 最后更新：2026-03-19

---

## 一、数据资产总览

### 已成功提取的 JSON 数据（可直接 `JSON.parse` 使用）

| 文件 | 路径 | 大小/数量 | 内容描述 |
|------|------|----------|---------|
| **cfg_all_data.json** | `tmp/extracted_cfg/` | 37.7MB, 157表, 241,229行 | 全量游戏配置（兵种/技能/城市/建筑/区划等） |
| **crashed_files_data.json** | `tmp/` | 83文件, 153,111行 | 从84个崩溃文件恢复的数据（含多版本表） |
| **army_data_v5.json** | `tmp/` | 1.46MB, 20,407条 | 兵种/武将完整数据（arity=7） |
| **skill_effect_map.json** | `tmp/extracted_cfg/` | 670技能 | 技能名→效果ID映射 |
| **world_city_5.json** | `tmp/extracted_cfg/` | 2,362城市 | 城市坐标+名称+血量+描述 |
| **world_scenic.json** | `tmp/extracted_cfg/` | 197景点 | 景点数据 |
| **world_road_detail.json** | `tmp/extracted_cfg/` | 1,099道路 | 道路网络(from/to/dist) |
| **effect_id_analysis.json** | `tmp/` | 121种效果 | 效果ID→技能名语义映射 |
| **opcode_map_full.json** | `tmp/` | 19条映射 | NeoX→CPython opcode替换密码表 |
| **cfg_summary.json** | `tmp/extracted_cfg/` | 157表目录 | 所有已提取表的名称+字段数索引 |
| **cfg_scan_results.json** | `tmp/extracted_cfg/` | 273条 | 文件扫描结果(189成功+84失败) |

### 总数据量：~394,340 行游戏配置数据

---

## 二、地图与坐标数据（项目核心需求）

### 坐标编码规则

```
pos = x * 10000 + y
例：pos = 29462310 → x = 2946, y = 2310
地图范围：X = [2, 2999], Y = [0, 8305]
```

### 地图相关表清单

| 表名 | 数据量 | 字段数 | 用途 | 关键字段 |
|------|--------|--------|------|---------|
| **Tb_cfg_world_city** | 2,362-13,218/版 | 13 | 城市坐标+属性 | id, pos, type_code, name, hp_max, hp, description |
| **Tb_cfg_world_scenic** | 197/版 | 11 | 景点/地标 | id, name, type, server |
| **Tb_cfg_world_road_detail** | 1,099-1,102/版 | 7 | 道路网络 | id, from, dist, to |
| **Tb_cfg_world_xian** | 316/版 | 6 | 县级区划 | — |
| **Tb_cfg_world_junxian** | 94/版 | 7 | 郡县区划 | — |
| **Tb_cfg_region** | 9/版 | 9 | 大区(幽/冀/豫/徐等) | — |
| **Tb_cfg_region_connection** | 不定 | 5 | 大区间连接关系 | — |
| **Tb_cfg_world_join** | 3,000-4,470/版 | 2 | **地块邻接关系图** | — |
| **Tb_cfg_world_build** | 不定 | 27 | 世界建筑物 | — |
| **Tb_cfg_build_point** | 4,245 | 6 | 建筑部署点位 | — |
| **Tb_cfg_build** | 139-3,416/版 | 11 | 建筑配置 | — |
| **Tb_cfg_build_cost** | 不定 | 11 | 建造成本 | — |
| **Tb_cfg_client_scenic** | 8,264-10,292/版 | 6 | 客户端景点渲染坐标 | （最密集的地图坐标数据） |
| **Tb_cfg_city_description** | 不定 | 3 | 城市中文描述 | — |

### 如何使用地图数据

```python
import json

# 加载城市数据
cities = json.load(open('tmp/extracted_cfg/world_city_5.json', encoding='utf-8'))

# 提取有效坐标（过滤 pos<=100 的特殊标记）
real_cities = [c for c in cities if isinstance(c['pos'], int) and c['pos'] > 10000]
for c in real_cities:
    x = c['pos'] // 10000
    y = c['pos'] % 10000
    # 现在 (x, y) 就是地图坐标
```

### 区划层级完整分析（2026-03-19 新增）

STZB 的区划层级为 **州 → 郡 → 县 → 城市 → 地块**，所有层级均包含空间坐标数据，可直接用于地图生成。

#### 13州 (tb_cfg_region_314, arity=9)

格式：`[id, 州名, 简称, 描述(含首府), flag1, flag2, 邻接州id(逗号分隔), 地图尺寸, 0]`

| ID | 州名 | 简称 | 首府 | 邻接州 |
|----|------|------|------|--------|
| 1 | 司隶 | — | — | (被其他州引用但不在region表中，对应junxian 1xx) |
| 2 | 雍州 | 雍 | 长安 | 1,9,10,11 |
| 3 | 兖州 | 兖 | 濮阳 | 1,4,5,6,7 |
| 4 | 豫州 | 豫 | 谯 | 1,13,7,8 |
| 5 | 冀州 | 冀 | 邺 | 3,9,6,12 |
| 6 | 青州 | 青 | 临淄 | 3,5,7 |
| 7 | 徐州 | 徐 | 彭城 | 3,4,6,8 |
| 8 | 扬州 | 扬 | 建业 | 4,7,13 |
| 9 | 并州 | 并 | 晋阳 | 2,5,10,12 |
| 10 | 凉州 | 凉 | 武威 | 2,9,11 |
| 11 | 益州 | 益 | 成都 | 2,10,13,14 |
| 12 | 幽州 | 幽 | 蓟 | 5,9 |
| 13 | 荆州 | 荆 | 襄阳 | 4,8,11,14 |
| 14 | 湘西 | 湘 | 夷陵 | 1,11,13 |

> **注意**：id=1(司隶) 不在 region 表中但被多个州的邻接列表引用。id=14(湘西) 是 STZB 自有的非历史划分。
> **策划调整**：本项目无雍州，拆分给凉州+益州+司隶。

#### 94郡 (tb_cfg_world_junxian_2, arity=7) — 含BBox边界

格式：`[id, center_xy, 郡名, min_xy, max_xy, 0, 0]`

**坐标编码**：`pos = x * 1000 + y`（注意：郡/县坐标编码与城市不同）

**ID→州映射规律**：`junxian_id ÷ 100 = region_id`

| ID前缀 | 州 | 郡列表 |
|--------|-----|--------|
| 1xx | 司隶 | 河南尹(101), 弘农(102), 平阳(103), 河东(104), 河内(105), 原武(106) |
| 2xx | 雍州 | 京兆(201), 陇西(202), 天水(203), 安定(204), 新平(205), 冯翊(206), 北地(207), 扶风(208) |
| 3xx | 兖州 | 东(301), 任城(302), 东平(303), 济北(304), 山阳(305), 泰山(306), 济阴(307), 陈留(308) |
| 4xx | 豫州 | 谯(401), 颍川(402), 汝南(403), 弋阳(404), 梁(405), 安丰(406), 襄城(407), 陈(408) |
| 5xx | 冀州 | 魏(501), 常山(502), 中山(503), 河间(504), 渤海(505), 清河(506), 巨鹿(507) |
| 6xx | 青州 | 齐(601), 济南(602), 平原(603), 乐安(604), 北海(605), 东莱(606), 城阳(607) |
| 7xx | 徐州 | 彭城(701), 下邳(702), 临沂(703), 琅琊(704), 东海(705), 广陵(706) |
| 8xx | 扬州 | 丹阳(801), 庐江(802), 吴(803), 会稽(804), 建安(805), 庐陵(806), 豫章(807), 鄱阳(808) |
| 9xx | 并州 | 太原(901), 雁门(902), 新兴(903), 乐平(904), 上党(905), 西河(906) |
| 10xx | 凉州 | 武威(1001), 敦煌(1002), 酒泉(1003), 西海(1004), 张掖(1005), 金城(1006), 西平(1007) |
| 11xx | 益州 | 蜀(1101), 梓潼(1102), 武都(1103), 汉中(1104), 巴(1105), 永昌(1106), 云南(1107), 汉嘉(1108) |
| 12xx | 幽州 | 广阳(1201), 代(1202), 上谷(1203), 涿(1204), 右北平(1205), 辽西(1206), 渔阳(1207) |
| 13xx | 荆州 | 襄阳(1301), 南阳(1302), 南(1303), 武陵(1304), 长沙(1305), 天门(1306), 桂阳(1307), 江夏(1308) |

**BBox 解码示例**：
```
河南尹(101): center=(751,751), bbox=[(715,643), (838,775)]
弘农(102):   center=(708,678), bbox=[(674,597), (758,738)]
太原(901):   center=(649,823), bbox=[(582,756), (717,902)]
```

#### 316县 (tb_cfg_world_xian, arity=6) — 含BBox边界

格式：`[id, 县名, center_xy, min_xy, max_xy, 0]`

**ID→郡→州映射**：`xian_id ÷ 100 = junxian_id`（如 10102=荥阳 → 郡101=河南尹 → 州1=司隶）

#### 坐标编码差异

| 表 | 编码 | 地图比例 |
|----|------|----------|
| world_city | `x * 10000 + y` | ~3000×8300 |
| junxian / xian | `x * 1000 + y` | ~1500×1500 |

两套表使用不同坐标比例，应用时需注意映射关系。

### 注意事项

- `world_city` 中有 681 条 type_code=6, 519 条 type_code=7 的条目，pos<=100，是特殊标记
- `client_scenic` 是最密集的坐标数据（8264+条），包含客户端渲染用的景点/装饰物坐标
- `world_join` 是邻接关系图（每行是 [地块A, 地块B] 的连接），用于路径规划
- `world_road_detail` 包含道路的 from/to/dist 三元组，可构建道路网络图
- 多个表有多个版本（如 `_5`, `_314`, `_5314`），版本号对应游戏更新版本，取最新的
- **所有坐标统一编码为 `pos=x*10000+y`**（X轴向南递增，Y轴向东递增，约 1500×1500 网格）

---

## 三、战斗与技能数据

### 技能效果体系

效果 ID 分为 7 大系，共 121 种基础效果：

| 系列 | 范围 | 含义 | 代表效果 |
|------|------|------|---------|
| **100系** | 101-191 | 属性加成（被动） | 101=攻击力, 102=防御, 103=智谋, 104=速度, 105=攻城, 106=远攻 |
| **200系** | 201-271 | 主动伤害/debuff | 201=物理伤害, 202=策略伤害, 203=减益, 204=牵制 |
| **300系** | 301-322 | **核心战斗行为** | 301=普攻(最高频159次), 302=策攻(85次), 305=火攻 |
| **400系** | 401-402 | 治疗回复 | 401=主动治疗, 402=持续治疗 |
| **500系** | 501-552 | Buff/Debuff/控制 | 522=物防buff, 524=策防buff, 531=增伤buff |
| **700系** | 701-771 | 高阶特殊 | 714=闪避, 752=奇袭, 761=先手 |
| **900系** | 901-952 | 特殊战术 | 952=停战 |

详见 `docs/STZB_REVERSE_DESIGN_INSIGHTS.md` 第十二节。

### 兵种数据

`army_data_v5.json`：20,407 条，arity=7，含兵种属性和武将关联。
`skill_effect_map.json`：670 个技能的中文名和效果链。

---

## 四、图片/纹理资源状态

### 已提取图片资源总览

**来源**：通过 ADB 从 MuMu 模拟器设备直接拉取游戏运行时资源文件。

#### A. 标准格式图片（可直接使用）

| 目录 | 路径 | 文件数 | 大小 | 内容描述 |
|------|------|--------|------|---------|
| **jpg_direct/** | `tmp/stzb_reverse/assets/` | 1,312 | 344.2MB | 音乐封面、活动图片、分享截图 |
| **png_direct/** | `tmp/stzb_reverse/assets/` | 303 | 50.7MB | 3D 纹理、地形混合贴图、城市权重贴图 |
| **landscape_png/** | `tmp/stzb_reverse/assets/` | 48 | 0.1MB | 3D 景观地形贴图 |

#### B. NeoX 加密纹理（已解密转换为 PNG）

**关键发现**：所有 `.astc` 文件实际是 **KTX1 纹理格式 + 8 字节循环 XOR 加密**。

- **XOR 密钥**：`[0x8E, 0x50, 0x9F, 0xE8, 0x59, 0x67, 0x91, 0xFB]`
- **压缩格式**：ASTC 8×6 块（`GL_COMPRESSED_RGBA_ASTC_8x6_KHR = 0x93B6`）
- **解密工具**：`tmp/_neox_texture_decrypt.py`

| 目录 | 路径（PNG 输出） | 文件数 | 大小 | 典型分辨率 | 内容 |
|------|-----------------|--------|------|-----------|------|
| **card_images/** | `converted_png/card_images/` | 116 | 38.3MB | 470×592 | **武将卡片立绘** |
| **card_summon/** | `converted_png/card_summon/` | 107 | 71.9MB | — | **武将召唤画面** |
| **hero_ui/** | `converted_png/hero_ui/` | 280 | 17.2MB | 756×548 等 | 英雄 UI 素材（含 6 子目录） |
| **map/** | `converted_png/map/` | 18 | 53.3MB | 最大 4096×4096 | 地图小型材质（地标、水面、道路、军队选择器等，**非按州区划的背景地图**） |
| **map_common/** | `converted_png/map_common/` | 14 | 74.4MB | 最大 4096×4096 | 地图通用组件（城市组件、军队标记，**非区域背景地图**） |
| **card/** | `converted_png/card/` | 24 | 0.4MB | 小图标 | 装备图标 |
| **合计** | | **559** | **255.5MB** | | |

所有 PNG 输出位于 `tmp/stzb_reverse/assets/converted_png/`。

#### C. 设备上尚未拉取的资源（供后续探索）

| 设备目录 | 文件数 | 说明 |
|----------|--------|------|
| `res/real3d/` | 25,897 | 3D 模型和纹理（体积大） |
| `res/ui/` | 7,298 | UI 界面纹理 |
| `res/shader/` | 5,505 | 着色器代码 |
| `res/replace/` | 970 | 替换资源 |

#### D. NeoX 纹理解密方法说明

```python
# 解密流程：
# 1. 读取 .astc 文件（实际是 XOR 加密的 KTX1 格式）
# 2. 用 8 字节循环 XOR 密钥解密
# 3. 解析 KTX1 头部获取宽高和压缩格式
# 4. 提取 ASTC 压缩数据
# 5. 用 texture2ddecoder 解码为 RGBA
# 6. 用 Pillow 保存为 PNG

XOR_KEY = bytes([0x8E, 0x50, 0x9F, 0xE8, 0x59, 0x67, 0x91, 0xFB])
# 解密: decrypted[i] = encrypted[i] ^ XOR_KEY[i % 8]
```

### 分类数据文件（从大文件拆分）

原始 `cfg_all_data.json`（37.7MB）已拆分为按主题分类的小文件：

| 文件 | 路径 | 表数 | 大小 | 分类 |
|------|------|------|------|------|
| cfg_map_world.json | `tmp/extracted_cfg/split/` | 47 | 6.6MB | 世界地图（城市/景点/道路/区划） |
| cfg_battle_skill.json | `tmp/extracted_cfg/split/` | 30 | 7.2MB | 战斗技能（技能/兵种/武将/效果） |
| cfg_building.json | `tmp/extracted_cfg/split/` | 12 | 0.9MB | 建筑系统 |
| cfg_activity.json | `tmp/extracted_cfg/split/` | 6 | 0.2MB | 活动 |
| cfg_misc.json | `tmp/extracted_cfg/split/` | 62 | 0.5MB | 杂项配置 |
| cfg_index.json | `tmp/extracted_cfg/split/` | — | 11KB | 157 表名/行数/字段数索引 |

### 当前拥有的非数据文件

| 文件 | 路径 | 大小 | 内容 |
|------|------|------|------|
| **libclient.so** | `tmp/stzb_reverse/libs/` | 110MB | NeoX 引擎核心 |
| **zh-cn.txt** | `tmp/stzb_reverse/data/` | 39KB | 中文本地化文本 |
| **gm_dict.json** | `tmp/stzb_reverse/data/` | 616KB | GM 命令字典 |
| **neox_config.xml** | `tmp/stzb_reverse/data/` | 1.7KB | NeoX 引擎配置 |
| **army_data.stb** | `tmp/stzb_reverse/data/` | 235KB | 兵种数据（二进制格式） |

---

## 五、地图渲染逻辑参考

### 客户端地图代码（Python bytecode，可反编译参考但不能直接运行）

| 目录 | 文件数 | 关键类/引用 | 用途 |
|------|--------|-----------|------|
| `map_public/` | 35 | MapTerrain, MapSpriteMgr, MapZoomer, MapWarFogData | 地图公共逻辑 |
| `map3d_2/` | 48 | — | 3D 地图渲染 |
| `map_option/` | 63 | — | 地图配置选项 |
| `map_option_3d_2/` | 31 | — | 3D 地图配置 |
| `mini_map/` | 11 | — | 小地图 |
| `new_mini_map_3d/` | — | — | 新版 3D 小地图 |
| `game_scene3d/` | 71 | — | 3D 场景管理 |
| `game_sprite/` | — | — | 精灵管理代码（非图片） |

### STZB 地图渲染架构推测

基于代码引用分析：
- **分块加载**：地图分成 chunk/tile，按视口动态加载
- **多图层**：基础地形层 + 城市层 + 道路层 + 战争迷雾层 + 装饰层
- **3D 等轴测**：使用 NeoX 3D 引擎（非纯 2D tilemap）
- **精灵管理**：MapSpriteMgr 管理地图上的动态对象（军队、城市图标等）
- **缩放系统**：MapZoomer 处理从大地图到战斗地图的多级缩放

---

## 六、.bin 文件解析能力

### 批量测试结果

- **11,102 个 .bin 文件**，全部顶层是标准 code object (0xe3)
- MarshalParser 完整解析成功率：**26.5%**（2,942 个可完整解析）
- 失败原因：嵌套对象使用 NeoX 自定义 marshal type
  - 0x00 出现 1,089 次（最主要失败原因）
  - 0x74 出现 62 次
- **所有文件顶层结构可读**：即使完整解析失败，co_names/co_filename/co_code 可提取

### .bin 文件名映射

`scripts_decrypted/_filename_mapping.txt`（1,713 行）提供 hash → 真实模块路径映射。

主要模块类目分布：

| 顶级模块 | 文件数 | 用途 |
|----------|--------|------|
| db_data | 314 | 数据库/配置数据模块 |
| activity | 283 | 活动系统 |
| lib | 149 | 公共库/工具 |
| ui_layout | 145 | UI 布局定义 |
| game_scene3d | 71 | 3D 场景 |
| map_option | 63 | 地图配置 |
| map3d_2 | 48 | 3D 地图 |
| map_public | 35 | 地图公共逻辑 |
| army | 19 | 行军/部队 |
| mini_map | 11 | 小地图 |

---

## 七、可复用工具链

### 核心工具

| 工具 | 路径 | 功能 | 使用场景 |
|------|------|------|---------|
| **raw_binary_scanner.py** | `tmp/` | 安全 MarshalParser + NeoX opcode 解密 + PRECALL 模式扫描 | 从任何 NeoX .pyc/.bin 提取表数据 |
| **constraint_decoder_v2.py** | `tmp/` | NeoX bytecode → CPython bytecode 解码 | 需 marshal.loads 先成功的文件 |
| **_extract_one.py** | `tmp/` | PRECALL+CALL 模式识别+参数提取 | 单文件表数据提取 |
| **batch_subprocess_extract.py** | `tmp/` | 批量子进程提取（隔离崩溃） | 批量提取 cfg 表 |
| **bin_batch_test.py** | `tmp/` | MarshalParser 批量测试 | 测试新文件的兼容性 |
| **bin_quick_stats.py** | `tmp/` | .bin 文件快速分类统计（首字节分析） | 快速了解文件类型分布 |

### 工具调用示例

```python
# 1. 提取单个 crashed .pyc 文件的表数据
python raw_binary_scanner.py  # 交互式，修改 main() 中的文件路径

# 2. 批量提取所有 cfg 文件
python batch_subprocess_extract.py  # 会调用 _extract_one.py

# 3. 解码 NeoX bytecode（需文件能 marshal.loads）
python constraint_decoder_v2.py  # 验证解码器

# 4. 快速统计 .bin 文件
python bin_quick_stats.py  # 输出到 bin_quick_stats.json
```

---

## 八、NeoX 逆向技术备忘

### Opcode 替换密码表（19 条，跨文件零冲突）

NeoX marshal 对 co_code 的 opcode 位（偶数字节）做一对一替换，参数位（奇数字节）不变。

| Raw → Decoded | 含义 |
|---------------|------|
| 0x43, 0x8d → 0xa6 | CALL |
| 0x14 → 0x19 | RETURN_VALUE |
| 0xbc,0xc4,0xc8,0xcc,0xcf,0xd1,0xd4,0xdb,0xe4,0xed,0xf0 → 0x00 | CACHE |
| 0x00,0x32,0x82,0x8b,0xa4 → 不变 | 身份映射 |

### Marshal 二进制结构

```
[0] 0xe3 — TYPE_CODE (NeoX variant)
[1-4] argcount (int32 LE)
[5-8] kwonlyargcount
[9-12] nlocals
[13-16] stacksize
[17-20] flags
[21] 0xf3/0x73 — TYPE_STRING (co_code)
[22-25] co_code length
[26+] encrypted co_code bytes
... co_consts (tuple), co_names (tuple), ...
```

### PRECALL+CALL 签名（解密后）

```
0x00 NN 0x00 0x00 0xa6 NN  — 其中 NN = arity
```

---

## 九、项目设计参考建议

### 从 STZB 数据可直接参考的设计

1. **13州地图坐标体系**：2,362+ 城市坐标 + 197 景点 + 1,099 道路 → 可直接生成地图框架
2. **区划层级（含空间边界）**：州(13+1) → 郡(94, 含BBox) → 县(316, 含BBox) → 城市(2362+) → 地块(邻接图)。94郡和316县均有中心坐标+矩形边界(min/max)，ID编码规律清晰(junxian_id÷100=region_id)，可直接用于 Unity 地图生成
3. **技能效果体系**：7 大系 × 121 种效果 → 可直接参考设计战斗系统
4. **兵种数据模板**：20,407 条兵种数据的字段结构 → 参考属性设计
5. **world_join 邻接图**：4,470 条地块连接关系 → 路径规划算法的参考数据

### 不可直接复用的部分

1. **战斗计算公式**：在 libclient.so 中（110MB C++ 代码）
2. **网络协议**：只有部分抓包数据（已解析协议格式，详见 STZB_REVERSE_DESIGN_INSIGHTS.md）
3. **地图渲染代码**：虽有 Python bytecode，但依赖 NeoX 引擎 API，不可移植
4. **3D 模型/着色器**：设备上 25,897 个 3D 文件未拉取，且项目已改用 Unity 引擎

### 图片资源使用建议

| 场景 | 推荐方案 | 备注 |
|------|----------|------|
| 将领头像/卡牌 | STZB 武将立绘 (card_images, hero_ui) | 已解密转 PNG，可直接使用 |
| 地图地形纹理 | STZB 地图纹理 → 后期替换 craftpix.net | 风格不完全匹配，作为快速原型 |
| UI 图标 | STZB 装备图标 (card/) + craftpix.net | 小图标可直接复用 |
| AI 生成补充 | Midjourney 风格锚定 + ComfyUI 批量 | 保持暗金属战争沙盘风格一致性 |

---

## 十、快捷复用路径（复制即用）

### 路径常量

```
# 数据根目录
DATA_ROOT = "tmp/extracted_cfg/"
CRASH_DATA = "tmp/crashed_files_data.json"

# 核心数据文件
CFG_ALL = "tmp/extracted_cfg/cfg_all_data.json"        # 157表, 241K行
ARMY = "tmp/army_data_v5.json"                          # 20407兵种
SKILLS = "tmp/extracted_cfg/skill_effect_map.json"      # 670技能
CITIES = "tmp/extracted_cfg/world_city_5.json"          # 2362城市
SCENIC = "tmp/extracted_cfg/world_scenic.json"          # 197景点
ROADS = "tmp/extracted_cfg/world_road_detail.json"      # 1099道路
EFFECTS = "tmp/effect_id_analysis.json"                 # 121效果语义

# 图片资源（已解密转换为 PNG）
CONVERTED_PNG_ROOT = "tmp/stzb_reverse/assets/converted_png/"
HERO_CARDS    = "tmp/stzb_reverse/assets/converted_png/card_images/"   # 116张武将卡牌(470×592)
HERO_SUMMON   = "tmp/stzb_reverse/assets/converted_png/card_summon/"   # 107张召唤画面
HERO_UI       = "tmp/stzb_reverse/assets/converted_png/hero_ui/"       # 280张英雄UI素材(756×548)
MAP_TEXTURES  = "tmp/stzb_reverse/assets/converted_png/map/"           # 18张地图纹理(≤4096²)
MAP_COMMON    = "tmp/stzb_reverse/assets/converted_png/map_common/"    # 14张地图组件(≤4096²)
EQUIP_ICONS   = "tmp/stzb_reverse/assets/converted_png/card/"          # 24张装备图标

# 标准格式图片
JPG_DIRECT    = "tmp/stzb_reverse/assets/jpg_direct/"                  # 1312张JPG
PNG_DIRECT    = "tmp/stzb_reverse/assets/png_direct/"                  # 303张PNG
LANDSCAPE_PNG = "tmp/stzb_reverse/assets/landscape_png/"               # 48张景观贴图

# 分类数据文件（从 cfg_all_data 拆分）
SPLIT_ROOT      = "tmp/extracted_cfg/split/"
SPLIT_MAP       = "tmp/extracted_cfg/split/cfg_map_world.json"         # 47表, 6.6MB
SPLIT_BATTLE    = "tmp/extracted_cfg/split/cfg_battle_skill.json"      # 30表, 7.2MB
SPLIT_BUILDING  = "tmp/extracted_cfg/split/cfg_building.json"          # 12表, 0.9MB
SPLIT_ACTIVITY  = "tmp/extracted_cfg/split/cfg_activity.json"          # 6表, 0.2MB
SPLIT_MISC      = "tmp/extracted_cfg/split/cfg_misc.json"              # 62表, 0.5MB
SPLIT_INDEX     = "tmp/extracted_cfg/split/cfg_index.json"             # 157表索引

# 逆向工具
SCANNER = "tmp/raw_binary_scanner.py"                   # 安全MarshalParser
DECODER = "tmp/constraint_decoder_v2.py"                # NeoX bytecode解码
OPCODE_MAP = "tmp/opcode_map_full.json"                 # opcode密码表
TEXTURE_DECRYPT = "tmp/_neox_texture_decrypt.py"        # NeoX纹理解密+KTX1解析+PNG转换

# 原始脚本
SCRIPTS_DIR = "tmp/stzb_reverse/scripts_decrypted/"     # 完整脚本树
MAPPING = "tmp/stzb_reverse/scripts_decrypted/_filename_mapping.txt"  # hash→名称
LIBCLIENT = "tmp/stzb_reverse/libs/libclient.so"        # 110MB引擎(待逆向)
```

### TypeScript 数据加载模板

```typescript
import * as fs from 'fs';
import * as path from 'path';

// 加载城市坐标
interface City {
  id: number;
  pos: number;
  type_code: number | string;
  name: string;
  hp_max: number;
  hp: number;
  description: string;
}

const cities: City[] = JSON.parse(
  fs.readFileSync('tmp/extracted_cfg/world_city_5.json', 'utf-8')
);

// 转换坐标
const mapCities = cities
  .filter(c => typeof c.pos === 'number' && c.pos > 10000)
  .map(c => ({
    ...c,
    x: Math.floor(c.pos / 10000),
    y: c.pos % 10000,
  }));

console.log(`${mapCities.length} cities with coordinates`);
```

---

## 十一、资产项目适用性评估

> 评估标准：该资产能否直接用于本 AI 原生 SLG 项目（暗金属战争沙盘视觉风格）

### ✅ 适合直接使用

| 资产类别 | 数量 | 用途 | 适用组件 |
|----------|------|------|----------|
| **武将卡牌立绘** (card_images) | 116 | GeneralProfile 头像、将领详情页 | GeneralChatPanel, BriefingPanel |
| **武将召唤画面** (card_summon) | 107 | 将领招募/获得动画背景 | ReservePanel, 招募流程 |
| **英雄 UI 素材** (hero_ui) | 280 | 将领列表缩略图、HUD 头像 | HomeScreen 左侧将领栏, 各 Panel |
| **装备图标** (card) | 24 | 装备/道具系统图标 | 未来装备系统 |
| **城市坐标数据** (world_city) | 2,362+ | 13州地图框架 | PixiMapBoard, 规则引擎 scenario |
| **技能效果体系** (skill_effect_map) | 670 | 技能系统设计参考 | rules.ts 战斗系统 |
| **道路网络** (world_road_detail) | 1,099 | 路径规划、行军路线 | advanceTick 行军逻辑 |
| **区划层级** (region/junxian/xian) | 9+94+316 | 战区划分 | theater.ts |
| **中文本地化** (zh-cn.txt) | 39KB | UI 文案参考 | 前端中文文案 |

### ⚠️ 有参考价值但需改造

| 资产类别 | 数量 | 限制 | 改造方向 |
|----------|------|------|----------|
| **地图纹理** (map) | 18 | 均为小型UI材质（军队选择器/水面/道路等），非区域背景地图 | 可作为临时占位贴图，但不含按州划分的背景地图 |
| **地图组件** (map_common) | 14 | 城市渲染组件，与 NeoX 3D 引擎适配 | 提取城市图标元素参考 |
| **3D 景观贴图** (landscape_png) | 48 | 用于 NeoX 3D 地形，可参考 Unity 地形 | 提取地形颜色/纹理参考值 |
| **兵种数据** (army_data) | 20,407 | 字段含义需继续推导 | 作为属性平衡参考 |

### ❌ 不适合本项目

| 资产类别 | 数量 | 原因 |
|----------|------|------|
| **JPG 音乐封面/活动图** (jpg_direct) | 1,312 | 运营活动素材，与游戏机制无关 |
| **PNG 3D 纹理** (png_direct 大部分) | ~250 | NeoX 3D 引擎专用纹理，需评估 Unity 可用性 |
| **libclient.so** | 1 | NeoX C++ 引擎二进制，不可移植 |
| **army_data.stb** | 1 | 加密二进制，需 Frida 解密 |
| **gm_dict.json** | 1 | GM 命令字典，加密格式，仅调试参考 |

### 推荐优先使用顺序

1. **数据资产**：城市坐标 + 道路网络 + 区划层级 → 直接生成 13 州地图骨架
2. **技能/战斗**：技能效果体系 + 武将属性表 → 设计 rules.ts 战斗系统
3. **将领头像**：hero_ui + card_images → 替代当前文字缩写头像（heroVisualMonogram）
4. **地图纹理**：map/ + map_common/ → 临时地图贴图（后期用 craftpix.net 或 AI 生成替换）
5. **装备图标**：card/ → 未来装备系统原型

---

*本文档由 GitHub Copilot（Claude Opus 4.6）于 2026-03-19 更新。*
*基于 STZB APK script.npk 逆向工程 + NeoX 纹理解密成果整理，供项目后续 AI 助手快速复用。*
