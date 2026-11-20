/**
 * Local development MCP server over stdio.
 *
 * Runs the same tools in-process against this checkout's database. It still requires an MCP
 * access token (ARCUEX_MCP_TOKEN) issued by /api/mcp/auth/token for the same database, so stdio
 * never bypasses wallet authentication or backend authorization. Refuses to run in production.
 *
 *   ARCUEX_MCP_TOKEN=amcp_... pnpm --filter @arcuex/web mcp:stdio
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createArcuexMcpServer } from '../src/lib/mcp/server';
import { authenticateMcpToken } from '../src/lib/mcp/tokens';

if (process.env.NODE_ENV === 'production') {
  console.error('mcp-stdio is development-only; use the hosted /api/mcp endpoint.');
  process.exit(1);
}
const auth = authenticateMcpToken(process.env.ARCUEX_MCP_TOKEN?.trim() ?? null);
if (!auth.ok) {
  console.error(`ARCUEX_MCP_TOKEN rejected: ${auth.reasonCode}`);
  process.exit(1);
}
const server = createArcuexMcpServer({
  principal: auth.principal,
  boundary: { origin: 'http://localhost', headers: { host: 'localhost' } },
  correlationId: 'stdio',
});
await server.connect(new StdioServerTransport());
console.error(`Arcuex MCP stdio ready for ${auth.principal.wallet}`);
