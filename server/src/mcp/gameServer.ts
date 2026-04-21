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
import { registerAiPlayerTools } from './registerAiPlayerTools';

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
  'upgrade_first_city_building',
  'enqueue_first_city_affair',
  'upgrade_first_city_tech',
  'recruit_first_commander',
  'deploy_first_reserve_hero',
  'tactical_override_first_unit',
] as const;

const CITY_TECH_TRACK_IDS = ['governance', 'logistics', 'defense', 'recruitment'] as const;
const CITY_BUILDING_GROUP_IDS = ['market', 'tax', 'policy'] as const;
const CITY_BUILDING_IDS = ['market_plaza', 'tax_office', 'policy_hall', 'recruit_policy_board'] as const;
const TACTICAL_OVERRIDE_TEMPLATE_IDS = [
  'rally',
  'harass',
  'withdraw',
  'breakthrough',
  'sweep',
  'garrison',
] as const;

type WorldActionTemplateId = (typeof WORLD_ACTION_TEMPLATE_IDS)[number];
type CityTechTrackId = (typeof CITY_TECH_TRACK_IDS)[number];
type CityBuildingGroupId = (typeof CITY_BUILDING_GROUP_IDS)[number];
type CityBuildingId = (typeof CITY_BUILDING_IDS)[number];
type TacticalOverrideTemplateId = (typeof TACTICAL_OVERRIDE_TEMPLATE_IDS)[number];

type WorldActionTemplateOptions = {
  factionId?: string;
  heroId?: string;
  unitId?: string;
  targetTileId?: string;
  cityTileId?: string;
  buildingGroupId?: CityBuildingGroupId;
  buildingId?: CityBuildingId;
  affairGroupId?: CityBuildingGroupId;
  techId?: CityTechTrackId;
  recruitPoolId?: string;
  recruitCount?: number;
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

function pickTopCountEntries(value: unknown, limit: number): Array<{ key: string; count: number }> {
  const entries = Object.entries(asRecord(value) ?? {})
    .map(([key, count]) => ({
      key,
      count: Number(count ?? 0),
    }))
    .filter((entry) => Number.isFinite(entry.count) && entry.count > 0)
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  return entries.slice(0, limit);
}

function pickTopNumericEntries(
  value: unknown,
  field: string,
  limit: number,
): Array<{ key: string; value: number }> {
  const entries = Object.entries(asRecord(value) ?? {})
    .map(([key, record]) => {
      const row = asRecord(record) ?? {};
      return {
        key,
        value: Number(row[field] ?? 0),
      };
    })
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0)
    .sort((left, right) => right.value - left.value || left.key.localeCompare(right.key));
  return entries.slice(0, limit);
}

function pickTopAdvanceTickSubphaseEntries(
  phaseStatsValue: unknown,
  field: string,
  limit: number,
): Array<{ phase: string; subphase: string; value: number }> {
  const entries: Array<{ phase: string; subphase: string; value: number }> = [];
  for (const [phase, record] of Object.entries(asRecord(phaseStatsValue) ?? {})) {
    const subphaseStats = asRecord(asRecord(record)?.subphaseStats);
    if (!subphaseStats) {
      continue;
    }
    for (const [subphase, subphaseRecord] of Object.entries(subphaseStats)) {
      const value = Number(asRecord(subphaseRecord)?.[field] ?? 0);
      if (!Number.isFinite(value) || value <= 0) {
        continue;
      }
      entries.push({ phase, subphase, value });
    }
  }
  return entries
    .sort((left, right) => right.value - left.value || left.subphase.localeCompare(right.subphase))
    .slice(0, limit);
}

function summarizeFailureSamples(value: unknown, limit: number): Record<string, unknown>[] {
  return asRecordArray(value).slice(0, limit).map((sample) => ({
    tick: sample.tick ?? null,
    action: sample.action ?? null,
    factionId: sample.factionId ?? null,
    requestId: sample.requestId ?? null,
    failureCode: sample.failureCode ?? null,
    conflictCategory: sample.conflictCategory ?? null,
    holder: sample.holder ?? null,
    createdAt: sample.createdAt ?? null,
    message: sample.message ?? null,
  }));
}

