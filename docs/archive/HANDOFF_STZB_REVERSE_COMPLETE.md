# 率土之滨（STZB）逆向工程 — 完整交接报告

> **编写日期**：2026-03-18  
> **覆盖范围**：数十次对话的全部逆向工程成果  
> **工作目录**：`C:\Users\Buffoon Queer\Desktop\8989\tmp\`  
> **数据目录**：`C:\Users\Buffoon Queer\Desktop\8989\tmp\stzb_reverse\`  
> **前置文档**：`docs/STZB_REVERSE_DESIGN_INSIGHTS.md`（已有协议/协议映射）

---

## 一、项目背景与目标

### 为什么要逆向 STZB

率土之滨（STZB）是网易的 SLG 大地图手游，其战斗机制、武将属性、地图结构是同类游戏中最精密的之一。逆向工程的目的不是外挂，而是：

1. **获取战斗公式**（攻城伤害、兵损计算、技能触发系数）→ 用于本 AI 原生 SLG 项目的设计参考
2. **获取地图数据**（城市坐标、道路网络、地名）→ 为本项目的 YouZhou 地图提供真实参考
3. **获取技能体系**（技能ID、技能名、效果链）→ 理解"垂直深度"设计哲学
4. **获取兵种体系**（兵种 ID、升阶链、属性基准）→ 验证本项目平衡性假设

### 关键约束

- 游戏客户端在 **Android APK** 中，核心脚本为 NeoX 引擎（网易自研）加密的 `.py.pyc` 文件
- 网络协议为自定义二进制协议（非 protobuf）
- 本逆向研究仅用于个人学习与本项目设计参考，不涉及网络攻击或外挂

---

## 二、技术架构图

```
STZB APK
├── libclient.so ─────── NeoX 引擎（C++），含 Python 3.11 虚拟机魔改版
├── scripts_encrypted/ ─ 加密脚本，XOR + 自定义密钥
└── assets/ ──────────── 图片/音频

解密后 → scripts_decrypted/
├── *.bin (根目录 ~11,000 个) ─── NeoX 私有 marshal 格式（标准 Python 无法解析）
└── **/**/*.py.pyc ────────────── 标准 CPython 3.11 pyc（可用 marshal.loads 解析）
    ├── db_data/cfg/ (273 个)  ← ✅ 已全部扫描，157 个成功提取
    ├── activity/ (283 个)     ← ❌ 未处理
    ├── lib/ (149 个)          ← ❌ 标准库，价值低
    ├── army/ (19 个)          ← ❌ 行军逻辑，待处理
    ├── skill/ (~30 个)        ← ❌ 技能逻辑，待处理
    └── ... (更多目录)
