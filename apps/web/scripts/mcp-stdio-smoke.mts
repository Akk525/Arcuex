/**
 * Development smoke: issue a token against a throwaway database, then drive the stdio server
 * with the official MCP client. Usage: ARCUE_X_SQLITE_PATH=/tmp/x.sqlite pnpm exec tsx --tsconfig tsconfig.json scripts/mcp-stdio-smoke.mts
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { getRepo } from '../src/lib/server/db';
import { issueClaimsNonce } from '../src/lib/server/claims-session';
import { issueMcpToken } from '../src/lib/mcp/tokens';

if (!process.env.ARCUE_X_SQLITE_PATH)
  throw new Error('Set ARCUE_X_SQLITE_PATH to a throwaway database');
const account = privateKeyToAccount(generatePrivateKey());
const challenge = issueClaimsNonce(getRepo(), account.address);
const { accessToken } = await issueMcpToken({
  nonce: challenge.nonce,
  signature: await account.signMessage({ message: challenge.message }),
  scopes: ['arcuex:read'],
  clientName: 'stdio-smoke',
});
const client = new Client({ name: 'stdio-smoke', version: '1.0.0' });
await client.connect(
  new StdioClientTransport({
    command: 'pnpm',
    args: ['exec', 'tsx', '--tsconfig', 'tsconfig.json', 'scripts/mcp-stdio.mts'],
    env: { ...process.env, ARCUEX_MCP_TOKEN: accessToken } as Record<string, string>,
    stderr: 'inherit',
  }),
);
const { tools } = await client.listTools();
const identity = await client.callTool({ name: 'arcuex_get_identity', arguments: {} });
const products = await client.callTool({ name: 'arcuex_list_products', arguments: {} });
console.log(
  JSON.stringify(
    {
      tools: tools.length,
      identity: (identity.structuredContent as { status: string }).status,
      products: (
        products.structuredContent as {
          status: string;
          data?: { products: Array<{ code: string; sourceMode: string }> };
        }
      ).data?.products.map((p) => [p.code, p.sourceMode]),
    },
    null,
    2,
  ),
);
await client.close();
