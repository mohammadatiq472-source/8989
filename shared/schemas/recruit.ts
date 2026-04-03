import { z } from 'zod'

/** 招募请求 */
export const recruitRequestSchema = z.object({
  aiPlayerId: z.string().trim().min(1).max(64),
  poolType: z.enum(['normal', 'elite', 'limited']),
  count: z.number().int().min(1).max(10).default(1),
}).strict()

export type RecruitRequestPayload = z.infer<typeof recruitRequestSchema>

/** 升星请求 */
export const starUpgradeRequestSchema = z.object({
  aiPlayerId: z.string().trim().min(1).max(64),
  targetInstanceId: z.string().trim().min(1).max(64),
  sacrificeInstanceIds: z.array(z.string().trim().min(1).max(64)).min(1).max(10),
}).strict()

export type StarUpgradeRequestPayload = z.infer<typeof starUpgradeRequestSchema>

/** 升星属性分配请求 */
export const starAttributeAllocationSchema = z.object({
  aiPlayerId: z.string().trim().min(1).max(64),
  instanceId: z.string().trim().min(1).max(64),
  force: z.number().int().min(0),
  command: z.number().int().min(0),
  intelligence: z.number().int().min(0),
  charisma: z.number().int().min(0),
  speed: z.number().int().min(0),
}).strict()

export type StarAttributeAllocationPayload = z.infer<typeof starAttributeAllocationSchema>

/** 部队编组请求 */
export const armyComposeRequestSchema = z.object({
  aiPlayerId: z.string().trim().min(1).max(64),
  armyId: z.string().trim().min(1).max(64),
  mainGeneralId: z.string().trim().min(1).max(64).optional(),
  viceGeneralIds: z.array(z.string().trim().min(1).max(64)).max(2).default([]),
}).strict()

export type ArmyComposeRequestPayload = z.infer<typeof armyComposeRequestSchema>

/** 同盟创建请求 */
export const allianceCreateRequestSchema = z.object({
  name: z.string().trim().min(2).max(24),
  leaderId: z.string().trim().min(1).max(64),
  doctrine: z.string().trim().max(500).optional(),
}).strict()

export type AllianceCreateRequestPayload = z.infer<typeof allianceCreateRequestSchema>

/** 同盟加入请求 */
export const allianceJoinRequestSchema = z.object({
  allianceId: z.string().trim().min(1).max(64),
  playerId: z.string().trim().min(1).max(64),
}).strict()

export type AllianceJoinRequestPayload = z.infer<typeof allianceJoinRequestSchema>

/** 同盟角色变更请求 */
export const allianceRoleChangeRequestSchema = z.object({
  allianceId: z.string().trim().min(1).max(64),
  targetPlayerId: z.string().trim().min(1).max(64),
  newRole: z.enum(['officer', 'member']),
}).strict()

export type AllianceRoleChangeRequestPayload = z.infer<typeof allianceRoleChangeRequestSchema>
