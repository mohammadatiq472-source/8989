# AI 玩家语音命令未实现项（2026-04-27）

## 当前结论

- 本阶段不接真实语音转文字。
- Godot 主界面聊天只保留 `语音` 入口占位，避免阻塞自然语言文字命令闭环。
- 语音链路后续必须复用同一条正式命令链：自然语言文本 -> JSON proposal -> 后端审批/执行 -> receipt 回聊天流。

## 后续正式 contract 草案

1. Godot 录音入口采集音频。
2. `POST /api/ai/players/:id/chat/voice-command`
3. 后端接 ASR adapter，把音频转为中文文本。
4. ASR 文本进入现有 `POST /api/ai/players/:id/chat/messages` 等价路径。
5. 模型仍只允许输出严格 JSON proposal。
6. 后端继续负责 schema 校验、动作白名单、预算/审批、WorldService/rules 执行和 receipt。
7. receipt 与失败原因继续回写 AI 聊天流。

## 待定问题

- ASR 服务供应商与模型名。
- 音频格式：`webm / wav / m4a`。
- 单条音频最大时长与大小。
- 移动端录音权限失败时的玩家文案。
- 是否保存音频原文；默认建议不保存音频，只保存 ASR 文本和 proposal/receipt。

## 安全边界

- 语音只生成文本命令，不允许绕过后端 action whitelist。
- 语音文本不得直接写世界、改数据库或改代码。
- ASR secret 只能来自临时环境变量或后续受保护配置，不写入仓库。