```

### NeoX 字节码特征

NeoX 对 CPython 3.11 字节码做了 opcode 混淆：
- **opcode 顺序被打乱**（非标准编号）
- **CACHE 条目依然存在**（每个 CALL/LOAD_ATTR 后跟 N 个 `00 00` CACHE pair）
- **EXTENDED_ARG 编码特殊**：`00 HH` 表示高字节扩展，而非标准 `0x90 HH`
- 字节码格式仍是 word code（每指令 2 字节：opcode + arg）

---

## 三、核心工具清单

所有工具均在 `tmp/` 目录下。**当前可用的稳定版本如下**：

### 3.1 字节码解码器 `constraint_decoder_v2.py`

| 属性 | 值 |
|------|-----|
| 位置 | `tmp/constraint_decoder_v2.py` |
| 功能 | NeoX → CPython 3.11 字节码映射，含多层约束求解 |
| 当前准确率 | **98%（663/676 指令正确）** |
| 已知 bug | ①列表推导式中 FOR_ITER 识别（每处产生 3 个错误）；②PRECALL vs IMPORT_NAME 歧义（`00 01 00 00 82 xx` 模式） |
| 验证方法 | `py -3.11 constraint_decoder_v2.py` → 末行输出准确率 |

**已识别的关键 NeoX opcode 映射**（部分，仍有歧义项）：

| NeoX 字节 | CPython 3.11 指令 | 备注 |
|-----------|-----------------|------|
| `0xa6 NN` | `CALL(NN)` | 后跟 4 个 `00 00` CACHE |
| `0x00 NN` | `LOAD_CONST(NN)` 或 `RESUME(0)` 等 | 最常见歧义点 |
| `0x19` | `RETURN_VALUE` | |
| `0x32` | `PUSH_NULL` 或 `NOP` | 上下文判断 |
| `0xa4 NN` | `LOAD_NAME(NN)` | |
| `0x82 NN` | `IMPORT_NAME(NN)` | |
| `0x61 NN` | `LOAD_FAST(NN)` | |
| `0x8c NN` | `STORE_FAST(NN)` | |
| `0x45 NN` | `PRECALL(NN)` | 后跟 CACHE |

### 3.2 直接字节码扫描器 `army_raw_extract3.py`

| 属性 | 值 |
|------|-----|
| 位置 | `tmp/army_raw_extract3.py` |
| 功能 | 不依赖解码器，直接扫描二进制 PRECALL+CALL 模式提取数据 |
| 成果 | **20,407 条**兵种记录，**0 错误** |
| 输出 | `army_data_v5.json` |

**核心算法**（以兵种表为例）：
```python
# 扫描模式: PRECALL(7) + CACHE + CALL(7)
# 字节序列: 00 07 00 00 a6 07
pattern = bytes([0x00, 0x07, 0x00, 0x00, 0xa6, 0x07])

