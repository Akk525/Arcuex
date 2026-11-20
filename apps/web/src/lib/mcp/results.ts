import { z } from 'zod';

export const RESULT_STATUSES = [
  'SUCCESS',
  'PENDING',
  'ACTION_REQUIRED',
  'UNDER_REVIEW',
  'BLOCKED',
  'FAILED',
] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export type NextAction = {
  /** Who must act. Only `agent` actions can be taken through this MCP server. */
  actor: 'agent' | 'owner' | 'payer_wallet' | 'reviewer' | 'claims_authority' | 'none';
  description: string;
  tool?: string;
  /** For owner/wallet actions: the exact established endpoint and body that actor must submit. */
  endpoint?: string;
  body?: Record<string, unknown>;
};

export type ToolResult = {
  status: ResultStatus;
  operationId: string;
  tool: string;
  message?: string;
  reasonCode?: string;
  resourceId?: string;
  sourceMode?: string;
  authorizedActions?: string[];
  requiresHumanApproval?: boolean;
  requiresWalletSignature?: boolean;
  nextAction?: NextAction;
  evidenceReferences?: string[];
  transactionHash?: string;
  canonicality?: string;
  data?: unknown;
};

/** Shared structured output schema; every tool returns this envelope. */
export const toolResultShape = {
  status: z.enum(RESULT_STATUSES),
  operationId: z.string(),
  tool: z.string(),
  message: z.string().optional(),
  reasonCode: z.string().optional(),
  resourceId: z.string().optional(),
  sourceMode: z.string().optional(),
  authorizedActions: z.array(z.string()).optional(),
  requiresHumanApproval: z.boolean().optional(),
  requiresWalletSignature: z.boolean().optional(),
  nextAction: z
    .object({
      actor: z.enum(['agent', 'owner', 'payer_wallet', 'reviewer', 'claims_authority', 'none']),
      description: z.string(),
      tool: z.string().optional(),
      endpoint: z.string().optional(),
      body: z.record(z.unknown()).optional(),
    })
    .optional(),
  evidenceReferences: z.array(z.string()).optional(),
  transactionHash: z.string().optional(),
  canonicality: z.string().optional(),
  data: z.unknown().optional(),
};

/** Drop undefined fields so agents only see applicable, verified values. */
export function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export class McpToolError extends Error {
  constructor(
    readonly status: ResultStatus,
    readonly reasonCode: string,
    message: string,
    readonly extra: Partial<ToolResult> = {},
  ) {
    super(message);
  }
}
