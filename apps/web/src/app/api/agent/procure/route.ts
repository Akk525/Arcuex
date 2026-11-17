import { handle } from '@/lib/server/procurement-api';
export const runtime = 'nodejs';
/** Authenticated, delegation-checked preparation only. Signing remains external. */
export async function POST(request: Request) {
  return handle(request, 'procure');
}