# EXTARG 检测（NeoX 特有）：在一个 call block 内
# 所有 EXTARG 共享同一个高字节 HH（即 "00 HH" 格式）
# 检测算法: 找出满足 (HH<<8)|LL >= 256 的最常见 HH
```

### 3.3 子进程安全扫描器 `cfg_scan_subprocess.py` + `_probe_one.py`

| 属性 | 值 |
|------|-----|
| 位置 | `tmp/cfg_scan_subprocess.py` + `tmp/_probe_one.py` |
| 功能 | 用子进程隔离扫描每个 .pyc 文件，避免 marshal.loads C 层崩溃污染主进程 |
| 结果 | 189 OK / 84 崩溃（崩溃代码 0xC0000374 = HEAP_CORRUPTION） |
| 输出 | `cfg_scan_results.json` |

### 3.4 批量提取器 `batch_subprocess_extract.py` + `_extract_one.py`

| 属性 | 值 |
|------|-----|
| 位置 | `tmp/batch_subprocess_extract.py` + `tmp/_extract_one.py` |
| 功能 | 对所有安全文件运行 PRECALL 模式提取，汇总输出 |
| 结果 | **157 个表，241,229 行** |
| 输出 | `extracted_cfg/cfg_all_data.json` + `cfg_summary.json` |

---

## 四、已提取数据清单

### 4.1 核心输出文件

| 文件路径 | 内容 | 行数/条数 | 格式 |
|--------|------|---------|------|
| `tmp/army_data_v5.json` | 兵种配置（324服版本） | 20,407 条 | `{army_id: [f1..f6]}` |
| `tmp/extracted_cfg/cfg_all_data.json` | 全部157个配置表 | 241,229 行 | `{表名: {arity:N, rows:[...]}}` |
| `tmp/extracted_cfg/cfg_summary.json` | 157表摘要（表名/字段数/行数） | 157 条 | JSON 数组 |
| `tmp/extracted_cfg/skill_effect_map.json` | 技能→效果映射 | 670 条 | `{skill_id: {name, effects[]}}` |
| `tmp/extracted_cfg/world_city_5.json` | 第5服世界城市 | 2,362 条 | `[{id,pos,name,hp_max,...}]` |
| `tmp/extracted_cfg/world_scenic.json` | 风景/地标（3个服版本合并） | 197 条 | `[{pos,name,description,...}]` |
| `tmp/extracted_cfg/world_road_detail.json` | 道路网络 | 1,099 条 | `[{from_pos,to_pos,...}]` |
| `tmp/cfg_scan_results.json` | 文件扫描结果（OK/崩溃） | 273 条 | `[{file, status, error?}]` |

### 4.2 按类别的重要表

**兵种系统**：
- `Tb_cfg_army_324`（20,407行）— 兵种 ID + 6字段的升阶链
- `Tb_cfg_army_count_324`（844行）— 兵种数量配置
- `Tb_cfg_army_formation`（5行）— 5种阵型配置

**武将系统**：
- `Tb_cfg_hero_u`（19,869行×4服版本 = ~8万行）— 武将升级表
- `Tb_cfg_hero_type_feature_extend`（2版本）— 武将特性扩展

**地图系统**：
- `Tb_cfg_world_city`（多服版本，最大13,218行）— 世界城市完整配置
- `Tb_cfg_world_join`（多服版本）— 区域连接
- `Tb_cfg_world_xian`（多服版本，613行/服）— 郡县数据
- `Tb_cfg_client_scenic`（8,264行）— 客户端风景点
- `Tb_cfg_world_road_detail`（1,102行）— 道路网络

**技能系统**：
- `Tb_cfg_skill_effect_map`（687行）— 技能→效果映射，已导出为独立 JSON

**建筑/资源**：
- `Tb_cfg_build`（174行×7服版本）— 建筑配置
- `Tb_cfg_build_cost`（1,742行）— 建设费用
- `Tb_cfg_build_point`（4,245行）— 建设点位

### 4.3 坐标编码规则（已确认）

```python
pos = x * 10000 + y
# 例子: pos=7340711 → x=734, y=711（从 world_scenic.json 验证）
# 地图范围约: x=[0, 1000], y=[0, 2000]（基于城市数据统计）
```

### 4.4 已验证的技能样本（`skill_effect_map.json`）

| skill_id | 技能名 | 效果 ID 列表 |
|----------|--------|-------------|
| 200003 | 金吾飞将 | [77, 152, 301, 501] |
| 200004 | 胡笳离愁 | [401, 402] |
| 200005 | 闭月 | [202, 503] |
| 200007 | 将倾之柱 | [302, 522, 524] |
| 200008 | 黄天当立 | [152, 306, 500000401] |
| 200010 | 天下无双 | [101, 106, 505, 511, 551] |
| 200022 | 长坂之吼 | [301, 771] |
| 200034 | 侵掠如火 | [131, 531, 761] |

**注**：效果 ID 的具体含义（101=攻击加成？301=连击？）尚未完全映射，需要继续解析 `skill/` 目录。

---

## 五、已解析的协议层（网络抓包成果）

> 详见 `docs/STZB_REVERSE_DESIGN_INSIGHTS.md`，此处仅摘要最重要部分。

### 核心协议（已完全解析）

```
TCP 长连接 → 42.186.76.238:8001

