import { randomUUID } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { NextResponse } from 'next/server';
import { boundaryFromRequest } from './backend';
import { createArcuexMcpServer } from './server';
import { authenticateMcpToken, readBearer } from './tokens';
import { ALL_MCP_SCOPES } from './scopes';
import { getRepo } from '@/lib/server/db';

export function resourceMetadataUrl(request: Request) {
  return `${new URL(request.url).origin}/.well-known/oauth-protected-resource/api/mcp`;
}

function unauthorized(request: Request, reasonCode: string, message: string) {
  return NextResponse.json(
    { jsonrpc: '2.0', error: { code: -32001, message, data: { reasonCode } }, id: null },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer realm="arcuex-mcp", error="invalid_token", error_description="${reasonCode}", resource_metadata="${resourceMetadataUrl(request)}", scope="${ALL_MCP_SCOPES.join(' ')}"`,
      },
    },
  );
}

/**
 * Stateless Streamable HTTP: each request authenticates, builds a fresh server/transport and
 * closes it. Interrupted sessions recover by reconnecting with the same token; mutations are
 * made safe to retry by backend idempotency keys rather than transport session state.
 */
export async function handleMcpHttp(request: Request): Promise<Response> {
  const auth = authenticateMcpToken(readBearer(request.headers.get('authorization')));
  if (!auth.ok) return unauthorized(request, auth.reasonCode, auth.message);
  const requestId = randomUUID();
  const server = createArcuexMcpServer({
    principal: auth.principal,
    boundary: boundaryFromRequest(request),
    correlationId: requestId,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 65_536,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, {
      authInfo: {
        token: auth.principal.tokenId,
        clientId: auth.principal.clientName,
        scopes: auth.principal.scopes,
        expiresAt: Math.floor(Date.parse(auth.principal.expiresAt) / 1000),
      },
    });
    const headers = new Headers(response.headers);
    headers.set('x-request-id', requestId);
    const body = await response.arrayBuffer();
    return new Response(body.byteLength ? body : null, { status: response.status, headers });
  } catch {
    getRepo().insertAudit('mcp_request', auth.principal.tokenId, 'mcp.request.failed', {
      requestId,
    });
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'MCP request failed', data: { requestId } },
        id: null,
      },
      { status: 500 },
    );
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
