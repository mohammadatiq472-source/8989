import type { BattleOutcomeRecord, DiplomacyAgreement, NarrativeEvent } from '../game'

/** ???????upsert = ??????delete = ?? */
export type WsDeltaUnitChange = {
  id: string
  op: 'upsert' | 'delete'
  data?: {
    name: string
    faction: string
    tileId: string
    strength: number
    supply: number
    status: string
  }
}

export type WsDeltaTileChange = {
  id: string
  owner: string | null
  enemyPressure: number
}

export type WsDeltaFactionStat = {
  territories: number
  totalStrength: number
  unitCount: number
}

export type WsAiQuotaChange = {
  factionId: string
  previousQuota: number
  currentQuota: number
  maxQuota: number
  growthScore: number
  tugIntensity: number
  nextUnlockScore: number | null
}

/** ??? ? ????Tick ???? */
export type WsTickDeltaMessage = {
  type: 'tick_delta'
  tick: number
  worldVersion: number
  factionStats: Record<string, WsDeltaFactionStat>
  unitChanges: WsDeltaUnitChange[]
  tileChanges: WsDeltaTileChange[]
  /** Only the subscribed faction's quota delta entries are delivered. */
  aiQuotaChanges: WsAiQuotaChange[]
  events: NarrativeEvent[]
}

/** ??? ? ???????? */
export type WsBattleReportMessage = {
  type: 'battle_report'
  tick: number
  report: BattleOutcomeRecord
}

/** ??? ? ???????? */
export type WsDiplomacyMessage = {
  type: 'diplomacy_event'
  tick: number
  event: DiplomacyAgreement
}

/** ??? ? ???????? */
export type WsGeneralActionMessage = {
  type: 'general_action'
  tick: number
  generalId: string
  action: string
  autonomySource: string
  /** ????????0-1???????????? */
  loyaltyLevel?: number
  /** ??????????0-1?*/
  lordTrust?: number
  /** ???? tier?1=?????, 2=????, 3=?????*/
  tier?: 1 | 2 | 3
}

/**
 * ??? ? ????????????
 * ?????????????????????"??"
 */
export type WsGeneralMessageMessage = {
  type: 'general_message'
  tick: number
  generalId: string
  generalName: string
  faction: string
  text: string
  /** ???? */
  trigger: 'grievance' | 'victory' | 'crisis' | 'loyalty_critical' | 'promotion'
  loyaltyLevel: number
  lordTrust: number
}

/** ??? ? ????????????? */
export type WsServerMessage =
  | WsTickDeltaMessage
  | WsBattleReportMessage
  | WsDiplomacyMessage
  | WsGeneralActionMessage
  | WsGeneralMessageMessage
  | { type: 'subscribed'; factionId: string; tick: number }
  | { type: 'pong' }
  | { type: 'error'; message: string }

/** ??? ? ????????????? */
export type WsClientMessage =
  | { type: 'subscribe'; factionId: string; token?: string }
  | { type: 'ping' }
