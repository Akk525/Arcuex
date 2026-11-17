import {withApiSecurity} from '@/lib/server/api-security';
import { handle } from '@/lib/server/procurement-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function GETHandler(r: Request, c: Context) {
  return handle(r, (await c.params).path.join('/'));
}
async function POSTHandler(r: Request, c: Context) {
  return handle(r, (await c.params).path.join('/'));
}

export const GET=withApiSecurity(GETHandler);
export const POST=withApiSecurity(POSTHandler);
