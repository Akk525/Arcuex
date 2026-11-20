import * as procurementRoute from '@/app/api/procurement/[...path]/route';
import * as lifecycleRoute from '@/app/api/policies/[policyId]/lifecycle/route';
import * as casesRoute from '@/app/api/claims/cases/route';
import * as caseRoute from '@/app/api/claims/cases/[id]/route';
import * as investigationRoute from '@/app/api/claims/cases/[id]/investigation/route';
import * as verificationRoute from '@/app/api/claims/cases/[id]/verification/route';
import { CLAIMS_SESSION_COOKIE } from '@/lib/server/claims-session';
import type { McpPrincipal } from './tokens';

/**
 * In-process gateway to the existing Arcuex API route handlers.
 *
 * Every MCP tool reaches business logic only through these handlers, so request-boundary
 * checks, wallet-session authentication, agent-signer matching, idempotency, ownership,
 * delegation, quote, payment, reconciliation and claims rules run unchanged. The MCP bearer
 * token is never forwarded; only the token's sealed wallet session is presented as a cookie.
 */
export type Boundary = {
  /** Origin used for internal request URLs (the outer MCP request's origin). */
  origin: string;
  /** Edge/boundary headers copied from an outer request that already passed the boundary. */
  headers: Record<string, string>;
  /** Acceptance-gate cookie value from the outer request, if the deployment uses one. */
  gateCookie?: string;
};

export type BackendResponse = { status: number; body: unknown };

const FORWARDED = [
  'host',
  'x-forwarded-proto',
  'x-forwarded-for',
  'x-real-ip',
  'x-railway-edge',
  'x-arcuex-acceptance-gate',
] as const;

export function boundaryFromRequest(request: Request): Boundary {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  const gate = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('arcuex_acceptance_gate='));
  return {
    origin: new URL(request.url).origin,
    headers,
    gateCookie: gate?.slice('arcuex_acceptance_gate='.length),
  };
}

type Handler = (
  request: Request,
  ctx: { params: Promise<Record<string, unknown>> },
) => Promise<Response>;

function route(
  path: string,
  method: 'GET' | 'POST',
): { handler: Handler; params: Record<string, unknown> } {
  const pick = (mod: { GET?: unknown; POST?: unknown }) => {
    const handler = mod[method];
    if (typeof handler !== 'function') throw new Error(`No ${method} handler for ${path}`);
    return handler as Handler;
  };
  let m: RegExpExecArray | null;
  if ((m = /^\/api\/procurement\/([a-z0-9/_-]+)$/i.exec(path)))
    return { handler: pick(procurementRoute), params: { path: m[1]!.split('/') } };
  if ((m = /^\/api\/policies\/([^/]+)\/lifecycle$/.exec(path)))
    return { handler: pick(lifecycleRoute), params: { policyId: m[1] } };
  if (path === '/api/claims/cases') return { handler: pick(casesRoute), params: {} };
  if ((m = /^\/api\/claims\/cases\/([^/]+)\/investigation$/.exec(path)))
    return { handler: pick(investigationRoute), params: { id: m[1] } };
  if ((m = /^\/api\/claims\/cases\/([^/]+)\/verification$/.exec(path)))
    return { handler: pick(verificationRoute), params: { id: m[1] } };
  if ((m = /^\/api\/claims\/cases\/([^/]+)$/.exec(path)))
    return { handler: pick(caseRoute), params: { id: m[1] } };
  throw new Error(`Unmapped backend path ${path}`);
}

export class BackendGateway {
  constructor(
    readonly principal: McpPrincipal,
    readonly boundary: Boundary,
    readonly correlationId: string,
  ) {}

  async call(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    opts: { agentId?: string | null } = {},
  ): Promise<BackendResponse> {
    const segments = path.split('?')[0]!.split('/');
    if (segments.some((s) => s === '..' || s === '.' || /%2f|%5c/i.test(s)))
      throw new Error('Invalid backend path');
    const { handler, params } = route(path.split('?')[0]!, method);
    const cookies = [`${CLAIMS_SESSION_COOKIE}=${this.principal.sessionSecret}`];
    if (this.boundary.gateCookie)
      cookies.push(`arcuex_acceptance_gate=${this.boundary.gateCookie}`);
    const headers: Record<string, string> = {
      ...this.boundary.headers,
      cookie: cookies.join('; '),
      'x-arcuex-wallet': this.principal.wallet,
      'x-request-id': this.correlationId,
      accept: 'application/json',
    };
    if (opts.agentId) headers['x-arcuex-agent-id'] = opts.agentId;
    if (method === 'POST') headers['content-type'] = 'application/json';
    const request = new Request(`${this.boundary.origin}${path}`, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });
    const response = await handler(request, { params: Promise.resolve(params) });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { status: response.status, body: parsed };
  }
}
