/**
 * FactionConfigStore.ts — 每势力玩家配置存储
 *
 * 存储两类玩家可配置信息：
 *   1. Doctrine（战略方针）— 每个玩家为自己的势力写的战略意图，
 *      GameClock L2 模式下 CommanderAgent 以此作为规划依据。
 *
 *   2. ModelConfig（LLM 模型配置，BYOK）— 玩家可以：
 *      - 使用免费公共模型（默认）
 *      - 填入自己的 API key（薅羊毛）
 *      - 购买我们的 API 套餐（商业模式）
 *
 * 内存存储，服务重启后重置（将领线上时玩家重新设置即可）。
 * 如需持久化，可在未来版本接入 Redis / 文件写入。
 */

export interface FactionModelConfig {
  /** 使用的模型名，如 'gemini-2.0-flash:free', 'gpt-4o-mini', etc. */
  model: string
  /** 玩家自带的 API key（BYOK）。不存储明文到日志，只用于 LLM 调用。 */
  apiKey?: string
  /** 模型提供商 endpoint（可选；留空时使用服务器默认 LLM_RELAY_URL）*/
  baseUrl?: string
  /** Commander 使用的模型（不填则同上）*/
  commanderModel?: string
  /** General 使用的模型（不填则同上）*/
  generalModel?: string
  /** Unit 使用的模型（不填则同上）*/
  unitModel?: string
}

export interface FactionConfig {
  factionId: string
  /** 玩家写的战略方针，L2 下传给 CommanderAgent */
  doctrine?: string
  /** 玩家的模型配置（BYOK）*/
  modelConfig?: FactionModelConfig
  updatedAt: number
}

// ─── 内存存储 ─────────────────────────────────────────────────────────────────

const store = new Map<string, FactionConfig>()

// ─── 默认 Doctrine（全局 fallback）────────────────────────────────────────────

const DEFAULT_DOCTRINE =
  process.env.AI_DOCTRINE_PROMPT ??
  'Secure strategic passes and resource tiles. Expand when supply is sufficient. Defend under pressure. Scout before advancing.'

// ─── 读取 ──────────────────────────────────────────────────────────────────────

export function getFactionDoctrine(factionId: string): string {
  return store.get(factionId)?.doctrine ?? DEFAULT_DOCTRINE
}

export function getDefaultDoctrine(): string {
  return DEFAULT_DOCTRINE
}

export function getFactionModelConfig(factionId: string): FactionModelConfig | undefined {
  return store.get(factionId)?.modelConfig
}

export function getFactionConfig(factionId: string): FactionConfig | undefined {
  return store.get(factionId)
}

export function getAllFactionConfigs(): FactionConfig[] {
  return Array.from(store.values())
}

// ─── 写入 ──────────────────────────────────────────────────────────────────────

export function setFactionDoctrine(factionId: string, doctrine: string): void {
  const existing = store.get(factionId) ?? { factionId, updatedAt: 0 }
  store.set(factionId, {
    ...existing,
    doctrine: doctrine.slice(0, 1000), // 上限 1000 字符，防止 prompt 注入
    updatedAt: Date.now(),
  })
}

export function setFactionModelConfig(factionId: string, config: FactionModelConfig): void {
  const existing = store.get(factionId) ?? { factionId, updatedAt: 0 }
  store.set(factionId, {
    ...existing,
    modelConfig: {
      model: config.model.slice(0, 100),
      apiKey: config.apiKey?.slice(0, 200),
      baseUrl: config.baseUrl?.slice(0, 200),
      commanderModel: config.commanderModel?.slice(0, 100),
      generalModel: config.generalModel?.slice(0, 100),
      unitModel: config.unitModel?.slice(0, 100),
    },
    updatedAt: Date.now(),
  })
}

export function clearFactionConfig(factionId: string): void {
  store.delete(factionId)
}
