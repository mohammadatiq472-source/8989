# 13 - Unity Backend Endpoint Config (A/B 双机联调)

## 目标

避免 Unity 客户端硬编码 `localhost`，支持在 Inspector 中配置后端地址，满足 A/B 双机局域网联调。

## 变更点

1. `BackendApi` 支持构造注入 `baseUrl`（默认 `http://127.0.0.1:8787`）。
2. `GameManager` 新增 Inspector 字段 `backendHttpBase`。
3. `wsEndpoint` 允许留空，留空时自动从 `backendHttpBase` 推导：
   - `http://host:port` -> `ws://host:port/ws`
   - `https://host:port` -> `wss://host:port/ws`

## 使用方式

1. 在 Unity 场景中选中 `GameManager`。
2. 设置 `Backend Endpoint / backendHttpBase`：
   - 单机：`http://127.0.0.1:8787`
   - 局域网 A->B：`http://<A机IP>:8787`
3. 如无特殊需求，将 `wsEndpoint` 保持为空，系统会自动推导。

## 验收

- 运行后日志不再依赖硬编码 localhost。
- 更改 `backendHttpBase` 后，HTTP 与 WS 请求地址一致指向目标主机。
