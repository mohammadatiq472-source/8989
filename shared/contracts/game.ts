export type * from './game/common'
export type * from './game/planning'
export type * from './game/history'
export type * from './game/ai'
export type * from './game/meta'
export type * from './game/world'
export type * from './game/session'

// WebSocket Delta contracts
export type * from './game/ws'

// V2 alliance/domain contracts
export type * from './game/v2'
export {
  ARMY_SLOT_THRESHOLDS,
  STAR_UPGRADE_BONUS_PER_STAR,
} from './game/v2'
