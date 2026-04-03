export type ChatMode = 'chat' | 'order'

const ORDER_PATTERNS = [
  /(进攻|攻打|攻占|拿下|夺取|占领|派兵|出兵)/,
  /(撤退|撤兵|后撤|收兵)/,
  /(侦察|探查|刺探|侦查)/,
  /(驻守|驻防|守住|防守|坚守)/,
  /(支援|增援|协助)/,
  /(行军|推进|前进)/,
  // English fallback (keep \b for word boundary behavior)
  /\b(attack|capture|march|garrison|recon|support|retreat|advance)\b/i,
]

export function normalizeChatMode(mode?: string | null): ChatMode | undefined {
  if (!mode) return undefined
  const normalized = mode.trim().toLowerCase()
  if (normalized === 'chat' || normalized === 'order') {
    return normalized
  }
  return undefined
}

export function detectChatMode(message: string): ChatMode {
  for (const pattern of ORDER_PATTERNS) {
    if (pattern.test(message)) return 'order'
  }
  return 'chat'
}

export function resolveChatMode(message: string, forcedMode?: string | null): ChatMode {
  return normalizeChatMode(forcedMode) ?? detectChatMode(message)
}