function summarizeAdvanceTickRuns(value: unknown, limit: number): Record<string, unknown>[] {
  return asRecordArray(value).slice(0, limit).map((run) => ({
    outcome: run.outcome ?? null,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
    tickBefore: run.tickBefore ?? null,
    tickAfter: run.tickAfter ?? null,
    worldVersionBefore: run.worldVersionBefore ?? null,
    worldVersionAfter: run.worldVersionAfter ?? null,
    totalDurationMs: run.totalDurationMs ?? null,
    slowestPhase: run.slowestPhase ?? null,
    slowestPhaseDurationMs: run.slowestPhaseDurationMs ?? null,
    narrativeEvents: run.narrativeEvents ?? null,
    memoryWrites: run.memoryWrites ?? null,
    memoryWriteFailures: run.memoryWriteFailures ?? null,
    battleReportsBroadcast: run.battleReportsBroadcast ?? null,
    phases: asRecordArray(run.phases).map((phase) => ({
      phase: phase.phase ?? null,
      durationMs: phase.durationMs ?? null,
      subphases: asRecordArray(phase.subphases).map((subphase) => ({
        subphase: subphase.subphase ?? null,
        durationMs: subphase.durationMs ?? null,
      })),
    })),
    errorName: run.errorName ?? null,
    errorMessage: run.errorMessage ?? null,
  }));
}

function summarizeRecentEvents(value: unknown, limit: number): Record<string, unknown>[] {
  return asRecordArray(value).slice(0, limit).map((event) => {
    const metadata = asRecord(event.metadata);
    return {
      tick: event.tick ?? null,
      action: event.action ?? null,
      category: event.category ?? null,
      success: event.success ?? null,
      requestId: event.requestId ?? null,
      message: event.message ?? null,
      failureCode: metadata?.failureCode ?? null,
      mutationHolder: metadata?.mutationHolder ?? null,
      advanceTickTiming: asRecord(metadata?.advanceTickTiming) ?? null,
    };
  });
}

