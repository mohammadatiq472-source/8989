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

const WORLD_ACTION_TEMPLATE_IDS = [
  'advance_tick',
  'clear_plan_execution',
  'preview_national_agenda',
  'preview_court_session',
  'move_first_unit',
  'upgrade_first_city',
  'tactical_override_first_unit',
] as const;

const TACTICAL_OVERRIDE_TEMPLATE_IDS = [
  'rally',
  'harass',
  'withdraw',
  'breakthrough',
  'sweep',
  'garrison',
] as const;

type WorldActionTemplateId = (typeof WORLD_ACTION_TEMPLATE_IDS)[number];
type TacticalOverrideTemplateId = (typeof TACTICAL_OVERRIDE_TEMPLATE_IDS)[number];

type WorldActionTemplateOptions = {
  factionId?: string;
  unitId?: string;
  targetTileId?: string;
  cityTileId?: string;
  overrideTemplateId?: TacticalOverrideTemplateId;
  summary?: string;
  includeWorld?: boolean;
};

type ResolvedWorldActionTemplate = {
  action: string;
  payload?: Record<string, unknown>;
  includeWorld: boolean;
  resolved: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function readRuntimeRows(runtimePayload: unknown): Record<string, unknown>[] {
  const root = asRecord(runtimePayload);
  if (!root) {
    return [];
  }

  const directRows = asRecordArray(root.factions);
  if (directRows.length > 0) {
    return directRows;
  }

  const nested = asRecord(root.data);
  if (!nested) {
    return [];
  }
  return asRecordArray(nested.factions);
}

async function resolveTemplateFactionId(preferredFactionId?: string): Promise<string | null> {
  const preferred = preferredFactionId?.trim();
  if (preferred) {
    return preferred;
  }

  const runtimePayload = await backendFetch('/api/session/runtime');
  const rows = readRuntimeRows(runtimePayload);
  if (rows.length === 0) {
    return null;
  }

  for (const row of rows) {
    const onlineSeatCount = Number(row.onlineSeatCount ?? 0);
    const factionId = typeof row.factionId === 'string' ? row.factionId.trim() : '';
    if (factionId && Number.isFinite(onlineSeatCount) && onlineSeatCount <= 0) {
      return factionId;
    }
  }

  for (const row of rows) {
    const factionId = typeof row.factionId === 'string' ? row.factionId.trim() : '';
    if (factionId) {
      return factionId;
    }
  }

  return null;
}

function readWorldState(worldPayload: unknown): Record<string, unknown> | null {
  const root = asRecord(worldPayload);
  if (!root) {
    return null;
  }

  const nestedWorld = asRecord(root.world);
  if (nestedWorld) {
    return nestedWorld;
  }

  const nestedData = asRecord(root.data);
  if (!nestedData) {
    return null;
  }

  const nestedDataWorld = asRecord(nestedData.world);
  if (nestedDataWorld) {
    return nestedDataWorld;
  }
  return nestedData;
}

async function loadWorldStateForTemplate(): Promise<Record<string, unknown>> {
  const payload = await backendFetch('/api/world?intelMode=full');
  const world = readWorldState(payload);
  if (!world) {
    throw new Error('world snapshot unavailable for template resolution');
  }

  const map = asRecord(world.map) ?? {};
  if (!asRecord(map.connections)) {
    const layoutPayload = await backendFetch('/api/world/map-layout?scope=bootstrap');
    const layoutRoot = asRecord(layoutPayload);
    const layoutMap = layoutRoot ? asRecord(layoutRoot.map) ?? asRecord(asRecord(layoutRoot.data)?.map) : null;
    if (layoutMap) {
      if (!asRecord(map.connections) && asRecord(layoutMap.connections)) {
        map.connections = layoutMap.connections;
      }
      if (!Array.isArray(map.tiles) && Array.isArray(layoutMap.tiles)) {
        map.tiles = layoutMap.tiles;
      }
      world.map = map;
    }
  }

  return world;
}

function selectFactionUnit(
  world: Record<string, unknown>,
  factionId: string,
  preferredUnitId?: string,
): Record<string, unknown> | null {
  const units = asRecordArray(world.units);
  if (units.length === 0) {
    return null;
  }

  const normalizedPreferred = preferredUnitId?.trim();
  if (normalizedPreferred) {
    const byId = units.find((unit) => String(unit.id ?? '') === normalizedPreferred);
    if (byId) {
      return byId;
    }
  }

  return units.find((unit) => String(unit.faction ?? '') === factionId) ?? null;
}

function selectAdjacentTargetTileId(
  world: Record<string, unknown>,
  unit: Record<string, unknown>,
  preferredTargetTileId?: string,
): string | null {
  const normalizedPreferred = preferredTargetTileId?.trim();
  if (normalizedPreferred) {
    return normalizedPreferred;
  }

  const unitTileId = typeof unit.tileId === 'string' ? unit.tileId.trim() : '';
  if (!unitTileId) {
    return null;
  }

  const map = asRecord(world.map);
  const connections = map ? asRecord(map.connections) : null;
  if (!connections) {
    return null;
  }

  const neighbors = asStringArray(connections[unitTileId]);
  return neighbors.find((tileId) => tileId !== unitTileId) ?? neighbors[0] ?? null;
}

function selectOwnedCityTileId(
  world: Record<string, unknown>,
  factionId: string,
  preferredCityTileId?: string,
): string | null {
  const normalizedPreferred = preferredCityTileId?.trim();
  if (normalizedPreferred) {
    return normalizedPreferred;
  }

  const map = asRecord(world.map);
  const tiles = map ? asRecordArray(map.tiles) : [];
  if (tiles.length === 0) {
    return null;
  }

  for (const tile of tiles) {
    const owner = String(tile.owner ?? '');
    if (owner !== factionId) {
      continue;
    }

    const tileId = typeof tile.id === 'string' ? tile.id.trim() : '';
    if (!tileId) {
      continue;
    }

    const tileType = typeof tile.type === 'string' ? tile.type : '';
    const hasCityLevel = typeof tile.cityLevel === 'number';
    if (tileType === 'city' || tileType === 'capital' || hasCityLevel) {
      return tileId;
    }
  }

  return null;
}

async function resolveWorldActionTemplate(
  templateId: WorldActionTemplateId,
  options: WorldActionTemplateOptions,
): Promise<ResolvedWorldActionTemplate> {
  const includeWorldOverride = options.includeWorld;

  if (templateId === 'advance_tick') {
    return {
      action: 'advanceTick',
      includeWorld: includeWorldOverride ?? true,
      resolved: {
        templateId,
      },
    };
  }

  if (templateId === 'preview_national_agenda') {
    return {
      action: 'previewNationalAgenda',
      payload: {
        maxOptions: 5,
      },
      includeWorld: includeWorldOverride ?? false,
      resolved: {
        templateId,
        maxOptions: 5,
      },
    };
  }

  if (templateId === 'preview_court_session') {
    return {
      action: 'previewCourtSession',
      payload: {
        maxProposals: 5,
        maxOptions: 5,
      },
      includeWorld: includeWorldOverride ?? false,
      resolved: {
        templateId,
        maxProposals: 5,
        maxOptions: 5,
      },
    };
  }

  const factionId = await resolveTemplateFactionId(options.factionId);
  if (!factionId) {
    throw new Error('faction resolution failed for template execution');
  }

  if (templateId === 'clear_plan_execution') {
    return {
      action: 'clearPlanExecution',
      payload: { factionId },
      includeWorld: includeWorldOverride ?? true,
      resolved: {
        templateId,
        factionId,
      },
    };
  }

  const world = await loadWorldStateForTemplate();

  if (templateId === 'upgrade_first_city') {
    const tileId = selectOwnedCityTileId(world, factionId, options.cityTileId);
    if (!tileId) {
      throw new Error(`no city/capital tile found for faction ${factionId}`);
    }

    return {
      action: 'upgradeCity',
      payload: { factionId, tileId },
      includeWorld: includeWorldOverride ?? true,
      resolved: {
        templateId,
        factionId,
        tileId,
      },
    };
  }

  const unit = selectFactionUnit(world, factionId, options.unitId);
  if (!unit) {
    throw new Error(`no unit available for faction ${factionId}`);
  }

  const unitId = typeof unit.id === 'string' ? unit.id : '';
  if (!unitId) {
    throw new Error('selected unit has empty id');
  }

  const targetTileId = selectAdjacentTargetTileId(world, unit, options.targetTileId);
  if (!targetTileId) {
    throw new Error(`no target tile resolved for unit ${unitId}`);
  }

  if (templateId === 'move_first_unit') {
    return {
      action: 'moveUnit',
      payload: { factionId, unitId, targetTileId },
      includeWorld: includeWorldOverride ?? true,
      resolved: {
        templateId,
        factionId,
        unitId,
        targetTileId,
      },
    };
  }

  const template = options.overrideTemplateId ?? 'garrison';
  const summary = options.summary?.trim() || `template:${template} target:${targetTileId}`;
  return {
    action: 'queueTacticalOverride',
    payload: { factionId, unitId, targetTileId, templateId: template, summary },
    includeWorld: includeWorldOverride ?? true,
    resolved: {
      templateId,
      factionId,
      unitId,
      targetTileId,
      tacticalTemplate: template,
    },
  };
}

function buildWorldActionTemplateCatalog() {
  return [
    {
      templateId: 'advance_tick',
      action: 'advanceTick',
      autoResolves: [],
      defaultIncludeWorld: true,
    },
    {
      templateId: 'clear_plan_execution',
      action: 'clearPlanExecution',
      autoResolves: ['factionId'],
      defaultIncludeWorld: true,
    },
    {
      templateId: 'preview_national_agenda',
      action: 'previewNationalAgenda',
      autoResolves: [],
      defaultIncludeWorld: false,
    },
    {
      templateId: 'preview_court_session',
      action: 'previewCourtSession',
      autoResolves: [],
      defaultIncludeWorld: false,
    },
    {
      templateId: 'move_first_unit',
      action: 'moveUnit',
      autoResolves: ['factionId', 'unitId', 'targetTileId'],
      defaultIncludeWorld: true,
    },
    {
      templateId: 'upgrade_first_city',
      action: 'upgradeCity',
      autoResolves: ['factionId', 'tileId'],
      defaultIncludeWorld: true,
    },
    {
      templateId: 'tactical_override_first_unit',
      action: 'queueTacticalOverride',
      autoResolves: ['factionId', 'unitId', 'targetTileId', 'templateId', 'summary'],
      defaultIncludeWorld: true,
    },
  ];
}

const server = new McpServer({
  name: 'slg-game-api',
  version: '1.0.0',
});

// Tool 1: world summary
server.tool(
  'get_world_summary',
  'Get world summary (tick/factions/territory/recent events).',
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

// Tool 2: world snapshot
server.tool(
  'get_world_snapshot',
  'Get world map overview and tile statistics.',
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

// Tool 3: general profiles
server.tool(
  'get_general_profiles',
  'Get general profiles for a faction (personality, loyalty, history).',
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

// Tool 4: advance tick
server.tool(
  'advance_tick',
  'Advance one tick through rule engine and execute queued plans.',
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

// Tool 5: health check
server.tool(
  'health_check',
  'Check backend health status.',
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

// Tool 6: narrative events
server.tool(
  'get_narrative_events',
  'Get recent narrative events (battle, diplomacy, faction milestones).',
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

// Tool 7: recent events
server.tool(
  'get_recent_events',
  'Get recent game events (battles, captures, unit movements).',
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

// Tool 8: ai logs
server.tool(
  'get_ai_logs',
  'Get AI decision logs with strict-mode and fallback observability fields.',
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

// Tool 9: session runtime
server.tool(
  'get_session_runtime',
  'Get session runtime snapshot (factions, autonomy/control mode, seat occupancy).',
  {},
  async () => {
    try {
      const data = await backendFetch('/api/session/runtime');
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

// Tool 10: join session
server.tool(
  'join_session',
  'Join one faction seat and receive token/session context.',
  {
    factionId: z.string().min(1).describe('Faction ID to join, e.g. player/wei/shu'),
    playerName: z.string().min(1).describe('Player display name for this session'),
  },
  async ({ factionId, playerName }) => {
    try {
      const data = await backendFetch('/api/session/join', 'POST', {
        factionId,
        playerName,
      });
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

// Tool 11: set session autonomy
server.tool(
  'set_session_autonomy',
  'Set session autonomy level (L1/L2/L3) for a joined token.',
  {
    token: z.string().min(1).describe('Session token from join_session'),
    level: z.enum(['L1_assigned', 'L2_delegated', 'L3_negotiated']).describe('Autonomy target level'),
  },
  async ({ token, level }) => {
    try {
      const data = await backendFetch('/api/session/autonomy', 'POST', {
        token,
        level,
      });
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

// Tool 12: leave session
server.tool(
  'leave_session',
  'Leave a session seat by token.',
  {
    token: z.string().min(1).describe('Session token from join_session'),
  },
  async ({ token }) => {
    try {
      const data = await backendFetch('/api/session/leave', 'POST', {
        token,
      });
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

// Tool 13: map layout
server.tool(
  'get_map_layout',
  'Get world map layout for Godot/viewport rendering.',
  {
    scope: z.enum(['full', 'bootstrap', 'province', 'region', 'viewport']).optional().describe('Layout scope'),
  },
  async ({ scope }) => {
    try {
      const effectiveScope = scope ?? 'bootstrap';
      const data = await backendFetch(`/api/world/map-layout?scope=${encodeURIComponent(effectiveScope)}`);
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

// Tool 14: generic world action
server.tool(
  'run_world_action',
  'Run world action through authoritative backend route /api/world/action.',
  {
    action: z.string().min(1).describe('World action name, e.g. advanceTick/queuePlanExecution/moveUnit'),
    payload: z.record(z.string(), z.unknown()).optional().describe('Optional world action payload object'),
    includeWorld: z.boolean().optional().describe('Whether response should include world snapshot (default true)'),
  },
  async ({ action, payload, includeWorld }) => {
    try {
      const includeWorldQuery = includeWorld === false ? 'false' : 'true';
      const body: Record<string, unknown> = { action };
      if (payload && Object.keys(payload).length > 0) {
        body.payload = payload;
      }

      const data = await backendFetch(`/api/world/action?includeWorld=${includeWorldQuery}`, 'POST', body);
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

// Tool 15: list world action templates
server.tool(
  'list_world_action_templates',
  'List predefined world action templates for fast AI execution and replayable ops.',
  {},
  async () => {
    try {
      return {
        content: [{ type: 'text' as const, text: formatToolOutput({ templates: buildWorldActionTemplateCatalog() }) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// Tool 16: run world action template
server.tool(
  'run_world_action_template',
  'Run predefined world action template (move/upgrade/override included) with optional auto-resolved payload.',
  {
    templateId: z.enum(WORLD_ACTION_TEMPLATE_IDS).describe('Template ID to execute'),
    factionId: z.string().optional().describe('Optional faction override'),
    unitId: z.string().optional().describe('Optional unit override (for move/override templates)'),
    targetTileId: z.string().optional().describe('Optional target tile override (for move/override templates)'),
    cityTileId: z.string().optional().describe('Optional city tile override (for upgrade template)'),
    overrideTemplateId: z.enum(TACTICAL_OVERRIDE_TEMPLATE_IDS).optional().describe('Tactical template for override template'),
    summary: z.string().optional().describe('Optional tactical override summary'),
    includeWorld: z.boolean().optional().describe('Optional includeWorld override'),
  },
  async ({ templateId, factionId, unitId, targetTileId, cityTileId, overrideTemplateId, summary, includeWorld }) => {
    try {
      const resolved = await resolveWorldActionTemplate(templateId, {
        factionId,
        unitId,
        targetTileId,
        cityTileId,
        overrideTemplateId,
        summary,
        includeWorld,
      });

      const body: Record<string, unknown> = {
        action: resolved.action,
      };
      if (resolved.payload && Object.keys(resolved.payload).length > 0) {
        body.payload = resolved.payload;
      }

      const includeWorldQuery = resolved.includeWorld ? 'true' : 'false';
      const data = await backendFetch(`/api/world/action?includeWorld=${includeWorldQuery}`, 'POST', body);
      return {
        content: [{
          type: 'text' as const,
          text: formatToolOutput({
            templateId,
            resolved: resolved.resolved,
            request: body,
            response: data,
          }),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// MCP server bootstrap
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] SLG Game API server started on stdio');
}

main().catch((err) => {
  console.error('[MCP] Fatal error:', err);
  process.exit(1);
});
