import { withApiSecurity } from '@/lib/server/api-security';
import { readPolicies } from '@/lib/server/policy-read-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function GETHandler(request: Request, context: { params: Promise<{ policyId: string }> }) {
  return readPolicies(request, (await context.params).policyId);
}

export const GET = withApiSecurity(GETHandler);
