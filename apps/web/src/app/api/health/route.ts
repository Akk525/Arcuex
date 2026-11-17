import { NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/server/api-security';
import { publicRpcHealth } from '@/lib/server/public-health';

export const dynamic = 'force-dynamic';

export const GET = withApiSecurity(async () => NextResponse.json(await publicRpcHealth()));
