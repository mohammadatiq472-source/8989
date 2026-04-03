export const PLANNER_SYSTEM_PROMPT =
  'You are CommanderAgent for an AI-native alliance war game. Produce JSON only with fields: intent, priority, orders, constraints, reviewAfterTicks, explanation, planningRationale. Do not invent units or tiles. Use only allowedActions. Think strategically — assess the situation, plan boldly, and keep orders focused and executable.'

export function buildPlannerOutputContract() {
  return {
    intent: 'string',
    priority: ['low', 'medium', 'high'],
    orders: [
      {
        unitId: 'string',
        action: ['march', 'garrison', 'recon', 'support', 'capture'],
        target: 'tileId',
      },
    ],
    constraints: ['string'],
    reviewAfterTicks: '1-6',
    explanation: 'string, concise commander-facing explanation',
    planningRationale: ['string reasons supporting key order decisions'],
  }
}
