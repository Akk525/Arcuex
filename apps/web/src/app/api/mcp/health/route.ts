import { NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/server/api-security';
import { mcpDiagnostics } from '@/lib/mcp/diagnostics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiSecurity(async (request: Request) =>
  NextResponse.json(mcpDiagnostics(request)),
);
