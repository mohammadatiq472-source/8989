/**
 * MCP Server — 将游戏后端 API 暴露给 AI 编程助手
 *
 * 通过 HTTP 调用后端 API（端口 8787），不再直接 import WorldService。
 * 这样 MCP Server 作为独立进程运行时也能正确获取游戏数据。
 *
 * 前提: 游戏后端必须运行在 http://localhost:8787
 * 启动方式: npx tsx server/src/mcp/gameServer.ts
 * 配置入口: .vscode/mcp.json
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BACKEND_URL = process.env.SLG_BACKEND_URL || 'http://localhost:8787';

const TOOL_OUTPUT_LIMITS = {
  maxChars: 12000,
  maxDepth: 3,
  maxObjectKeys: 25,
  maxArrayItems: 12,
  maxStringChars: 1200,
} as const;

type SummaryState = {
  truncated: boolean;
};

function safeStringify(value: unknown): string {
  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeForToolOutput(value: unknown, depth = 0, seen = new WeakSet<object>(), state: SummaryState = { truncated: false }): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (value.length <= TOOL_OUTPUT_LIMITS.maxStringChars) {
      return value;
    }

    state.truncated = true;
    const omitted = value.length - TOOL_OUTPUT_LIMITS.maxStringChars;
    return `${value.slice(0, TOOL_OUTPUT_LIMITS.maxStringChars)}... [truncated ${omitted} chars]`;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    if (typeof value === 'bigint') {
      return `${value.toString()}n`;
    }

    return value;
  }

  if (typeof value === 'symbol' || typeof value === 'function') {
    state.truncated = true;
    return `[${typeof value}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    const summarizedError: Record<string, unknown> = {
      name: value.name,
      message: value.message,
    };

    if (value.stack) {
      summarizedError.stack = summarizeForToolOutput(value.stack, depth + 1, seen, state);
    }

    return summarizedError;
  }

  if (value instanceof Map) {
    if (seen.has(value)) {
      state.truncated = true;
      return '[Circular Map]';
    }

    seen.add(value);

    const entries = Array.from(value.entries()).slice(0, TOOL_OUTPUT_LIMITS.maxArrayItems).map(([key, entryValue]) => ([
      summarizeForToolOutput(key, depth + 1, seen, state),
      summarizeForToolOutput(entryValue, depth + 1, seen, state),
    ]));
    const output: Record<string, unknown> = {
      _type: 'Map',
      size: value.size,
      entries,
    };

    if (value.size > TOOL_OUTPUT_LIMITS.maxArrayItems) {
      output._truncated = true;
      output._omittedEntries = value.size - TOOL_OUTPUT_LIMITS.maxArrayItems;
      state.truncated = true;
    }

    return output;
  }

  if (value instanceof Set) {
    if (seen.has(value)) {
      state.truncated = true;
      return '[Circular Set]';
    }

    seen.add(value);

    const entries = Array.from(value.values()).slice(0, TOOL_OUTPUT_LIMITS.maxArrayItems).map((entryValue) => summarizeForToolOutput(entryValue, depth + 1, seen, state));
    const output: Record<string, unknown> = {
      _type: 'Set',
      size: value.size,
      values: entries,
    };

    if (value.size > TOOL_OUTPUT_LIMITS.maxArrayItems) {
      output._truncated = true;
      output._omittedEntries = value.size - TOOL_OUTPUT_LIMITS.maxArrayItems;
      state.truncated = true;
    }

    return output;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      state.truncated = true;
      return '[Circular]';
    }

    seen.add(value);

    if (Array.isArray(value)) {
      if (depth >= TOOL_OUTPUT_LIMITS.maxDepth) {
        state.truncated = true;
        return {
          _type: 'Array',
          length: value.length,
          _truncated: true,
          _reason: 'max depth reached',
        };
      }

      const sample = value.slice(0, TOOL_OUTPUT_LIMITS.maxArrayItems).map((entry) => summarizeForToolOutput(entry, depth + 1, seen, state));
      const output: Record<string, unknown> = {
        _type: 'Array',
        length: value.length,
        sample,
      };

      if (value.length > TOOL_OUTPUT_LIMITS.maxArrayItems) {
        output._truncated = true;
        output._omittedItems = value.length - TOOL_OUTPUT_LIMITS.maxArrayItems;
        state.truncated = true;
      }

      return output;
    }

    if (depth >= TOOL_OUTPUT_LIMITS.maxDepth) {
      const keys = Object.keys(value);
      state.truncated = true;
      return {
        _type: 'Object',
        keys: keys.slice(0, TOOL_OUTPUT_LIMITS.maxObjectKeys),
        keyCount: keys.length,
        _truncated: true,
        _reason: 'max depth reached',
      };
    }

    const entries = Object.entries(value as Record<string, unknown>);
    const output: Record<string, unknown> = {};
    for (const [key, entryValue] of entries.slice(0, TOOL_OUTPUT_LIMITS.maxObjectKeys)) {
      output[key] = summarizeForToolOutput(entryValue, depth + 1, seen, state);
    }

    if (entries.length > TOOL_OUTPUT_LIMITS.maxObjectKeys) {
      output._truncated = true;
      output._omittedKeys = entries.length - TOOL_OUTPUT_LIMITS.maxObjectKeys;
      state.truncated = true;
    }

    return output;
  }

  return safeStringify(value);
}

function formatToolOutput(value: unknown): string {
  const state: SummaryState = { truncated: false };
  const summarized = summarizeForToolOutput(value, 0, new WeakSet<object>(), state);
  const json = JSON.stringify(
    summarized,
    (_key, jsonValue) => (typeof jsonValue === 'bigint' ? `${jsonValue.toString()}n` : jsonValue),
    2,
  ) ?? String(summarized);

  if (json.length <= TOOL_OUTPUT_LIMITS.maxChars) {
    return state.truncated ? `${json}\n\n[truncated]` : json;
  }

  const note = `\n\n[truncated to ${TOOL_OUTPUT_LIMITS.maxChars} chars]`;
  const body = json.slice(0, Math.max(0, TOOL_OUTPUT_LIMITS.maxChars - note.length));
  return `${body}${note}`;
}

async function backendFetch(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const url = `${BACKEND_URL}${path}`;
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`Backend ${method} ${path} returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new McpServer({
  name: 'slg-game-api',
  version: '1.0.0',
});

// ─── Tool 1: 查询世界状态摘要 ───
server.tool(
  'get_world_summary',
  'Get the current world state summary including tick, factions, territory counts, and recent events',
  {},
  async () => {
    try {
      const data = await backendFetch('/api/world') as Record<string, unknown>;
      return {
        content: [{ type: 'text' as const, text: formatToolOutput(data) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// ─── Tool 2: 查询完整世界快照（含地图概览） ───
server.tool(
  'get_world_snapshot',
  'Get the world map overview including faction territories and tile statistics.',
  {},
  async () => {
    try {
      const data = await backendFetch('/api/map/overview');
      return {
        content: [{ type: 'text' as const, text: formatToolOutput(data) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// ─── Tool 3: 查询将领档案 ───
server.tool(
  'get_general_profiles',
  'Get general (将领) profiles for a specific faction, including personality, loyalty, and history',
  {
    factionId: z.string().describe('The faction ID to query generals for'),
  },
  async ({ factionId }) => {
    try {
      const data = await backendFetch(`/api/generals?faction=${encodeURIComponent(factionId)}`);
      return {
        content: [{ type: 'text' as const, text: formatToolOutput(data) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// ─── Tool 4: 推进一个 Tick ───
server.tool(
  'advance_tick',
  'Advance the game world by one tick. Executes all queued plans through the rule engine. Returns the action result.',
  {},
  async () => {
    try {
      const data = await backendFetch('/api/world/action', 'POST', { action: 'advanceTick' });
      return {
        content: [{ type: 'text' as const, text: formatToolOutput(data) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// ─── Tool 5: 健康检查 ───
server.tool(
  'health_check',
  'Check if the game backend is running and responsive',
  {},
  async () => {
    try {
      const data = await backendFetch('/api/health');
      return {
        content: [{ type: 'text' as const, text: formatToolOutput(data) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Backend not available: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// ─── Tool 6: 故事线叙事事件 ───
server.tool(
  'get_narrative_events',
  'Get recent narrative events (battle stories, diplomacy outcomes, faction milestones) — useful for AI context and decision-making',
  {
    limit: z.number().optional().describe('Max number of events to return (default 20)'),
  },
  async ({ limit }) => {
    try {
      const n = limit ?? 20;
      const data = await backendFetch(`/api/narratives?limit=${n}`);
      return {
        content: [{ type: 'text' as const, text: formatToolOutput(data) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// ─── Tool 7: 游戏事件流 ───
server.tool(
  'get_recent_events',
  'Get recent game events including battles, captures, and unit movements',
  {},
  async () => {
    try {
      const data = await backendFetch('/api/events');
      return {
        content: [{ type: 'text' as const, text: formatToolOutput(data) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// ─── Tool 8: AI 决策日志 ───
server.tool(
  'get_ai_logs',
  'Get recent AI (CommanderAgent/GeneralAgent) decision logs — shows LLM calls, plans generated, and planning errors for debugging and analysis',
  {
    limit: z.number().optional().describe('Max number of log entries to return (default 20)'),
  },
  async ({ limit }) => {
    try {
      const n = limit ?? 20;
      const data = await backendFetch(`/api/ai/logs?limit=${n}`);
      return {
        content: [{ type: 'text' as const, text: formatToolOutput(data) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// ─── 启动 MCP Server ───
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] SLG Game API server started on stdio');
}

main().catch((err) => {
  console.error('[MCP] Fatal error:', err);
  process.exit(1);
});
