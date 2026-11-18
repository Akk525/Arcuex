import { withApiSecurity } from '@/lib/server/api-security';
import { readPolicies } from '@/lib/server/policy-read-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function GETHandler(request: Request) {
  return readPolicies(request);
}

export const GET = withApiSecurity(GETHandler);
