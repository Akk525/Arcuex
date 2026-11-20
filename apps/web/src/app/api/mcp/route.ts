import { withApiSecurity } from '@/lib/server/api-security';
import { handleMcpHttp } from '@/lib/mcp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiSecurity(handleMcpHttp);
export const GET = withApiSecurity(handleMcpHttp);
export const DELETE = withApiSecurity(handleMcpHttp);
