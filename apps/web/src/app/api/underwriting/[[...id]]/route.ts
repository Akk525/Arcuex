import { NextResponse } from 'next/server';
import { ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import { ProcurementStore } from '@arcuex/persistence';
import { withApiSecurity } from '@/lib/server/api-security';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
import { getDb } from '@/lib/server/db';
import { ProcurementError, ProcurementService } from '@/lib/server/procurement';
import { procurementPool } from '@/lib/server/procurement-chain';
import { getRuntimeConfig } from '@/lib/server/runtime-config';
import { UnderwritingService } from '@/lib/server/underwriting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id?: string[] }> };

const handle = withApiSecurity(async (request: Request, context: Context) => {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const segments = (await context.params).id ?? [];
  if (segments.length > 1)
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  const id = segments[0];
  const service = new UnderwritingService(
    new ProcurementService(new ProcurementStore(getDb()), procurementPool, ARC_USDC_ERC20_ADDRESS),
  );
  const paymentEnabled = getRuntimeConfig().chainSource === 'arc-testnet';
  try {
    if (request.method === 'GET') {
      return NextResponse.json(
        id
          ? { application: service.get(auth.principal, id), paymentEnabled }
          : { applications: service.list(auth.principal), paymentEnabled },
      );
    }
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 16000) {
      return NextResponse.json({ error: 'Application request too large' }, { status: 413 });
    }
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      input = null;
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
    }
    const payload = input as Record<string, unknown>;
    const application = id
      ? service.act(auth.principal, id, payload)
      : service.apply(auth.principal, payload);
    return NextResponse.json({ application, paymentEnabled });
  } catch (error) {
    if (error instanceof ProcurementError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    throw error;
  }
});

export const GET = handle;
export const POST = handle;
