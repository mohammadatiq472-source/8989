import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type LoadedEnvSource = {
  path: string
  loaded: number
}

const loadedSources: LoadedEnvSource[] = []

const lockedKeys = new Set<string>(Object.keys(process.env))

loadEnvFile('.env', false)
loadEnvFile('.env.local', true)

if (loadedSources.length > 0 && process.env.NODE_ENV !== 'test') {
  const summary = loadedSources
    .map((item) => `${item.path}(${item.loaded})`)
    .join(', ')
  console.info(`[env] loaded ${summary}`)
}

function loadEnvFile(fileName: string, canOverrideLoadedValue: boolean) {
  const filePath = resolve(process.cwd(), fileName)
  if (!existsSync(filePath)) {
    return
  }

  const text = readFileSync(filePath, 'utf-8')
  const lines = text.split(/\r?\n/)
  let loaded = 0

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separator = line.indexOf('=')
    if (separator <= 0) {
      continue
    }

    const key = line.slice(0, separator).trim()
    if (!key) {
      continue
    }

    if (lockedKeys.has(key)) {
      continue
    }

    if (!canOverrideLoadedValue && typeof process.env[key] === 'string') {
      continue
    }

    const rawValue = line.slice(separator + 1)
    process.env[key] = parseEnvValue(rawValue)
    loaded += 1
  }

  loadedSources.push({ path: fileName, loaded })
}

function parseEnvValue(rawValue: string) {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return ''
  }

  const isQuoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))

  const unwrapped = isQuoted ? trimmed.slice(1, -1) : trimmed
  return unwrapped
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
}
