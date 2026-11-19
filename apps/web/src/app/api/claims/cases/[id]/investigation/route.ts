import { NextResponse } from 'next/server';
import {
  ExaminerWorkerRequestSchema,
  appendClaimsInvestigation,
  getClaimsInvestigation,
  beginClaimsExamination,
  finishClaimsExamination,
  failClaimsExamination,
} from '@arcuex/insurance';
import { getRepo } from '@/lib/server/db';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
import { withApiSecurity } from '@/lib/server/api-security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export const GET = withApiSecurity(async (request: Request, ctx: Context) => {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority', 'system']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    return NextResponse.json(
      getClaimsInvestigation(getRepo(), (await ctx.params).id, auth.principal),
    );
  } catch {
    return NextResponse.json(
      { error: 'Claim not found or investigation integrity unavailable' },
      { status: 404 },
    );
  }
});
export const POST = withApiSecurity(async (request: Request, ctx: Context) => {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority', 'system']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 32000)
      return NextResponse.json({ error: 'Investigation request too large' }, { status: 413 });
    const input = JSON.parse(raw),
      repo = getRepo(),
      id = (await ctx.params).id;
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('JSON object required');
    const roles = ['examiner_start', 'examiner_finish', 'examiner_failure'].includes(input.action)
      ? (['system'] as const)
      : [
            'request_proof',
            'adopt_examiner_request',
            'resolve_request',
            'escalate',
            'cancel_examiner',
          ].includes(input.action)
        ? (['reviewer', 'authority'] as const)
        : (['claimant', 'reviewer', 'authority'] as const);
    const actionAuth = authenticateClaimsRequest(request, roles);
    if (!actionAuth.ok)
      return NextResponse.json({ error: actionAuth.error }, { status: actionAuth.status });
    if (input.action === 'examiner_start') {
      const v = ExaminerWorkerRequestSchema.parse(input);
      if (v.action === 'examiner_finish') throw new Error('Invalid worker envelope');
      return NextResponse.json(beginClaimsExamination(repo, id, v.requestId, auth.principal));
    }
    if (input.action === 'examiner_finish') {
      const envelope = ExaminerWorkerRequestSchema.parse(input);
      if (envelope.action !== 'examiner_finish') throw new Error('Invalid worker envelope');
      return NextResponse.json({
        entry: finishClaimsExamination(repo, id, envelope.report, auth.principal),
      });
    }
    if (input.action === 'examiner_failure') {
      const v = ExaminerWorkerRequestSchema.parse(input);
      if (v.action === 'examiner_finish') throw new Error('Invalid worker envelope');
      return NextResponse.json({
        entry: failClaimsExamination(repo, id, v.requestId, auth.principal),
      });
    }
    return NextResponse.json({ entry: appendClaimsInvestigation(repo, id, input, auth.principal) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Investigation failed' },
      { status: 400 },
    );
  }
});
