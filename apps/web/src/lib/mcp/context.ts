import { createHash } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z, ZodRawShape } from 'zod';
import { getRepo } from '@/lib/server/db';
import { getRuntimeConfig } from '@/lib/server/runtime-config';
import type { BackendGateway, BackendResponse } from './backend';
import { compact, McpToolError, toolResultShape, type ToolResult } from './results';
import type { McpScope } from './scopes';
import type { McpPrincipal } from './tokens';

export type ToolContext = {
  principal: McpPrincipal;
  backend: BackendGateway;
  correlationId: string;
  /** `arc-testnet` or `fixture`; from server runtime configuration, never from the caller. */
  chainSource: string;
};

export type ToolOutcome = Omit<ToolResult, 'operationId' | 'tool'>;

export type ToolSpec<S extends ZodRawShape> = {
  name: string;
  title: string;
  description: string;
  scope: McpScope;
  input: S;
  readOnly: boolean;
  idempotent?: boolean;
  run: (args: z.objectOutputType<S, z.ZodTypeAny>, ctx: ToolContext) => Promise<ToolOutcome>;
};

/** Catalog metadata for documentation/diagnostics, kept in sync with registrations. */
export type ToolCatalogEntry = {
  name: string;
  title: string;
  scope: McpScope;
  readOnly: boolean;
  supported: boolean;
  description: string;
};

const STATUS_CODES: Record<number, string> = {
  400: 'INVALID_INPUT',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'TOO_LARGE',
  429: 'RATE_LIMITED',
  503: 'BACKEND_UNAVAILABLE',
};

/** Map an existing backend refusal to a machine-readable MCP outcome without changing it. */
export function backendFailure(res: BackendResponse): McpToolError {
  const body = (res.body ?? {}) as { error?: unknown; code?: unknown };
  const reasonCode =
    typeof body.code === 'string' ? body.code : (STATUS_CODES[res.status] ?? 'BACKEND_ERROR');
  const status =
    res.status === 401 || res.status === 403 || res.status === 409
      ? 'BLOCKED'
      : res.status === 429 || res.status === 503
        ? 'PENDING'
        : 'FAILED';
  return new McpToolError(
    status,
    reasonCode,
    typeof body.error === 'string' ? body.error : `Backend refused the request (${res.status})`,
    { data: { backendStatus: res.status } },
  );
}

export function ok<T = unknown>(res: BackendResponse): T {
  if (res.status < 200 || res.status >= 300) throw backendFailure(res);
  return res.body as T;
}

/** Resolve the agent identity for a call. Model-supplied IDs are hints, never authority. */
export function effectiveAgentId(ctx: ToolContext, requested?: string | null): string | null {
  if (ctx.principal.agentId) {
    if (requested && requested !== ctx.principal.agentId)
      throw new McpToolError(
        'BLOCKED',
        'AGENT_BINDING_MISMATCH',
        'This token is bound to a different agent; agent IDs in arguments cannot widen it',
      );
    return ctx.principal.agentId;
  }
  return requested ?? null;
}

export function sourceMode(ctx: ToolContext, synthetic?: boolean): string {
  if (ctx.chainSource === 'fixture') return 'fixture_rehearsal';
  if (synthetic === undefined) return 'arc_testnet';
  return synthetic ? 'synthetic_arc_testnet' : 'independent_arc_testnet_pilot';
}

const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(value ?? null))
    .digest('hex');

export function registerTool<S extends ZodRawShape>(
  server: McpServer,
  makeContext: () => ToolContext,
  spec: ToolSpec<S>,
) {
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: `${spec.description}\nRequired scope: ${spec.scope}.`,
      inputSchema: spec.input,
      outputSchema: toolResultShape,
      annotations: {
        title: spec.title,
        readOnlyHint: spec.readOnly,
        destructiveHint: false,
        idempotentHint: spec.readOnly || spec.idempotent === true,
        openWorldHint: false,
      },
    },
    // The SDK has already validated `args` against `spec.input`.
    (async (args: z.objectOutputType<S, z.ZodTypeAny>) => {
      const ctx = makeContext();
      let result: ToolResult;
      try {
        if (!ctx.principal.scopes.includes(spec.scope))
          throw new McpToolError(
            'BLOCKED',
            'INSUFFICIENT_SCOPE',
            `Token lacks scope ${spec.scope}; request a new token with that scope`,
          );
        const outcome = await spec.run(args, ctx);
        result = compact({ ...outcome, operationId: ctx.correlationId, tool: spec.name });
      } catch (error) {
        result =
          error instanceof McpToolError
            ? compact({
                ...error.extra,
                status: error.status,
                reasonCode: error.reasonCode,
                message: error.message,
                operationId: ctx.correlationId,
                tool: spec.name,
              })
            : {
                status: 'FAILED',
                reasonCode: 'INTERNAL_ERROR',
                // Never echo raw exceptions: RPC errors can contain secret-bearing URLs.
                message: 'Request could not be completed; no transaction was sent.',
                operationId: ctx.correlationId,
                tool: spec.name,
              };
      }
      try {
        getRepo().insertAudit('mcp_tool_call', ctx.principal.tokenId, `mcp.tool.${spec.name}`, {
          correlationId: ctx.correlationId,
          wallet: ctx.principal.wallet,
          agentId: ctx.principal.agentId,
          client: ctx.principal.clientName,
          status: result.status,
          reasonCode: result.reasonCode ?? null,
          resourceId: result.resourceId ?? null,
          inputDigest: digest(args),
        });
      } catch {
        // Audit failure must not convert a completed backend action into an apparent failure.
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
        isError: result.status === 'FAILED',
      };
    }) as never,
  );
}

export function chainSource(): string {
  return getRuntimeConfig().chainSource;
}

export type AnyToolSpec = ToolSpec<ZodRawShape>;
/** Preserve per-tool input typing while collecting heterogeneous specs. */
export function tool<S extends ZodRawShape>(spec: ToolSpec<S>): AnyToolSpec {
  return spec as unknown as AnyToolSpec;
}
