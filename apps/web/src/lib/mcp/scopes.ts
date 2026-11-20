/**
 * Least-privilege MCP scopes. Scopes only narrow what a token may attempt; the
 * Arcuex backend still decides ownership, delegation, payer and beneficiary authority.
 */
export const MCP_SCOPES = {
  'arcuex:read': 'Read identity, products, policies, claims, verification and settlement status.',
  'arcuex:register':
    'Prepare agent/exposure registration and delegation requests for owner approval. Grants nothing.',
  'arcuex:quote': 'Request schedule-priced quotes within backend-enforced authority.',
  'arcuex:purchase':
    'Accept exact quote digests, prepare unsigned payment transactions and submit receipts for reconciliation.',
  'arcuex:claims':
    'File claims, submit evidence, answer evidence requests and request verification or examiner reassessment.',
} as const;
export type McpScope = keyof typeof MCP_SCOPES;
export const ALL_MCP_SCOPES = Object.keys(MCP_SCOPES) as McpScope[];
export const DEFAULT_MCP_SCOPES: McpScope[] = ['arcuex:read'];

export function isMcpScope(value: unknown): value is McpScope {
  return typeof value === 'string' && value in MCP_SCOPES;
}