function buildAiRuntimeObservabilitySummary(payload: unknown, sampleLimit?: number): Record<string, unknown> {
  const root = asRecord(payload) ?? {};
  const runtime = asRecord(root.runtime) ?? {};
  const advanceTickPerformance = asRecord(runtime.advanceTickPerformance) ?? {};
  const recentFailures = asRecord(runtime.recentFailures) ?? {};
  const lockConflicts = asRecord(runtime.lockConflicts) ?? {};
  const sessionMetrics = asRecord(runtime.sessionMetrics) ?? {};
  const wsStats = asRecord(runtime.wsStats) ?? {};
  const lock = asRecord(runtime.lock) ?? {};
  const normalizedSampleLimit = Math.min(8, Math.max(1, Math.trunc(sampleLimit ?? 3)));

  return {
    tick: root.tick ?? null,
    worldVersion: root.worldVersion ?? null,
    generatedAt: root.generatedAt ?? null,
    factionFilter: root.factionFilter ?? null,
    factionCount: asRecordArray(root.factions).length,
    runtime: {
      lock: {
        busy: Boolean(lock.busy),
        holder: lock.holder ?? null,
      },
      queuePlanFailureStats: asRecord(runtime.queuePlanFailureStats) ?? {},
      queuePlanConflictStats: asRecord(runtime.queuePlanConflictStats) ?? {},
      advanceTickFailureStats: asRecord(runtime.advanceTickFailureStats) ?? {},
      advanceTickPerformance: {
        totalRuns: advanceTickPerformance.totalRuns ?? null,
        successfulRuns: advanceTickPerformance.successfulRuns ?? null,
        failedRuns: advanceTickPerformance.failedRuns ?? null,
        lastOutcome: advanceTickPerformance.lastOutcome ?? null,
        lastCompletedAt: advanceTickPerformance.lastCompletedAt ?? null,
        lastTotalDurationMs: advanceTickPerformance.lastTotalDurationMs ?? null,
        avgTotalDurationMs: advanceTickPerformance.avgTotalDurationMs ?? null,
        maxTotalDurationMs: advanceTickPerformance.maxTotalDurationMs ?? null,
        topPhasesByLast: pickTopNumericEntries(advanceTickPerformance.phaseStats, 'lastDurationMs', 5),
        topPhasesByAverage: pickTopNumericEntries(advanceTickPerformance.phaseStats, 'avgDurationMs', 5),
        topSubphasesByLast: pickTopAdvanceTickSubphaseEntries(advanceTickPerformance.phaseStats, 'lastDurationMs', 8),
        topSubphasesByAverage: pickTopAdvanceTickSubphaseEntries(advanceTickPerformance.phaseStats, 'avgDurationMs', 8),
        recentRuns: summarizeAdvanceTickRuns(advanceTickPerformance.recentRuns, normalizedSampleLimit),
      },
      recentFailures: {
        totalRecentFailures: Number(recentFailures.totalRecentFailures ?? 0),
        topActions: pickTopCountEntries(recentFailures.byAction, 5),
        topFailureCodes: pickTopCountEntries(recentFailures.byFailureCode, 5),
        topFactions: pickTopCountEntries(recentFailures.byFaction, 5),
        samples: summarizeFailureSamples(recentFailures.samples, normalizedSampleLimit),
      },
      lockConflicts: {
        totalRecentConflicts: Number(lockConflicts.totalRecentConflicts ?? 0),
        topActions: pickTopCountEntries(lockConflicts.byAction, 5),
        topHolders: pickTopCountEntries(lockConflicts.byHolder, 5),
        samples: summarizeFailureSamples(lockConflicts.samples, normalizedSampleLimit),
      },
      sessionMetrics: {
        activeSessions: sessionMetrics.activeSessions ?? null,
        onlineSessions: sessionMetrics.onlineSessions ?? null,
        delegatedSessions: sessionMetrics.delegatedSessions ?? null,
        claimedFactions: sessionMetrics.claimedFactions ?? null,
        maxActiveSessions: sessionMetrics.maxActiveSessions ?? null,
        maxSeatsPerFaction: sessionMetrics.maxSeatsPerFaction ?? null,
      },
      wsStats: {
        totalConnections: wsStats.totalConnections ?? null,
        subscribedConnections: wsStats.subscribedConnections ?? null,
        rejectedConnections: wsStats.rejectedConnections ?? null,
        rejectedSubscriptions: wsStats.rejectedSubscriptions ?? null,
        truncatedTickDeltaMessages: wsStats.truncatedTickDeltaMessages ?? null,
        maxConnections: wsStats.maxConnections ?? null,
        maxSubscriptionsPerFaction: wsStats.maxSubscriptionsPerFaction ?? null,
      },
    },
    factions: asRecordArray(root.factions).map((faction) => {
      const agenda = asRecord(faction.agenda);
      const execution = asRecord(faction.execution);
      const budget = asRecord(faction.budget) ?? {};
      const aiQuota = asRecord(budget.aiQuota);
      const lastFailure = asRecord(faction.lastFailure);
      return {
        factionId: faction.factionId ?? null,
        autonomyLevel: faction.autonomyLevel ?? null,
        controlMode: faction.controlMode ?? null,
        online: Boolean(faction.online),
        seatCount: faction.seatCount ?? null,
        onlineSeatCount: faction.onlineSeatCount ?? null,
        contextFocusId: faction.contextFocusId ?? null,
        agenda: agenda
          ? {
              phase: agenda.phase ?? null,
              selectedActionId: agenda.selectedActionId ?? null,
              updatedTick: agenda.updatedTick ?? null,
              updatedWorldVersion: agenda.updatedWorldVersion ?? null,
            }
          : null,
        execution: execution
          ? {
              status: execution.status ?? null,
              activeOrderCount: execution.activeOrderCount ?? null,
              queuedOrderCount: execution.queuedOrderCount ?? null,
              runningOrderCount: execution.runningOrderCount ?? null,
              requestId: execution.requestId ?? null,
              source: execution.source ?? null,
              updatedTick: execution.updatedTick ?? null,
              updatedWorldVersion: execution.updatedWorldVersion ?? null,
            }
          : null,
        budget: {
          actionPointsRemaining: budget.actionPointsRemaining ?? null,
          foodRemaining: budget.foodRemaining ?? null,
          aiQuota: aiQuota
            ? {
                currentQuota: aiQuota.currentQuota ?? null,
                maxQuota: aiQuota.maxQuota ?? null,
                nextUnlockScore: aiQuota.nextUnlockScore ?? null,
              }
            : null,
        },
        lastFailure: lastFailure
          ? {
              action: lastFailure.action ?? null,
              requestId: lastFailure.requestId ?? null,
              failureCode: lastFailure.failureCode ?? null,
              createdAt: lastFailure.createdAt ?? null,
            }
          : null,
      };
    }),
    recentEvents: summarizeRecentEvents(root.recentEvents, normalizedSampleLimit),
  };
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

function selectReserveHeroId(
  world: Record<string, unknown>,
  factionId: string,
  preferredHeroId?: string,
): string | null {
  const factions = asRecord(world.factions);
  const faction = factions ? asRecord(factions[factionId]) : null;
  const heroCommand = faction ? asRecord(faction.heroCommand) : null;
  const reserveHeroIds = asStringArray(heroCommand?.reserveHeroIds);
  const normalizedPreferred = preferredHeroId?.trim();
  if (normalizedPreferred && reserveHeroIds.includes(normalizedPreferred)) {
    return normalizedPreferred;
  }
  return reserveHeroIds[0] ?? null;
}

function selectReserveDeployTileId(
  world: Record<string, unknown>,
  factionId: string,
  preferredTileId?: string,
): string | null {
  const normalizedPreferred = preferredTileId?.trim();
  const map = asRecord(world.map);
  const tiles = map ? asRecordArray(map.tiles) : [];
  if (normalizedPreferred) {
    const preferredTile = tiles.find((tile) => String(tile.id ?? '') === normalizedPreferred);
    return preferredTile ? normalizedPreferred : null;
  }

  const factions = asRecord(world.factions);
  const faction = factions ? asRecord(factions[factionId]) : null;
  const heroCommand = faction ? asRecord(faction.heroCommand) : null;
  const homeTileId = typeof heroCommand?.homeTileId === 'string' ? heroCommand.homeTileId.trim() : '';
  if (homeTileId && tiles.some((tile) => String(tile.id ?? '') === homeTileId)) {
    return homeTileId;
  }

  return selectOwnedCityTileId(world, factionId);
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
  const map = asRecord(world.map);
  const overlays = asRecord(map?.overlays);
  const cityClusters = overlays ? asRecordArray(overlays.cityClusters) : [];

  if (normalizedPreferred) {
    const matchingCluster = cityClusters.find((cluster) => {
      const cityHallTileId = typeof cluster.cityHallTileId === 'string' ? cluster.cityHallTileId.trim() : '';
      const tileIds = asStringArray(cluster.tileIds);
      return cityHallTileId === normalizedPreferred || tileIds.includes(normalizedPreferred);
    });
    if (matchingCluster) {
      return typeof matchingCluster.cityHallTileId === 'string' ? matchingCluster.cityHallTileId.trim() : null;
    }
  }

  const ownedCluster = cityClusters.find((cluster) => String(cluster.owner ?? '') === factionId);
  if (ownedCluster && typeof ownedCluster.cityHallTileId === 'string' && ownedCluster.cityHallTileId.trim()) {
    return ownedCluster.cityHallTileId.trim();
  }

  const tiles = map ? asRecordArray(map.tiles) : [];
  if (normalizedPreferred) {
    const preferredTile = tiles.find((tile) =>
      String(tile.id ?? '') === normalizedPreferred &&
      String(tile.owner ?? '') === factionId &&
      (tile.type === 'city' || typeof tile.cityLevel === 'number'),
    );
    if (preferredTile) {
      return normalizedPreferred;
    }
    return null;
  }
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

function resolveCityBuildingTemplateTarget(
  preferredGroupId?: CityBuildingGroupId,
  preferredBuildingId?: CityBuildingId,
): { groupId: CityBuildingGroupId; buildingId: CityBuildingId } {
  if (preferredBuildingId === 'market_plaza') {
    return { groupId: 'market', buildingId: preferredBuildingId };
  }
  if (preferredBuildingId === 'tax_office') {
    return { groupId: 'tax', buildingId: preferredBuildingId };
  }
  if (preferredBuildingId === 'policy_hall' || preferredBuildingId === 'recruit_policy_board') {
    return { groupId: 'policy', buildingId: preferredBuildingId };
  }
  switch (preferredGroupId) {
    case 'tax':
      return { groupId: 'tax', buildingId: 'tax_office' };
    case 'policy':
      return { groupId: 'policy', buildingId: 'policy_hall' };
    case 'market':
    default:
      return { groupId: 'market', buildingId: 'market_plaza' };
  }
}

function resolveAffairTemplateGroup(preferredGroupId?: CityBuildingGroupId): {
  groupId: CityBuildingGroupId;
  affairId: string;
} {
  switch (preferredGroupId) {
    case 'market':
      return { groupId: 'market', affairId: 'queue_market_upgrade' };
    case 'policy':
      return { groupId: 'policy', affairId: 'queue_policy_review' };
    case 'tax':
    default:
      return { groupId: 'tax', affairId: 'queue_tax_upgrade' };
  }
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

  if (templateId === 'upgrade_first_city_building') {
    const cityId = selectOwnedCityTileId(world, factionId, options.cityTileId);
    if (!cityId) {
      throw new Error(`no city/capital tile found for faction ${factionId}`);
    }
    const target = resolveCityBuildingTemplateTarget(options.buildingGroupId, options.buildingId);
    return {
      action: 'promoteCityBuilding',
      payload: { factionId, cityId, groupId: target.groupId, buildingId: target.buildingId },
      includeWorld: includeWorldOverride ?? true,
      resolved: {
        templateId,
        factionId,
        cityId,
        groupId: target.groupId,
        buildingId: target.buildingId,
      },
    };
  }

  if (templateId === 'enqueue_first_city_affair') {
    const cityId = selectOwnedCityTileId(world, factionId, options.cityTileId);
    if (!cityId) {
      throw new Error(`no city/capital tile found for faction ${factionId}`);
    }
    const target = resolveAffairTemplateGroup(options.affairGroupId);
    return {
      action: 'enqueueAffair',
      payload: { factionId, cityId, affairId: target.affairId },
      includeWorld: includeWorldOverride ?? true,
      resolved: {
        templateId,
        factionId,
        cityId,
        groupId: target.groupId,
        affairId: target.affairId,
      },
    };
  }

  if (templateId === 'upgrade_first_city_tech') {
    const tileId = selectOwnedCityTileId(world, factionId, options.cityTileId);
    if (!tileId) {
      throw new Error(`no city/capital tile found for faction ${factionId}`);
    }

    const techId = options.techId ?? 'governance';
    return {
      action: 'upgradeCityTech',
      payload: { factionId, tileId, techId },
      includeWorld: includeWorldOverride ?? true,
      resolved: {
        templateId,
        factionId,
        tileId,
        techId,
      },
    };
  }

  if (templateId === 'recruit_first_commander') {
    const slgDomainState = asRecord(world.slgDomainState);
    const recruitStateByFaction = asRecord(slgDomainState?.recruitStateByFaction);
    const recruitState = asRecord(recruitStateByFaction?.[factionId]);
    const poolId =
      options.recruitPoolId?.trim() ||
      (typeof recruitState?.selectedPoolId === 'string' ? recruitState.selectedPoolId.trim() : '') ||
      'pool_standard';
    const count = Math.max(1, Math.min(10, Math.trunc(options.recruitCount ?? 1)));
    return {
      action: 'recruitProspectHero',
      payload: { factionId, poolId, count },
      includeWorld: includeWorldOverride ?? true,
      resolved: {
        templateId,
        factionId,
        poolId,
        count,
      },
    };
  }

  if (templateId === 'deploy_first_reserve_hero') {
    const heroId = selectReserveHeroId(world, factionId, options.heroId);
    if (!heroId) {
      throw new Error(`no reserve hero found for faction ${factionId}`);
    }
    const tileId = selectReserveDeployTileId(world, factionId, options.targetTileId);
    if (!tileId) {
      throw new Error(`no deploy tile resolved for faction ${factionId}`);
    }
    return {
      action: 'deployReserveHero',
      payload: { factionId, heroId, tileId },
      includeWorld: includeWorldOverride ?? true,
      resolved: {
        templateId,
        factionId,
        heroId,
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
      templateId: 'upgrade_first_city_building',
      action: 'promoteCityBuilding',
      autoResolves: ['factionId', 'cityId', 'groupId', 'buildingId'],
      defaultIncludeWorld: true,
    },
    {
      templateId: 'enqueue_first_city_affair',
      action: 'enqueueAffair',
      autoResolves: ['factionId', 'cityId', 'groupId', 'affairId'],
      defaultIncludeWorld: true,
    },
    {
      templateId: 'upgrade_first_city_tech',
      action: 'upgradeCityTech',
      autoResolves: ['factionId', 'tileId', 'techId'],
      defaultIncludeWorld: true,
    },
    {
      templateId: 'recruit_first_commander',
      action: 'recruitProspectHero',
      autoResolves: ['factionId', 'poolId', 'count'],
      defaultIncludeWorld: true,
    },
    {
      templateId: 'deploy_first_reserve_hero',
      action: 'deployReserveHero',
      autoResolves: ['factionId', 'heroId', 'tileId'],
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

// AI-player governance and knowledge-graph tools live in a dedicated module to keep this file searchable.
registerAiPlayerTools(server, {
  backendFetch,
  formatToolOutput,
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

// Tool 10: ai runtime observability
server.tool(
  'get_ai_runtime_observability',
  'Get AI runtime observability snapshot (authority, execution, budget, lock, failure stats, ws/session metrics).',
  {
    factionId: z.string().min(1).optional().describe('Optional faction filter, e.g. player/enemy/wei'),
    eventLimit: z.number().int().min(1).max(80).optional().describe('Max recent AI runtime events to include'),
    view: z.enum(['full', 'summary']).optional().describe('Return the full payload or an agent-friendly summary'),
    sampleLimit: z.number().int().min(1).max(8).optional().describe('Summary mode only: cap failure/conflict samples'),
  },
  async ({ factionId, eventLimit, view, sampleLimit }) => {
    try {
      const params = new URLSearchParams();
      if (factionId) {
        params.set('factionId', factionId);
      }
      if (typeof eventLimit === 'number') {
        params.set('eventLimit', String(eventLimit));
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      const data = await backendFetch(`/api/observability/ai-runtime${suffix}`);
      const output = view === 'summary' ? buildAiRuntimeObservabilitySummary(data, sampleLimit) : data;
      return {
        content: [{ type: 'text' as const, text: formatToolOutput(output) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// Tool 11: civil memory
server.tool(
  'get_civil_memory_entries',
  'Get civil-memory entries with optional type/faction/related filters for ops and agent debugging.',
  {
    limit: z.number().int().min(1).max(120).optional().describe('Max number of entries to return'),
    type: z.enum(['agenda_compiled', 'court_session_closed', 'court_resolution', 'execution_outcome']).optional().describe('Optional civil-memory event type filter'),
    factionId: z.string().min(1).optional().describe('Optional faction filter'),
    relatedId: z.string().min(1).optional().describe('Optional related entity filter'),
    tickFrom: z.number().int().nonnegative().optional().describe('Optional lower tick bound'),
    tickTo: z.number().int().nonnegative().optional().describe('Optional upper tick bound'),
  },
  async ({ limit, type, factionId, relatedId, tickFrom, tickTo }) => {
    try {
      const params = new URLSearchParams();
      if (typeof limit === 'number') {
        params.set('limit', String(limit));
      }
      if (type) {
        params.set('type', type);
      }
      if (factionId) {
        params.set('factionId', factionId);
      }
      if (relatedId) {
        params.set('relatedId', relatedId);
      }
      if (typeof tickFrom === 'number') {
        params.set('tickFrom', String(tickFrom));
      }
      if (typeof tickTo === 'number') {
        params.set('tickTo', String(tickTo));
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      const data = await backendFetch(`/api/civil-memory${suffix}`);
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

// Tool 23: join session
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

// Tool 13: set session autonomy
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

// Tool 14: leave session
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

// Tool 15: map layout
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

// Tool 16: generic world action
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

// Tool 17: list world action templates
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
    heroId: z.string().optional().describe('Optional reserve hero override (for deploy template)'),
    unitId: z.string().optional().describe('Optional unit override (for move/override templates)'),
    targetTileId: z.string().optional().describe('Optional target tile override (for move/deploy/override templates)'),
    cityTileId: z.string().optional().describe('Optional city tile override (for upgrade template)'),
    buildingGroupId: z.enum(CITY_BUILDING_GROUP_IDS).optional().describe('Optional building group override (for city-building/affair templates)'),
    buildingId: z.enum(CITY_BUILDING_IDS).optional().describe('Optional building id override (for city-building template)'),
    affairGroupId: z.enum(CITY_BUILDING_GROUP_IDS).optional().describe('Optional affair group override (for city-affair template)'),
    techId: z.enum(CITY_TECH_TRACK_IDS).optional().describe('Optional tech override (for city-tech upgrade template)'),
    recruitPoolId: z.string().optional().describe('Optional recruit pool override (for recruit template)'),
    recruitCount: z.number().int().min(1).max(10).optional().describe('Optional recruit count override (for recruit template)'),
    overrideTemplateId: z.enum(TACTICAL_OVERRIDE_TEMPLATE_IDS).optional().describe('Tactical template for override template'),
    summary: z.string().optional().describe('Optional tactical override summary'),
    includeWorld: z.boolean().optional().describe('Optional includeWorld override'),
  },
  async ({
    templateId,
    factionId,
    heroId,
    unitId,
    targetTileId,
    cityTileId,
    buildingGroupId,
    buildingId,
    affairGroupId,
    techId,
    recruitPoolId,
    recruitCount,
    overrideTemplateId,
    summary,
    includeWorld,
  }) => {
    try {
      const resolved = await resolveWorldActionTemplate(templateId, {
        factionId,
        heroId,
        unitId,
        targetTileId,
        cityTileId,
        buildingGroupId,
        buildingId,
        affairGroupId,
        techId,
        recruitPoolId,
        recruitCount,
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
