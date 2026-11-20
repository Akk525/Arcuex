import { getDb } from '@/lib/server/db';
import { getRuntimeConfig } from '@/lib/server/runtime-config';
import { MCP_SCOPES } from './scopes';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION, TOOL_CATALOG } from './server';

export const MCP_SDK_VERSION = '1.32.2';

/** Public, secret-free diagnostics for /api/mcp/health and the integrations page. */
export function mcpDiagnostics(request: Request) {
  const c = getRuntimeConfig();
  const origin = c.enforced ? c.origin : new URL(request.url).origin;
  let tokenStore = false;
  try {
    tokenStore = Boolean(
      getDb().prepare("SELECT name FROM sqlite_master WHERE name='mcp_access_tokens'").get(),
    );
  } catch {
    tokenStore = false;
  }
  return {
    server: {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
      sdk: `@modelcontextprotocol/sdk@${MCP_SDK_VERSION}`,
    },
    endpoint: `${origin}/api/mcp`,
    transport: 'streamable-http (stateless, JSON responses)',
    localTransport: 'stdio (development only): pnpm --filter @arcuex/web mcp:stdio',
    authentication: {
      scheme: 'Bearer',
      issuance: `${origin}/api/mcp/auth/challenge → wallet signature → ${origin}/api/mcp/auth/token`,
      protectedResourceMetadata: `${origin}/.well-known/oauth-protected-resource/api/mcp`,
      oauthAuthorizationServer: 'not_implemented',
    },
    scopes: MCP_SCOPES,
    chainSource: c.chainSource,
    checks: { tokenStore },
    hostedAcceptance: 'not_performed',
    tools: TOOL_CATALOG,
  };
}
