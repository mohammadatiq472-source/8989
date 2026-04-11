export type MemoryRecord = {
  id: string
  agentId: string
  text: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export type MemorySearchResult = {
  text: string
  score?: number
  createdAt?: string
  metadata?: Record<string, unknown>
}

export type MemoryProvider = {
  add: (agentId: string, text: string, metadata?: Record<string, unknown>) => Promise<void>
  search: (agentId: string, query: string, limit?: number) => Promise<MemorySearchResult[]>
}

export type MemoryProviderRequested = 'mem0' | 'in_memory'
export type MemoryProviderActive = MemoryProviderRequested | 'unknown'
export type MemoryProviderLifecycle = 'uninitialized' | 'ready' | 'degraded'

export type MemoryProviderDiagnostics = {
  requestedProvider: MemoryProviderRequested
  activeProvider: MemoryProviderActive
  lifecycle: MemoryProviderLifecycle
  downgraded: boolean
  reason?: string
  updatedAt: string
}

type Mem0ClientMethod = (payload: unknown, options?: Record<string, unknown>) => Promise<unknown>

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }

  return null
}

const MAX_RECORDS_PER_AGENT = 200
const DEDUP_WINDOW = 30
const RECENCY_DECAY = 0.985 // ~0.64 after 24h, ~0.41 after 48h
const MEM0_TIMEOUT_MS = 8_000 // Mem0 远程调用超时，防阻塞 tick 推进

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

/**
 * 将文本拆分为搜索 token（支持中英文混合）。
 * 按空白和标点切分为短语级 token，保持中文词组完整。
 * 例: "洛阳 遭到攻击" → ["洛阳", "遭到攻击"]
 * 例: "reinforce east line" → ["reinforce", "east", "line"]
 */
function tokenize(text: string): string[] {
  return text
    .split(/[\s,;.!?，。！？、；：""''（）【】《》\-\n\r]+/)
    .filter((t) => t.length > 0)
}

/**
 * 计算 query token 在 recordText 中的覆盖率（0-1）。
 * 每个 token 在 recordText 中做 substring 匹配（适配中文无空格连写）。
 */
function computeTokenRelevance(queryTokens: string[], recordText: string): number {
  if (queryTokens.length === 0) return 0
  let hits = 0
  for (const token of queryTokens) {
    if (recordText.includes(token)) hits++
  }
  return hits / queryTokens.length
}

class InMemoryProvider implements MemoryProvider {
  private store = new Map<string, MemoryRecord[]>()
  private idCounter = new Map<string, number>()

  async add(agentId: string, text: string, metadata?: Record<string, unknown>) {
    const records = this.store.get(agentId) ?? []

    // 去重：最近 DEDUP_WINDOW 条内有完全相同的文本则跳过
    const dedupStart = Math.max(0, records.length - DEDUP_WINDOW)
    for (let i = records.length - 1; i >= dedupStart; i--) {
      if (records[i].text === text) return
    }

    const counter = (this.idCounter.get(agentId) ?? 0) + 1
    this.idCounter.set(agentId, counter)

    records.push({
      id: `${agentId}-${counter}`,
      agentId,
      text,
      createdAt: new Date().toISOString(),
      metadata,
    })

    // 超出容量时丢弃最旧的记录
    if (records.length > MAX_RECORDS_PER_AGENT) {
      records.splice(0, records.length - MAX_RECORDS_PER_AGENT)
    }

    this.store.set(agentId, records)
  }

  async search(agentId: string, query: string, limit = 5) {
    const records = this.store.get(agentId) ?? []
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      // 空查询：返回最近的记录（最新在前）
      return records
        .slice(-limit)
        .reverse()
        .map((record, index) => ({
          text: record.text,
          score: 1 - index * 0.01,
          createdAt: record.createdAt,
          metadata: record.metadata,
        }))
    }

    const queryTokens = tokenize(normalized)

