import { handle } from '@/lib/server/procurement-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
export async function GET(r: Request, c: Context) {
  return handle(r, (await c.params).path.join('/'));
}
export async function POST(r: Request, c: Context) {
  return handle(r, (await c.params).path.join('/'));
}
