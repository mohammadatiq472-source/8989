/**
 * RedisWorldStore.ts — 世界状态外置存储抽象层
 *
 * 提供统一的 WorldState 存取接口，支持两种后端：
 *   1. Redis（当 REDIS_URL 环境变量存在时）→ 支持未来多进程 / 水平扩展
 *   2. InMemory（默认）→ 零依赖，和当前行为一致
 *
 * 使用方式：
 *   const store = await createWorldStore()
 *   await store.save('world:main', worldState)
 *   const ws = await store.load('world:main')
 *
 * 远期目标：
 *   - 多 GameServer 实例共享同一 Redis，实现水平扩展
 *   - 支持快照 / 回放 / 热迁移
 */

import type { WorldState } from '../../../../shared/contracts/game'

// ─── 接口定义 ─────────────────────────────────────────────────────────────────

export interface WorldStore {
  /** 存储世界状态 */
  save(key: string, state: WorldState): Promise<void>
  /** 加载世界状态，不存在时返回 null */
  load(key: string): Promise<WorldState | null>
  /** 删除指定 key */
  delete(key: string): Promise<void>
  /** 检查连接状态 */
  ping(): Promise<boolean>
  /** 关闭连接 */
  close(): Promise<void>
  /** 当前使用的后端类型 */
  readonly backend: 'redis' | 'memory'
}

// ─── InMemory 实现 ────────────────────────────────────────────────────────────

class InMemoryWorldStore implements WorldStore {
  readonly backend = 'memory' as const
  private data = new Map<string, string>()

  async save(key: string, state: WorldState): Promise<void> {
    this.data.set(key, JSON.stringify(state))
  }

  async load(key: string): Promise<WorldState | null> {
    const raw = this.data.get(key)
    if (!raw) return null
    return JSON.parse(raw) as WorldState
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }

  async ping(): Promise<boolean> {
    return true
  }

  async close(): Promise<void> {
    this.data.clear()
  }
}

// ─── Redis 实现 ────────────────────────────────────────────────────────────────

// ioredis 是可选依赖，未安装时 dynamic import 会自然 catch 降级
// 此处用 any 作为 client 类型避免编译时依赖 @types/ioredis
type RedisClient = { set(k: string, v: string): Promise<unknown>; get(k: string): Promise<string | null>; del(k: string): Promise<unknown>; ping(): Promise<string>; disconnect(): void }

class RedisWorldStore implements WorldStore {
  readonly backend = 'redis' as const
  private client: RedisClient

  constructor(client: RedisClient) {
    this.client = client
  }

  async save(key: string, state: WorldState): Promise<void> {
    await this.client.set(key, JSON.stringify(state))
  }

  async load(key: string): Promise<WorldState | null> {
    const raw = await this.client.get(key)
    if (!raw) return null
    return JSON.parse(raw) as WorldState
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key)
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping()
      return result === 'PONG'
    } catch {
      return false
    }
  }

  async close(): Promise<void> {
    this.client.disconnect()
  }
}

// ─── 工厂函数 ──────────────────────────────────────────────────────────────────

let _store: WorldStore | null = null

export async function createWorldStore(): Promise<WorldStore> {
  if (_store) return _store

  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    try {
      // 动态 import ioredis，未安装时将自然 catch 降级
      // @ts-expect-error ioredis 是可选依赖
      const { default: Redis } = await import('ioredis')
      const client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 5_000,
      })
      await client.connect()
      await client.ping()
      console.log(`[WorldStore] connected to Redis: ${redisUrl.replace(/\/\/.*@/, '//<credentials>@')}`)
      _store = new RedisWorldStore(client)
      return _store
    } catch (err) {
      console.warn(`[WorldStore] Redis connection failed, falling back to InMemory: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log('[WorldStore] using InMemory backend (set REDIS_URL to enable Redis)')
  _store = new InMemoryWorldStore()
  return _store
}

export function getWorldStore(): WorldStore | null {
  return _store
}
