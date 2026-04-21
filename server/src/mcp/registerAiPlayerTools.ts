import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type RegisterAiPlayerToolsOptions = {
  backendFetch: (path: string, method?: string, body?: unknown) => Promise<unknown>;
  formatToolOutput: (value: unknown) => string;
};

export function registerAiPlayerTools(
  server: McpServer,
  { backendFetch, formatToolOutput }: RegisterAiPlayerToolsOptions,
) {
  server.tool(
    'list_ai_player_action_catalog',
    'List the formal AI-player atomic action catalog, including risk and whether each action is executable in v1.',
    {},
    async () => {
      try {
        const data = await backendFetch('/api/ai/player-actions/catalog');
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

  server.tool(
    'get_ai_player_knowledge_graph',
    'Read the AI-player backend knowledge graph from the formal HTTP surface. Supports json and Obsidian-friendly markdown views.',
    {
      format: z.enum(['json', 'obsidian']).optional().describe('Output view. Use obsidian for markdown-oriented note export.'),
      aiAction: z.string().min(1).optional().describe('Optional AI action filter'),
      worldAction: z.string().min(1).optional().describe('Optional world action filter'),
      recommendation: z.enum(['promoted', 'defer']).optional().describe('Optional authority recommendation filter'),
      includeCatalog: z.boolean().optional().describe('Include executable catalog in the snapshot'),
    },
    async ({ format, aiAction, worldAction, recommendation, includeCatalog }) => {
      try {
        const params = new URLSearchParams();
        if (format) {
          params.set('format', format);
        }
        if (aiAction) {
          params.set('aiAction', aiAction);
        }
        if (worldAction) {
          params.set('worldAction', worldAction);
        }
        if (recommendation) {
          params.set('recommendation', recommendation);
        }
        if (typeof includeCatalog === 'boolean') {
          params.set('includeCatalog', includeCatalog ? 'true' : 'false');
        }
        const suffix = params.size > 0 ? `?${params.toString()}` : '';
        const data = await backendFetch(`/api/ai/knowledge-graph${suffix}`);
        const markdown = typeof data === 'object' && data && 'markdown' in data && typeof (data as { markdown?: unknown }).markdown === 'string'
          ? (data as { markdown: string }).markdown
          : null;
        return {
          content: [{ type: 'text' as const, text: format === 'obsidian' && markdown ? markdown : formatToolOutput(data) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'list_governed_ai_players',
    'List governed AI players with runtime status, session authority, budget, and proposal stats.',
    {
      governorPlayerId: z.string().min(1).optional().describe('Optional governor filter'),
      factionId: z.string().min(1).optional().describe('Optional faction filter'),
      includeDisabled: z.boolean().optional().describe('Include disabled AI players'),
    },
    async ({ governorPlayerId, factionId, includeDisabled }) => {
      try {
        const params = new URLSearchParams();
        if (governorPlayerId) {
          params.set('governorPlayerId', governorPlayerId);
        }
        if (factionId) {
          params.set('factionId', factionId);
        }
        if (includeDisabled) {
          params.set('includeDisabled', 'true');
        }
        const suffix = params.size > 0 ? `?${params.toString()}` : '';
        const data = await backendFetch(`/api/ai/players${suffix}`);
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

  server.tool(
    'register_governed_ai_player',
    'Register one governed AI player under a human governor for a faction.',
    {
      aiPlayerId: z.string().min(1).describe('Stable governed AI player ID'),
      displayName: z.string().min(1).describe('Human-readable AI player name'),
      governorPlayerId: z.string().min(1).describe('Human governor/player ID'),
      factionId: z.string().min(1).describe('Faction that this AI player operates'),
      actionWhitelist: z.array(z.string().min(1)).optional().describe('Optional action whitelist'),
      enabled: z.boolean().optional(),
      paused: z.boolean().optional(),
    },
    async ({ aiPlayerId, displayName, governorPlayerId, factionId, actionWhitelist, enabled, paused }) => {
      try {
        const data = await backendFetch('/api/ai/players', 'POST', {
          aiPlayerId,
          displayName,
          governorPlayerId,
          factionId,
          actionWhitelist,
          enabled,
          paused,
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

  server.tool(
    'get_ai_player_runtime',
    'Get runtime snapshot for one governed AI player.',
    {
      aiPlayerId: z.string().min(1).describe('Governed AI player ID'),
    },
    async ({ aiPlayerId }) => {
      try {
        const data = await backendFetch(`/api/ai/players/${encodeURIComponent(aiPlayerId)}`);
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

  server.tool(
    'pause_ai_player',
    'Pause one governed AI player.',
    {
      aiPlayerId: z.string().min(1).describe('Governed AI player ID'),
      updatedBy: z.string().min(1).describe('Operator or governor performing the pause'),
    },
    async ({ aiPlayerId, updatedBy }) => {
      try {
        const data = await backendFetch(`/api/ai/players/${encodeURIComponent(aiPlayerId)}/pause`, 'POST', {
          updatedBy,
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

  server.tool(
    'resume_ai_player',
    'Resume one governed AI player.',
    {
      aiPlayerId: z.string().min(1).describe('Governed AI player ID'),
      updatedBy: z.string().min(1).describe('Operator or governor performing the resume'),
    },
    async ({ aiPlayerId, updatedBy }) => {
      try {
        const data = await backendFetch(`/api/ai/players/${encodeURIComponent(aiPlayerId)}/resume`, 'POST', {
          updatedBy,
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

  server.tool(
    'propose_ai_player_action',
    'Create one governed AI-player action proposal through the formal policy layer.',
    {
      aiPlayerId: z.string().min(1).describe('Governed AI player ID'),
      action: z.string().min(1).describe('Atomic action ID, e.g. city_upgrade'),
      reason: z.string().min(1).describe('Why this action is being proposed'),
      source: z.enum(['llm', 'rule', 'human', 'replay', 'mcp', 'cli']).describe('Proposal source'),
      args: z.record(z.string(), z.unknown()).optional().describe('Optional action arguments'),
    },
    async ({ aiPlayerId, action, reason, source, args }) => {
      try {
        const data = await backendFetch('/api/ai/players/proposals', 'POST', {
          aiPlayerId,
          action,
          reason,
          source,
          args,
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

  server.tool(
    'get_ai_player_proposals',
    'List AI-player action proposals, optionally filtered by AI player or proposal status.',
    {
      aiPlayerId: z.string().min(1).optional().describe('Optional governed AI player filter'),
      status: z.enum(['pending_approval', 'approved', 'rejected', 'executed', 'failed']).optional().describe('Optional status filter'),
      limit: z.number().int().min(1).max(200).optional().describe('Optional proposal limit'),
    },
    async ({ aiPlayerId, status, limit }) => {
      try {
        const params = new URLSearchParams();
        if (aiPlayerId) {
          params.set('aiPlayerId', aiPlayerId);
        }
        if (status) {
          params.set('status', status);
        }
        if (typeof limit === 'number') {
          params.set('limit', String(limit));
        }
        const suffix = params.size > 0 ? `?${params.toString()}` : '';
        const data = await backendFetch(`/api/ai/players/proposals${suffix}`);
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

  server.tool(
    'approve_ai_player_proposal',
    'Approve one pending AI-player proposal.',
    {
      proposalId: z.string().min(1).describe('Proposal ID'),
      approvedBy: z.string().min(1).describe('Governor/operator approving the proposal'),
    },
    async ({ proposalId, approvedBy }) => {
      try {
        const data = await backendFetch(`/api/ai/players/proposals/${encodeURIComponent(proposalId)}/approve`, 'POST', {
          approvedBy,
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

  server.tool(
    'execute_ai_player_proposal',
    'Execute one approved AI-player proposal through the authoritative world-action chain.',
    {
      proposalId: z.string().min(1).describe('Proposal ID'),
      executedBy: z.string().min(1).describe('Governor/operator executing the proposal'),
      includeWorld: z.boolean().optional().describe('Include world snapshot in the underlying world-action response'),
    },
    async ({ proposalId, executedBy, includeWorld }) => {
      try {
        const data = await backendFetch(`/api/ai/players/proposals/${encodeURIComponent(proposalId)}/execute`, 'POST', {
          executedBy,
          includeWorld,
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

  server.tool(
    'get_ai_player_recent_receipts',
    'Get recent execution receipts for one governed AI player.',
    {
      aiPlayerId: z.string().min(1).describe('Governed AI player ID'),
      limit: z.number().int().min(1).max(200).optional().describe('Optional receipt limit'),
    },
    async ({ aiPlayerId, limit }) => {
      try {
        const params = new URLSearchParams();
        if (typeof limit === 'number') {
          params.set('limit', String(limit));
        }
        const suffix = params.size > 0 ? `?${params.toString()}` : '';
        const data = await backendFetch(`/api/ai/players/${encodeURIComponent(aiPlayerId)}/receipts${suffix}`);
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
}
