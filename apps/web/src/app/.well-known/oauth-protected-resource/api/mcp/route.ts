import { NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/server/api-security';
import { ALL_MCP_SCOPES } from '@/lib/mcp/scopes';
import { canonicalSigningOrigin } from '@/lib/server/request-boundary';
import { getRuntimeConfig } from '@/lib/server/runtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 9728 protected-resource metadata. No OAuth authorization server is deployed. */
export const GET = withApiSecurity(async (request: Request) => {
  // Behind the Railway edge request.url is the container address; advertise the public origin.
  const origin = canonicalSigningOrigin(request, getRuntimeConfig());
  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    scopes_supported: ALL_MCP_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'Arcuex MCP',
    resource_documentation: `${origin}/integrations#mcp`,
    arcuex_token_issuance: {
      challenge: `${origin}/api/mcp/auth/challenge`,
      token: `${origin}/api/mcp/auth/token`,
      revoke: `${origin}/api/mcp/auth/revoke`,
      method: 'wallet_signature',
      note: 'Tokens are issued after the wallet signs the Arcuex challenge. OAuth 2.1 authorization-server flows are not implemented.',
    },
  });
});
