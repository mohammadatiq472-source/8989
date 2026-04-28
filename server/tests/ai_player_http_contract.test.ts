import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const SHARDS = [
  'ai_player_http_domestic_contract.test.ts',
  'ai_player_http_movement_contract.test.ts',
  'ai_player_http_recruit_contract.test.ts',
  'ai_player_http_command_support_contract.test.ts',
  'ai_player_http_model_proposal_contract.test.ts',
  'ai_player_http_chat_command_contract.test.ts',
  'ai_player_http_playable_loop_contract.test.ts',
  'ai_player_http_resource_gather_contract.test.ts',
  'ai_player_http_tile_occupy_contract.test.ts',
  'ai_player_http_troop_heal_contract.test.ts',
  'ai_player_http_battle_report_read_contract.test.ts',
  'ai_player_http_battle_report_followup_contract.test.ts',
  'ai_player_http_resource_transfer_contract.test.ts',
  'ai_player_http_reward_persistence_contract.test.ts',
] as const

for (const shard of SHARDS) {
  const shardPath = join('server', 'tests', shard)
  console.log(`[ai_player_http_contract] running ${shardPath}`)
  const result = spawnSync(process.execPath, ['--import', 'tsx', shardPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(`[ai_player_http_contract] ${shardPath} failed to start:`, result.error)
    process.exitCode = 1
    break
  }

  if (result.status !== 0) {
    console.error(`[ai_player_http_contract] ${shardPath} failed with status ${result.status ?? 'unknown'}`)
    process.exitCode = result.status ?? 1
    break
  }
}

if (!process.exitCode) {
  console.log('[ai_player_http_contract] all shards passed')
}