包头格式:
[0:4]  = 包总大小 (BigEndian uint32)
[4:8]  = cmdId   (BigEndian uint32)
[12]   = 数据类型 (2=明文, 3=zlib+JSON, 5=XOR152+JSON)
[17:]  = 数据体
```

| cmdId | 含义 | 重要性 |
|-------|------|--------|
| **90005** | 数据同步（增量表更新）| ⭐⭐⭐⭐⭐ 最重要 |
| **5028** | 世界快照（完整地图/部队状态）| ⭐⭐⭐⭐⭐ |
| **10** | 战斗数据初始化 | ⭐⭐⭐⭐ |
| **92** | 战报 | ⭐⭐⭐⭐ |
| **6231** | 战报回放 | ⭐⭐⭐⭐ |
| **829** | 武将详细属性 | ⭐⭐⭐⭐ |

### cmdId 90005 表结构

通过 `00 9c 05`（大端 PRECALL 序列）在 `.bin` 文件中可定位。包含的主表：
- `Tb_hero`（武将基础数据）
- `Tb_army`（部队状态）  
- `Tb_world_city`（城市状态）
- `Tb_user_res`（资源）
- `Tb_battle_report_attack`（战报）

字段映射见 `docs/STZB_REVERSE_DESIGN_INSIGHTS.md` 第二节。

---

## 六、尚未解决的问题

### 6.1 84 个崩溃文件（`0xC0000374` HEAP_CORRUPTION）

**原因**：这些文件使用了 NeoX 私有 marshal 格式（与标准 CPython 3.11 不兼容）。不是文件损坏，是格式不同。

**已知失败的表（含重要数据）**：
- `tb_cfg_junxian_connection_*`（18 个，全军覆没）— 郡县连接关系
- `tb_cfg_world_join_*`（14 个）— 区域连接
- `tb_cfg_client_scenic_*`（5 个：214/224/304/344/904 服）— 其他服景点
- `tb_cfg_army_2`, `tb_cfg_army_344`, `tb_cfg_army_5054`（3 个）— 其他服兵种
- `tb_cfg_black_market_*`（多个）— 黑市配置
- `tb_cfg_sys_policy_*`（多个）— 政策配置

**三种绕过方案**（未实施）：
1. **直接二进制扫描**：跳过 marshal，直接在 .pyc 原始字节中搜索 PRECALL 模式（`00 NN 00 00 a6 NN`）。这不需要 marshal 解析，理论上对所有格式都有效。
2. **Frida hook**：Hook `libclient.so` 中的 `marshal_loads` C 函数，在解析时捕获数据。
3. **换 Python 版本**：某些文件可能是 Python 3.10 格式，用 3.10 解析。

### 6.2 `~/.bin` 根目录文件（~11,000 个，NeoX 私有 marshal）

这些是最核心的逻辑文件（Python 源码对应的字节码），目前**完全无法解析**。解锁需要：
- 逆向 `libclient.so` 中的 `NeoXMarshal::loads` 函数（IDA/Ghidra）
- 或者 Frida hook `libclient.so!_ZN4neox13marshal_loads`

### 6.3 效果 ID 语义未映射

技能效果 ID（如 101、152、301、401、522 等）的具体含义尚不明确。解决路径：
- 解析 `skill/` 目录的 `.py.pyc` 文件（效果处理逻辑）
- 对比网络抓包中的战斗数据（cmdId=10 战斗数据包含 `all_skill_info`）

### 6.4 武将基础属性缺失

`Tb_cfg_hero_u` 已提取（武将升级表），但**武将基础属性表**（武将 ID → 兵法/统率/谋略等基础值）可能在 `.bin` 文件中，或在 `db_data/hero/` 子目录（未处理）。

### 6.5 解码器 FOR_ITER bug（低优先级）

`constraint_decoder_v2.py` 在列表推导式中仍有 2% 错误率。修复方案已知但未实施：
- 在 FOR_ITER 判断时检查后续指令是否为 STORE_FAST/STORE_NAME

---

## 七、数据质量已知问题

| 文件 | 问题 | 严重度 |
|------|------|--------|
| `world_city_5.json` | `type_code` 字段是混淆字符串（无法直接读）| 🔴 高 |
| `world_city_5.json` | 部分 `pos` 字段含中文或为父ID引用 | 🔴 高 |
| `skill_effect_map.json` | skill_id=200229 数据污染（解析 bug） | 🟡 中 |
| `army_data_v5.json` | 字段 `[0]-[5]` 含义未完全确认 | 🟡 中 |
| 多表 | 同一表存在多个服版本（324=324级服,5=5服等）| 🟢 低（可区分） |

---

## 八、后续推进路线图

### P0（已完成 ✅ — 2026-03-18）

**P0.1 ✅ 对 84 个崩溃文件做直接二进制扫描**
```python
# 实际执行：创建 raw_binary_scanner.py，完全绕过 marshal.loads
# 关键发现：NeoX marshal 对 co_code 做 opcode 替换加密（不是加密，是替换映射表）
# 提取了 19 个 NeoX→CPython opcode 映射（跨文件一致，无冲突）
# 结果：83/84 成功，153,111 行数据提取
# 唯一失败：map_city_road_detail_table_244.py.pyc（dict literal 模式，非函数调用）
# 工具：raw_binary_scanner.py（含安全 MarshalParser，可处理标准 marshal 类型）
# 输出：crashed_files_data.json（83个文件的完整数据）
```

**P0.2 ✅ 解析武将基础属性**（上一个会话完成）
```python
# tb_cfg_hero_new_cost: 58 SSR 武将，12 个字段
# 字段映射：[hero_type_id, rarity(25/30), force, governance, wisdom, charisma, speed, sub1-sub5]
```

**P0.3 ✅ 效果 ID 语义推导**
```python
# 全局搜索所有可解析 .pyc 文件确认：效果处理 dispatch 不在客户端
# 改用数据分析方法：按 effect_id 分组所有 670 个技能的中文名
# 从名称语义推导效果含义（如"火箭,火辎,赤壁大火"→效果305=火攻）
# 结果：121 种效果全部分类，7 大系（100属性/200伤害/300核心/400治疗/500增减益/700高阶/900特殊）
# 详见 docs/STZB_REVERSE_DESIGN_INSIGHTS.md 第十二节（大幅更新版）
# 输出：effect_id_analysis.json（每个效果ID→关联技能名列表）
```

### P1（需要额外工具，2-8小时）

**P1.1 解析 `skill/` 目录** — 部分完成
```bash
# skill/ 只有 6 个 UI 文件（非逻辑层）
# 效果计算逻辑在服务端 C++ (libclient.so) 中执行
```

**P1.2 解析 `army/` 目录（行军逻辑）**
- 19 个文件，全部可 marshal.loads 解析
- 全部是 UI 层代码（army_util, army_formation, army_dispatch 等）
- 行军速度公式/战斗计算在服务端

**P1.3 解析 `network/` 目录（协议处理）**
- 补全 cmdId 映射表
- 确认 `Tb_*` 表的字段名顺序

**P1.4 ⭐ 用 raw_binary_scanner.py 批量扫描 11,102 个 .bin 文件**
```python
# 新增任务！基于 P0.1 的突破
# MarshalParser 已验证能解析标准 marshal 类型
# opcode 映射表对 .bin 文件同样适用
# 风险：.bin 可能含 NeoX 自定义 marshal 类型（会抛异常）
# 建议：先批量扫描，统计成功率
```

### P2（需要逆向 native 层，数天）

**P2.1 解锁 `.bin` 文件（NeoX 私有 marshal）**
- 工具：IDA Pro / Ghidra 分析 `libclient.so`
- 目标函数：`NeoXMarshal::loads` 或 `neox_unmarshal`
- 预期：解锁 ~11,000 个核心文件，含战斗公式的核心实现

**P2.2 Frida hook 实时数据**
- 目标：在真实对战中 hook 战斗计算函数，获取实际参数值
- 前置：需要 root Android 设备 + Frida server

---

## 九、关键发现总结（设计参考价值）

### 9.1 技能体系的垂直深度

STZB 有 **670 个具名技能**（200003-200611+），每个技能有 1-5 个效果链。这意味着：
- 本项目不需要也不能一次推出几百个技能
- 应该先做 **20-30 个核心技能**，每个有 2-4 个独特效果
- 技能效果 ID 存在 `500000xxx` 形式的特殊 ID，可能是"传奇"或"本命"效果

### 9.2 兵种体系的多维扩展

20,407 条兵种记录中，**16,324 个唯一 ID**，说明兵种有多个变体（服务器版本/精锐化等），不是简单的线性升阶树。本项目设计时，兵种体系应保持简单（5-10种基础兵种）。

### 9.3 地图精度

- 城市 2,362 个（第5服），景点 197 个
- 坐标系：1000×2000 级别的格子地图
- 比本项目当前设计的 `1万格子`（~100×100）大约 200 倍

本项目 YouZhou 地图应参考 STZB 的**地名分布**（已有坐标数据），但规模缩小至 200×500 格子级别。

### 9.4 协议频率（AI 感知层参考）

- `cmdId 90005`（增量表更新）：每 10-30 秒一次 → **AI 的 "Tick" 设计周期参考**
- `cmdId 5028`（世界快照）：每秒级别 → **前端地图渲染频率参考**  
- `cmdId 694`（心跳）：60 秒 → **连接保活参考**

---

## 十、脚本快速索引

```bash
# 重新运行提取（如需更新数据）
cd C:\Users\Buffoon Queer\Desktop\8989\tmp

