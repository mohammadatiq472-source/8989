import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildReplayVectorIndexAsync,
  type ReplayEmbeddingBuildOptions,
  type ReplayIndexSourceRecord,
} from '../server/src/infra/rag/retrieveReplays'
import type { ReplayRagEmbeddingProvider } from '../server/src/config/replayRag'

type ReplayIndexInput = {
  records: ReplayIndexSourceRecord[]
}

async function main() {
  const inputArg = readArg('--input')
  if (!inputArg) {
    throw new Error('missing --input, expected a JSON file containing replay records')
  }

  const outputArg = readArg('--output') ?? 'server/evals/replay_vector_index.json'
  const dimensionArg = Number(readArg('--dimension') ?? 192)
  const dimension = Number.isFinite(dimensionArg) ? Math.max(64, Math.min(3072, Math.round(dimensionArg))) : 192

  const provider = readProviderArg(readArg('--provider'))
  const embeddingOptions: ReplayEmbeddingBuildOptions = {
    provider,
    embeddingDimension: dimension,
    baseUrl: readArg('--base-url'),
    model: readArg('--model'),
    timeoutMs: readNumberArg('--timeout-ms'),
    failOpen: readBooleanArg('--fail-open'),
  }

  const input = loadInput(inputArg)
  const index = await buildReplayVectorIndexAsync(input.records, embeddingOptions)

  const payload = {
    generatedAt: new Date().toISOString(),
    provider: provider ?? 'env_default',
    dimension: index.dimension,
    count: index.items.length,
    items: index.items,
  }

  const outputPath = resolve(process.cwd(), outputArg)
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
  console.info(
    `replay vector index written: ${outputPath} (count=${index.items.length}, dim=${index.dimension}, provider=${payload.provider})`,
  )
}

function loadInput(inputPath: string): ReplayIndexInput {
  const absolute = resolve(process.cwd(), inputPath)
  const raw = readFileSync(absolute, 'utf-8')
  const parsed = JSON.parse(raw) as ReplayIndexInput | ReplayIndexSourceRecord[]

  const records = Array.isArray(parsed) ? parsed : parsed.records
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`invalid input: expected records[] in ${absolute}`)
  }

  return {
    records,
  }
}

function readProviderArg(value: string | undefined): ReplayRagEmbeddingProvider | undefined {
  if (!value) {
    return undefined
  }

  if (value === 'hash' || value === 'openai_compat') {
    return value
  }

  throw new Error(`invalid --provider value: ${value}`)
}

function readNumberArg(name: string) {
  const value = readArg(name)
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1000, Math.min(30000, Math.round(parsed))) : undefined
}

function readBooleanArg(name: string) {
  const value = readArg(name)
  if (!value) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  throw new Error(`invalid ${name} value: ${value}`)
}

function readArg(name: string) {
  const index = process.argv.findIndex((item) => item === name)
  if (index < 0 || index + 1 >= process.argv.length) {
    return undefined
  }

  return process.argv[index + 1]
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'failed to build replay vector index')
  process.exit(1)
})
