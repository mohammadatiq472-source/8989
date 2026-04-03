import { z } from 'zod'
import type { NationFoundRequest } from '../contracts/game'

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/

export const nationFoundRequestSchema = z
  .object({
    factionId: z.string().trim().min(1).max(32),
    nationName: z.string().trim().min(2).max(24),
    color: z.string().trim().regex(HEX_COLOR_REGEX, 'color must be #RRGGBB'),
    capitalTileId: z.string().trim().min(1).max(64).optional(),
  })
  .strict()

export function parseNationFoundRequest(input: unknown): NationFoundRequest {
  return nationFoundRequestSchema.parse(input) as NationFoundRequest
}
