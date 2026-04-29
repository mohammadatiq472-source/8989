# 开发态世界持久化重置说明（2026-04-22）

## 1. 结论

开发态可以重置本地 world persist，让后端用新的 seed/version 重新生成资源地。

但这个能力只用于本地开发，不是线上旧世界迁移，不是旧资源 PNG 资产清理，也不是 Godot 视觉贴图替换。

正式口径：

- 本地开发可删除 `tmp/world_snapshot.json`。
- 删除前命令会先备份。
- 只允许目标在仓库 `tmp/` 目录下。
- 如果后端服务正在运行，命令会拒绝执行。
- `NODE_ENV=production` 时命令会拒绝执行。

## 2. 命令

只看将要重置什么，不删除：

```text
npm run dev:world:persist:reset:dry-run
```

执行开发态重置：

```text
npm run dev:world:persist:reset
```

指定开发态目标文件：

```powershell
$env:DEV_WORLD_RESET_TARGET_PATH="C:\Users\26739\Desktop\8989\tmp\world_snapshot.json"
npm run dev:world:persist:reset
```

或：

```text
npm run dev:world:persist:reset -- --path tmp/world_snapshot.json
```

## 3. 安全规则

命令会拒绝：

- `NODE_ENV=production`
- 目标路径不在仓库 `tmp/` 下
- 目标路径是目录
- 默认健康检查发现后端还在运行

如果确实在隔离测试里需要跳过健康检查，可设置：

```text
DEV_WORLD_RESET_SKIP_HEALTH_CHECK=1
```

不要在真实服务运行时使用这个跳过项。

## 4. 重置后做什么

重置本地开发世界后，按需要设置：

```text
WORLD_RESOURCE_SEED
WORLD_RESOURCE_GENERATION_VERSION
WORLD_RESOURCE_TILE_DENSITY_PERMILLE
WORLD_RESOURCE_LEVEL_WEIGHT_TABLE
WORLD_RESOURCE_KIND_WEIGHT_TABLE
```

再启动后端：

```text
npm run start
```

然后验证：

```text
npm run ops:world:resource-generation
npm run gate:world:resource-authority
```

## 5. 和新赛季 / 新服的关系

开发态 reset 是为了本地快速清空旧开发 world snapshot。

新赛季 / 新服仍然推荐使用新的 `WORLD_STATE_PERSIST_PATH`，而不是删除或覆盖旧世界。

线上旧世界如果必须迁移，不能使用这个命令，必须单独设计：

- backup
- dry-run
- migrationId
- rollback
- AI 采集记录处理
- 占领与驻军处理
- gate 验证

## 6. 和旧资源资产的关系

这里的“旧世界”指后端持久化 world state。

它不是：

- 旧世界地图贴图
- 旧山体地块 PNG
- 旧资源地 PNG
- Godot asset import 缓存

资源 PNG 替换和投影落格仍由 Godot 视觉窗口处理；本命令只影响后端本地开发 world snapshot。

## 7. 给后续 AI 的执行口径

如果用户说“开发期重新洗资源地”：

1. 先确认是本地开发世界，不是线上旧服。
2. 停止后端。
3. 运行 `npm run dev:world:persist:reset:dry-run`。
4. 确认目标在 `tmp/` 下。
5. 运行 `npm run dev:world:persist:reset`。
6. 设置新的 seed/version。
7. 启动后端。
8. 运行 `npm run ops:world:resource-generation`。
9. 运行 `npm run gate:world:resource-authority`。

如果用户说“线上旧世界迁移”，不要用这个命令，转入新赛季 / 新服重洗设计。
