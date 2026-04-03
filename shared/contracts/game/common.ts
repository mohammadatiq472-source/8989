export type TileType = 'plain' | 'resource' | 'pass' | 'city' | 'fog'
export type TileTerrain =
  | 'grassland'
  | 'forest'
  | 'highland'
  | 'mountain'
  | 'riverland'
  | 'urban'
  | 'wasteland'
export type TileOwner = string
export type ResourceKind = 'wood' | 'stone' | 'iron' | 'food'
export type FactionId = string
export type RegionRole = 'frontier' | 'support' | 'recon' | 'resource'
export type RegionPriority = 'low' | 'medium' | 'high'
export type AllianceStance = 'hold' | 'support' | 'harass' | 'expand'
export type UnitStatus =
  | '待命'
  | '行军中'
  | '交战中'
  | '驻防中'
  | '侦察中'
  | '支援中'
  | '占领中'
export type ActionType = 'march' | 'garrison' | 'recon' | 'support' | 'capture'
export type ExecutionEnqueueMode = 'replace' | 'append' | 'reject_if_active'
export type GeneralDirective = {
  generalId: string
  instruction: string
  targetTileId?: string
  action?: ActionType
}

export type GeneralDirectivePreviewItemStatus = 'accepted' | 'duplicate' | 'conflict' | 'rejected'
export type GeneralDirectivePreviewMatchMode = 'exact' | 'normalized' | 'partial' | 'fuzzy' | 'none'
export type GeneralDirectivePreviewConfidence = 'high' | 'medium' | 'low'

export type GeneralDirectivePreviewItem = {
  directiveIndex: number
  generalIdInput: string
  instruction: string
  status: GeneralDirectivePreviewItemStatus
  confidence: GeneralDirectivePreviewConfidence
  matchMode: GeneralDirectivePreviewMatchMode
  reason: string
  warning?: string
  action: ActionType
  resolvedGeneralId?: string
  resolvedGeneralName?: string
  resolvedUnitId?: string
  targetTileId?: string
  targetTileName?: string
}

export type HeroArchetype =
  | 'assault'
  | 'recon'
  | 'guard'
  | 'mobile'
  | 'heavy'
  | 'logistics'
  | 'reserve'
export type TroopType = 'infantry' | 'cavalry' | 'shield' | 'mixed' | 'supply'
export type HeroFaction = '魏' | '蜀' | '吴' | '群' | '未知'
export type HeroCardType = '步' | '骑' | '弓'
/** @deprecated 旧品质标记，保留向后兼容。新代码请使用 HeroQualityTier (1-5) */
export type HeroQuality = '1-N' | '2-UC' | '3-R' | '4-SR' | '5-SSR'

/** 武将品质星级 (1-5)，数值等于基础黄星数和可升红星上限 */
export type HeroQualityTier = 1 | 2 | 3 | 4 | 5
export type TacticalTemplateId =
  | 'rally'
  | 'harass'
  | 'withdraw'
  | 'breakthrough'
  | 'sweep'
  | 'garrison'
export type TacticalOverrideStatus = 'queued' | 'committed' | 'completed' | 'failed' | 'cancelled'
export type IntelligenceLevel = 'unknown' | 'suspected' | 'confirmed'
export type OrderStatus = 'queued' | 'running' | 'completed' | 'failed'
export type PlanSource = 'mock' | 'local' | 'gateway'
export type PlannerMode = 'mock' | 'local' | 'gateway'
export type PlanningJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'stale'
export type ExecutionReplayOutcome = 'running' | 'completed' | 'failed' | 'cleared'
export type ReplayHighlightKind =
  | 'enemy_turn'
  | 'alliance_turn'
  | 'tile_control'
  | 'intel'
  | 'logistics'
  | 'planning'
  | 'battle'
export type ReplayHighlightSeverity = 'high' | 'medium' | 'low'

export type PlanningFailureCategory =
  | 'validation'
  | 'gateway_http'
  | 'gateway_network'
  | 'gateway_timeout'
  | 'gateway_quota'
  | 'provider_error'
  | 'unknown'

export type PlannerMetrics = {
  requestId?: string
  gatewayProvider: string
  model: string
  latencyMs: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  failureCategory?: PlanningFailureCategory
}
