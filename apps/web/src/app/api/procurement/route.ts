import { NextResponse } from 'next/server';
import { handle } from '@/lib/server/procurement-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(request, 'products');
}
/** Compatibility action API uses the same authorization and read-only preflight as REST. */
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 16000)
      return NextResponse.json(
        { error: { code: 'TOO_LARGE', message: 'Request too large' } },
        { status: 413 },
      );
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    const routes: Record<string, string> = {
      challenge: 'auth/challenge',
      authenticate: 'auth/verify',
      register: 'agents',
      delegate: 'delegations',
      revoke: 'delegations/revoke',
      quote: 'quotes',
      prepare: 'procure',
      confirm: 'confirm',
      authority: 'authority',
    };
    const action = String(body.action);
    delete body.action;
    let path = routes[action],
      method = 'POST';
    if (action === 'list') {
      path = 'list';
      method = 'GET';
    }
    if (action === 'status' || action === 'reconcile') {
      if (typeof body.policyId !== 'string') throw new Error();
      path = `policies/${body.policyId}`;
      method = 'GET';
    }
    if (!path)
      return NextResponse.json(
        { error: { code: 'INVALID_ACTION', message: 'Unknown action' } },
        { status: 400 },
      );
    if (action === 'revoke') body.id = body.delegationId;
    if (action === 'confirm') body.hash = body.txHash;
    const response = await handle(
      new Request(request.url, {
        method,
        headers: request.headers,
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      }),
      path,
    );
    const json = await response.json();
    if (!response.ok)
      return NextResponse.json(
        { error: { code: json.code, message: json.error } },
        { status: response.status, headers: { 'Cache-Control': 'no-store' } },
      );
    return NextResponse.json(
      {
        result:
          action === 'status' ? json.policy : action === 'reconcile' ? json.reconciliation : json,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Expected valid JSON object' } },
      { status: 400 },
    );
  }
}
