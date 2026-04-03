const truthyFlags = ['1', 'true', 'yes']

function parseBooleanFlag(value: string | undefined): boolean {
  return truthyFlags.includes((value ?? '').toLowerCase())
}

export interface RuntimeConfig {
  host: string
  port: number
  allowFullMapLayout: boolean
  gameClockEnabled: boolean
}

export const runtimeConfig: RuntimeConfig = {
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? 8787),
  allowFullMapLayout: parseBooleanFlag(process.env.ENABLE_FULL_MAP_LAYOUT),
  gameClockEnabled: parseBooleanFlag(process.env.GAME_CLOCK_ENABLED),
}