    // 时间衰减：越近的记忆权重越高（半衰期约 72 小时）
    // 公式参考 Stanford Generative Agents: recency = decay^Δt_hours
    const now = Date.now()
    const scored = records
      .map((record) => {
        const hoursAgo = (now - new Date(record.createdAt).getTime()) / 3_600_000
        const recency = Math.pow(RECENCY_DECAY, hoursAgo)

        const recordText = record.text.toLowerCase()
        // token 覆盖率（多 token 部分匹配也能得分）
        const tokenRelevance = computeTokenRelevance(queryTokens, recordText)
        // 完整子串匹配加分
        const fullMatch = recordText.includes(normalized) ? 1.0 : 0
        const relevance = Math.max(fullMatch, tokenRelevance)

        // 文本相关性 × 0.6 + 时间新鲜度 × 0.4
        const score = relevance * 0.6 + recency * 0.4
        return {
          text: record.text,
          score,
          createdAt: record.createdAt,
          metadata: record.metadata,
        }
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

    return scored.slice(0, limit)
  }
}

let providerPromise: Promise<MemoryProvider> | null = null

const isMem0RequestedAtBoot = Boolean(process.env.MEM0_API_KEY?.trim())

let providerDiagnostics: MemoryProviderDiagnostics = isMem0RequestedAtBoot
  ? {
      requestedProvider: 'mem0',
      activeProvider: 'unknown',
      lifecycle: 'uninitialized',
      downgraded: false,
      updatedAt: new Date().toISOString(),
    }
  : {
      requestedProvider: 'in_memory',
      activeProvider: 'in_memory',
      lifecycle: 'ready',
      downgraded: false,
      reason: 'mem0_unconfigured',
      updatedAt: new Date().toISOString(),
    }

function setProviderDiagnostics(next: Omit<MemoryProviderDiagnostics, 'updatedAt'>) {
  providerDiagnostics = {
    ...next,
    updatedAt: new Date().toISOString(),
  }
}

export function getMemoryProviderDiagnostics(): MemoryProviderDiagnostics {
  const requestedProvider: MemoryProviderRequested = process.env.MEM0_API_KEY?.trim() ? 'mem0' : 'in_memory'
  if (providerDiagnostics.requestedProvider === requestedProvider) {
    return { ...providerDiagnostics }
  }

  return {
    ...providerDiagnostics,
    requestedProvider,
  }
}

export async function getMemoryProvider(): Promise<MemoryProvider> {
  if (!providerPromise) {
    providerPromise = resolveMemoryProvider().catch((err) => {
      // 初始化失败时清除缓存，下次重试而非永久卡死
      providerPromise = null
      console.warn('[mem0] provider init failed, will retry next call:', err instanceof Error ? err.message : err)
      setProviderDiagnostics({
        requestedProvider: 'mem0',
        activeProvider: 'in_memory',
        lifecycle: 'degraded',
        downgraded: true,
        reason: err instanceof Error ? err.message : 'mem0_provider_init_failed',
      })
      return new InMemoryProvider()
    })
  }

  return providerPromise
}

async function resolveMemoryProvider(): Promise<MemoryProvider> {
  const apiKey = process.env.MEM0_API_KEY?.trim()
  if (!apiKey) {
    setProviderDiagnostics({
      requestedProvider: 'in_memory',
      activeProvider: 'in_memory',
      lifecycle: 'ready',
      downgraded: false,
      reason: 'mem0_unconfigured',
    })
    return new InMemoryProvider()
  }

  try {
    const mod: unknown = await import('mem0ai')
    const moduleExports = asRecord(mod)
    const Mem0 =
      moduleExports?.Mem0 ??
      moduleExports?.MemoryClient ??
      moduleExports?.default ??
      moduleExports?.Client ??
      moduleExports?.mem0
    if (typeof Mem0 !== 'function') {
      console.warn('[mem0] mem0ai module loaded but no client export found, using in-memory fallback')
      setProviderDiagnostics({
        requestedProvider: 'mem0',
        activeProvider: 'in_memory',
        lifecycle: 'degraded',
        downgraded: true,
        reason: 'mem0_client_export_missing',
      })
      return new InMemoryProvider()
    }

    const baseUrl = process.env.MEM0_BASE_URL?.trim() || process.env.MEM0_HOST?.trim()
    const organizationId = process.env.MEM0_ORG_ID?.trim()
    const projectId = process.env.MEM0_PROJECT_ID?.trim()
    const apiVersion = process.env.MEM0_API_VERSION?.trim()

    const config: Record<string, unknown> = {
      apiKey,
    }

    if (baseUrl) {
      config.host = baseUrl
      config.baseUrl = baseUrl
    }

    if (organizationId) {
      config.organizationId = organizationId
    }

    if (projectId) {
      config.projectId = projectId
    }

    if (apiVersion) {
      config.apiVersion = apiVersion
    }

    const client = new (Mem0 as new (config: Record<string, unknown>) => unknown)(config)
    const addFn = resolveClientMethod(client, 'add')
    const searchFn = resolveClientMethod(client, 'search')

    if (!addFn || !searchFn) {
      console.warn('[mem0] mem0 client missing add/search, using in-memory fallback')
      setProviderDiagnostics({
        requestedProvider: 'mem0',
        activeProvider: 'in_memory',
        lifecycle: 'degraded',
        downgraded: true,
        reason: 'mem0_client_method_missing',
      })
      return new InMemoryProvider()
    }

    setProviderDiagnostics({
      requestedProvider: 'mem0',
      activeProvider: 'mem0',
      lifecycle: 'ready',
      downgraded: false,
    })

    return {
      async add(agentId: string, text: string, metadata?: Record<string, unknown>) {
        await withTimeout(runMem0Add(addFn, agentId, text, metadata), MEM0_TIMEOUT_MS, 'mem0 add')
      },
      async search(agentId: string, query: string, limit = 5) {
        const result = await withTimeout(runMem0Search(searchFn, agentId, query, limit), MEM0_TIMEOUT_MS, 'mem0 search')
        return normalizeMem0Result(result)
      },
    } satisfies MemoryProvider
  } catch (error) {
    console.warn(
      '[mem0] mem0ai unavailable, using in-memory fallback:',
      error instanceof Error ? error.message : 'unknown error',
    )
    setProviderDiagnostics({
      requestedProvider: 'mem0',
      activeProvider: 'in_memory',
      lifecycle: 'degraded',
      downgraded: true,
      reason: error instanceof Error ? error.message : 'mem0_unknown_error',
    })
    return new InMemoryProvider()
  }
}

function resolveClientMethod(client: unknown, method: 'add' | 'search'): Mem0ClientMethod | null {
  const clientRecord = asRecord(client)
  const methodCandidate = clientRecord?.[method]
  if (typeof methodCandidate === 'function') {
    return methodCandidate.bind(clientRecord) as Mem0ClientMethod
  }

  const memoryRecord = asRecord(clientRecord?.memory)
  const memoryMethodCandidate = memoryRecord?.[method]
  if (typeof memoryMethodCandidate === 'function') {
    return memoryMethodCandidate.bind(memoryRecord) as Mem0ClientMethod
  }

  return null
}

function buildMem0Scope(agentId: string, metadata?: Record<string, unknown>) {
  const scope: Record<string, unknown> = {
    agent_id: agentId,
    user_id: agentId,
  }

  if (metadata) {
    scope.metadata = metadata
  }

  return scope
}

async function runMem0Add(
  addFn: Mem0ClientMethod,
  agentId: string,
  text: string,
  metadata?: Record<string, unknown>,
) {
  const messages = [{ role: 'user', content: text }]
  const scope = buildMem0Scope(agentId, metadata)
  const altScope = { agentId, userId: agentId, metadata }

  const attempts = [
    () => addFn(messages, scope),
    () => addFn(messages, altScope),
    () => addFn(text, scope),
    () => addFn(text, altScope),
    () => addFn({ messages, ...scope }),
    () => addFn({ messages, ...altScope }),
  ]

  await runMem0Attempts(attempts, 'add')
}

async function runMem0Search(
  searchFn: Mem0ClientMethod,
  agentId: string,
  query: string,
  limit: number,
) {
  const scope = { agent_id: agentId, user_id: agentId, limit }
  const altScope = { agentId, userId: agentId, limit }
  const filterScope = { filters: { agent_id: agentId }, limit }
  const filterUserScope = { filters: { user_id: agentId }, limit }

  const attempts = [
    () => searchFn(query, scope),
    () => searchFn(query, altScope),
    () => searchFn(query, filterScope),
    () => searchFn(query, filterUserScope),
    () => searchFn({ query, ...scope }),
    () => searchFn({ query, ...altScope }),
    () => searchFn({ query, ...filterScope }),
    () => searchFn({ query, ...filterUserScope }),
  ]

  return runMem0Attempts(attempts, 'search')
}

/** 判断错误是否为致命的（不应重试下一个签名）。 */
function isFatalMem0Error(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  // HTTP 状态码类错误：认证失败、限流、服务端错误 → 不要再试其他签名
  if (/\b(401|403|429|5\d{2})\b/.test(msg)) return true
  if (/unauthorized|forbidden|rate.?limit|too many requests|internal server error/i.test(msg)) return true
  if (/timed? ?out|timeout|econnrefused|enotfound|network/i.test(msg)) return true
  return false
}

async function runMem0Attempts(
  attempts: Array<() => Promise<unknown>>,
  label: string,
) {
  let lastError: unknown

  for (const attempt of attempts) {
    try {
      return await attempt()
    } catch (error) {
      lastError = error
      // 致命错误（认证/限流/网络）不再尝试其他签名变体
      if (isFatalMem0Error(error)) break
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error(`mem0 ${label} failed`)
}

function normalizeMem0Result(raw: unknown): MemorySearchResult[] {
  const rawRecord = asRecord(raw)
  const dataRecord = asRecord(rawRecord?.data)
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray(rawRecord?.results)
      ? rawRecord.results
      : Array.isArray(rawRecord?.memories)
        ? rawRecord.memories
        : Array.isArray(dataRecord?.results)
          ? dataRecord.results
          : Array.isArray(dataRecord)
            ? dataRecord
            : []

  return items
    .map((item: unknown) => {
      const itemRecord = asRecord(item)
      const textCandidate = itemRecord?.text ?? itemRecord?.memory ?? itemRecord?.content ?? item
      const scoreCandidate = itemRecord?.score ?? itemRecord?.similarity
      const createdAtCandidate = itemRecord?.created_at ?? itemRecord?.createdAt

      return {
        text: typeof textCandidate === 'string' ? textCandidate : String(textCandidate ?? ''),
        score: typeof scoreCandidate === 'number' ? scoreCandidate : undefined,
        createdAt: typeof createdAtCandidate === 'string' ? createdAtCandidate : undefined,
        metadata: asRecord(itemRecord?.metadata) ?? undefined,
      }
    })
    .filter((item: MemorySearchResult) => item.text.length > 0)
}
