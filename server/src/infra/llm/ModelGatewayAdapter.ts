import type { PlannerConfig, PlannerResult } from '../../../../shared/contracts/game'
import type { CommanderToolContext } from '../../agents/tools/CommanderTools'
import type { GatewayProtocol, ResolvedPlannerTarget } from '../../config/modelGateway'
import { resolvePlannerTarget } from '../../config/modelGateway'
import { createOpenAICompatiblePlanningResult } from './OpenAICompatPlannerAdapter'

export type ModelGatewayAdapter = {
  readonly protocol: GatewayProtocol
  createPlanningResult(
    strategicCommand: string,
    target: ResolvedPlannerTarget,
    toolContext: CommanderToolContext,
  ): Promise<PlannerResult>
}

const openAICompatAdapter: ModelGatewayAdapter = {
  protocol: 'openai_compat',
  createPlanningResult: (strategicCommand, target, toolContext) =>
    createOpenAICompatiblePlanningResult(strategicCommand, target, toolContext),
}

const adapters: Record<GatewayProtocol, ModelGatewayAdapter> = {
  openai_compat: openAICompatAdapter,
}

export async function createPlanningResultViaModelGateway(
  strategicCommand: string,
  config: PlannerConfig,
  toolContext: CommanderToolContext,
): Promise<PlannerResult> {
  const target = resolvePlannerTarget(config)
  const adapter = adapters[target.protocol]

  if (!adapter) {
    throw new Error(`unsupported gateway protocol: ${String(target.protocol)}`)
  }

  return adapter.createPlanningResult(strategicCommand, target, toolContext)
}
