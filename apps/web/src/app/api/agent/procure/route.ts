import {withApiSecurity} from '@/lib/server/api-security';
import { handle } from '@/lib/server/procurement-api';
export const runtime = 'nodejs';
/** Authenticated, delegation-checked preparation only. Signing remains external. */
async function POSTHandler(request: Request) {
  return handle(request, 'procure');
}

export const POST=withApiSecurity(POSTHandler);
