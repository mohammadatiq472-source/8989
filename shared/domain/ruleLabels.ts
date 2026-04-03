import type { ActionType, TacticalTemplateId, Tile, WorldState } from '../contracts/game'

export function ownerLabel(owner: Tile['owner']) {
  if (!owner || owner === 'neutral') {
    return '中立'
  }

  return `阵营(${owner})`
}

export function allianceStanceLabel(stance: WorldState['alliance']['directives'][string]['stance']) {
  switch (stance) {
    case 'hold':
      return '稳守'
    case 'support':
      return '策应'
    case 'harass':
      return '骚扰'
    case 'expand':
      return '扩张'
  }
}

export function templateLabel(templateId: TacticalTemplateId) {
  switch (templateId) {
    case 'rally':
      return '集结'
    case 'harass':
      return '牵制'
    case 'withdraw':
      return '撤回'
    case 'breakthrough':
      return '重点突破'
    case 'sweep':
      return '扫荡'
    case 'garrison':
      return '驻防'
  }
}

export function actionLabel(action: ActionType) {
  switch (action) {
    case 'march':
      return '行军'
    case 'garrison':
      return '驻防'
    case 'recon':
      return '侦察'
    case 'support':
      return '支援'
    case 'capture':
      return '占领'
  }
}