$PY = 'C:\Users\Buffoon Queer\AppData\Local\Programs\Python\Python311\python.exe'

# 1. 验证解码器准确率
& $PY constraint_decoder_v2.py

# 2. 提取兵种数据（army_data_v5.json）
& $PY army_raw_extract3.py

# 3. 扫描所有 cfg 文件（cfg_scan_results.json）
& $PY cfg_scan_subprocess.py

# 4. 批量提取所有 cfg 表（cfg_all_data.json）
& $PY batch_subprocess_extract.py

# 5. 导出关键表为独立 JSON
& $PY save_key_tables.py

# 6. 验证坐标编码
& $PY decode_coords.py
```

---

## 十一、文件依赖树

```
constraint_decoder_v2.py     ← 解码器（98%准确率）
    用于: batch_decode.py（已废弃，太慢）
    不用于: army_raw_extract3.py（直接字节扫描，更快更准）

army_raw_extract3.py         ← 兵种数据专用提取器
    输出: army_data_v5.json

cfg_scan_subprocess.py       ← 安全扫描器
    调用: _probe_one.py（子进程 worker）
    输出: cfg_scan_results.json

batch_subprocess_extract.py  ← 批量提取器
    调用: _extract_one.py（子进程 worker）
    依赖: cfg_scan_results.json
    输出: extracted_cfg/cfg_all_data.json
         extracted_cfg/cfg_summary.json

