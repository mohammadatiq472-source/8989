import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  buildSessionPersistPath,
  getAvailablePort,
  shutdownChild,
  spawnBackend,
  type TailState,
  waitForHealth,
} from './helpers/backendHarness'

type JsonRpcResponse = {
  jsonrpc: '2.0'
  id?: number
  result?: unknown
  error?: {
    message?: string
  }
}

function encodeMessage(message: Record<string, unknown>): Buffer {
  return Buffer.from(`${JSON.stringify(message)}\n`, 'utf-8')
}

function appendTail(target: string[], chunk: string, max = 40) {
  const lines = chunk.split(/\r?\n/).filter((line) => line.trim().length > 0)
  target.push(...lines)
  if (target.length > max) {
    target.splice(0, target.length - max)
  }
}

function spawnMcpServer(baseUrl: string, tail: TailState): ChildProcess {
  const npmExecPath = process.env.npm_execpath?.trim()
  const env = {
    ...process.env,
    SLG_BACKEND_URL: baseUrl,
  }

  const child = npmExecPath
    ? spawn(process.execPath, [npmExecPath, 'exec', '--', 'tsx', 'server/src/mcp/gameServer.ts'], {
      cwd: process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    : spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['exec', '--', 'tsx', 'server/src/mcp/gameServer.ts'], {
      cwd: process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

  child.stderr?.on('data', (chunk) => appendTail(tail.stderr, String(chunk)))
  child.stdout?.on('data', (chunk) => appendTail(tail.stdout, String(chunk)))
  return child
}

class McpClient {
  private buffer = ''
  private readonly pending = new Map<number, { resolve: (value: JsonRpcResponse) => void; reject: (reason?: unknown) => void }>()
  private nextId = 1
  private readonly child: ChildProcess
  private readonly tail: TailState

  constructor(child: ChildProcess, tail: TailState) {
    this.child = child
    this.tail = tail
    this.child.stdout?.on('data', (chunk) => {
      const data = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk)
      this.buffer += data
      this.drain()
    })
    this.child.once('exit', () => {
      const reason = new Error(`mcp child exited early.\nstdout:\n${this.tail.stdout.join('\n')}\nstderr:\n${this.tail.stderr.join('\n')}`)
      for (const pending of this.pending.values()) {
        pending.reject(reason)
      }
      this.pending.clear()
    })
  }

  private drain() {
    while (true) {
      const lineEnd = this.buffer.indexOf('\n')
      if (lineEnd < 0) {
        return
      }
      const payload = this.buffer.slice(0, lineEnd).replace(/\r$/, '')
      this.buffer = this.buffer.slice(lineEnd + 1)
      if (payload.trim().length === 0) {
        continue
      }
      const message = JSON.parse(payload) as JsonRpcResponse
      if (typeof message.id === 'number') {
        const pending = this.pending.get(message.id)
        if (pending) {
          this.pending.delete(message.id)
          pending.resolve(message)
        }
      }
    }
  }

  async request(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++
    const responsePromise = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP request timeout for ${method}.\nstdout:\n${this.tail.stdout.join('\n')}\nstderr:\n${this.tail.stderr.join('\n')}`))
      }, 30_000)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (reason) => {
          clearTimeout(timer)
          reject(reason)
        },
      })
    })

    this.child.stdin?.write(encodeMessage({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }))
    const response = await responsePromise
    if (response.error) {
      throw new Error(`MCP ${method} failed: ${response.error.message ?? 'unknown error'}`)
    }
    return response.result
  }

  notify(method: string, params: Record<string, unknown> = {}) {
    this.child.stdin?.write(encodeMessage({
      jsonrpc: '2.0',
      method,
      params,
    }))
  }
}

async function shutdownMcpChild(child: ChildProcess | null) {
  if (!child || child.exitCode !== null) {
    return
  }

  child.stdin?.end()
  child.kill('SIGINT')
  await new Promise((resolve) => setTimeout(resolve, 1_000))

  if (child.exitCode === null && child.pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGKILL')
    }
  }
}

function readTextContent(result: unknown): string {
  if (!result || typeof result !== 'object') {
    throw new Error('expected MCP result object')
  }
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error('expected MCP content array')
  }
  const first = content[0]
  if (!first || typeof first !== 'object' || typeof (first as { text?: unknown }).text !== 'string') {
    throw new Error('expected first MCP content item with text')
  }
  return (first as { text: string }).text
}

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const backendTail: TailState = { stdout: [], stderr: [] }
  const mcpTail: TailState = { stdout: [], stderr: [] }
  const backend = spawnBackend(port, backendTail, {
    SESSION_STATE_PERSIST_PATH: buildSessionPersistPath('ai_player_knowledge_graph_mcp_session'),
  })
  let mcpChild: ChildProcess | null = null

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health?.ok, `backend failed to start: ${backendTail.stderr.join('\n')}`)

    mcpChild = spawnMcpServer(baseUrl, mcpTail)
    const client = new McpClient(mcpChild, mcpTail)
    const initializeResult = await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'ai-player-knowledge-graph-mcp-test',
        version: '1.0.0',
      },
    })
    assert.ok(initializeResult, 'MCP initialize should succeed')
    client.notify('notifications/initialized')

    const toolsResult = await client.request('tools/list')
    const tools = ((toolsResult as { tools?: unknown }).tools ?? []) as unknown[]
    assert.ok(
      tools.some((item) => typeof item === 'object' && item && (item as { name?: unknown }).name === 'get_ai_player_knowledge_graph'),
      'MCP tools/list should expose get_ai_player_knowledge_graph',
    )

    const obsidianText = readTextContent(await client.request('tools/call', {
      name: 'get_ai_player_knowledge_graph',
      arguments: {
        format: 'obsidian',
        worldAction: 'setAiContextFocus',
        recommendation: 'defer',
        includeCatalog: false,
      },
    }))
    assert.ok(obsidianText.includes('# AI Player Backend Knowledge Graph'))
    assert.ok(obsidianText.includes('### setAiContextFocus'))
    assert.ok(obsidianText.includes('Recommendation: `defer`'))

    const jsonText = readTextContent(await client.request('tools/call', {
      name: 'get_ai_player_knowledge_graph',
      arguments: {
        aiAction: 'reward_claim',
      },
    }))
    assert.ok(jsonText.includes('reward_claim'))
    assert.ok(jsonText.includes('snapshot'))

    console.log('[ai_player_knowledge_graph_mcp] all checks passed')
  } finally {
    await shutdownMcpChild(mcpChild)
    await shutdownChild(backend)
  }
}

run().catch((error) => {
  console.error('[ai_player_knowledge_graph_mcp] failed:', error)
  process.exitCode = 1
})