save_key_tables.py           ← 关键表导出
    依赖: extracted_cfg/cfg_all_data.json
    输出: skill_effect_map.json
         world_city_5.json
         world_scenic.json
         world_road_detail.json
```

---

## 十二、历史 Handoff 文档链

| 日期 | 文件 | 主要内容 |
|------|------|---------|
| 2026-03-17 | `docs/HANDOFF_2026_03_17.md` | 项目整体架构、CommanderAgent 初版 |
| 2026-03-17 | `docs/HANDOFF_2026_03_17_EDITOR_SESSION.md` | 编辑器会话上下文 |
| 2026-03-18 | `docs/HANDOFF_2026_03_18.md` | AI 后端 bug 修复（战斗触发归零→8场战斗）|
| 2026-03-18 | `docs/STZB_REVERSE_DESIGN_INSIGHTS.md` | 协议映射、表结构（协议层重点）|
| **2026-03-18** | **本文档** | **逆向工程完整成果总结** |

---

## 附录 A：已解码 NeoX Opcode 完整映射表

> 基于 `constraint_decoder_v2.py` 内的约束集推导

| NeoX Opcode | CPython 3.11 Opcode | 指令名 | CACHE数 | 置信度 |
|-------------|---------------------|--------|---------|--------|
| 0x00 0x00 | 149 | RESUME | 0 | 高（文件开头固定） |
| 0x00 NN | 100 | LOAD_CONST | 0 | 高 |
| 0x00 NN | 93 | FOR_ITER | 1 | 中（上下文依赖） |
| 0x19 | 83 | RETURN_VALUE | 0 | 高 |
| 0x32 | 2 | NOP/PUSH_NULL | 0 | 中 |
| 0x45 NN | 237 | PRECALL | 0 | 高 |
| 0x61 NN | 124 | LOAD_FAST | 0 | 高 |
| 0x82 NN | 108 | IMPORT_NAME | 0 | 高 |
| 0x8c NN | 125 | STORE_FAST | 0 | 高 |
| 0xa4 NN | 116 | LOAD_NAME | 0 | 高 |
| 0xa6 NN | 171 | CALL | 4 | 高（后跟4个CACHE）|

### 附录 A.2：NeoX Marshal Opcode 替换密码表（2026-03-18 新增 ⭐）

> 关键发现：NeoX 的 marshal 在序列化 co_code 时对 opcode 做一对一替换加密。
> Args（奇数字节位）不变，仅 Opcodes（偶数字节位）被替换。
> 该映射从多个 working 文件比对确认，跨文件零冲突。
> 这是绕过 marshal.loads 崩溃、直接二进制扫描的关键技术。

| Raw（文件中） | Decoded（CPython） | 身份映射？ | 解码含义 |
|-------------|-------------------|----------|---------|
| 0x00 | 0x00 | ✅ | CACHE |
| 0x14 | 0x19 | ❌ | RETURN_VALUE |
| 0x32 | 0x32 | ✅ | PUSH_NULL |
| 0x43 | 0xa6 | ❌ | CALL |
| 0x82 | 0x82 | ✅ | IMPORT_NAME |
| 0x8b | 0x8b | ✅ | LOAD_ATTR (?) |
| 0x8d | 0xa6 | ❌ | CALL (variant) |
| 0xa4 | 0xa4 | ✅ | LOAD_NAME |
| 0xbc | 0x00 | ❌ | CACHE |
| 0xc4 | 0x00 | ❌ | CACHE |
| 0xc8 | 0x00 | ❌ | CACHE |
| 0xcc | 0x00 | ❌ | CACHE |
| 0xcf | 0x00 | ❌ | CACHE |
| 0xd1 | 0x00 | ❌ | CACHE |
| 0xd4 | 0x00 | ❌ | CACHE |
| 0xdb | 0x00 | ❌ | CACHE |
| 0xe4 | 0x00 | ❌ | CACHE |
| 0xed | 0x00 | ❌ | CACHE |
| 0xf0 | 0x00 | ❌ | CACHE |

**注意**：此表仅包含 cfg 数据文件中使用的 19 个 opcode。逻辑代码文件可能使用更多 opcode。
对于映射到 0x00 的多个 raw opcode，在 cfg 文件中它们全是 CACHE 指令；
在逻辑代码文件中，这些 raw 值可能映射到不同的 CPython opcode（如 LOAD_CONST, STORE_SUBSCR 等）。

---

## 附录 B：关键文件校验值

运行时验证文件完整性（不需要文件不变，仅作参考）：

```
army_data_v5.json         — 16,324 个唯一 army_id
cfg_all_data.json         — 157 个表名（cfg_summary.json 中有完整列表）
skill_effect_map.json     — 670 条（ID 200003-200611+）
world_city_5.json         — 2,362 条城市
world_scenic.json         — 197 条景点
world_road_detail.json    — 1,099 条道路
cfg_scan_results.json     — 273 条（189 OK + 84 失败）
crashed_files_data.json   — 83 条（从 84 个崩溃文件恢复，153,111 行数据）
effect_id_analysis.json   — 121 种效果 ID → 技能名映射
opcode_map_full.json      — 19 条 NeoX→CPython opcode 映射
```

---

*本文档由 GitHub Copilot（Claude Opus 4.6）于 2026-03-18 自动生成并更新，基于数十次对话成果整理。*
